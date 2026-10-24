// T-469 — the scope and the reach, over HTTP, with three organisations.
//
// *In plain terms: choosing which part of the library a question reads can only
// shrink what is read; the numbers in "read 14 documents, left out 31" are
// counted from what that person may see; and a share between two other firms
// never moves a number on your screen.*
//
// Organisations A, B and C share one project. A owns it. B and C are members and
// each produce a document. The wall tests are run as each party.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { GetRunPlanResponse, RerunPlanResponse, Run, SavedView } from '@infora/contracts';
import { ingestVersion } from '@infora/data';
import { createDb, hashPassword, schema as s, seedProjectOntology } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const router = fakeRouter();
const app = buildApp({ db, sessionSecret: 'test-secret', router });

const stamp = Date.now();
const password = 'pw-t469';
let projectId: string;
const cookies: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };
const orgIds: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };
const participantIds: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };
const docs: Record<string, { containerId: string; versionId: string }> = {};
let discipline: string;

async function document(name: string, org: 'a' | 'b' | 'c', content: string) {
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: orgIds[org],
      documentReference: `T469-${name}-${stamp}`,
      inLibrary: true,
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'P01', content, isCurrent: true })
    .returning();
  await ingestVersion(db, router, version!.id);
  docs[name] = { containerId: container!.id, versionId: version!.id };
}

const signIn = async (email: string) => {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
};

const post = (who: 'a' | 'b' | 'c', path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie: cookies[who], 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function ask(who: 'a' | 'b' | 'c', scope?: unknown) {
  const opened = await post(who, `/projects/${projectId}/conversations`, { surface: 'web' });
  const { conversationId } = (await opened.json()) as { conversationId: string };
  return post(who, `/conversations/${conversationId}/runs`, {
    request: 'What did the survey record?',
    ...(scope !== undefined && { scope }),
  });
}

beforeAll(async () => {
  const names = ['a', 'b', 'c'] as const;
  const orgs = await Promise.all(
    names.map(async (n) => (await db.insert(s.organisations).values({ name: `t469 ${n} ${stamp}` }).returning())[0]!),
  );
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t469 project ${stamp}`, ownerOrganisationId: orgs[0]!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgs[0]!.id, projectId, role: 'owner' },
    { organisationId: orgs[1]!.id, projectId, role: 'member' },
    { organisationId: orgs[2]!.id, projectId, role: 'member' },
  ]);
  for (const [i, n] of names.entries()) {
    orgIds[n] = orgs[i]!.id;
    const email = `t469-${n}-${stamp}@test.local`;
    const [user] = await db
      .insert(s.users)
      .values({ name: `t469 ${n}`, email, organisationId: orgs[i]!.id })
      .returning();
    await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
    const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
    participantIds[n] = participant!.id;
    cookies[n] = await signIn(email);
  }

  await document('A1', 'a', 'The survey recorded three exceedances at the north boundary.');
  await document('A2', 'a', 'The survey recorded a perched water table.');
  await document('A3', 'a', 'The survey recorded no asbestos.');
  await document('B1', 'b', 'The survey recorded elevated lead.');
  await document('C1', 'c', 'The survey recorded a clean groundwater sample.');

  await seedProjectOntology(db, projectId);
  const [facet] = await db
    .select()
    .from(s.classificationFacets)
    .where(eq(s.classificationFacets.projectId, projectId));
  const terms = await db.select().from(s.classificationTerms).where(eq(s.classificationTerms.facetId, facet!.id));
  discipline = terms[0]!.id;
  await db.insert(s.containerClassifications).values([
    { containerId: docs['A1']!.containerId, facetId: facet!.id, termId: discipline, setByParticipantId: participantIds.a },
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe('what a run is told to read is written down, then counted (T-469)', () => {
  it('writes the scope on the plan, and the counts on the run, and they agree with the audit', async () => {
    const res = await ask('a', { containerIds: [docs['A1']!.containerId, docs['A2']!.containerId] });
    expect(res.status).toBe(201);
    const run = (await res.json()) as Run;

    const plan = (await (await app.request(`/runs/${run.id}/plan`, { headers: { cookie: cookies.a } })).json()) as GetRunPlanResponse;
    expect(plan.plan.scope).toEqual({ containerIds: [docs['A1']!.containerId, docs['A2']!.containerId] });

    // A owns the project, so A sees all five documents
    expect(run.reach).toMatchObject({ visibleLive: 5, inScope: 2, leftOutByScope: 3 });
    // THE PASSAGE-GRAIN AUDIT: `read` is the distinct documents in the steps'
    // source sets, and nothing outside the scope can be in them
    const versionIds = new Set(
      run.steps.flatMap((step) => step.sourceSet).flatMap((source) => ('versionId' in source ? [source.versionId] : [])),
    );
    const containers = await Promise.all(
      [...versionIds].map(async (id) => (await db.select().from(s.versions).where(eq(s.versions.id, id)))[0]!.containerId),
    );
    expect(new Set(containers).size).toBe(run.reach!.read);
    expect(run.reach!.read).toBeGreaterThan(0);
    expect(run.reach!.read).toBeLessThanOrEqual(run.reach!.inScope);
    expect(run.reach!.inScope).toBeLessThanOrEqual(run.reach!.visibleLive);
    for (const container of containers) {
      expect([docs['A1']!.containerId, docs['A2']!.containerId]).toContain(container);
    }
  });

  it('with no scope, the plan carries none and the whole visible library is in reach', async () => {
    const res = await ask('b');
    expect(res.status).toBe(201);
    const run = (await res.json()) as Run;
    const plan = (await (await app.request(`/runs/${run.id}/plan`, { headers: { cookie: cookies.b } })).json()) as GetRunPlanResponse;
    expect(plan.plan.scope).toBeUndefined();
    expect(run.reach).toMatchObject({ visibleLive: 1, inScope: 1, leftOutByScope: 0 });
  });

  it('a terms scope narrows to the classified document', async () => {
    const res = await ask('a', { termIds: [discipline] });
    expect(res.status).toBe(201);
    expect(((await res.json()) as Run).reach).toMatchObject({ visibleLive: 5, inScope: 1, leftOutByScope: 4 });
  });
});

describe('THE WALL, AS EACH PARTY (T-469)', () => {
  it('B naming A’s unshared document: refused in words, nothing read, nothing counted', async () => {
    const res = await ask('b', { containerIds: [docs['A1']!.containerId] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail: string }).detail).toContain('Your scope leaves nothing to read');
  });

  it('C naming its own and A’s: reads only its own, and A’s is not counted anywhere', async () => {
    const res = await ask('c', { containerIds: [docs['C1']!.containerId, docs['A1']!.containerId] });
    expect(res.status).toBe(201);
    const run = (await res.json()) as Run;
    expect(run.reach).toMatchObject({ visibleLive: 1, inScope: 1, leftOutByScope: 0 });
  });

  it('DONE-WHEN: B’s counts do not move when A shares one more document with C', async () => {
    const before = ((await (await ask('b')).json()) as Run).reach;
    await db.insert(s.deliverableShares).values({
      containerId: docs['A3']!.containerId,
      organisationId: orgIds.c,
      grantedByParticipantId: participantIds.a,
    });
    await db.insert(s.deliverableAcknowledgements).values({
      containerId: docs['A3']!.containerId,
      versionId: docs['A3']!.versionId,
      organisationId: orgIds.c,
      acknowledgedByParticipantId: participantIds.c,
    });
    // C now sees A3 — the share took effect
    const cRun = (await (await ask('c')).json()) as Run;
    expect(cRun.reach!.visibleLive).toBe(2);
    // B's numbers are exactly what they were
    const after = ((await (await ask('b')).json()) as Run).reach;
    expect({ ...after, read: undefined }).toEqual({ ...before, read: undefined });
    expect(after!.visibleLive).toBe(before!.visibleLive);
  });
});

describe('an empty scope, and a scope on a re-run (T-469)', () => {
  it('an empty scope is a 400 in words', async () => {
    for (const scope of [{}, { termIds: [] }]) {
      const res = await ask('a', scope);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { detail: string }).detail).toContain('a scope must name at least one');
    }
  });

  it('a re-run INHERITS its plan’s scope, and may not carry one', async () => {
    const first = (await (await ask('a', { containerIds: [docs['A2']!.containerId] })).json()) as Run;
    const steps = [{ stage: 'search_corpus' }, { stage: 'analyse' }, { stage: 'verify' }, { stage: 'present' }];
    const refused = await post('a', `/runs/${first.id}/plan/rerun`, { steps, scope: { containerIds: [docs['A1']!.containerId] } });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { detail: string }).detail).toContain('inherits the scope');

    const res = await post('a', `/runs/${first.id}/plan/rerun`, { steps });
    expect(res.status).toBe(201);
    const body = (await res.json()) as RerunPlanResponse;
    expect(body.plan.scope).toEqual({ containerIds: [docs['A2']!.containerId] });
    expect(body.run.reach).toMatchObject({ inScope: 1 });
  });
});

describe('a saved scope: validated on save, resolved on use (T-469)', () => {
  const save = (who: 'a' | 'b' | 'c', name: string, filter: unknown, shared = false) =>
    post(who, `/projects/${projectId}/saved-views`, { register: 'scope', name, filter, shared });

  it('refuses, on save, a filter that is not a scope — in words', async () => {
    for (const filter of [{}, { containerIds: [] }, { containerIds: ['not-an-id'] }, { colour: 'red' }]) {
      const res = await save('a', `bad ${JSON.stringify(filter)}`, filter);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { detail: string }).detail).toContain('that is not a scope');
    }
    // and one scope cannot point at another
    const nested = await save('a', 'nested', { savedScopeId: crypto.randomUUID() });
    expect(nested.status).toBe(400);
  });

  it('other registers are still stored as sent and never interpreted', async () => {
    const res = await post('a', `/projects/${projectId}/saved-views`, {
      register: 'library',
      name: `anything ${stamp}`,
      filter: { colour: 'red' },
      shared: false,
    });
    expect(res.status).toBe(201);
  });

  it('is resolved on use: the plan records the ids AND where they came from', async () => {
    const saved = await save('a', 'the north boundary', { containerIds: [docs['A1']!.containerId] });
    expect(saved.status).toBe(201);
    const view = (await saved.json()) as SavedView;

    const res = await ask('a', { savedScopeId: view.id });
    expect(res.status).toBe(201);
    const run = (await res.json()) as Run;
    const plan = (await (await app.request(`/runs/${run.id}/plan`, { headers: { cookie: cookies.a } })).json()) as GetRunPlanResponse;
    expect(plan.plan.scope).toEqual({ containerIds: [docs['A1']!.containerId], savedScopeId: view.id });
    expect(run.reach).toMatchObject({ inScope: 1, leftOutByScope: 4 });
  });

  it('stands alone: a saved scope plus loose ids is a 400', async () => {
    const saved = (await (await save('a', 'alone', { containerIds: [docs['A1']!.containerId] })).json()) as SavedView;
    const res = await ask('a', { savedScopeId: saved.id, containerIds: [docs['A2']!.containerId] });
    expect(res.status).toBe(400);
  });

  it('is the maker’s (or shared within their firm): another organisation’s saved scope does not exist', async () => {
    const mine = (await (await save('a', 'private to a', { containerIds: [docs['A1']!.containerId] })).json()) as SavedView;
    const other = await ask('b', { savedScopeId: mine.id });
    expect(other.status).toBe(404);
    // even shared, it is shared within A only
    const shared = (await (await save('a', 'shared in a', { containerIds: [docs['A1']!.containerId] }, true)).json()) as SavedView;
    expect((await ask('b', { savedScopeId: shared.id })).status).toBe(404);
  });
});
