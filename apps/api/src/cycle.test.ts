// T-120+ acceptance, against the live dev database: promotion as the
// near-empty hand-off launching the cycle (ADR-0002/0008/0014/0017/0032),
// then the round loop as its tickets land.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PromotionResult, ReviewCycle } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { and, eq } from 'drizzle-orm';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t120';
let projectId: string;
let ownerOrg: string;
let consultOrg: string;
let containerId: string;
let documentId: string;
let leadAuthorCookie: string; // consultant lead author
let colleagueCookie: string; // consultant non-lead author
let ownerCookie: string; // owner-side lead reviewer
let leadAuthorParticipantId: string;
let colleagueParticipantId: string;
let ownerParticipantId: string;

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
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
const promote = (cookie: string, docId = documentId) =>
  app.request(`/sandbox-documents/${docId}/promotion`, { method: 'POST', headers: asJson(cookie) });

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: 't120 owner org' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't120 consult org' }).returning();
  ownerOrg = oA!.id;
  consultOrg = oB!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't120 project', ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: consultOrg, projectId, role: 'member' },
  ]);
  await db.insert(s.acceptanceCodes).values([
    { projectId, code: 'A', description: 'Accepted', isAccepting: true, sortOrder: 1 },
    { projectId, code: 'C', description: 'Revise and resubmit', isAccepting: false, sortOrder: 2 },
  ]);

  const lead = await makeUser('t120-lena', consultOrg);
  const colleague = await makeUser('t120-cole', consultOrg);
  const owner = await makeUser('t120-opal', ownerOrg);
  leadAuthorParticipantId = lead.participant.id;
  colleagueParticipantId = colleague.participant.id;
  ownerParticipantId = owner.participant.id;
  leadAuthorCookie = await session(lead.user.email);
  colleagueCookie = await session(colleague.user.email);
  ownerCookie = await session(owner.user.email);

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: consultOrg,
      documentReference: `T120-DEL-${stamp}`,
      inLibrary: false,
    })
    .returning();
  containerId = container!.id;
  await db.insert(s.workItems).values({
    projectId,
    type: 'document_production',
    title: 't120 statement',
    status: 'drafting',
    containerId,
    assigneeParticipantId: leadAuthorParticipantId,
  });
  await db.insert(s.deliverableAuthors).values([
    {
      containerId,
      participantId: leadAuthorParticipantId,
      isLead: true,
      grantedByParticipantId: leadAuthorParticipantId,
    },
    {
      containerId,
      participantId: colleagueParticipantId,
      grantedByParticipantId: leadAuthorParticipantId,
    },
  ]);

  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: consultOrg,
      title: 't120 draft',
      content: 'The drafted statement, ready for round one.',
      containerId,
      createdByParticipantId: leadAuthorParticipantId,
    })
    .returning();
  documentId = doc!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('promotion (T-120)', () => {
  it('cannot launch without a confirmed lead reviewer (ADR-0005/0008)', async () => {
    const res = await promote(leadAuthorCookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('no_lead_reviewer');
    // appoint the owner as confirmed lead reviewer, by the owner
    await db.insert(s.deliverableReviewers).values({
      containerId,
      participantId: ownerParticipantId,
      isLead: true,
      grantedByParticipantId: ownerParticipantId,
      confirmedByParticipantId: ownerParticipantId,
      confirmedAt: new Date(),
    });
  });

  it('only the lead author promotes (ADR-0017)', async () => {
    const byColleague = await promote(colleagueCookie);
    expect(byColleague.status).toBe(403);
    const byOwner = await promote(ownerCookie);
    expect(byOwner.status).toBe(404); // not their sandbox — the wall, silent
  });

  it('the first promotion snapshots the head, launches the cycle and opens round 1', async () => {
    const res = await promote(leadAuthorCookie);
    expect(res.status).toBe(201);
    const result = (await res.json()) as PromotionResult;
    expect(result.versionReference).toBe('v1');
    expect(result.roundNumber).toBe(1);

    const [version] = await db.select().from(s.versions).where(eq(s.versions.id, result.versionId));
    expect(version!.content).toBe('The drafted statement, ready for round one.');
    expect(version!.isCurrent).toBe(true);

    const cycleRead = await app.request(`/containers/${containerId}/cycle`, {
      headers: { cookie: ownerCookie },
    });
    expect(cycleRead.status).toBe(200);
    const cycle = (await cycleRead.json()) as ReviewCycle;
    expect(cycle.state).toBe('active');
    expect(cycle.editLockHolder).toBe('reviewing'); // the reviewers hold the pen
    expect(cycle.rounds).toHaveLength(1);
    expect(cycle.rounds[0]!.state).toBe('open');
    expect(cycle.rounds[0]!.transmittals).toHaveLength(1); // promotion IS the transmittal

    // the work item moved by the event, not a hand (ADR-0032 addendum)
    const [workItem] = await db
      .select()
      .from(s.workItems)
      .where(eq(s.workItems.containerId, containerId));
    expect(workItem!.status).toBe('in_review');
  });

  it('a second promotion while the round is open is refused — one round, one lock (ADR-0014)', async () => {
    const res = await promote(leadAuthorCookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('round_not_in_respond_phase');
  });

  it('an unplanned document cannot promote', async () => {
    const [adhoc] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: consultOrg,
        title: 't120 ad hoc',
        createdByParticipantId: leadAuthorParticipantId,
      })
      .returning();
    const res = await promote(leadAuthorCookie, adhoc!.id);
    expect(res.status).toBe(400);
  });
});

describe('the cycle read is phased (ADR-0014)', () => {
  it('the open round hides its comments from the authoring side, not from reviewers', async () => {
    // the owner (a confirmed reviewer) drops a comment directly
    const [cycleRow] = await db
      .select()
      .from(s.reviewCycles)
      .where(and(eq(s.reviewCycles.containerId, containerId), eq(s.reviewCycles.state, 'active')));
    const [round] = await db.select().from(s.rounds).where(eq(s.rounds.cycleId, cycleRow!.id));
    const [version] = await db.select().from(s.versions).where(eq(s.versions.id, round!.versionId));
    await db.insert(s.reviewComments).values({
      roundId: round!.id,
      versionId: version!.id,
      authorParticipantId: ownerParticipantId,
      body: 'reviewer-side deliberation — walled while open',
    });

    const asReviewer = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: ownerCookie } })
    ).json()) as ReviewCycle;
    expect(asReviewer.rounds[0]!.comments).toHaveLength(1);

    const asAuthor = (await (
      await app.request(`/containers/${containerId}/cycle`, { headers: { cookie: leadAuthorCookie } })
    ).json()) as ReviewCycle;
    expect(asAuthor.rounds[0]!.comments).toHaveLength(0); // hidden until issued
  });
});
