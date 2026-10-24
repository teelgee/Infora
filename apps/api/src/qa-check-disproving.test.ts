// T-476 acceptance — the checker's findings writer refuses a judgement finding
// with no rule and no passage, and counts it; and the optional disproving pass
// (ADR-0053 addendum A9) is declared in the plan, withdraws what it disproves,
// and is counted in the coverage sentence.
//
// *In plain terms: the checker can no longer keep a finding that says "this is
// wrong" without saying which rule or which other passage it is about. And with
// the second-look option on, a finding the model can argue itself out of is
// dropped before anyone reads it — with the reason kept on the run.*
//
// Repeatable on one seed: every lookup is by the ids this file created.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { QaCheckPlanResponse, QaCheckRunResponse } from '@infora/contracts';
import { createWorkerRegistry } from '@infora/capabilities';
import type { DraftFinding } from '@infora/capabilities';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { loadWorkflows } from '@infora/workflows';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { REFUSED_NO_RULE_OR_PASSAGE, writeFindingsReport } from './findings';

const { db, pool } = createDb();
const workflows = loadWorkflows({ workers: createWorkerRegistry(), production: true });

const CONTENT = [
  'Assessment',
  '',
  'The survey recorded three exceedances. The cap is two metres thick.',
].join('\n');

/** the model raises two findings from an attached note; the pass disproves one */
const router = fakeRouter((system) => {
  if (system.includes('checkable factual assertions')) return 'the exceedances';
  if (system.includes('summaries of what each section')) return JSON.stringify({ findings: [] });
  if (system.includes('You are testing a finding')) {
    return system.includes('cap is thinner')
      ? JSON.stringify({ holds: false, reasoning: 'The note says two metres, so the sentence is right.' })
      : JSON.stringify({ holds: true, reasoning: 'The note says four.' });
  }
  return JSON.stringify({
    summary: 'The section reports exceedances and a cap.',
    findings: [
      { family: 'corpus_accuracy', quote: 'three exceedances', defect: 'The note says four.', severity: 'required', source: 'A1' },
      { family: 'corpus_accuracy', quote: 'two metres thick', defect: 'The cap is thinner in the note.', severity: 'advisory', source: 'A1' },
    ],
  });
});
const app = buildApp({ db, sessionSecret: 'test-secret', router, workflows, workers: createWorkerRegistry() });

const stamp = Date.now();
let projectId: string;
let cookie: string;
let documentId: string;
let noteId: string;
let runId: string;
let draftDocumentId: string;

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const body = (over: Record<string, unknown> = {}) => ({
  sandboxDocumentId: documentId,
  families: ['corpus_accuracy'],
  depth: 'quick',
  attachedDocumentIds: [noteId],
  ...over,
});

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t476 org ${stamp}` }).returning();
  const organisationId = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t476 project ${stamp}`, ownerOrganisationId: organisationId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId, projectId, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't476-eleanor', email: `t476-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword('pw-t476') });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated: true })
    .returning();
  const session = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password: 'pw-t476' }),
  });
  cookie = session.headers.get('set-cookie')!.split(';')[0]!;

  // the draft sits in a shared area; the note it is checked against in one of the author's own
  const [area] = await db
    .insert(s.sandboxes)
    .values({ projectId, name: `t476 area ${stamp}`, scope: 'single_org', owningOrganisationId: organisationId, createdByParticipantId: participant!.id })
    .returning();
  const [draft] = await db
    .insert(s.sandboxDocuments)
    .values({ projectId, organisationId, sandboxId: area!.id, title: `t476 draft ${stamp}`, content: CONTENT, createdByParticipantId: participant!.id })
    .returning();
  documentId = draft!.id;
  draftDocumentId = draft!.id;
  const [own] = await db
    .insert(s.sandboxes)
    .values({ projectId, name: `t476 own ${stamp}`, scope: 'named_user', owningOrganisationId: organisationId, createdByParticipantId: participant!.id })
    .returning();
  await db.insert(s.sandboxScopeGrants).values({ sandboxId: own!.id, granteeType: 'participant', participantId: participant!.id, grantedByParticipantId: participant!.id });
  const [note] = await db
    .insert(s.sandboxDocuments)
    .values({ projectId, organisationId, sandboxId: own!.id, title: 'Ground note', content: 'Four exceedances. The cap is two metres thick.', createdByParticipantId: participant!.id })
    .returning();
  noteId = note!.id;

  const [conversation] = await db.insert(s.conversations).values({ projectId, surface: 'web' }).returning();
  const [run] = await db
    .insert(s.runs)
    .values({ conversationId: conversation!.id, agentId: 'infora.qa_checker', agentProvenance: 'infora', request: 'x', environmentKey: projectId, requesterParticipantId: participant!.id })
    .returning();
  runId = run!.id;
});

afterAll(async () => {
  await pool.end();
});

const anchor = { span: { start: 0, end: 10 }, paragraph: 0, verbatim: 'Assessment' };
const draftFinding = (over: Partial<DraftFinding> = {}): DraftFinding => ({
  checkFamily: 'style',
  anchor,
  defect: 'A judgement.',
  severity: 'advisory',
  evidence: { input: 'draft', basis: 'a rule typed onto the standard', ruleId: 'rule-1' },
  ...over,
});

describe('the writer is the backstop: no passage and no rule, no judgement finding (T-476)', () => {
  it('refuses a style finding that names no rule, writes nothing, and counts it', async () => {
    const result = await writeFindingsReport(db, {
      runId: runId as never,
      sandboxDocumentId: draftDocumentId as never,
      findings: [
        draftFinding({ evidence: { input: 'draft', basis: 'a rule typed onto the standard' }, defect: 'no rule here' }),
        draftFinding({ defect: 'has its rule' }),
        draftFinding({
          checkFamily: 'self_contradiction',
          defect: 'no second place',
          evidence: { input: 'draft', basis: 'section 2' },
        }),
      ],
    });
    expect(result.refused).toBe(2);
    expect(result.reason).toBe(REFUSED_NO_RULE_OR_PASSAGE);
    expect(REFUSED_NO_RULE_OR_PASSAGE).toBe('no passage and no rule');
    expect(result.written.map((finding) => finding.defect)).toEqual(['has its rule']);
    // and nothing of the refused ones reached the store (looked up by this run's id)
    const rows = await db.select().from(s.findings).where(eq(s.findings.runId, runId as never));
    expect(rows.map((row) => row.defect)).toEqual(['has its rule']);
  });
});

describe('the disproving pass is declared in the plan and its removals are counted (ADR-0053 A9)', () => {
  it('off by default: no disprove step, and the plan says nothing about it', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/plan`, body());
    const { plan } = (await res.json()) as QaCheckPlanResponse;
    expect(plan.steps.some((step) => step.key === 'disprove')).toBe(false);
    expect(plan.coverage).not.toContain('argued against');
  });

  it('on: the plan declares a disprove step with its estimate, after the section read', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/plan`, body({ disprovingPass: true }));
    expect(res.status).toBe(200);
    const { plan } = (await res.json()) as QaCheckPlanResponse;
    const keys = plan.steps.map((step) => step.key);
    expect(keys).toContain('disprove');
    expect(keys.indexOf('disprove')).toBeGreaterThan(keys.findIndex((key) => key.startsWith('check')));
    expect(plan.steps.find((step) => step.key === 'disprove')!.estimate.calls).toBeGreaterThan(0);
    expect(plan.coverage).toContain('argued against before you see it');
  });

  it('a run with the pass off keeps both findings and says nothing about the pass', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/runs`, body());
    expect(res.status).toBe(201);
    const result = (await res.json()) as QaCheckRunResponse;
    expect(result.findings.map((finding) => finding.defect).sort()).toEqual([
      'The cap is thinner in the note.',
      'The note says four.',
    ]);
    expect(result.coverage).not.toContain('disproving');
  });

  it('a run with the pass on withdraws the finding it disproves, counts it, and keeps the reason on the run', async () => {
    const res = await post(`/projects/${projectId}/tools/qa-check/runs`, body({ disprovingPass: true }));
    expect(res.status).toBe(201);
    const result = (await res.json()) as QaCheckRunResponse;
    // only the one it could not disprove is shown, and only that one is stored
    expect(result.findings.map((finding) => finding.defect)).toEqual(['The note says four.']);
    const stored = await db.select().from(s.findings).where(eq(s.findings.runId, result.run.id as never));
    expect(stored.map((row) => row.defect)).toEqual(['The note says four.']);
    // the coverage sentence counts what was raised and what was withdrawn
    expect(result.coverage).toContain('2 raised, 1 withdrawn by the disproving pass');
    // and the reason is on the run's own step row, in the record the run already keeps
    const steps = await db.select().from(s.steps).where(eq(s.steps.runId, result.run.id as never));
    const outcomes = steps.flatMap((step) => step.railOutcomes as Array<{ rail: string; detail?: string }>);
    const withdrawn = outcomes.filter((outcome) => outcome.rail === 'disproving_pass');
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]!.detail).toContain('The note says two metres, so the sentence is right.');
  });
});
