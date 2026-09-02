// T-427 acceptance — every run records the rule-set version it used, once, and
// nothing shows it (ADR-0054 decision 7).
//
// *In plain terms: a check and a draft each store which version of the writing
// rules they ran against. Stored, not shown. The owner ruled explicitly against
// a screen repeating "checked against style guide v3" down a list of findings,
// so the interesting assertions here are the negative ones: the version is on
// the run's record and it is on no finding and in no response.*
//
// **Why the record and not a column.** A run stores what it ran against through
// its bound workflow parameters — that is where `families`, `depth`,
// `template_id` and the upload fingerprints already live, and they are facts of
// exactly this class. The stamp joins them, on the ONE step that expands
// exactly once, so the run carries it once rather than once per section.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { QaCheckRunResponse } from '@infora/contracts';
import { createWorkerRegistry } from '@infora/capabilities';
import { saveRuleSet } from '@infora/data';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { loadWorkflows } from '@infora/workflows';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const workflows = loadWorkflows({ workers: createWorkerRegistry(), production: true });

const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter((system) => {
    if (system.includes('checkable factual assertions')) return 'the reduction in loading';
    if (system.includes('summaries of what each section')) return JSON.stringify({ findings: [] });
    return JSON.stringify({
      summary: 'The section asserts a 12% reduction.',
      findings: [
        {
          family: 'style',
          quote: 'The Scheme',
          defect: 'The works are capitalised where the guide says lower case.',
          severity: 'advisory',
          rule: 'R1',
        },
      ],
    });
  }),
  workflows,
  workers: createWorkerRegistry(),
});

const stamp = Date.now();
const password = 'pw-t427';
/**
 * Long enough that the planner fans the section check out rather than reading
 * the whole draft in one pass — which is what makes *stamped once* a claim with
 * teeth rather than a coincidence of a short document.
 */
const CONTENT = Array.from({ length: 30 }, (_, at) =>
  [
    `Section ${at + 1}`,
    '',
    'The Scheme is assessed for land quality across its whole extent, and the assessment records a 12% reduction in contaminant loading against the baseline established in the preceding survey. '.repeat(
      20,
    ),
  ].join('\n'),
).join('\n\n');

let projectId: string;
let cookie: string;
let documentId: string;
let ruleSetVersionId: string;

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t427 org ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t427 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't427-curator', email: `t427-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  await db
    .insert(s.userCredentials)
    .values({ userId: user!.id, passwordHash: hashPassword(password) });
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
      name: `t427 area ${stamp}`,
      scope: 'single_org',
      owningOrganisationId: org!.id,
      createdByParticipantId: participant!.id,
    })
    .returning();
  const [document] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: org!.id,
      sandboxId: sandbox!.id,
      title: `t427 draft ${stamp}`,
      content: CONTENT,
      createdByParticipantId: participant!.id,
    })
    .returning();
  documentId = document!.id;

  const [guide] = await db
    .insert(s.projectStyleGuides)
    .values({
      projectId,
      title: `t427 guide ${stamp}`,
      sourceFormat: 'docx',
      loadedByUserId: user!.id,
    })
    .returning();
  await db.insert(s.projectStyleGuideClauses).values({
    styleGuideId: guide!.id,
    ordinal: 1,
    clause: '2.1',
    heading: 'Naming',
    content: 'Refer to the works as “the scheme”, in lower case.',
    spanStart: 0,
    spanEnd: 48,
  });
  const saved = await saveRuleSet(db, {
    styleGuideId: guide!.id,
    acceptedByUserId: user!.id,
    draftingBrief: '',
    rules: [
      {
        kind: 'term',
        origin: 'typed',
        statement: 'Use “scheme”, not “Scheme”.',
        scope: 'sentence',
        exceptedContexts: [],
        exceptedTerms: [],
        register: 'all',
        enforcement: 'raises_findings',
        severity: 'advisory',
        payload: { preferred: 'scheme', replaces: ['Scheme'] },
      },
    ],
  });
  ruleSetVersionId = saved.ruleSetVersionId;
});

afterAll(async () => {
  await pool.end();
});

/** Every step's stored inputs for one run, keyed by the step's ordinal. */
async function stepInputs(runId: string) {
  const rows = await db
    .select({ ordinal: s.planSteps.ordinal, worker: s.planSteps.worker, inputs: s.planSteps.inputs })
    .from(s.planSteps)
    .innerJoin(s.plans, eq(s.plans.id, s.planSteps.planId))
    .where(eq(s.plans.runId, runId));
  return rows.map((row) => ({
    worker: row.worker,
    inputs: row.inputs as Record<string, unknown>,
  }));
}

describe('T-427 — the run records the rule-set version, once', () => {
  let result: QaCheckRunResponse;

  beforeAll(async () => {
    const res = await app.request(`/projects/${projectId}/tools/qa-check/runs`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        sandboxDocumentId: documentId,
        families: ['style', 'readability', 'completeness'],
        depth: 'quick',
        scopeVersionIds: [],
        attachedDocumentIds: [],
      }),
    });
    expect(res.status).toBe(201);
    result = (await res.json()) as QaCheckRunResponse;
  });

  it('stores it on the run’s own record', async () => {
    const steps = await stepInputs(result.run.id);
    const carrying = steps.filter((step) =>
      JSON.stringify(step.inputs['rule_set_versions'] ?? '').includes(ruleSetVersionId),
    );
    expect(carrying).toHaveLength(1);
    expect(carrying[0]!.worker).toBe('qa_document_check');
  });

  it('stamps it ONCE — never once per section', async () => {
    const steps = await stepInputs(result.run.id);
    // the section check fans out; the coverage step does not, which is why the
    // stamp lives on the latter
    expect(steps.filter((step) => step.worker === 'qa_section_check').length).toBeGreaterThan(1);
    expect(
      steps.filter((step) => 'rule_set_versions' in step.inputs).length,
    ).toBe(1);
  });

  it('puts it on NO finding — `checkFamily` is a different field and is untouched', async () => {
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(JSON.stringify(finding)).not.toContain(ruleSetVersionId);
      expect(finding.checkFamily).toBeDefined();
    }
    const rows = await db
      .select()
      .from(s.findings)
      .where(eq(s.findings.sandboxDocumentId, documentId));
    for (const row of rows) expect(JSON.stringify(row)).not.toContain(ruleSetVersionId);
  });

  it('renders it on NO surface — it is absent from the whole response', () => {
    // 🔒 the response is what every screen is built from, and `ToolPlan` carries
    // no step inputs at all — so "stored, not displayed" holds by construction
    // rather than by a rule somebody has to remember
    expect(JSON.stringify(result)).not.toContain(ruleSetVersionId);
    expect(JSON.stringify(result)).not.toContain('rule_set_versions');
    expect(JSON.stringify(result.coverage)).not.toContain('v1');
  });

  it('names no version where the project has no accepted rules', async () => {
    const [org] = await db.insert(s.organisations).values({ name: `t427 bare ${stamp}` }).returning();
    const [bare] = await db
      .insert(s.projects)
      .values({ name: `t427 bare project ${stamp}`, ownerOrganisationId: org!.id })
      .returning();
    // an empty stamp is a real answer — this run was bound by no accepted rules
    // at all — and it is different from a stamp nobody recorded
    const { currentRuleSetVersionIds } = await import('@infora/data');
    expect(await currentRuleSetVersionIds(db, bare!.id)).toEqual([]);
  });
});
