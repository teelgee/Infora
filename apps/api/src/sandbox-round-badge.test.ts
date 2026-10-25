// T-486 (e) — the sandbox list carries each draft's latest internal QA round, so
// the row's badge reads what the editor's reads.
//
// *In plain terms: while a draft is in internal QA the editor says "In internal
// QA P01", but its row on the sandbox screen still said "Frozen v0.2". The list
// now says which round a draft is in and whether it was accepted, worked out in
// one batch for the whole list by the same rule the editor applies to the cycle
// it loads. A draft with no round carries nothing, and nobody's name is in it.*
//
// A fresh organisation and project; every row is looked up by an id this file
// made, never by title.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { internalRoundOf } from '@infora/contracts';
import type { GetCycleResponse, ListSandboxDocumentsResponse, SandboxDocument } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { ensureDefaultSandbox } from './sandbox';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t486e';
let projectId: string;
let orgId: string;
let authorCookie: string;
let authorParticipantId: string;
let reviewerParticipantId: string;
let strangerCookie: string;

async function makeUser(organisationId: string, name: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password }),
  });
  return { participant: participant!, cookie: res.headers.get('set-cookie')!.split(';')[0]! };
}
const asJson = (cookie: string) => ({ cookie, 'content-type': 'application/json' });

async function makeDoc(title: string): Promise<string> {
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: orgId,
      sandboxId: await ensureDefaultSandbox(db, projectId, orgId, authorParticipantId),
      title,
      content: `${title} body`,
      createdByParticipantId: authorParticipantId,
    })
    .returning();
  return doc!.id;
}
const requestReview = (docId: string) =>
  app.request(`/sandbox-documents/${docId}/internal-review`, {
    method: 'POST',
    headers: asJson(authorCookie),
    body: JSON.stringify({ leadReviewerParticipantId: reviewerParticipantId }),
  });
const freezeContainerOf = async (docId: string) =>
  (await db.select().from(s.containers).where(eq(s.containers.sandboxDocumentId, docId)))[0]!;
const cycleOf = async (docId: string) =>
  (await db.select().from(s.reviewCycles).where(eq(s.reviewCycles.containerId, (await freezeContainerOf(docId)).id)))[0]!;
async function listed(cookie = authorCookie): Promise<Map<string, SandboxDocument>> {
  const res = await app.request(`/projects/${projectId}/sandbox-documents`, { headers: { cookie } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as ListSandboxDocumentsResponse;
  return new Map(body.items.map((item) => [item.id, item]));
}

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t486e org ${stamp}` }).returning();
  orgId = org!.id;
  const [other] = await db.insert(s.organisations).values({ name: `t486e other ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t486e project ${stamp}`, ownerOrganisationId: orgId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgId, projectId, role: 'owner' },
    { organisationId: other!.id, projectId, role: 'member' },
  ]);
  const author = await makeUser(orgId, 't486e-amy');
  authorParticipantId = author.participant.id;
  authorCookie = author.cookie;
  reviewerParticipantId = (await makeUser(orgId, 't486e-rae')).participant.id;
  strangerCookie = (await makeUser(other!.id, 't486e-ola')).cookie;
});

afterAll(async () => {
  await pool.end();
});

describe('the sandbox list carries the latest internal round (T-486 e)', () => {
  it('a draft with an open internal round carries it, and a draft with none carries nothing', async () => {
    const plain = await makeDoc('t486e plain');
    const inQa = await makeDoc('t486e in qa');
    expect((await requestReview(inQa)).status).toBe(201);
    const rows = await listed();
    expect(rows.get(inQa)!.internalRound).toEqual({ state: 'open', versionReference: 'P01' });
    // absent, not null and not an empty object
    expect('internalRound' in rows.get(plain)!).toBe(false);
    // the freeze container still shows, so the editor's own read is the same one
    expect(rows.get(inQa)!.freezeContainerId).toBe((await freezeContainerOf(inQa)).id);
  });

  it('an accepted internal cycle says QA accepted at its latest round', async () => {
    const docId = await makeDoc('t486e accepted');
    expect((await requestReview(docId)).status).toBe(201);
    // the acceptance itself is a long path through the review flow (a verdict,
    // a response, the lead's code); the list only has to read the state it ends in
    await db.update(s.reviewCycles).set({ state: 'accepted' }).where(eq(s.reviewCycles.id, (await cycleOf(docId)).id));
    expect((await listed()).get(docId)!.internalRound).toEqual({ state: 'accepted', versionReference: 'P01' });
  });

  it('a round that has been issued and not yet answered is neither open nor accepted, so the row keeps its old words', async () => {
    const docId = await makeDoc('t486e issued');
    expect((await requestReview(docId)).status).toBe(201);
    await db.update(s.rounds).set({ state: 'issued' }).where(eq(s.rounds.cycleId, (await cycleOf(docId)).id));
    expect('internalRound' in (await listed()).get(docId)!).toBe(false);
  });

  it('a plain freeze with no round, and a cycle closed as rejected, carry nothing', async () => {
    const frozen = await makeDoc('t486e plain freeze');
    const res = await app.request(`/sandbox-documents/${frozen}/freeze`, { method: 'POST', headers: asJson(authorCookie) });
    expect(res.status).toBe(201);
    const rejected = await makeDoc('t486e rejected');
    expect((await requestReview(rejected)).status).toBe(201);
    await db.update(s.reviewCycles).set({ state: 'closed_rejected' }).where(eq(s.reviewCycles.id, (await cycleOf(rejected)).id));
    const rows = await listed();
    expect('internalRound' in rows.get(frozen)!).toBe(false);
    expect('internalRound' in rows.get(rejected)!).toBe(false);
  });

  it('with several rounds it is the LATEST round of the latest cycle that is read', async () => {
    const docId = await makeDoc('t486e two rounds');
    expect((await requestReview(docId)).status).toBe(201);
    const container = await freezeContainerOf(docId);
    const cycle = await cycleOf(docId);
    // round 1 was answered; the draft was frozen again as P02 and round 2 is open
    await db.update(s.rounds).set({ state: 'responded' }).where(eq(s.rounds.cycleId, cycle.id));
    const [second] = await db
      .insert(s.versions)
      .values({ containerId: container.id, versionReference: 'P02', content: 't486e two rounds body v2', isCurrent: true })
      .returning();
    await db.insert(s.rounds).values({ cycleId: cycle.id, number: 2, versionId: second!.id, state: 'open' });
    expect((await listed()).get(docId)!.internalRound).toEqual({ state: 'open', versionReference: 'P02' });
  });

  it('the row and the editor cannot disagree: the list agrees with the rule applied to the cycle the editor loads', async () => {
    const docId = await makeDoc('t486e one rule');
    expect((await requestReview(docId)).status).toBe(201);
    const container = await freezeContainerOf(docId);
    const cycleRes = await app.request(`/containers/${container.id}/cycle`, { headers: { cookie: authorCookie } });
    expect(cycleRes.status).toBe(200);
    const cycle = (await cycleRes.json()) as GetCycleResponse;
    expect(internalRoundOf(cycle)).toEqual({ state: 'open', versionReference: 'P01' });
    expect((await listed()).get(docId)!.internalRound).toEqual(internalRoundOf(cycle));
  });

  it('is the organisation’s own list: another organisation’s members see none of these drafts, and so no round', async () => {
    const docId = await makeDoc('t486e private');
    expect((await requestReview(docId)).status).toBe(201);
    expect((await listed(strangerCookie)).has(docId)).toBe(false);
    // and the round names no person: only a state and a P reference
    expect(Object.keys((await listed()).get(docId)!.internalRound!).sort()).toEqual(['state', 'versionReference']);
  });
});

describe('internalRoundOf is the one rule (T-486 e)', () => {
  const round = (state: 'submitted' | 'open' | 'issued' | 'responded', versionReference = 'P01') => ({ state, versionReference });
  it('an accepted cycle is accepted; an active cycle with an open latest round is open; anything else is neither', () => {
    expect(internalRoundOf({ state: 'accepted', rounds: [round('responded')] })).toEqual({ state: 'accepted', versionReference: 'P01' });
    expect(internalRoundOf({ state: 'active', rounds: [round('responded'), round('open', 'P02')] })).toEqual({ state: 'open', versionReference: 'P02' });
    expect(internalRoundOf({ state: 'active', rounds: [round('issued')] })).toBeNull();
    expect(internalRoundOf({ state: 'closed_rejected', rounds: [round('open')] })).toBeNull();
    expect(internalRoundOf({ state: 'active', rounds: [] })).toBeNull();
    expect(internalRoundOf(null)).toBeNull();
    expect(internalRoundOf(undefined)).toBeNull();
  });
});
