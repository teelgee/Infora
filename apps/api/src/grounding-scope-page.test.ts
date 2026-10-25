// T-486 (b) — the Scope control's Documents group is searched on the server and
// shows the first 50 matches, never the whole grounding scope.
//
// *In plain terms: on a project with three hundred reference documents the
// picker used to be handed all three hundred. It is now handed fifty, can be
// narrowed by typing (the server does the narrowing), and is told how many
// matched and how many the whole scope holds so it can say "Showing 50 of 53 —
// type to narrow". Another firm's unshared document is neither listed nor
// counted, and the number beside each discipline never changes with what was typed.*
//
// A fresh project and three fresh organisations; every document is looked up by
// the id this file made, never by title.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { GROUNDING_SOURCES_LIMIT } from '@infora/contracts';
import type { GetGroundingScopeResponse } from '@infora/contracts';
import { ingestVersion } from '@infora/data';
import { createDb, hashPassword, schema as s, seedProjectOntology } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { narrowGroundingSources } from './grounding-search';

const { db, pool } = createDb();
const router = fakeRouter();
const app = buildApp({ db, sessionSecret: 'test-secret', router });

const stamp = Date.now();
const password = 'pw-t486b';
const COUNT = GROUNDING_SOURCES_LIMIT + 3; // 53 of the member's own documents
let projectId: string;
let cookie: string;
let outsiderContainerId: string;
let startsWithId: string;
let describedId: string;
let classifiedTermId: string;
const ownIds: string[] = [];

async function document(organisationId: string, reference: string, description: string | null) {
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: organisationId,
      documentReference: reference,
      inLibrary: true,
      scope: 'library',
      state: 'live',
      description,
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({
      containerId: container!.id,
      versionReference: 'P01',
      content: `The survey recorded item ${reference}.`,
      isCurrent: true,
    })
    .returning();
  await ingestVersion(db, router, version!.id);
  return container!.id;
}

beforeAll(async () => {
  const [owner] = await db.insert(s.organisations).values({ name: `t486b owner ${stamp}` }).returning();
  const [mine] = await db.insert(s.organisations).values({ name: `t486b mine ${stamp}` }).returning();
  const [theirs] = await db.insert(s.organisations).values({ name: `t486b theirs ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t486b project ${stamp}`, ownerOrganisationId: owner!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: owner!.id, projectId, role: 'owner' },
    { organisationId: mine!.id, projectId, role: 'member' },
    { organisationId: theirs!.id, projectId, role: 'member' },
  ]);
  const [user] = await db
    .insert(s.users)
    .values({ name: 't486b asker', email: `t486b-${stamp}@test.local`, organisationId: mine!.id })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();

  // 53 of the member's own documents. Three are told apart: one whose reference
  // STARTS with "zebra", one whose description merely MENTIONS it, and the rest
  // plain numbered references.
  for (let n = 1; n <= COUNT - 2; n += 1) {
    ownIds.push(await document(mine!.id, `T486B-${String(n).padStart(3, '0')}-${stamp}`, null));
  }
  describedId = await document(mine!.id, `T486B-DESC-${stamp}`, 'A note on the zebra crossing.');
  startsWithId = await document(mine!.id, `ZEBRA-${stamp}`, null);
  ownIds.push(describedId, startsWithId);
  // another firm's, indexed, shared with nobody — and it would match "zebra"
  outsiderContainerId = await document(theirs!.id, `ZEBRA-OTHER-${stamp}`, 'zebra');

  // two of the member's documents carry one vocabulary term
  await seedProjectOntology(db, projectId);
  const [facet] = await db.select().from(s.classificationFacets).where(eq(s.classificationFacets.projectId, projectId));
  const [term] = await db.select().from(s.classificationTerms).where(eq(s.classificationTerms.facetId, facet!.id));
  classifiedTermId = term!.id;
  await db.insert(s.containerClassifications).values(
    [ownIds[0]!, startsWithId].map((containerId) => ({
      containerId,
      facetId: facet!.id,
      termId: classifiedTermId,
      setByParticipantId: participant!.id,
    })),
  );

  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `t486b-${stamp}@test.local`, password }),
  });
  cookie = res.headers.get('set-cookie')!.split(';')[0]!;
});

afterAll(async () => {
  await pool.end();
});

async function scope(q?: string): Promise<GetGroundingScopeResponse> {
  const query = q === undefined ? '' : `?q=${encodeURIComponent(q)}`;
  const res = await app.request(`/projects/${projectId}/grounding-scope${query}`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as GetGroundingScopeResponse;
}

describe('the Documents group is the first 50, with the totals (T-486 b)', () => {
  it('with 53 documents in scope, no query returns exactly 50, and says there are 53', async () => {
    const answer = await scope();
    expect(answer.sources).toHaveLength(GROUNDING_SOURCES_LIMIT);
    expect(answer.total).toBe(COUNT);
    expect(answer.matched).toBe(COUNT);
    // every listed document is one this file made for the requester — and the
    // same fifty come back the second time (the order is a rule, not a guess)
    for (const source of answer.sources) expect(ownIds).toContain(source.containerId);
    expect((await scope()).sources.map((source) => source.containerId)).toEqual(
      answer.sources.map((source) => source.containerId),
    );
  });

  it('a query narrows on the server: the matches, best first, with how many matched and the unchanged total', async () => {
    const answer = await scope('zebra');
    // the reference that STARTS with the word comes before the description that only mentions it
    expect(answer.sources.map((source) => source.containerId)).toEqual([startsWithId, describedId]);
    expect(answer.matched).toBe(2);
    expect(answer.total).toBe(COUNT);
  });

  it('a query that matches nothing returns nothing, and the total still says what the scope holds', async () => {
    const answer = await scope('no-such-document-anywhere');
    expect(answer.sources).toEqual([]);
    expect(answer.matched).toBe(0);
    expect(answer.total).toBe(COUNT);
  });

  it('a query that matches more than fifty is still capped at fifty, and says how many matched', async () => {
    const answer = await scope('t486b');
    expect(answer.sources).toHaveLength(GROUNDING_SOURCES_LIMIT);
    expect(answer.matched).toBe(COUNT - 1); // every reference but ZEBRA-… carries the prefix
  });

  it('a query over the length ceiling is a 400 in words', async () => {
    const res = await app.request(`/projects/${projectId}/grounding-scope?q=${'x'.repeat(201)}`, { headers: { cookie } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail: string }).detail).toContain('200');
  });

  it('THE WALL: another firm’s unshared document is neither listed nor counted — even when it matches', async () => {
    const all = await scope();
    const hit = await scope('zebra');
    for (const answer of [all, hit]) {
      expect(answer.sources.map((source) => source.containerId)).not.toContain(outsiderContainerId);
    }
    expect(all.total).toBe(COUNT); // not COUNT + 1
    expect(hit.matched).toBe(2); // not 3
  });

  it('termCounts is counted over the WHOLE scope and does not move with the query', async () => {
    const whole = await scope();
    expect(whole.termCounts[classifiedTermId]).toBe(2);
    // typing a word that matches only one of the two classified documents, or
    // none of them, leaves every number exactly where it was
    expect((await scope('zebra')).termCounts).toEqual(whole.termCounts);
    expect((await scope('no-such-document-anywhere')).termCounts).toEqual(whole.termCounts);
    // …and a number beside a term can never exceed what the scope holds
    for (const count of Object.values(whole.termCounts)) expect(count).toBeLessThanOrEqual(whole.total);
  });
});

describe('the search and the cap are one pure step after the visibility rule (T-486 b)', () => {
  const source = (containerId: string, documentReference: string, title: string | null, description: string | null) => ({
    containerId,
    versionId: `v-${containerId}`,
    documentReference,
    title,
    description,
  });

  it('matches every word typed against reference, title and the filer’s description', () => {
    const list = [
      source('a', 'WA-GEO-001', 'Ground investigation report', null),
      source('b', 'WA-ENV-002', 'Ecology baseline', 'covers geotechnical constraints'),
      source('c', 'WA-ENV-003', 'Ecology survey', null),
    ];
    // neither reference nor title STARTS with "geo", so both are plain matches, in reference order
    expect(narrowGroundingSources(list, 'geo', 10).sources.map((s2) => s2.containerId)).toEqual(['b', 'a']);
    expect(narrowGroundingSources(list, 'ecology constraints', 10).sources.map((s2) => s2.containerId)).toEqual(['b']);
    expect(narrowGroundingSources(list, '   ', 10).matched).toBe(3);
  });

  it('puts a reference or title that starts with the query before one that contains it', () => {
    const list = [
      source('a', 'WA-X-001', 'Notes on hydro-geology', null),
      source('b', 'WA-X-002', 'Geotechnical interpretive report', null),
      source('c', 'GEO-003', 'Another', null),
    ];
    expect(narrowGroundingSources(list, 'geo', 10).sources.map((s2) => s2.containerId)).toEqual(['c', 'b', 'a']);
  });

  it('cuts at the limit but reports the full match count', () => {
    const list = Array.from({ length: 7 }, (_, n) => source(`id${n}`, `REF-${n}`, null, null));
    const out = narrowGroundingSources(list, '', 3);
    expect(out.sources.map((s2) => s2.documentReference)).toEqual(['REF-0', 'REF-1', 'REF-2']);
    expect(out.matched).toBe(7);
  });
});
