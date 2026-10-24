// T-474 acceptance — supersede impact, the first notification producer, and
// stale grounding, over HTTP against the live dev database.
//
// The cases that matter are the negatives: organisation C, which cited nothing,
// is told nothing and sees nothing; and the OWNER's dialog does not change when
// another firm's private draft cites the document (ADR-0049's amendment of
// 2026-10-24). Stamped data for shared-database isolation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  ContainerCitedByResponse,
  ContainerImpactResponse,
  ListNotificationsResponse,
  StaleGroundingResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s, seedProjectOntology } from '@infora/db';
import { groupByOrganisation, readImpact, versionIdsOfContainer } from '@infora/knowledge';
import { createQaDocumentCheck } from '@infora/orchestration';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t474';
const SENTENCE = 'Made ground was found to a depth of 2.4 m across the compound.';

let projectId: string;
let ownerOrg: string;
let orgB: string;
let orgC: string;
let ownerP: string;
let bP: string;
let cP: string;
let ownerCookie: string;
let bCookie: string;
let cCookie: string;
let bSandbox: string;
let ownerSandbox: string;
let cSandbox: string;
let libraryA: { containerId: string; versionId: string };
let replacement: { containerId: string; versionId: string };
// the chapter this run created; looked up by id because titles repeat across runs on the shared database
let chapter: string;

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId, orgRole: 'admin' })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated: true })
    .returning();
  return participant!.id;
}

async function session(name: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}-${stamp}@test.local`, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

function req(path: string, cookie: string, method = 'GET', body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function sandboxFor(organisationId: string, participantId: string) {
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      name: `wa-${organisationId.slice(0, 6)}-${stamp}`,
      scope: 'single_org',
      owningOrganisationId: organisationId,
      createdByParticipantId: participantId,
    })
    .returning();
  await db.insert(s.sandboxScopeGrants).values({
    sandboxId: sandbox!.id,
    granteeType: 'organisation',
    organisationId,
    grantedByParticipantId: participantId,
  });
  return sandbox!.id;
}

async function libraryDoc(ref: string) {
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: ownerOrg, documentReference: `${ref}-${stamp}`, inLibrary: true })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content: `body ${ref}`, isCurrent: true })
    .returning();
  for (const [orgId, participantId] of [[orgB, bP], [orgC, cP]] as const) {
    await db.insert(s.deliverableShares).values({ containerId: container!.id, organisationId: orgId, grantedByParticipantId: ownerP });
    await db.insert(s.deliverableAcknowledgements).values({
      containerId: container!.id,
      versionId: version!.id,
      organisationId: orgId,
      acknowledgedByParticipantId: participantId,
    });
  }
  return { containerId: container!.id, versionId: version!.id };
}

/** A working document holding one accepted suggestion that cites the version. */
async function citingDraft(opts: {
  organisationId: string;
  participantId: string;
  sandboxId: string;
  versionId: string;
  title: string;
  content?: string;
}) {
  const content = opts.content ?? SENTENCE;
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: opts.organisationId,
      sandboxId: opts.sandboxId,
      title: opts.title,
      content,
      createdByParticipantId: opts.participantId,
    })
    .returning();
  const [conversation] = await db.insert(s.conversations).values({ projectId, sandboxDocumentId: doc!.id, surface: 'web' }).returning();
  const [run] = await db
    .insert(s.runs)
    .values({
      conversationId: conversation!.id,
      agentId: 'test',
      agentProvenance: 'infora',
      request: `draft ${opts.title}`,
      environmentKey: projectId,
      requesterParticipantId: opts.participantId,
    })
    .returning();
  const [suggestion] = await db
    .insert(s.suggestions)
    .values({ runId: run!.id, sandboxDocumentId: doc!.id, kind: 'insert', content: SENTENCE, rationale: 'r' })
    .returning();
  await db.insert(s.citations).values({
    suggestionId: suggestion!.id,
    versionId: opts.versionId,
    claimSpan: { start: 0, end: SENTENCE.length },
  });
  await db.insert(s.signals).values({
    suggestionId: suggestion!.id,
    resolution: 'accepted',
    resolvedByParticipantId: opts.participantId,
  });
  return doc!.id;
}

beforeAll(async () => {
  const [o] = await db.insert(s.organisations).values({ name: `Owner-${stamp}` }).returning();
  const [b] = await db.insert(s.organisations).values({ name: `B-${stamp}` }).returning();
  const [c] = await db.insert(s.organisations).values({ name: `C-${stamp}` }).returning();
  ownerOrg = o!.id;
  orgB = b!.id;
  orgC = c!.id;
  const [project] = await db.insert(s.projects).values({ name: `P-${stamp}`, ownerOrganisationId: ownerOrg }).returning();
  projectId = project!.id;
  for (const [org, role] of [[ownerOrg, 'owner'], [orgB, 'member'], [orgC, 'member']] as const) {
    await db.insert(s.memberships).values({ organisationId: org, projectId, role, state: 'active' });
  }
  await seedProjectOntology(db, projectId);
  ownerP = await makeUser('own', ownerOrg);
  bP = await makeUser('bee', orgB);
  cP = await makeUser('sea', orgC);
  ownerCookie = await session('own');
  bCookie = await session('bee');
  cCookie = await session('sea');
  ownerSandbox = await sandboxFor(ownerOrg, ownerP);
  bSandbox = await sandboxFor(orgB, bP);
  cSandbox = await sandboxFor(orgC, cP);
  libraryA = await libraryDoc('T474-A');
  replacement = await libraryDoc('T474-R');
});

afterAll(async () => {
  await pool.end();
});

describe('T-474 — supersede impact, per organisation and never a total', () => {
  let privateDraft: string;

  it('B sees its two citing drafts, C sees nothing, and only B is in the full grouping', async () => {
    chapter = await citingDraft({ organisationId: orgB, participantId: bP, sandboxId: bSandbox, versionId: libraryA.versionId, title: 'Chapter 9' });
    privateDraft = await citingDraft({ organisationId: orgB, participantId: bP, sandboxId: bSandbox, versionId: libraryA.versionId, title: 'Private note' });
    await citingDraft({ organisationId: orgC, participantId: cP, sandboxId: cSandbox, versionId: replacement.versionId, title: 'C cites something else' });
    const versionIds = await versionIdsOfContainer(db, libraryA.containerId);
    const forB = await readImpact(db, versionIds, { organisationId: orgB });
    expect(forB.filter((t) => t.kind === 'draft').map((t) => t.title).sort()).toEqual(['Chapter 9', 'Private note']);
    expect(await readImpact(db, versionIds, { organisationId: orgC })).toEqual([]);
    expect(await readImpact(db, versionIds, { organisationId: ownerOrg })).toEqual([]);
    expect([...groupByOrganisation(await readImpact(db, versionIds)).keys()]).toEqual([orgB]);
    expect(chapter).not.toBe(privateDraft);
  });

  it('a deleted working document is no longer affected', async () => {
    const gone = await citingDraft({ organisationId: orgB, participantId: bP, sandboxId: bSandbox, versionId: libraryA.versionId, title: 'Deleted one' });
    await db.update(s.sandboxDocuments).set({ deletedAt: new Date() }).where(eq(s.sandboxDocuments.id, gone));
    const forB = await readImpact(db, await versionIdsOfContainer(db, libraryA.containerId), { organisationId: orgB });
    expect(forB.map((t) => t.title)).not.toContain('Deleted one');
  });

  it('a past answer whose step citations name it counts as a run, for its requester\'s organisation only', async () => {
    const [conversation] = await db.insert(s.conversations).values({ projectId, surface: 'web' }).returning();
    const [run] = await db
      .insert(s.runs)
      .values({ conversationId: conversation!.id, agentId: 'test', agentProvenance: 'infora', request: 'What did the ground investigation find?', environmentKey: projectId, requesterParticipantId: cP })
      .returning();
    const [step] = await db.insert(s.steps).values({ runId: run!.id, type: 'cite' }).returning();
    await db.insert(s.citations).values({ stepId: step!.id, versionId: libraryA.versionId });
    const versionIds = await versionIdsOfContainer(db, libraryA.containerId);
    const forC = await readImpact(db, versionIds, { organisationId: orgC });
    expect(forC.map((t) => [t.kind, t.title])).toEqual([['run', 'What did the ground investigation find?']]);
    const forB = await readImpact(db, versionIds, { organisationId: orgB });
    expect(forB.some((t) => t.kind === 'run')).toBe(false);
    // C now has an affected thing — but only a past answer, which has no
    // document to point a notification at. (Removed again below so the
    // later cases keep "C sees nothing" true.)
    await db.delete(s.citations).where(eq(s.citations.stepId, step!.id));
    expect(await readImpact(db, versionIds, { organisationId: orgC })).toEqual([]);
  });

  it('a library revision whose bound working document took the citation first is counted (by time), for its producer', async () => {
    const [container] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: orgB, documentReference: `T474-B-DELIV-${stamp}`, inLibrary: true })
      .returning();
    const doc = await citingDraft({ organisationId: orgB, participantId: bP, sandboxId: bSandbox, versionId: libraryA.versionId, title: 'Bound draft' });
    await db.update(s.sandboxDocuments).set({ containerId: container!.id }).where(eq(s.sandboxDocuments.id, doc));
    await db.insert(s.versions).values({ containerId: container!.id, versionReference: 'v1', content: 'promoted', isCurrent: true });
    const forB = await readImpact(db, await versionIdsOfContainer(db, libraryA.containerId), { organisationId: orgB });
    expect(forB.some((t) => t.kind === 'library-version' && t.title.endsWith(' v1'))).toBe(true);
    // tidy so the counts below stay as described
    await db.update(s.sandboxDocuments).set({ deletedAt: new Date() }).where(eq(s.sandboxDocuments.id, doc));
  });

  it('the owner\'s dialog shows the owner\'s own work and library edges — and does not change when B\'s private draft cites the document', async () => {
    const before = await req(`/containers/${libraryA.containerId}/impact`, ownerCookie);
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as ContainerImpactResponse;
    expect(beforeBody.ownWork).toEqual([]); // B's two drafts are invisible here
    expect(beforeBody.edges).toEqual([]);
    // the owner cites it in a draft of their own: it appears
    await citingDraft({ organisationId: ownerOrg, participantId: ownerP, sandboxId: ownerSandbox, versionId: libraryA.versionId, title: 'Owner note' });
    const withOwn = (await (await req(`/containers/${libraryA.containerId}/impact`, ownerCookie)).json()) as ContainerImpactResponse;
    expect(withOwn.ownWork.map((i) => i.title)).toEqual(['Owner note']);
    // ...and B drafts another private draft that cites it: nothing moves
    await citingDraft({ organisationId: orgB, participantId: bP, sandboxId: bSandbox, versionId: libraryA.versionId, title: 'Another private draft' });
    const after = (await (await req(`/containers/${libraryA.containerId}/impact`, ownerCookie)).json()) as ContainerImpactResponse;
    expect(after).toEqual(withOwn);
    // a library edge pointing at it shows
    await db.insert(s.documentRelationships).values({
      projectId,
      fromContainerId: replacement.containerId,
      toContainerId: libraryA.containerId,
      type: 'references',
      createdByParticipantId: ownerP,
      confirmedByParticipantId: ownerP,
      confirmedAt: new Date(),
    });
    const withEdge = (await (await req(`/containers/${libraryA.containerId}/impact`, ownerCookie)).json()) as ContainerImpactResponse;
    expect(withEdge.edges.map((e) => e.otherDocumentReference)).toEqual([`T474-R-${stamp}`]);
    await db.delete(s.documentRelationships).where(eq(s.documentRelationships.toContainerId, libraryA.containerId));
    // not the owner's act for anybody else: answered as if it were not there
    expect((await req(`/containers/${libraryA.containerId}/impact`, bCookie)).status).toBe(404);
    expect((await req(`/containers/${libraryA.containerId}/impact`, cCookie)).status).toBe(404);
  });

  it('"cited by" is the requester\'s own organisation\'s work, never a total', async () => {
    const forB = (await (await req(`/containers/${libraryA.containerId}/cited-by`, bCookie)).json()) as ContainerCitedByResponse;
    expect(forB.items.filter((i) => i.kind === 'draft').map((i) => i.title).sort()).toEqual(['Another private draft', 'Chapter 9', 'Private note']);
    const forC = (await (await req(`/containers/${libraryA.containerId}/cited-by`, cCookie)).json()) as ContainerCitedByResponse;
    expect(forC.items).toEqual([]);
    const forOwner = (await (await req(`/containers/${libraryA.containerId}/cited-by`, ownerCookie)).json()) as ContainerCitedByResponse;
    expect(forOwner.items.map((i) => i.title)).toEqual(['Owner note']);
  });
});

describe('T-474 — stale grounding, live and stored', () => {
  it('finds nothing while the source is current, and says how many claims it examined', async () => {
    const doc = { id: chapter };
    const res = await req(`/sandbox-documents/${doc.id}/stale-grounding`, bCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as StaleGroundingResponse;
    expect(body.items).toEqual([]);
    expect(body.claimsChecked).toBe(1);
  });

  it('after the owner supersedes the document: a finding on the citing sentence, a notification for B only', async () => {
    const proposed = await req(`/containers/${replacement.containerId}/relationships`, ownerCookie, 'POST', {
      toContainerId: libraryA.containerId,
      type: 'supersedes',
    });
    expect(proposed.status).toBe(201);
    const edge = (await proposed.json()) as { id: string };
    const confirmed = await req(`/relationships/${edge.id}/confirmation`, ownerCookie, 'POST');
    expect(confirmed.status).toBe(200);

    const doc = { id: chapter };
    const live = (await (await req(`/sandbox-documents/${doc.id}/stale-grounding`, bCookie)).json()) as StaleGroundingResponse;
    expect(live.items).toHaveLength(1);
    expect(live.items[0]!.located).toBe(true);
    expect(live.items[0]!.anchor.verbatim).toBe(SENTENCE);
    expect(live.items[0]!.defect).toContain(`superseded by T474-R-${stamp}`);
    expect(live.items[0]!.severity).toBe('required');

    // B: exactly one notification, pointing at its most recently edited affected document
    const bList = (await (await req('/notifications', bCookie)).json()) as ListNotificationsResponse;
    const mine = bList.items.filter((n) => n.eventType === 'cited-document-superseded');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject.kind).toBe('sandbox-document');
    // C: nothing. The owner caused the act: nothing either.
    const cList = (await (await req('/notifications', cCookie)).json()) as ListNotificationsResponse;
    expect(cList.items.filter((n) => n.eventType === 'cited-document-superseded')).toEqual([]);
    const oList = (await (await req('/notifications', ownerCookie)).json()) as ListNotificationsResponse;
    expect(oList.items.filter((n) => n.eventType === 'cited-document-superseded')).toEqual([]);
    // C sees no trace on the Relationships tab either
    const cBy = (await (await req(`/containers/${libraryA.containerId}/cited-by`, cCookie)).json()) as ContainerCitedByResponse;
    expect(cBy.items).toEqual([]);
  });

  it('a claim whose sentence is no longer in the text is anchored on the document, and says so', async () => {
    const edited = await citingDraft({ organisationId: orgB, participantId: bP, sandboxId: bSandbox, versionId: libraryA.versionId, title: 'Edited away', content: 'Completely rewritten text.' });
    const body = (await (await req(`/sandbox-documents/${edited}/stale-grounding`, bCookie)).json()) as StaleGroundingResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.located).toBe(false);
    expect(body.items[0]!.defect).toContain('could not be located in the current text');
    expect(body.items[0]!.anchor.verbatim).toBe('Completely rewritten text.');
  });

  it('the checker stores the same finding, on the same sentence, with the family named in its coverage', async () => {
    const doc = { id: chapter };
    const out = await createQaDocumentCheck({ db })({ sandboxDocumentId: doc.id, families: ['stale_grounding'] });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]!.checkFamily).toBe('stale_grounding');
    expect(out.findings[0]!.anchor.verbatim).toBe(SENTENCE);
    expect(out.findings[0]!.evidence.input).toBe('corpus');
    expect(out.coverage.staleGrounding).toEqual({ claimsChecked: 1, stale: 1 });
    // switched off, it raises nothing
    const off = await createQaDocumentCheck({ db })({ sandboxDocumentId: doc.id, families: ['readability'] });
    expect(off.findings.filter((f) => f.checkFamily === 'stale_grounding')).toEqual([]);
  });
});

describe('T-474 — the other acts raise the same event', () => {
  it('withdrawing a document tells B about its own work, once', async () => {
    const withdrawn = await libraryDoc('T474-W');
    await citingDraft({ organisationId: orgB, participantId: bP, sandboxId: bSandbox, versionId: withdrawn.versionId, title: 'Cites the withdrawn one' });
    const before = ((await (await req('/notifications', bCookie)).json()) as ListNotificationsResponse).items.filter((n) => n.eventType === 'cited-document-superseded').length;
    const res = await req(`/containers/${withdrawn.containerId}/withdrawal`, ownerCookie, 'POST', { reason: 'No longer required' });
    expect(res.status).toBe(200);
    const after = ((await (await req('/notifications', bCookie)).json()) as ListNotificationsResponse).items.filter((n) => n.eventType === 'cited-document-superseded');
    expect(after.length).toBe(before + 1);
    expect(after.some((n) => n.subject.label === 'Cites the withdrawn one')).toBe(true);
    const cList = (await (await req('/notifications', cCookie)).json()) as ListNotificationsResponse;
    expect(cList.items.filter((n) => n.eventType === 'cited-document-superseded')).toEqual([]);
  });

  it('a bulk supersession tells B once per superseded document it cited', async () => {
    const one = await libraryDoc('T474-X1');
    const two = await libraryDoc('T474-X2');
    await citingDraft({ organisationId: orgB, participantId: bP, sandboxId: bSandbox, versionId: one.versionId, title: 'Bulk one' });
    await citingDraft({ organisationId: orgB, participantId: bP, sandboxId: bSandbox, versionId: two.versionId, title: 'Bulk two' });
    const before = ((await (await req('/notifications', bCookie)).json()) as ListNotificationsResponse).items.filter((n) => n.eventType === 'cited-document-superseded').length;
    const res = await req(`/projects/${projectId}/bulk/supersessions`, ownerCookie, 'POST', {
      containerIds: [one.containerId, two.containerId],
      replacementContainerId: replacement.containerId,
    });
    expect(res.status).toBe(201);
    const after = ((await (await req('/notifications', bCookie)).json()) as ListNotificationsResponse).items.filter((n) => n.eventType === 'cited-document-superseded');
    expect(after.length).toBe(before + 2);
    expect(after.map((n) => n.subject.label)).toEqual(expect.arrayContaining(['Bulk one', 'Bulk two']));
  });

  it('accepting a proposed withdrawal tells the organisations whose work rested on it, and not the one that proposed (asserted as C)', async () => {
    const proposed = await libraryDoc('T474-P');
    // the producer of a published deliverable proposes; here B produces one
    await db.update(s.containers).set({ producingOrganisationId: orgB }).where(eq(s.containers.id, proposed.containerId));
    await citingDraft({ organisationId: ownerOrg, participantId: ownerP, sandboxId: ownerSandbox, versionId: proposed.versionId, title: 'Owner cites proposed' });
    await citingDraft({ organisationId: orgC, participantId: cP, sandboxId: cSandbox, versionId: proposed.versionId, title: 'C cites proposed' });
    const propose = await req(`/containers/${proposed.containerId}/withdrawal`, bCookie, 'POST', { reason: 'Retiring this' });
    expect(propose.status).toBe(200);
    const accept = await req(`/containers/${proposed.containerId}/withdrawal-proposal/resolution`, ownerCookie, 'POST', { accept: true });
    expect(accept.status).toBe(200);
    const cList = (await (await req('/notifications', cCookie)).json()) as ListNotificationsResponse;
    expect(cList.items.some((n) => n.eventType === 'cited-document-superseded' && n.subject.label === 'C cites proposed')).toBe(true);
    // the owner did the act and is told nothing about it
    const oList = (await (await req('/notifications', ownerCookie)).json()) as ListNotificationsResponse;
    expect(oList.items.filter((n) => n.eventType === 'cited-document-superseded')).toEqual([]);
  });
});
