// T-470 — the scope preview and the term counts, over HTTP.
//
// *In plain terms: while a person builds a scope in the picker, the server says
// how many documents it would reach — counted from what that person may see,
// spending nothing — and a firm outside the project learns nothing at all.*
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { GetGroundingScopeResponse, ScopePreviewResponse } from '@infora/contracts';
import { ingestVersion } from '@infora/data';
import { createDb, hashPassword, schema as s, seedProjectOntology } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const router = fakeRouter();
const app = buildApp({ db, sessionSecret: 'test-secret', router });

const stamp = Date.now();
const password = 'pw-t470';
let projectId: string;
let otherProjectId: string;
const cookies: Record<'a' | 'b' | 'out', string> = { a: '', b: '', out: '' };
const docs: Record<string, string> = {};
let term: string;
let foreignTerm: string;
let savedScopeId: string;

const signIn = async (email: string) => {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
};
const preview = (who: 'a' | 'b' | 'out', body: unknown, project = projectId) =>
  app.request(`/projects/${project}/scope-preview`, {
    method: 'POST',
    headers: { cookie: cookies[who], 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  const [a, b, out] = await Promise.all(
    (['a', 'b', 'out'] as const).map(async (n) => (await db.insert(s.organisations).values({ name: `t470 ${n} ${stamp}` }).returning())[0]!),
  );
  const [project] = await db.insert(s.projects).values({ name: `t470 ${stamp}`, ownerOrganisationId: a!.id }).returning();
  const [other] = await db.insert(s.projects).values({ name: `t470 other ${stamp}`, ownerOrganisationId: out!.id }).returning();
  projectId = project!.id;
  otherProjectId = other!.id;
  await db.insert(s.memberships).values([
    { organisationId: a!.id, projectId, role: 'owner' },
    { organisationId: b!.id, projectId, role: 'member' },
    { organisationId: out!.id, projectId: otherProjectId, role: 'owner' },
  ]);
  const people = { a: [a!, projectId], b: [b!, projectId], out: [out!, otherProjectId] } as const;
  const participants: Record<string, string> = {};
  for (const n of ['a', 'b', 'out'] as const) {
    const [org, pid] = people[n];
    const email = `t470-${n}-${stamp}@test.local`;
    const [user] = await db.insert(s.users).values({ name: `t470 ${n}`, email, organisationId: org.id }).returning();
    await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
    const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId: pid }).returning();
    participants[n] = participant!.id;
    cookies[n] = await signIn(email);
  }
  const make = async (name: string, org: string, content: string) => {
    const [container] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: org, documentReference: `T470-${name}-${stamp}`, inLibrary: true })
      .returning();
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'P01', content, isCurrent: true })
      .returning();
    await ingestVersion(db, router, version!.id);
    docs[name] = container!.id;
  };
  await make('A1', a!.id, 'The survey recorded three exceedances.');
  await make('A2', a!.id, 'The survey recorded a perched water table.');
  await make('B1', b!.id, 'The survey recorded elevated lead.');

  await seedProjectOntology(db, projectId);
  await seedProjectOntology(db, otherProjectId);
  const [facet] = await db.select().from(s.classificationFacets).where(eq(s.classificationFacets.projectId, projectId));
  const [terms] = [await db.select().from(s.classificationTerms).where(eq(s.classificationTerms.facetId, facet!.id))];
  term = terms[0]!.id;
  const [foreignFacet] = await db.select().from(s.classificationFacets).where(eq(s.classificationFacets.projectId, otherProjectId));
  foreignTerm = (await db.select().from(s.classificationTerms).where(eq(s.classificationTerms.facetId, foreignFacet!.id)))[0]!.id;
  await db.insert(s.containerClassifications).values([
    { containerId: docs['A1']!, facetId: facet!.id, termId: term, setByParticipantId: participants['a']! },
    { containerId: docs['A2']!, facetId: facet!.id, termId: term, setByParticipantId: participants['a']! },
  ]);
  const [view] = await db
    .insert(s.savedViews)
    .values({
      projectId,
      organisationId: a!.id,
      participantId: participants['a']!,
      register: 'scope',
      name: `t470 saved ${stamp}`,
      filter: { termIds: [term] },
      shared: false,
    })
    .returning();
  savedScopeId = view!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('POST /projects/:id/scope-preview (T-470)', () => {
  it('counts the whole visible library when no scope is given, and spends nothing', async () => {
    const res = await preview('a', {});
    expect(res.status).toBe(200);
    const reach = (await res.json()) as ScopePreviewResponse;
    expect(reach).toMatchObject({ visibleLive: 3, inScope: 3, leftOutByScope: 0 });
    expect(reach).not.toHaveProperty('read');
  });

  it('counts a term and a named document', async () => {
    const byTerm = (await (await preview('a', { scope: { termIds: [term] } })).json()) as ScopePreviewResponse;
    expect(byTerm).toMatchObject({ visibleLive: 3, inScope: 2, leftOutByScope: 1 });
    const byDoc = (await (await preview('a', { scope: { containerIds: [docs['B1']!] } })).json()) as ScopePreviewResponse;
    expect(byDoc.inScope).toBe(1);
  });

  it('a saved scope is resolved on the server; another firm\'s does not exist', async () => {
    const mine = (await (await preview('a', { scope: { savedScopeId } })).json()) as ScopePreviewResponse;
    expect(mine.inScope).toBe(2);
    expect((await preview('b', { scope: { savedScopeId } })).status).toBe(404);
  });

  it('a term from another project reaches nothing', async () => {
    const reach = (await (await preview('a', { scope: { termIds: [foreignTerm] } })).json()) as ScopePreviewResponse;
    expect(reach.inScope).toBe(0);
    expect(reach.visibleLive).toBe(3);
  });

  it('an empty scope is a 400 in words', async () => {
    const res = await preview('a', { scope: {} });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('a scope must name at least one');
  });

  it('an outsider gets 404 and learns nothing', async () => {
    expect((await preview('out', {})).status).toBe(404);
  });

  it('the grounding scope carries visible-document counts per term', async () => {
    const res = await app.request(`/projects/${projectId}/grounding-scope`, { headers: { cookie: cookies.a } });
    const body = (await res.json()) as GetGroundingScopeResponse;
    expect(body.termCounts[term]).toBe(2);
  });
});
