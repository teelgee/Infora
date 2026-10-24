// T-469 — the request's scope and the reach counts, through the real gateway.
//
// *In plain terms: telling a run which part of the library to read can only
// ever make the reading smaller, and the numbers behind "read 14 documents,
// left out 31" are counted from what that person may see — so they never move
// because two OTHER organisations shared a document.*
//
// Three organisations on one project: A owns it and produces most documents, B
// and C are members. The invariant under test is **scope ∩ visible == what is
// retrieved**, proved as each party.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { reachStatement } from '@infora/contracts';
import type { AssemblyRequest, ReachCounts } from '@infora/contracts';
import type { EntitledSlice } from '@infora/governance';
import { createDb, schema as s, seedProjectOntology } from '@infora/db';
import { createAssembler } from './gateway';
import { reachCounts } from './retrieval';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const router = fakeRouter();
const deps = { db, router };
const assemble = createAssembler(deps);

const CONTENT = 'alpha design basis for the scheme';

let projectId: string;
let a: AssemblyRequest['requester'];
let b: AssemblyRequest['requester'];
let c: AssemblyRequest['requester'];
const slices: Record<'a' | 'b' | 'c', EntitledSlice> = {} as never;

let geoReport: string; // A: geotechnical + report
let geoDrawing: string; // A: geotechnical + drawing
let structReport: string; // A: structural + report
let unclassified: string; // A: no classification
let bOwn: string; // B: produced by B, visible to B only
let termGeo: string;
let termStruct: string;
let termReport: string;
let termDrawing: string;

async function addDoc(
  orgId: string,
  ref: string,
  state: 'live' | 'superseded' | 'withdrawn' = 'live',
): Promise<string> {
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: orgId, documentReference: ref, inLibrary: true, state })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'v1', content: CONTENT, isCurrent: true })
    .returning();
  await db.insert(s.versionChunks).values({
    versionId: version!.id,
    chunkIndex: 0,
    content: CONTENT,
    embedding: fakeVector(CONTENT),
    embeddingModelId: FAKE_EMBED_MODEL,
    embeddingModelVersion: 'fake-1',
  });
  return container!.id;
}

async function classify(containerId: string, termId: string, participantId: string) {
  const [term] = await db
    .select()
    .from(s.classificationTerms)
    .where(eq(s.classificationTerms.id, termId))
    .limit(1);
  await db.insert(s.containerClassifications).values({
    containerId,
    facetId: term!.facetId,
    termId,
    setByParticipantId: participantId,
  });
}

async function termOf(facetKey: string, offset: number): Promise<string> {
  const [facet] = await db
    .select()
    .from(s.classificationFacets)
    .where(and(eq(s.classificationFacets.projectId, projectId), eq(s.classificationFacets.key, facetKey)))
    .limit(1);
  const terms = await db
    .select()
    .from(s.classificationTerms)
    .where(eq(s.classificationTerms.facetId, facet!.id))
    .orderBy(s.classificationTerms.sortOrder, s.classificationTerms.code);
  return terms[offset]!.id;
}

const ask = (
  requester: AssemblyRequest['requester'],
  scope?: AssemblyRequest['request']['scope'],
): AssemblyRequest => ({
  request: { text: CONTENT, mode: 'baseline', ...(scope !== undefined && { scope }) },
  environment: { kind: 'project', projectId },
  requester,
});

async function containersRetrieved(
  requester: AssemblyRequest['requester'],
  scope?: AssemblyRequest['request']['scope'],
): Promise<Set<string>> {
  const { items } = await assemble(ask(requester, scope));
  const versionIds = items.flatMap((i) =>
    i.channel === 'grounded' && i.source !== undefined && 'versionId' in i.source ? [i.source.versionId] : [],
  );
  if (versionIds.length === 0) return new Set();
  const rows = await db.select().from(s.versions);
  const byVersion = new Map(rows.map((row) => [row.id, row.containerId]));
  return new Set(versionIds.map((id) => byVersion.get(id)!));
}

async function member(orgId: string, name: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId: orgId })
    .returning();
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
  return participant!.id;
}

beforeAll(async () => {
  const stamp = Date.now();
  const [orgA] = await db.insert(s.organisations).values({ name: `t469 A ${stamp}` }).returning();
  const [orgB] = await db.insert(s.organisations).values({ name: `t469 B ${stamp}` }).returning();
  const [orgC] = await db.insert(s.organisations).values({ name: `t469 C ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t469 ${stamp}`, ownerOrganisationId: orgA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgA!.id, projectId, role: 'owner' },
    { organisationId: orgB!.id, projectId, role: 'member' },
    { organisationId: orgC!.id, projectId, role: 'member' },
  ]);
  const pa = await member(orgA!.id, 'a');
  const pb = await member(orgB!.id, 'b');
  const pc = await member(orgC!.id, 'c');
  a = { organisationId: orgA!.id, participantId: pa };
  b = { organisationId: orgB!.id, participantId: pb };
  c = { organisationId: orgC!.id, participantId: pc };
  for (const [key, req, id] of [['a', a, pa], ['b', b, pb], ['c', c, pc]] as const) {
    slices[key] = {
      organisationId: req.organisationId,
      participantId: id,
      projectId,
      membershipRole: key === 'a' ? 'owner' : 'member',
      elevated: false,
    };
  }

  await seedProjectOntology(db, projectId);
  termGeo = await termOf('discipline', 0);
  termStruct = await termOf('discipline', 1);
  termReport = await termOf('document_type', 0);
  termDrawing = await termOf('document_type', 1);

  geoReport = await addDoc(orgA!.id, `T469-GEO-REP-${stamp}`);
  geoDrawing = await addDoc(orgA!.id, `T469-GEO-DRG-${stamp}`);
  structReport = await addDoc(orgA!.id, `T469-STR-REP-${stamp}`);
  unclassified = await addDoc(orgA!.id, `T469-UNC-${stamp}`);
  await addDoc(orgA!.id, `T469-SUP-${stamp}`, 'superseded');
  await addDoc(orgA!.id, `T469-WDR-${stamp}`, 'withdrawn');
  bOwn = await addDoc(orgB!.id, `T469-B-${stamp}`);
  await classify(geoReport, termGeo, pa);
  await classify(geoReport, termReport, pa);
  await classify(geoDrawing, termGeo, pa);
  await classify(geoDrawing, termDrawing, pa);
  await classify(structReport, termStruct, pa);
  await classify(structReport, termReport, pa);
});

afterAll(async () => {
  await pool.end();
});

describe('the scope narrows and never widens (T-469)', () => {
  it('no scope reads the whole visible library', async () => {
    const got = await containersRetrieved(a);
    // A owns the project, so A sees B's document too (owner organisation, ADR-0016)
    expect(got).toEqual(new Set([geoReport, geoDrawing, structReport, unclassified, bOwn]));
  });

  it('named documents: exactly those, ANDed with the wall', async () => {
    const got = await containersRetrieved(a, { containerIds: [geoReport, unclassified] });
    expect(got).toEqual(new Set([geoReport, unclassified]));
  });

  it('terms of ONE facet are OR\'d', async () => {
    const got = await containersRetrieved(a, { termIds: [termGeo, termStruct] });
    expect(got).toEqual(new Set([geoReport, geoDrawing, structReport]));
  });

  it('terms of DIFFERENT facets are AND\'d — "geotechnical and report"', async () => {
    const got = await containersRetrieved(a, { termIds: [termGeo, termReport] });
    expect(got).toEqual(new Set([geoReport]));
  });

  it('OR within a facet and AND across, together', async () => {
    const got = await containersRetrieved(a, { termIds: [termGeo, termStruct, termReport] });
    expect(got).toEqual(new Set([geoReport, structReport]));
  });

  it('terms AND named documents', async () => {
    const got = await containersRetrieved(a, { termIds: [termGeo], containerIds: [geoDrawing, structReport] });
    expect(got).toEqual(new Set([geoDrawing]));
  });

  it('a term that names nothing, or an id that is not an id, admits nothing', async () => {
    expect(await containersRetrieved(a, { termIds: [crypto.randomUUID()] })).toEqual(new Set());
    expect(await containersRetrieved(a, { termIds: [termGeo, crypto.randomUUID()] })).toEqual(new Set());
    expect(await containersRetrieved(a, { containerIds: ['not-an-id'] })).toEqual(new Set());
  });

  it('a scope naming nothing the gateway can read (an unresolved saved scope) admits nothing', async () => {
    expect(await containersRetrieved(a, { savedScopeId: crypto.randomUUID() })).toEqual(new Set());
  });

  it('THE WALL, AS EACH PARTY: B naming A\'s unshared document retrieves and counts nothing from it', async () => {
    // B can read its own document and none of A's
    expect(await containersRetrieved(b)).toEqual(new Set([bOwn]));
    // …and naming A's documents widens nothing
    const named = { containerIds: [geoReport, geoDrawing, structReport] };
    expect(await containersRetrieved(b, named)).toEqual(new Set());
    const counts = await reachCounts(deps, slices.b, named);
    expect(counts.inScope).toBe(0);
    expect(counts.visibleLive).toBe(1);
    // …and a term that classifies only A's documents widens nothing either
    expect(await containersRetrieved(b, { termIds: [termGeo] })).toEqual(new Set());
    // the same question from A reaches them, so the scope is what is crossed
    expect(await containersRetrieved(a, named)).toEqual(new Set([geoReport, geoDrawing, structReport]));
  });

  it('C, with no documents of its own, reads nothing — and the same scope still does not help', async () => {
    expect(await containersRetrieved(c)).toEqual(new Set());
    expect(await containersRetrieved(c, { containerIds: [geoReport] })).toEqual(new Set());
  });

  it('the coverage counts the pre-filter admitted AFTER the scope', async () => {
    const { coverage } = await assemble(ask(a, { termIds: [termGeo] }));
    expect(coverage?.candidates).toBe(2);
    expect(coverage?.reach.inScope).toBe(2);
  });
});

describe('the reach counts (T-469)', () => {
  it('count documents, not passages, and what state excluded', async () => {
    // give one document a second passage: the count must not move
    const [v] = await db.select().from(s.versions).where(eq(s.versions.containerId, geoReport)).limit(1);
    await db.insert(s.versionChunks).values({
      versionId: v!.id,
      chunkIndex: 1,
      content: CONTENT,
      embedding: fakeVector(CONTENT),
      embeddingModelId: FAKE_EMBED_MODEL,
      embeddingModelVersion: 'fake-1',
    });
    const counts = await reachCounts(deps, slices.a, undefined);
    expect(counts).toEqual<ReachCounts>({
      visibleLive: 5,
      inScope: 5,
      excludedByState: { superseded: 1, withdrawn: 1 },
      leftOutByScope: 0,
      notCitable: 0,
      awaitingRecheck: 0,
    });
  });

  it('a scope leaves out the rest, and the parts add up', async () => {
    const counts = await reachCounts(deps, slices.a, { termIds: [termGeo, termReport] });
    expect(counts.visibleLive).toBe(5);
    expect(counts.inScope).toBe(1);
    expect(counts.leftOutByScope).toBe(4);
    expect(counts.inScope + counts.leftOutByScope).toBe(counts.visibleLive);
  });

  it('confine the state counts to the scope too (review fix): a scope naming one live document excludes nothing by state', async () => {
    const counts = await reachCounts(deps, slices.a, { containerIds: [geoReport] });
    expect(counts.inScope).toBe(1);
    // the superseded and withdrawn documents exist (the test above counts them),
    // but they are outside this scope, so the sentence must not name them
    expect(counts.excludedByState).toEqual({ superseded: 0, withdrawn: 0 });
  });

  it('are counted under the requester\'s own visibility: B sees B\'s one document, and none of A\'s states', async () => {
    const counts = await reachCounts(deps, slices.b, undefined);
    expect(counts).toEqual<ReachCounts>({
      visibleLive: 1,
      inScope: 1,
      excludedByState: { superseded: 0, withdrawn: 0 },
      leftOutByScope: 0,
      notCitable: 0,
      awaitingRecheck: 0,
    });
  });

  it('DONE-WHEN: B\'s counts do not move when A shares one more document with C', async () => {
    const before = await Promise.all([reachCounts(deps, slices.b, undefined), containersRetrieved(b)]);
    const [grantor] = await db.select().from(s.participants).where(eq(s.participants.id, a.participantId)).limit(1);
    await db.insert(s.deliverableShares).values({
      containerId: structReport,
      organisationId: c.organisationId,
      grantedByParticipantId: grantor!.id,
    });
    const [version] = await db.select().from(s.versions).where(eq(s.versions.containerId, structReport)).limit(1);
    await db.insert(s.deliverableAcknowledgements).values({
      containerId: structReport,
      versionId: version!.id,
      organisationId: c.organisationId,
      acknowledgedByParticipantId: c.participantId,
    });
    // C now sees it — the share took effect
    expect((await reachCounts(deps, slices.c, undefined)).visibleLive).toBe(1);
    // B's numbers and B's retrieval are exactly what they were
    const after = await Promise.all([reachCounts(deps, slices.b, undefined), containersRetrieved(b)]);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual(before[1]);
  });
});

describe('a held but unreadable document (T-472)', () => {
  it('is counted as not citable, never retrieved, and named in the reach sentence — under the wall and the scope', async () => {
    // a confirmed reference file whose text could not be read: a version
    // marked not_citable at insert, content '' and no passages
    const [container] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: a.organisationId,
        documentReference: `T472-SCAN-${Date.now()}`,
        title: 'A scanned standard',
        inLibrary: true,
        state: 'live',
      })
      .returning();
    await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'R01', content: '', isCurrent: true, notCitable: true });

    const mine = await reachCounts(deps, slices.a, undefined);
    expect(mine.notCitable).toBe(1);
    // it has no passages, so it is not among the documents a run could read
    expect(mine.visibleLive).toBe(5);
    expect(await containersRetrieved(a)).not.toContain(container!.id);
    expect(reachStatement({ ...mine, read: 5 })).toContain('1 not citable (scan).');

    // a scope that does not admit it does not hear about it
    expect((await reachCounts(deps, slices.a, { termIds: [termGeo] })).notCitable).toBe(0);
    // …and one that names it does
    expect((await reachCounts(deps, slices.a, { containerIds: [container!.id] })).notCitable).toBe(1);
    // THE WALL: B cannot see A's unshared document, so cannot be told it exists
    expect((await reachCounts(deps, slices.b, undefined)).notCitable).toBe(0);
    // zero is omitted from the sentence, never printed
    expect(reachStatement({ ...(await reachCounts(deps, slices.b, undefined)), read: 1 })).not.toContain('not citable');
  });
});

describe('documents past their re-check date (T-473)', () => {
  it('are counted awaiting re-check — still read, named in the sentence, under the wall and the scope; the date passing is the only thing that changes', async () => {
    const mineBefore = await reachCounts(deps, slices.a, undefined);
    expect(mineBefore.awaitingRecheck).toBe(0);
    // confirmed once, and the date for checking it again has passed
    await db
      .update(s.containers)
      .set({ confirmedCurrentAt: new Date('2025-01-01'), recheckDueAt: new Date('2026-01-01') })
      .where(eq(s.containers.id, geoReport));
    const mine = await reachCounts(deps, slices.a, undefined);
    expect(mine.awaitingRecheck).toBe(1);
    // it still grounds: nothing about the readable count moved
    expect(mine.visibleLive).toBe(mineBefore.visibleLive);
    expect(mine.inScope).toBe(mineBefore.inScope);
    expect(await containersRetrieved(a)).toContain(geoReport);
    expect(reachStatement({ ...mine, read: 5 })).toContain('1 awaiting re-check.');

    // a scope that leaves it out does not hear about it; one that names it does
    expect((await reachCounts(deps, slices.a, { containerIds: [structReport] })).awaitingRecheck).toBe(0);
    expect((await reachCounts(deps, slices.a, { containerIds: [geoReport] })).awaitingRecheck).toBe(1);
    // a date still ahead is not awaiting anything
    await db.update(s.containers).set({ recheckDueAt: new Date('2099-01-01') }).where(eq(s.containers.id, geoReport));
    expect((await reachCounts(deps, slices.a, undefined)).awaitingRecheck).toBe(0);
    // THE WALL: B cannot see A's document, so is told nothing about it
    await db.update(s.containers).set({ recheckDueAt: new Date('2026-01-01') }).where(eq(s.containers.id, geoReport));
    expect((await reachCounts(deps, slices.b, undefined)).awaitingRecheck).toBe(0);
    // zero is omitted from the sentence
    expect(reachStatement({ ...(await reachCounts(deps, slices.b, undefined)), read: 1 })).not.toContain('awaiting re-check');
    await db.update(s.containers).set({ confirmedCurrentAt: null, recheckDueAt: null }).where(eq(s.containers.id, geoReport));
  });
});
