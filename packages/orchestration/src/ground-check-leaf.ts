// T-044 — the ground-check seam bound: the governance verifier adapted into
// the chain. The admitted set is what retrieval returned — the same source
// set already on the step's audit row — so a claim can only survive on a
// source the run actually saw.
import { groundCheck } from '@infora/governance';
import type { ChainLeaves } from './chain';
import { sourcesOf } from './chain';

export function createGroundCheckLeaf(): ChainLeaves['groundCheck'] {
  return async (_ctx, input) => {
    const result = groundCheck({
      claims: input.draft.claims,
      sourceSet: sourcesOf(input.retrieved),
      // chat keeps model-knowledge claims, labelled open-world; drafting
      // into a document stays grounded-only (ruled 2026-07-09, T-089)
      unsourced: input.mode === 'chat' ? 'label' : 'withhold',
    });
    // T-475 — where each withheld claim stood in the draft, so the gap marker
    // lands at the sentence that needed it
    const withheldSet = new Set(result.withheld);
    const withheldAfter: number[] = [];
    let surviving = 0;
    for (const claim of input.draft.claims) {
      if (withheldSet.has(claim)) withheldAfter.push(surviving);
      else surviving += 1;
    }
    return {
      output: { surviving: result.surviving, withheld: result.withheld, withheldAfter },
      audit: { railOutcomes: result.railOutcomes },
    };
  };
}
