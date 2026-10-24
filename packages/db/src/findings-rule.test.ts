// T-476 — a judgement finding names its rule, and the store refuses one that
// does not (migration 0082, `findings_judgement_names_rule_or_passage`).
// *In plain terms: a finding the AI raised by reading — a style finding, or a
// contradiction — must say which writing rule it applied or which second place
// it points at. The database itself refuses one that says neither, whatever
// wrote it. The arithmetic checks are not asked: they are measured against a
// stated target.*
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

let documentId: string;
let runId: string;
let participantId: string;

const anchor = { span: { start: 0, end: 5 }, paragraph: 0, verbatim: 'Hello' };

beforeAll(async () => {
  const stamp = Date.now();
  const [org] = await db.insert(s.organisations).values({ name: `t476 org ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t476 project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  const [user] = await db
    .insert(s.users)
    .values({ name: 't476-user', email: `t476-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId: project!.id })
    .returning();
  participantId = participant!.id;
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId: project!.id,
      name: `t476 area ${stamp}`,
      scope: 'single_org',
      owningOrganisationId: org!.id,
      createdByParticipantId: participantId,
    })
    .returning();
  const [document] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId: project!.id,
      organisationId: org!.id,
      sandboxId: sandbox!.id,
      title: `t476 draft ${stamp}`,
      content: 'Hello world',
      createdByParticipantId: participantId,
    })
    .returning();
  documentId = document!.id;
  const [conversation] = await db
    .insert(s.conversations)
    .values({ projectId: project!.id, surface: 'web' })
    .returning();
  const [run] = await db
    .insert(s.runs)
    .values({
      conversationId: conversation!.id,
      agentId: 'infora.qa_checker',
      agentProvenance: 'infora',
      request: 'check this draft',
      environmentKey: project!.id,
      requesterParticipantId: participantId,
    })
    .returning();
  runId = run!.id;
});

afterAll(async () => {
  await pool.end();
});

const insert = (
  checkFamily: (typeof s.checkFamily.enumValues)[number],
  evidence: Record<string, unknown>,
) =>
  db
    .insert(s.findings)
    .values({
      runId,
      sandboxDocumentId: documentId,
      checkFamily,
      input: evidence['input'] as 'draft',
      evidence,
      anchor,
      defect: 'a defect',
      severity: 'advisory',
    })
    .returning({ id: s.findings.id });

/** drizzle wraps the driver's error; the constraint's name is on the cause */
const refusedByTheStore = async (attempt: Promise<unknown>) => {
  let caught: unknown;
  try {
    await attempt;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'the store should have refused this row').toBeDefined();
  const cause = (caught as { cause?: { message?: string } }).cause;
  expect(cause?.message ?? String(caught)).toContain('findings_judgement_names_rule_or_passage');
};

describe('a judgement finding names its rule or its second place (T-476)', () => {
  it('refuses a style finding with draft evidence that names no rule', async () => {
    await refusedByTheStore(insert('style', { input: 'draft', basis: 'a rule typed onto the standard' }));
  });

  it('refuses a blank rule id as no rule at all', async () => {
    await refusedByTheStore(insert('style', { input: 'draft', basis: 'a rule', ruleId: '' }));
  });

  it('refuses a contradiction that names no second place', async () => {
    await refusedByTheStore(
      insert('self_contradiction', { input: 'draft', basis: 'section 3 of this draft' }),
    );
  });

  it('accepts a style finding that names its rule', async () => {
    const [row] = await insert('style', { input: 'draft', basis: 'a rule', ruleId: 'rule-1' });
    expect(row!.id).toBeTruthy();
  });

  it('accepts a contradiction that carries its second place', async () => {
    const [row] = await insert('self_contradiction', {
      input: 'draft',
      basis: 'section 3 of this draft',
      otherAnchor: anchor,
    });
    expect(row!.id).toBeTruthy();
  });

  it('does not ask the arithmetic checks, which are measured against a stated target', async () => {
    const [read] = await insert('readability', { input: 'draft', basis: 'the grade-14 target' });
    const [complete] = await insert('completeness', { input: 'draft', basis: 'placeholder text' });
    expect(read!.id).toBeTruthy();
    expect(complete!.id).toBeTruthy();
  });

  it('does not ask a finding that carries its own proof (a cited passage, a quoted clause)', async () => {
    const [corpus] = await insert('corpus_accuracy', { input: 'corpus', citations: [] });
    const [clause] = await insert('style', {
      input: 'rulebook',
      clause: '§1',
      quote: 'a rule',
      rulebookRef: 'x',
      scope: 'project',
    });
    expect(corpus!.id).toBeTruthy();
    expect(clause!.id).toBeTruthy();
  });

  it('a finding written before the rule was kept (stamped by the migration) can still be closed', async () => {
    const [row] = await insert('style', { input: 'draft', basis: 'an old rule', ruleRecorded: false });
    await db
      .update(s.findings)
      .set({ status: 'closed', closedByParticipantId: participantId, closedAt: new Date() })
      .where(eq(s.findings.id, row!.id));
    const [after] = await db.select().from(s.findings).where(eq(s.findings.id, row!.id));
    expect(after!.status).toBe('closed');
  });
});
