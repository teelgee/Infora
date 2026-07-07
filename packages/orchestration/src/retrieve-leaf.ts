// T-042 — the retrieve leaf and the v1 retrieval sub-agent (ADR-0028 §4).
// The leaf's only reach into any store is the injected assemble() gateway —
// it takes nothing else, so bypassing the wall is structurally impossible.
// Baseline assembly opens the working input; then the one v1 sub-agent runs
// targeted retrieval as a real child Run (parent_run_id), hung off a nested
// delegate step (parent_step_id, child_run_id) so the audit tree is genuine.
import { eq } from 'drizzle-orm';
import type { Assemble, AssembledInput, AssemblyRequest } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { estimateTokens } from '@infora/knowledge';
import type { ChainLeaves } from './chain';
import { sourcesOf } from './chain';
import { finishRun, finishStep, openRun, openStep } from './run-writer';

export const RETRIEVAL_AGENT_ID = 'infora.retrieval';

export function createRetrieveLeaf(gateway: { assemble: Assemble }): ChainLeaves['retrieve'] {
  return async (ctx, { request }) => {
    // identity comes from the run's own record, never from the caller
    const requester = await requesterOf(ctx.db, ctx.run.requesterParticipantId);
    const environment: AssemblyRequest['environment'] = {
      kind: 'project',
      projectId: ctx.run.environmentKey,
    };

    const baseline = await gateway.assemble({
      request: { text: request, mode: 'baseline' },
      environment,
      requester,
    });

    // v1's sub-question is the request itself — the structure is what the
    // skeleton exercises; choosing a narrower sub-question agentically is
    // the draft leaf's post-skeleton escalation (ADR-0028 §5)
    const delegate = await openStep(ctx.db, {
      runId: ctx.run.id,
      type: 'delegate',
      parentStepId: ctx.stepId,
    });
    const child = await openRun(ctx.db, {
      conversationId: ctx.run.conversationId,
      agentId: RETRIEVAL_AGENT_ID,
      agentProvenance: 'infora',
      request,
      environmentKey: ctx.run.environmentKey,
      requesterParticipantId: ctx.run.requesterParticipantId,
      parentRunId: ctx.run.id,
    });
    const childStep = await openStep(ctx.db, { runId: child.id, type: 'retrieve' });

    try {
      const targeted = await gateway.assemble({
        request: { text: request, mode: 'targeted' },
        environment,
        requester,
      });
      await finishStep(ctx.db, childStep.id, 'completed', { sourceSet: sourcesOf(targeted) });
      await finishRun(ctx.db, child.id, 'completed');
      await finishStep(ctx.db, delegate.id, 'completed', { childRunId: child.id });

      return { output: fold(baseline, targeted) };
    } catch (error) {
      await finishStep(ctx.db, childStep.id, 'failed');
      await finishRun(ctx.db, child.id, 'failed');
      await finishStep(ctx.db, delegate.id, 'failed', { childRunId: child.id });
      throw error;
    }
  };
}

async function requesterOf(db: Db, participantId: string) {
  const [row] = await db
    .select({ organisationId: s.users.organisationId })
    .from(s.participants)
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.participants.id, participantId))
    .limit(1);
  if (!row) throw new Error(`participant ${participantId} not found`);
  return { organisationId: row.organisationId, participantId };
}

// Fold the sub-agent's findings into the calling agent's context (ADR-0028
// §4): new items append within the shared budget, duplicates dropped.
function fold(baseline: AssembledInput, targeted: AssembledInput): AssembledInput {
  const seen = new Set(baseline.items.map((item) => JSON.stringify([item.source, item.content])));
  const items = [...baseline.items];
  let tokensUsed = baseline.budget.tokensUsed;

  for (const item of targeted.items) {
    const key = JSON.stringify([item.source, item.content]);
    if (seen.has(key)) continue;
    const cost = estimateTokens(item.content);
    if (tokensUsed + cost > baseline.budget.tokenLimit) continue;
    seen.add(key);
    items.push(item);
    tokensUsed += cost;
  }

  return { items, budget: { tokenLimit: baseline.budget.tokenLimit, tokensUsed } };
}
