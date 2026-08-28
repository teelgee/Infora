// T-329 acceptance — the notification record, and the one rule it exists to
// hold: **visibility follows the subject** (ADR-0049 §3).
//
// The cases that matter are all negatives, and they are negatives of a
// particular shape: a row that EXISTS, addressed to a real person, pointing at a
// subject that person cannot reach. That is the leak the ADR names — a channel
// by which a fact reaches someone who could not otherwise reach it — and it is
// invisible in any test that only checks the happy path.
//
// Rows are inserted directly here because **nothing emits them yet**: T-330 is
// the emitter and waits on T-323 (the SES transport). The record and the surface
// ship first, deliberately.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ListNotificationsResponse, MarkNotificationReadResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t329';

let projectId: string;
let otherProjectId: string;
let ownerOrg: string;
let producerOrg: string;
let rivalOrg: string;

let producerCookie: string;
let producerParticipantId: string;
let producerOtherParticipantId: string;
let rivalCookie: string;
let rivalParticipantId: string;

/** the producer's own sandbox document, and a comment on it */
let sandboxDocId: string;
let commentId: string;
/** a published deliverable of the producer's, and its round */
let containerId: string;
let roundId: string;

async function makeUser(name: string, organisationId: string, projects: string[]) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db.insert(s.users).values({ name, email, organisationId }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const participants = [];
  for (const projectId of projects) {
    const [p] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
    participants.push(p!);
  }
  return { user: user!, participants };
}

async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

async function notify(
  recipientParticipantId: string,
  eventType: string,
  subjectKind: string,
  subjectId: string,
): Promise<string> {
  const [row] = await db
    .insert(s.notifications)
    .values({ recipientParticipantId, eventType, subjectKind, subjectId })
    .returning();
  return row!.id;
}

const list = async (cookie: string, path = '/notifications'): Promise<ListNotificationsResponse> => {
  const res = await app.request(path, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as ListNotificationsResponse;
};

beforeAll(async () => {
  const [a] = await db.insert(s.organisations).values({ name: `t329 owner ${stamp}` }).returning();
  const [b] = await db.insert(s.organisations).values({ name: `t329 producer ${stamp}` }).returning();
  const [cOrg] = await db.insert(s.organisations).values({ name: `t329 rival ${stamp}` }).returning();
  ownerOrg = a!.id;
  producerOrg = b!.id;
  rivalOrg = cOrg!.id;

  const [project] = await db
    .insert(s.projects)
    .values({ name: `t329 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  const [other] = await db
    .insert(s.projects)
    .values({ name: `t329 second project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  otherProjectId = other!.id;

  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: producerOrg, projectId, role: 'member' },
    { organisationId: rivalOrg, projectId, role: 'member' },
    { organisationId: ownerOrg, projectId: otherProjectId, role: 'owner' },
    { organisationId: producerOrg, projectId: otherProjectId, role: 'member' },
  ]);

  const producer = await makeUser('t329-pia', producerOrg, [projectId, otherProjectId]);
  producerParticipantId = producer.participants[0]!.id;
  producerOtherParticipantId = producer.participants[1]!.id;
  producerCookie = await session(producer.user.email);

  const rival = await makeUser('t329-rex', rivalOrg, [projectId]);
  rivalParticipantId = rival.participants[0]!.id;
  rivalCookie = await session(rival.user.email);

  // the producer's org-private working area
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      owningOrganisationId: producerOrg,
      createdByParticipantId: producerParticipantId,
      scope: 'single_org',
      name: 'T329 sandbox',
    })
    .returning();
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: producerOrg,
      sandboxId: sandbox!.id,
      title: 'Chapter 7 — Noise and Vibration',
      content: 'The draft.',
      createdByParticipantId: producerParticipantId,
    })
    .returning();
  sandboxDocId = doc!.id;
  const [comment] = await db
    .insert(s.sandboxComments)
    .values({
      sandboxDocumentId: sandboxDocId,
      authorParticipantId: producerParticipantId,
      body: 'THE COMMENT TEXT THAT MUST NEVER APPEAR IN A NOTIFICATION',
    })
    .returning();
  commentId = comment!.id;

  // a published deliverable of the producer's, with a cycle and a round
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: producerOrg,
      documentReference: `T329-CH7-${stamp}`,
      inLibrary: true,
    })
    .returning();
  containerId = container!.id;
  const [version] = await db
    .insert(s.versions)
    .values({ containerId, versionReference: 'P01', content: 'issued', isCurrent: true })
    .returning();
  const [cycle] = await db.insert(s.reviewCycles).values({ containerId }).returning();
  const [round] = await db
    .insert(s.rounds)
    .values({ cycleId: cycle!.id, number: 1, versionId: version!.id })
    .returning();
  roundId = round!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('the record and its read (T-329)', () => {
  it('lists a notification with its subject resolved LIVE — never a stored label', async () => {
    await notify(producerParticipantId, 'round-issued', 'round', roundId);
    const body = await list(producerCookie);
    const item = body.items.find((n) => n.subject.id === roundId)!;
    expect(item).toBeDefined();
    expect(item.eventType).toBe('round-issued');
    expect(item.subject.label).toBe(`Round 1 on T329-CH7-${stamp}`);
    expect(item.projectId).toBe(projectId);
    expect(item.readAt).toBeNull();
    // a round is read on its deliverable, not at its own grain — the target is
    // resolved in the SAME pass that decided the row was visible
    expect(item.subject.opens).toEqual({ kind: 'container', id: containerId });

    // the label tracks the subject, because it is resolved and not copied: the
    // whole point of storing no content is that the record cannot go stale or
    // outlive the access that permitted it
    await db
      .update(s.containers)
      .set({ documentReference: `T329-RENAMED-${stamp}` })
      .where(eq(s.containers.id, containerId));
    const again = await list(producerCookie);
    expect(again.items.find((n) => n.subject.id === roundId)!.subject.label).toBe(
      `Round 1 on T329-RENAMED-${stamp}`,
    );
    await db
      .update(s.containers)
      .set({ documentReference: `T329-CH7-${stamp}` })
      .where(eq(s.containers.id, containerId));
  });

  it('names the comment’s document and never the comment’s text (§4’s rule, in-app)', async () => {
    await notify(producerParticipantId, 'mention', 'sandbox-comment', commentId);
    const body = await list(producerCookie);
    const item = body.items.find((n) => n.subject.id === commentId)!;
    expect(item.subject.label).toBe('a comment on Chapter 7 — Noise and Vibration');
    expect(item.subject.opens).toEqual({ kind: 'sandbox-document', id: sandboxDocId });
    expect(JSON.stringify(body)).not.toContain('THE COMMENT TEXT');
  });
});

describe('visibility follows the subject, and never runs independently (§3)', () => {
  it('a notification pointing into another organisation’s sandbox is INVISIBLE to its recipient', async () => {
    // the leak this rule exists to stop: a real row, a real recipient on this
    // project, pointing at a document behind the wall. Nothing about the row
    // itself is wrong — it is the subject that decides.
    await notify(rivalParticipantId, 'mention', 'sandbox-comment', commentId);
    const body = await list(rivalCookie);
    expect(body.items).toHaveLength(0);
    expect(body.unread).toBe(0);
  });

  it('a deliverable the third organisation cannot see takes its notification with it', async () => {
    await notify(rivalParticipantId, 'round-issued', 'round', roundId);
    const body = await list(rivalCookie);
    expect(body.items).toHaveLength(0);
  });

  it('the count and the list come off ONE resolution — a hidden row is not counted either', async () => {
    const body = await list(rivalCookie);
    // two rows exist for this participant; both are invisible, so the badge
    // must not say "2" over an empty list — that would itself disclose them
    const stored = await db
      .select()
      .from(s.notifications)
      .where(eq(s.notifications.recipientParticipantId, rivalParticipantId));
    expect(stored.length).toBeGreaterThanOrEqual(2);
    expect(body.unread).toBe(0);
    expect(body.unreadByProject).toEqual([]);
  });

  it('a subject that no longer exists resolves to nothing rather than to a broken row', async () => {
    await notify(producerParticipantId, 'mention', 'sandbox-comment', crypto.randomUUID());
    const body = await list(producerCookie);
    expect(body.items.every((n) => n.subject.label.length > 0)).toBe(true);
  });

  it('a subject kind the contracts union does not carry is not guessed at', async () => {
    // the store is `text` so ADR-0049 §2's guard holds; the vocabulary is still
    // closed at the surface, and an unknown kind reads as nothing rather than
    // as a half-rendered row
    const id = await notify(producerParticipantId, 'lock-flipped', 'workspace', crypto.randomUUID());
    const body = await list(producerCookie);
    expect(body.items.find((n) => n.id === id)).toBeUndefined();
  });

  it('a notification addressed to an ENDED engagement goes dark with the engagement', async () => {
    const gone = await makeUser('t329-gus', producerOrg, [projectId]);
    const cookie = await session(gone.user.email);
    await notify(gone.participants[0]!.id, 'round-issued', 'round', roundId);
    expect((await list(cookie)).items).toHaveLength(1);
    await db
      .update(s.participants)
      .set({ removedAt: new Date() })
      .where(eq(s.participants.id, gone.participants[0]!.id));
    // the participant interval closing is the same act that ends the access
    // (ADR-0033) — nothing has to remember to sweep the notifications
    const after = await app.request('/notifications', { headers: { cookie } });
    expect(((await after.json()) as ListNotificationsResponse).items).toHaveLength(0);
  });
});

describe('the two scopes are different on purpose (§6b)', () => {
  it('the rail is the user’s own across every project; the panel is one project’s', async () => {
    await notify(producerOtherParticipantId, 'round-issued', 'container', containerId);
    // the second project's notification points at a container on the FIRST
    // project, so it resolves to nothing there — the wall does not open because
    // a notification crossed a project
    const rail = await list(producerCookie);
    expect(rail.items.some((n) => n.projectId === otherProjectId)).toBe(false);

    await notify(producerOtherParticipantId, 'round-issued', 'round', roundId);
    expect((await list(producerCookie)).items.some((n) => n.projectId === otherProjectId)).toBe(false);

    const panel = await list(producerCookie, `/projects/${projectId}/notifications`);
    expect(panel.items.every((n) => n.projectId === projectId)).toBe(true);
    expect(panel.items.length).toBeGreaterThan(0);
    expect(panel.unreadByProject.map((p) => p.projectId)).toEqual([projectId]);
  });

  it('a project the requester cannot reach is a 404, exactly like one that does not exist', async () => {
    const res = await app.request(`/projects/${crypto.randomUUID()}/notifications`, {
      headers: { cookie: producerCookie },
    });
    expect(res.status).toBe(404);
  });
});

describe('the read state (T-329’s mark-read API)', () => {
  it('marks one read, idempotently, and keeps the first time', async () => {
    const id = await notify(producerParticipantId, 'round-issued', 'round', roundId);
    const res = await app.request(`/notifications/${id}/read`, {
      method: 'POST',
      headers: { cookie: producerCookie },
    });
    expect(res.status).toBe(200);
    const first = ((await res.json()) as MarkNotificationReadResponse).notification.readAt;
    expect(first).not.toBeNull();

    const again = await app.request(`/notifications/${id}/read`, {
      method: 'POST',
      headers: { cookie: producerCookie },
    });
    expect(((await again.json()) as MarkNotificationReadResponse).notification.readAt).toBe(first);
  });

  it('cannot mark read what it cannot see — the same 404 the list’s silence gives', async () => {
    const id = await notify(rivalParticipantId, 'mention', 'sandbox-comment', commentId);
    const res = await app.request(`/notifications/${id}/read`, {
      method: 'POST',
      headers: { cookie: rivalCookie },
    });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(s.notifications).where(eq(s.notifications.id, id));
    expect(row!.readAt).toBeNull();
  });

  it('mark-all clears only what the requester was shown, at the scope asked for', async () => {
    await notify(producerParticipantId, 'round-issued', 'round', roundId);
    const before = await list(producerCookie, `/projects/${projectId}/notifications`);
    expect(before.unread).toBeGreaterThan(0);
    const res = await app.request(`/projects/${projectId}/notifications/read-all`, {
      method: 'POST',
      headers: { cookie: producerCookie },
    });
    expect(res.status).toBe(200);
    expect((await list(producerCookie, `/projects/${projectId}/notifications`)).unread).toBe(0);

    // the rival's invisible rows were never in anybody's mark-all
    const rivalRows = await db
      .select()
      .from(s.notifications)
      .where(eq(s.notifications.recipientParticipantId, rivalParticipantId));
    expect(rivalRows.every((r) => r.readAt === null)).toBe(true);
  });
});
