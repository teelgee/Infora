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
import { costOf } from '@infora/model';
import type { ModelRates } from '@infora/model';
import type { ChainLeaves } from './chain';
import { sourcesOf } from './chain';
import { finishRun, finishStep, openRun, openStep } from './run-writer';
import type { StepAudit } from './run-writer';

export const RETRIEVAL_AGENT_ID = 'infora.retrieval';

/**
 * T-313 — the retrieval half of a run's cost, on the step that spent it.
 *
 * `tokensCompletion: 0` is a FACT about an embedding call, not a placeholder:
 * an embedding produces no completion. The cost is `costOf` against the
 * embedding model's own rate, so an unpriced embedding model yields `null` and
 * the step reads as unpriced rather than free — the T-254 rule, which is the
 * whole reason this ticket exists one layer down.
 *
 * Absent usage returns an EMPTY audit rather than a zero one: an assembly that
 * reported no usage must not be recorded as a model call that cost nothing.
 */
function embeddingAudit(input: AssembledInput, rates: ModelRates | undefined): StepAudit {
  if (input.embedding === undefined) return {};
  const usage = { tokensPrompt: input.embedding.tokens, tokensCompletion: 0 };
  return {
    model: input.embedding.model,
    usage: { ...usage, cost: costOf(rates, input.embedding.model, usage) },
  };
}

export function createRetrieveLeaf(
  gateway: { assemble: Assemble },
  // T-313 — provider rates per model id, as the draft leaf takes them. Absent
  // records `cost: null` — unpriced, and reported as such.
  options: { rates?: ModelRates } = {},
): ChainLeaves['retrieve'] {
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
      // the sub-agent's OWN embedding call, on the sub-agent's own step —
      // attributing it to the parent would put a child run's spend on a step
      // that did not make it
      await finishStep(ctx.db, childStep.id, 'completed', {
        sourceSet: sourcesOf(targeted),
        ...embeddingAudit(targeted, options.rates),
      });
      await finishRun(ctx.db, child.id, 'completed');
      await finishStep(ctx.db, delegate.id, 'completed', { childRunId: child.id });

      return {
        output: fold(baseline, targeted),
        // the parent step carries the BASELINE assembly's embedding call, which
        // is the one it made itself
        audit: embeddingAudit(baseline, options.rates),
      };
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

  // the folded input carries the BASELINE's embedding fact only: each
  // assembly's cost is recorded on the step that made it, and summing them here
  // would double-count the targeted call the child step already carries.
  return {
    items,
    budget: { tokenLimit: baseline.budget.tokenLimit, tokensUsed },
    ...(baseline.embedding !== undefined && { embedding: baseline.embedding }),
  };
}
