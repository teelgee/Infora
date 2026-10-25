// T-486 (a) — a check that searched the library says how many documents it
// searched, not how many happen to sit behind its findings.
//
// *In plain terms: a check of a draft against the whole library that finds
// nothing wrong used to end with "Read no documents", which made a clean result
// look like a check that never looked. It now says "Read 4 documents". Ask and
// the document creator are untouched — they still say how many documents they
// drew on (pinned by `scope-reach.test.ts`). A check of style or arithmetic
// alone searched nothing, so it says nothing about reading the library, and the
// findings panel never shows such a run's sentence.*
//
// A fresh organisation and project; every row is looked up by an id this file
// made, never by title.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ListFindingsResponse, QaCheckRunResponse } from '@infora/contracts';
import { createWorkerRegistry } from '@infora/capabilities';
import { ingestVersion } from '@infora/data';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { loadWorkflows } from '@infora/workflows';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const workflows = loadWorkflows({ workers: createWorkerRegistry(), production: true });
// a model that finds nothing wrong anywhere: every check is clean
const router = fakeRouter(() => JSON.stringify({ summary: 'x', findings: [] }));
const app = buildApp({ db, sessionSecret: 'test-secret', router, workflows, workers: createWorkerRegistry() });

const stamp = Date.now();
const password = 'pw-t486a';
let projectId: string;
let cookie: string;
let documentId: string;
const libraryContainerIds: string[] = [];

const CONTENT = [
  'Introduction',
  '',
  'The Scheme is assessed for land quality across its whole extent.',
  '',
  'Assessment',
  '',
  'The Scheme delivers a 12% reduction in contaminant loading. TBC.',
].join('\n');

const check = (over: Record<string, unknown>) =>
  app.request(`/projects/${projectId}/tools/qa-check/runs`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ sandboxDocumentId: documentId, depth: 'quick', attachedDocumentIds: [], ...over }),
  });

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t486a org ${stamp}` }).returning();
  const organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t486a project ${stamp}`, ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't486a-author', email: `t486a-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated: true })
    .returning();
  const session = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password }),
  });
  cookie = session.headers.get('set-cookie')!.split(';')[0]!;

  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      name: `t486a area ${stamp}`,
      scope: 'single_org',
      owningOrganisationId: organisationId,
      createdByParticipantId: participant!.id,
    })
    .returning();
  await db
    .insert(s.sandboxScopeGrants)
    .values({ sandboxId: sandbox!.id, granteeType: 'organisation', organisationId, grantedByParticipantId: participant!.id });
  const [document] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId: sandbox!.id,
      title: `t486a draft ${stamp}`,
      content: CONTENT,
      createdByParticipantId: participant!.id,
    })
    .returning();
  documentId = document!.id;

  // four documents in the project's library, all live and all readable
  for (const n of [1, 2, 3, 4]) {
    const [container] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: organisationId,
        documentReference: `T486A-${n}-${stamp}`,
        inLibrary: true,
      })
      .returning();
    const [version] = await db
      .insert(s.versions)
      .values({
        containerId: container!.id,
        versionReference: 'P01',
        content: `The survey recorded finding number ${n} at the north boundary.`,
        isCurrent: true,
      })
      .returning();
    await ingestVersion(db, router, version!.id);
    libraryContainerIds.push(container!.id);
  }
});

afterAll(async () => {
  await pool.end();
});

const runRow = async (runId: string) =>
  (await db.select().from(s.runs).where(eq(s.runs.id, runId)).limit(1))[0]!;

describe('a check that searched the library says how many documents it searched (T-486 a)', () => {
  it('a clean check of the whole library records read = in scope, and says so in words', async () => {
    const res = await check({ families: ['corpus_accuracy'] });
    expect(res.status).toBe(201);
    const result = (await res.json()) as QaCheckRunResponse;
    expect(result.findings).toHaveLength(0); // clean: nothing behind a finding
    const row = await runRow(result.run.id);
    expect(row.reach).toMatchObject({ visibleLive: 4, inScope: 4, read: 4 });
    expect(result.coverage).toContain('Read 4 documents.');
    expect(result.coverage).not.toContain('Read no documents');
    // the audit itself is still the passage-grain record: it is `read` that
    // changed meaning for this kind of run, not what the steps recorded
    expect(result.run.reach).toMatchObject({ inScope: 4, read: 4 });
  });

  it('a scoped check records read = the scope’s in-scope count', async () => {
    const res = await check({
      families: ['corpus_accuracy'],
      scope: { containerIds: [libraryContainerIds[0]!, libraryContainerIds[1]!] },
    });
    expect(res.status).toBe(201);
    const result = (await res.json()) as QaCheckRunResponse;
    const row = await runRow(result.run.id);
    expect(row.reach).toMatchObject({ visibleLive: 4, inScope: 2, leftOutByScope: 2, read: 2 });
    expect(result.coverage).toContain('Read 2 documents in your scope.');
  });

  it('a check that did not search the library records no reach and says nothing about reading it', async () => {
    const res = await check({ families: ['completeness'] });
    expect(res.status).toBe(201);
    const result = (await res.json()) as QaCheckRunResponse;
    expect((await runRow(result.run.id)).reach).toBeNull();
    expect(result.run.reach).toBeUndefined();
    expect(result.coverage).not.toMatch(/\bRead \d+ document|Read no documents/);
  });

  it('the findings panel shows the newest run that SEARCHED the library, never a later check that did not', async () => {
    // the completeness check found the placeholder, so the draft has findings;
    // the corpus checks above were clean, so the only findings are from runs
    // that searched nothing — no sentence at all
    const withoutLibrary = (await (
      await app.request(`/sandbox-documents/${documentId}/findings`, { headers: { cookie } })
    ).json()) as ListFindingsResponse;
    expect(withoutLibrary.items.length).toBeGreaterThan(0);
    expect(withoutLibrary.reach).toBeNull();

    // one check that searched the library AND found the placeholder: its
    // sentence now shows
    const both = (await (await check({ families: ['corpus_accuracy', 'completeness'] })).json()) as QaCheckRunResponse;
    expect(both.findings.length).toBeGreaterThan(0);
    const shown = (await (
      await app.request(`/sandbox-documents/${documentId}/findings`, { headers: { cookie } })
    ).json()) as ListFindingsResponse;
    expect(shown.reach).toMatchObject({ inScope: 4, read: 4 });

    // …and a LATER check that searched nothing does not replace it with
    // "Read no documents"
    const later = (await (await check({ families: ['completeness'] })).json()) as QaCheckRunResponse;
    expect(later.run.id).not.toBe(both.run.id);
    const stillShown = (await (
      await app.request(`/sandbox-documents/${documentId}/findings`, { headers: { cookie } })
    ).json()) as ListFindingsResponse;
    expect(stillShown.reach).toMatchObject({ inScope: 4, read: 4 });
  });
});
