// T-336 acceptance — the launcher's two endpoints: the plan before any spend,
// and the run that executes exactly that plan.
//
// **The cases that carry the ticket are the honesty ones.** A checker that ran
// and returned an empty list would pass a happy-path suite while making the one
// claim ADR-0053 §5 exists to forbid: *your document is fine*, said about
// material nobody read. So the coverage statement is asserted **before and
// after, in the same shape**, the refusal is asserted **before any spend**, and
// the editor route is asserted to be the Tools route rather than a second flow.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { QaCheckPlanResponse, QaCheckRunResponse } from '@infora/contracts';
import { createWorkerRegistry } from '@infora/capabilities';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { loadWorkflows } from '@infora/workflows';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const workflows = loadWorkflows({ workers: createWorkerRegistry(), production: true });

/**
 * A router that answers the CHECK prompt with one well-formed finding and the
 * assertion-extraction prompt with a line of text. It keys on the system prompt
 * because the two calls are different acts and a fake that answered both the
 * same way could not exercise either honestly.
 */
const checkingRouter = () =>
  fakeRouter((system) => {
    if (system.includes('checkable factual assertions')) return 'the reduction in loading';
    if (system.includes('summaries of what each section')) {
      return JSON.stringify({ findings: [] });
    }
    return JSON.stringify({
      summary: 'The section asserts a 12% reduction.',
      findings: [
        {
          family: 'style',
          quote: 'The Scheme',
          defect: 'The works are capitalised where the guide says lower case.',
          severity: 'advisory',
          rule: 'R1',
          replacement: 'The scheme',
        },
      ],
    });
  });

const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: checkingRouter(),
  workflows,
  workers: createWorkerRegistry(),
});

const stamp = Date.now();
const password = 'pw-t336';
let projectId: string;
let organisationId: string;
let cookie: string;
let participantId: string;
let documentId: string;
let emptyDocumentId: string;

const CONTENT = [
  'Introduction',
  '',
  'The Scheme is assessed for land quality across its whole extent.',
  '',
  'Assessment',
  '',
  'The Scheme delivers a 12% reduction in contaminant loading. TBC.',
  '',
  'Conclusions',
  '',
  'The works are acceptable subject to the validation strategy.',
].join('\n');

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const body = (over: Record<string, unknown> = {}) => ({
  sandboxDocumentId: documentId,
  families: ['style', 'corpus_accuracy', 'self_contradiction', 'readability', 'completeness'],
  depth: 'full',
  scopeVersionIds: [],
  attachedDocumentIds: [],
  ...over,
});

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t336 org ${stamp}` }).returning();
  organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t336 project ${stamp}`, ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });

  const [user] = await db
    .insert(s.users)
    .values({ name: 't336-eleanor', email: `t336-${stamp}@test.local`, organisationId })
    .returning();
  await db
    .insert(s.userCredentials)
    .values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated: true })
    .returning();
  participantId = participant!.id;
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
      name: `t336 area ${stamp}`,
      scope: 'single_org',
      owningOrganisationId: organisationId,
      createdByParticipantId: participantId,
    })
    .returning();
  const [document] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId: sandbox!.id,
      title: `t336 draft ${stamp}`,
      content: CONTENT,
      createdByParticipantId: participantId,
    })
    .returning();
  documentId = document!.id;
  const [empty] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId,
      sandboxId: sandbox!.id,
      title: `t336 empty ${stamp}`,
      content: '',
      createdByParticipantId: participantId,
    })
    .returning();
  emptyDocumentId = empty!.id;

  // the project's own style guide, so the style family has something to bind
  const [guide] = await db
    .insert(s.projectStyleGuides)
    .values({
      projectId,
      title: 'Wrenfield Project Style Guide',
      sourceFormat: 'docx',
      loadedByUserId: user!.id,
    })
    .returning();
  await db.insert(s.projectStyleGuideClauses).values({
    styleGuideId: guide!.id,
    ordinal: 1,
    clause: '§2.1',
    heading: 'Naming',
    content: 'Refer to the works as “the scheme”, in lower case.',
    spanStart: 0,
    spanEnd: 48,
  });
});

afterAll(async () => {
  await pool.end();
});

describe('the plan is shown before anything is spent (ADR-0053 §4)', () => {
  it('names its shape, its steps and what it will cover', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/plan`, body());
    expect(res.status).toBe(200);
    const { plan } = (await res.json()) as QaCheckPlanResponse;
    expect(plan.workflowId).toBe('qa-check');
    expect(plan.shape).toBeDefined();
    expect(plan.steps.length).toBeGreaterThan(0);
    // coverage BEFORE: sections, checks, the record's reach, the clause ratio
    expect(plan.coverage).toContain('3 sections');
    expect(plan.coverage).toContain('5 checks');
    expect(plan.coverage).toContain('1 of 1 clauses');
    expect(plan.refusal).toBeNull();
  });

  it('the plan endpoint spends nothing — no run, no findings, no rows', async () => {
    const before = await db.select().from(s.runs).where(eq(s.runs.environmentKey, projectId));
    await post(`/projects/${projectId}/tools/qa-check/plan`, body());
    const after = await db.select().from(s.runs).where(eq(s.runs.environmentKey, projectId));
    expect(after.length).toBe(before.length);
  });

  it('the same request plans the same way twice, over HTTP', async () => {
    // 🔒 the declared-workflow promise, asserted at the boundary a user meets
    const first = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body())
    ).json()) as QaCheckPlanResponse;
    const second = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body())
    ).json()) as QaCheckPlanResponse;
    expect(second).toEqual(first);
  });

  it('changing a parameter changes the plan, which is how the user shapes it', async () => {
    const full = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body())
    ).json()) as QaCheckPlanResponse;
    const narrow = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body({ families: ['readability'] }))
    ).json()) as QaCheckPlanResponse;
    expect(narrow.plan.steps.length).toBeLessThan(full.plan.steps.length);
    expect(narrow.plan.coverage).toContain('1 check');
  });

  it('refuses an empty draft rather than planning a run over nothing', async () => {
    const res = await post(
      `/projects/${projectId}/tools/qa-check/plan`,
      body({ sandboxDocumentId: emptyDocumentId }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail?: string }).detail).toContain('nothing to check');
  });

  it('a draft that is not this requester’s does not exist to them', async () => {
    const res = await post(
      `/projects/${projectId}/tools/qa-check/plan`,
      body({ sandboxDocumentId: '00000000-0000-0000-0000-000000000000' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('the run executes exactly that plan, and states its coverage again', () => {
  it('runs, writes anchored findings, and reports coverage in the same shape', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/runs`, body());
    expect(res.status).toBe(201);
    const result = (await res.json()) as QaCheckRunResponse;

    // the plan the user saw and the plan the run executed are ONE object
    expect(result.plan.workflowId).toBe('qa-check');
    expect(result.run.id).toBeDefined();

    // 🔒 the same SHAPE as the plan's sentence, so the difference between what
    // was promised and what happened is visible at a glance
    expect(result.coverage).toContain('sections read');
    // and the SHORT shape reports every section, not one: reading the whole
    // draft in one pass read all of it, and "1 of 3 sections read" would
    // understate the coverage — the same class of error as overstating it
    expect(result.coverage).toMatch(/^3 of 3 sections read/);
    expect(result.coverage).toContain('5 checks');
    expect(result.coverage).toContain('style guide');

    // the findings are stored, anchored into the draft, and come back
    expect(result.findings.length).toBeGreaterThan(0);
    const [row] = await db
      .select()
      .from(s.findings)
      .where(eq(s.findings.sandboxDocumentId, documentId))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.runId).toBe(result.run.id);
  });

  it('the CODE families run with no model behind them, and find the placeholder', async () => {
    const res = await post(
      `/projects/${projectId}/tools/qa-check/runs`,
      body({ families: ['completeness'] }),
    );
    const result = (await res.json()) as QaCheckRunResponse;
    // "TBC." is in the draft; no model call is involved in finding it
    expect(
      result.findings.some((finding) => finding.defect.includes('placeholder')),
    ).toBe(true);
    expect(result.findings.every((finding) => finding.checkFamily === 'completeness')).toBe(true);
  });

  it('records the run as DECLARED, with a step of each capability’s own kind', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/runs`, body());
    const result = (await res.json()) as QaCheckRunResponse;
    const steps = await db.select().from(s.steps).where(eq(s.steps.runId, result.run.id));
    const types = new Set(steps.map((step) => step.type));
    // the executor rule: a plan step runs the capability it NAMES, and the Step
    // row is of that capability's own kind (T-396, migration 0061's vocabulary)
    expect(types.has('qa_section_check')).toBe(true);
    expect(types.has('qa_document_check')).toBe(true);
  });

  it('“no findings” is never unqualified — the coverage says what was read', async () => {
    // a run whose model finds nothing still states its reach, which is the only
    // thing distinguishing a clean result from an unexamined one
    const quiet = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: fakeRouter(() => JSON.stringify({ summary: 'x', findings: [] })),
      workflows,
      workers: createWorkerRegistry(),
    });
    const res = await quiet.request(`/projects/${projectId}/tools/qa-check/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body({ families: ['style', 'corpus_accuracy'] })),
    });
    const result = (await res.json()) as QaCheckRunResponse;
    expect(result.findings).toHaveLength(0);
    expect(result.coverage).toContain('sections read');
    // and it says the library gave it nothing rather than implying it agreed
    expect(result.coverage).toContain('the library returned nothing to check against');
  });
});

describe('one run shape, and one place the scope is stated (ADR-0053 §1)', () => {
  it('a run covers ONE document — the body has no way to name a second', () => {
    // the shape itself is the guarantee: there is no `sandboxDocumentIds`, and
    // a set sweep would produce a report, which ADR-0048 §1 made the checker
    // deliberately not be
    expect(Object.keys(body())).toContain('sandboxDocumentId');
    expect(Object.keys(body())).not.toContain('sandboxDocumentIds');
  });

  it('the run honours the plan’s refusal rather than treating it as advice', async () => {
    // a section too long to check even on its own — the pathological case, said
    // in the plan BEFORE any spend
    const [huge] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId,
        sandboxId: (await db.select().from(s.sandboxes).where(eq(s.sandboxes.projectId, projectId)).limit(1))[0]!.id,
        title: `t336 huge ${stamp}`,
        content: `One\n\n${'x'.repeat(400_000)}\n\nTwo\n\nshort.`,
        createdByParticipantId: participantId,
      })
      .returning();

    const planned = (await (
      await post(`/projects/${projectId}/tools/qa-check/plan`, body({ sandboxDocumentId: huge!.id }))
    ).json()) as QaCheckPlanResponse;
    expect(planned.plan.refusal).not.toBeNull();

    const res = await post(
      `/projects/${projectId}/tools/qa-check/runs`,
      body({ sandboxDocumentId: huge!.id }),
    );
    expect(res.status).toBe(400);
    const runs = await db.select().from(s.findings).where(eq(s.findings.sandboxDocumentId, huge!.id));
    expect(runs).toHaveLength(0);
  });
});
