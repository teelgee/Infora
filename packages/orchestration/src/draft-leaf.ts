// T-043 — the draft seam bound: the grounded-generation capability adapted
// into the chain's one thinking leaf. The capability draws only on the
// working input the retrieve step admitted; the Router's model identity and
// usage land on the Step row.
import type { Router } from '@infora/model';
import { groundedDraft } from '@infora/capabilities';
import type { GroundedDraftOptions } from '@infora/capabilities';
import type { ChainLeaves } from './chain';

export function createDraftLeaf(
  router: Router,
  options: GroundedDraftOptions = {},
): ChainLeaves['draft'] {
  return async (_ctx, input) => {
    // T-299 — `input.lens` travels with the request; `options` is the
    // deployment's construction-time configuration and carries no Lens, which
    // is what makes the Lens per-request rather than per-deployment.
    const result = await groundedDraft(
      router,
      { request: input.request, retrieved: input.retrieved, lens: input.lens },
      { ...options, mode: input.mode },
    );
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
