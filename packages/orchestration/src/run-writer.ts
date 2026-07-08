// T-040 — the Run/Step writer (ADR-0028 §1–3): Conversation → Run → Step
// lifecycle against the append-only tables. Rows are opened 'running' and
// finished exactly once; the DB triggers (T-008) freeze a finished row, so
// the finish call carries the whole audit payload in the one UPDATE the
// trigger admits. The tree is representable from the start: parent_run_id
// for sub-agent child Runs, parent_step_id for nesting, child_run_id on the
// delegating step.
import { eq } from 'drizzle-orm';
import type { Id, Step, Surface } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

export type ConversationRow = typeof s.conversations.$inferSelect;
export type RunRow = typeof s.runs.$inferSelect;
export type StepRow = typeof s.steps.$inferSelect;

export async function createConversation(
  db: Db,
  values: { projectId: Id; surface: Surface; workItemId?: Id | null },
): Promise<ConversationRow> {
  const [row] = await db
    .insert(s.conversations)
    .values({
      projectId: values.projectId,
      surface: values.surface,
      workItemId: values.workItemId ?? null,
    })
    .returning();
  return row!;
}

export async function openRun(
  db: Db,
  values: {
    conversationId: Id;
    agentId: string;
    agentProvenance: 'infora' | 'custom';
    request: string;
    environmentKey: string;
    requesterParticipantId: Id;
    parentRunId?: Id | null;
  },
): Promise<RunRow> {
  const [row] = await db
    .insert(s.runs)
    .values({ ...values, parentRunId: values.parentRunId ?? null })
    .returning();
  return row!;
}

/**
 * running → completed/failed, exactly once; the trigger rejects a second
 * finish. The produced answer lands in the same UPDATE (part of the record,
 * 2026-07-08) — after it, the row is frozen.
 */
export async function finishRun(
  db: Db,
  runId: Id,
  state: 'completed' | 'failed',
  record: { response?: string | null } = {},
): Promise<RunRow> {
  const [row] = await db
    .update(s.runs)
    .set({ state, endedAt: new Date(), response: record.response ?? null })
    .where(eq(s.runs.id, runId))
    .returning();
  if (!row) throw new Error(`run ${runId} not found`);
  return row;
}

export async function openStep(
  db: Db,
  values: { runId: Id; type: Step['type']; parentStepId?: Id | null },
): Promise<StepRow> {
  const [row] = await db
    .insert(s.steps)
    .values({ runId: values.runId, type: values.type, parentStepId: values.parentStepId ?? null })
    .returning();
  return row!;
}

export type StepAudit = {
  model?: { id: string; version: string };
  usage?: { tokensPrompt: number; tokensCompletion: number; cost: number };
  sourceSet?: Step['sourceSet'];
  railOutcomes?: Step['railOutcomes'];
  childRunId?: Id;
};

/**
 * Status flip and audit payload in one UPDATE — after it, the row is frozen.
 * The two defensibility fields (ADR-0028 §7) default to explicit emptiness,
 * never null: an empty source set is a recorded fact.
 */
export async function finishStep(
  db: Db,
  stepId: Id,
  status: 'completed' | 'failed',
  audit: StepAudit = {},
): Promise<StepRow> {
  const [row] = await db
    .update(s.steps)
    .set({
      status,
      endedAt: new Date(),
      modelId: audit.model?.id ?? null,
      modelVersion: audit.model?.version ?? null,
      tokensPrompt: audit.usage?.tokensPrompt ?? null,
      tokensCompletion: audit.usage?.tokensCompletion ?? null,
      cost: audit.usage ? String(audit.usage.cost) : null,
      sourceSet: audit.sourceSet ?? [],
      railOutcomes: audit.railOutcomes ?? [],
      childRunId: audit.childRunId ?? null,
    })
    .where(eq(s.steps.id, stepId))
    .returning();
  if (!row) throw new Error(`step ${stepId} not found`);
  return row;
}
