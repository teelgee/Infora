// T-043 — the draft seam bound: the grounded-generation capability adapted
// into the chain's one thinking leaf. The capability draws only on the
// working input the retrieve step admitted; the Router's model identity and
// usage land on the Step row.
//
// T-285 — and every route the router ATTEMPTED lands there too. The Step row
// records the call that answered; a route that was tried and was unavailable
// egressed all the same, and a record naming only the endpoint that eventually
// worked has omitted an egress event. Those attempts are written as CHILD Step
// rows under the draft step, which is why this is the leaf's job and not the
// capability's: `@infora/capabilities` holds no `Db` by design, and the child
// row is exactly what the append-only tree already models (`parent_step_id`).
import type { Router } from '@infora/model';
import { attemptsOf } from '@infora/model';
import type { RouteAttempt } from '@infora/model';
import { groundedDraft } from '@infora/capabilities';
import type { GroundedDraftOptions } from '@infora/capabilities';
import type { Db } from '@infora/db';
import type { Id } from '@infora/contracts';
import type { ChainLeaves } from './chain';
import { finishStep, openStep } from './run-writer';

/**
 * One child Step per FAILED attempt.
 *
 * The successful attempt is not duplicated: it IS the draft step, whose egress
 * columns already name the endpoint that answered. Writing it twice would make
 * a single-route call look like two model calls in every cost report.
 *
 * Failures are recorded even when the call went on to succeed — that is the
 * whole point of the requirement, since a fallback that fired silently is a
 * fallback nobody can audit. They are written AFTER the fact rather than as
 * the attempt happens, because a Step row is opened and finished exactly once
 * (the T-008 trigger) and an attempt's outcome is not known until it is over.
 */
async function recordFailedAttempts(
  db: Db,
  parentStepId: Id,
  runId: Id,
  attempts: readonly RouteAttempt[],
): Promise<void> {
  for (const attempt of attempts) {
    if (attempt.outcome === 'succeeded') continue;
    const row = await openStep(db, { runId, type: 'draft', parentStepId });
    await finishStep(db, row.id, 'failed', { egress: attempt.egress });
  }
}

export function createDraftLeaf(
  router: Router,
  options: GroundedDraftOptions = {},
): ChainLeaves['draft'] {
  return async (ctx, input) => {
    // T-299 — `input.lens` travels with the request; `options` is the
    // deployment's construction-time configuration and carries no Lens, which
    // is what makes the Lens per-request rather than per-deployment.
    let result;
    try {
      result = await groundedDraft(
        router,
        { request: input.request, retrieved: input.retrieved, lens: input.lens },
        { ...options, mode: input.mode },
      );
    } catch (error) {
      // The chain is about to record this step failed and carry on (T-268).
      // The attempts still happened, so they are written before the error is
      // re-thrown — an exhausted chain is precisely the case where the record
      // of what was tried is worth most.
      await recordFailedAttempts(ctx.db, ctx.stepId, ctx.run.id, attemptsOf(error));
      throw error;
    }
    await recordFailedAttempts(ctx.db, ctx.stepId, ctx.run.id, result.attempts ?? []);
    return {
      output: { claims: result.claims },
      audit: {
        model: result.model,
        usage: result.usage,
        ...(result.egress !== undefined && { egress: result.egress }),
      },
    };
  };
}
