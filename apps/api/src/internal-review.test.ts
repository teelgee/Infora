// T-478 acceptance, against the live dev database: "Request internal review" is
// ONE act — it makes the freeze container, names the QA reviewer, freezes the
// draft as the next P revision, opens the internal round and leaves the note, all
// in one transaction (ADR-0032). A refusal leaves nothing behind.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { ensureDefaultSandbox } from './sandbox';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t478';
let projectId: string;
let org: string;
let otherOrg: string;
let authorCookie: string;
let authorParticipantId: string;
let reviewerParticipantId: string;
let secondReviewerParticipantId: string;
let strangerParticipantId: string; // another organisation's participant on the same project

async function makeUser(organisationId: string, name: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
  return { user: user!, participant: participant! };
}
async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}
const asJson = (cookie: string) => ({ cookie, 'content-type': 'application/json' });
async function makeDoc(title: string): Promise<string> {
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: org,
      sandboxId: await ensureDefaultSandbox(db, projectId, org, authorParticipantId),
      title,
      content: `${title} body`,
      createdByParticipantId: authorParticipantId,
    })
    .returning();
  return doc!.id;
}
const request = (docId: string, body: unknown, cookie = authorCookie) =>
  app.request(`/sandbox-documents/${docId}/internal-review`, {
    method: 'POST',
    headers: asJson(cookie),
    body: JSON.stringify(body),
  });
const containerOf = async (docId: string) =>
  (await db.select().from(s.containers).where(eq(s.containers.sandboxDocumentId, docId)))[0];
const commentsOf = (docId: string) =>
  db.select().from(s.sandboxComments).where(eq(s.sandboxComments.sandboxDocumentId, docId));
async function nothingWritten(docId: string) {
  const container = await containerOf(docId);
  expect(container).toBeUndefined();
  expect(await commentsOf(docId)).toHaveLength(0);
  const [doc] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, docId));
  expect(doc!.headLocked).toBe(false);
}

beforeAll(async () => {
  const [o] = await db.insert(s.organisations).values({ name: 't478 org' }).returning();
  org = o!.id;
  const [o2] = await db.insert(s.organisations).values({ name: 't478 other org' }).returning();
  otherOrg = o2!.id;
  const [project] = await db.insert(s.projects).values({ name: 't478 project', ownerOrganisationId: org }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org, projectId, role: 'owner' });
  await db.insert(s.memberships).values({ organisationId: otherOrg, projectId, role: 'member' });
  const author = await makeUser(org, 't478-amy');
  authorParticipantId = author.participant.id;
  authorCookie = await session(author.user.email);
  reviewerParticipantId = (await makeUser(org, 't478-rae')).participant.id;
  secondReviewerParticipantId = (await makeUser(org, 't478-sam')).participant.id;
  strangerParticipantId = (await makeUser(otherOrg, 't478-ola')).participant.id;
});

afterAll(async () => {
  await pool.end();
});

describe('request internal review in one step (T-478)', () => {
  it('from a working head with no freeze container, one call opens the round', async () => {
    const docId = await makeDoc('t478 first');
    expect(await containerOf(docId)).toBeUndefined();
    const res = await request(docId, { leadReviewerParticipantId: reviewerParticipantId, note: '  Please check section 3.  ' });
    expect(res.status).toBe(201);
    const out = (await res.json()) as {
      versionReference: string;
      containerId: string;
      roundId: string;
      noteCommentId: string;
    };
    expect(out.versionReference).toBe('P01');

    const container = await containerOf(docId);
    expect(container!.id).toBe(out.containerId);
    expect(container!.scope).toBe('sandbox');
    const [cycle] = await db.select().from(s.reviewCycles).where(eq(s.reviewCycles.containerId, container!.id));
    expect(cycle!.state).toBe('active');
    const [round] = await db.select().from(s.rounds).where(eq(s.rounds.cycleId, cycle!.id));
    expect(round!.id).toBe(out.roundId);
    expect(round!.state).toBe('open');
    expect(round!.number).toBe(1);

    const grants = await db
      .select()
      .from(s.deliverableReviewers)
      .where(eq(s.deliverableReviewers.containerId, container!.id));
    expect(grants).toHaveLength(1);
    expect(grants[0]!.participantId).toBe(reviewerParticipantId);
    expect(grants[0]!.isLead).toBe(true);
    expect(grants[0]!.confirmedAt).not.toBeNull();
    expect(grants[0]!.revokedAt).toBeNull();

    const [doc] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, docId));
    expect(doc!.headLocked).toBe(true);

    const comments = await commentsOf(docId);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.id).toBe(out.noteCommentId);
    expect(comments[0]!.body).toBe('Review request: Please check section 3.');
    expect(comments[0]!.mentions).toEqual([reviewerParticipantId]);
    expect(comments[0]!.authorParticipantId).toBe(authorParticipantId);
  });

  it('no note, no comment', async () => {
    const docId = await makeDoc('t478 no note');
    const res = await request(docId, { leadReviewerParticipantId: reviewerParticipantId });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { noteCommentId: string | null }).noteCommentId).toBeNull();
    expect(await commentsOf(docId)).toHaveLength(0);
  });

  it("a reviewer of another organisation is absence: 404 and nothing written", async () => {
    const docId = await makeDoc('t478 stranger');
    const res = await request(docId, { leadReviewerParticipantId: strangerParticipantId, note: 'hello' });
    expect(res.status).toBe(404);
    await nothingWritten(docId);
  });

  it('an unknown participant is absence too', async () => {
    const docId = await makeDoc('t478 unknown');
    const res = await request(docId, { leadReviewerParticipantId: crypto.randomUUID() });
    expect(res.status).toBe(404);
    await nothingWritten(docId);
  });

  it("another organisation's member cannot request on this document (404)", async () => {
    const docId = await makeDoc('t478 foreign requester');
    const outsider = await makeUser(otherOrg, 't478-ivy');
    const res = await request(docId, { leadReviewerParticipantId: reviewerParticipantId }, await session(outsider.user.email));
    expect(res.status).toBe(404);
    await nothingWritten(docId);
  });

  it('a bad body is 400 and writes nothing', async () => {
    const docId = await makeDoc('t478 bad body');
    expect((await request(docId, { note: 'no reviewer' })).status).toBe(400);
    expect((await request(docId, { leadReviewerParticipantId: reviewerParticipantId, note: 'x'.repeat(2001) })).status).toBe(400);
    await nothingWritten(docId);
  });

  it('a second call while the round is open is 409 round_open and writes nothing more', async () => {
    const docId = await makeDoc('t478 open');
    expect((await request(docId, { leadReviewerParticipantId: reviewerParticipantId, note: 'one' })).status).toBe(201);
    const container = (await containerOf(docId))!;
    const res = await request(docId, { leadReviewerParticipantId: secondReviewerParticipantId, note: 'two' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('round_open');
    // the refused call named nobody, froze nothing, commented nothing
    const grants = await db.select().from(s.deliverableReviewers).where(eq(s.deliverableReviewers.containerId, container.id));
    expect(grants).toHaveLength(1);
    expect(grants[0]!.participantId).toBe(reviewerParticipantId);
    expect(grants[0]!.revokedAt).toBeNull();
    const versions = await db.select().from(s.versions).where(eq(s.versions.containerId, container.id));
    expect(versions).toHaveLength(1);
    expect(await commentsOf(docId)).toHaveLength(1);
  });

  it('a plain check-out with no round upgrades into a round, replacing a different standing lead', async () => {
    const docId = await makeDoc('t478 upgrade');
    // the old three-step path, half done: a plain freeze and a lead who stands
    const frozen = await app.request(`/sandbox-documents/${docId}/freeze`, { method: 'POST', headers: asJson(authorCookie) });
    expect(frozen.status).toBe(201);
    const containerId = ((await frozen.json()) as { containerId: string }).containerId;
    const first = await app.request(`/containers/${containerId}/reviewers`, {
      method: 'POST',
      headers: asJson(authorCookie),
      body: JSON.stringify({ participantId: secondReviewerParticipantId, isLead: true }),
    });
    expect(first.status).toBe(201);

    const res = await request(docId, { leadReviewerParticipantId: reviewerParticipantId });
    expect(res.status).toBe(201);
    const out = (await res.json()) as { versionReference: string };
    expect(out.versionReference).toBe('P01');
    const grants = await db.select().from(s.deliverableReviewers).where(eq(s.deliverableReviewers.containerId, containerId));
    const live = grants.filter((g) => g.revokedAt === null);
    expect(live).toHaveLength(1);
    expect(live[0]!.participantId).toBe(reviewerParticipantId);
    expect(grants.filter((g) => g.participantId === secondReviewerParticipantId)[0]!.revokedAt).not.toBeNull();
  });

  it('the same person already standing as lead keeps their grant', async () => {
    const docId = await makeDoc('t478 same lead');
    const frozen = await app.request(`/sandbox-documents/${docId}/freeze`, { method: 'POST', headers: asJson(authorCookie) });
    const containerId = ((await frozen.json()) as { containerId: string }).containerId;
    const grant = await app.request(`/containers/${containerId}/reviewers`, {
      method: 'POST',
      headers: asJson(authorCookie),
      body: JSON.stringify({ participantId: reviewerParticipantId, isLead: true }),
    });
    const grantId = ((await grant.json()) as { id: string }).id;
    expect((await request(docId, { leadReviewerParticipantId: reviewerParticipantId })).status).toBe(201);
    const grants = await db.select().from(s.deliverableReviewers).where(eq(s.deliverableReviewers.containerId, containerId));
    expect(grants).toHaveLength(1);
    expect(grants[0]!.id).toBe(grantId);
    expect(grants[0]!.revokedAt).toBeNull();
  });

  it('naming yourself follows the existing appointment rules (none stands in the way)', async () => {
    const docId = await makeDoc('t478 self');
    const res = await request(docId, { leadReviewerParticipantId: authorParticipantId });
    expect(res.status).toBe(201);
  });

  it('the plain freeze route still behaves as before: no lead, a v0.x check-out', async () => {
    const docId = await makeDoc('t478 plain');
    const res = await app.request(`/sandbox-documents/${docId}/freeze`, { method: 'POST', headers: asJson(authorCookie) });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { versionReference: string }).versionReference).toBe('v0.1');
    const again = await app.request(`/sandbox-documents/${docId}/freeze`, { method: 'POST', headers: asJson(authorCookie) });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { detail?: string }).detail).toBe('already_checked_out');
  });
});
