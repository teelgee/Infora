// T-044 — the ground-check verifier (ADR-0027 §2's deterministic verifier,
// ADR-0028 §6): every claim either resolves to a source in the step's
// admitted source set or is withheld. Pure code — no model call, no
// probability: "every surviving claim is grounded" is provable. Withholding
// is recorded per claim in rail outcomes, the detail carrying the withheld
// text for the UI (contracts §2).
import type { Id, Step } from '@infora/contracts';

// T-468 — a claim's ref may carry the passage (chunk) it rested on; admission is
// still by document (`refKey`), the chunk rides through to the citation record
export type SourceRef = ({ versionId: Id } | { authorityRef: string }) & { chunkId?: Id };
export type CheckedClaim = { text: string; sourceRef?: SourceRef };
export type RailOutcome = Step['railOutcomes'][number];

export type GroundCheckResult = {
  surviving: Array<{ text: string; sourceRef?: SourceRef }>; // no ref = labelled open-world (chat only)
  withheld: CheckedClaim[];
  railOutcomes: RailOutcome[];
};

/**
 * `unsourced` is the labelled-channels ruling (2026-07-09, grill tracker):
 * 'withhold' (the default — document-targeted drafting stays grounded-only)
 * drops any claim that does not resolve to an admitted source; 'label' (chat)
 * lets it survive uncited, recorded per claim as an `open_world` rail
 * outcome so the surface can mark it. A claim whose marker names a source
 * the run never saw is never trusted: it is withheld or re-labelled, per mode.
 */
export function groundCheck(input: {
  claims: CheckedClaim[];
  sourceSet: SourceRef[];
  unsourced?: 'withhold' | 'label';
}): GroundCheckResult {
  const admitted = new Set(input.sourceSet.map(refKey));
  const label = input.unsourced === 'label';

  const surviving: GroundCheckResult['surviving'] = [];
  const withheld: CheckedClaim[] = [];
  const openWorld: RailOutcome[] = [];
  for (const claim of input.claims) {
    if (claim.sourceRef !== undefined && admitted.has(refKey(claim.sourceRef))) {
      surviving.push({ text: claim.text, sourceRef: claim.sourceRef });
    } else if (label) {
      surviving.push({ text: claim.text }); // the unverified marker (if any) is dropped, not trusted
      openWorld.push({ rail: 'grounding', outcome: 'open_world', detail: claim.text });
    } else {
      withheld.push(claim);
    }
  }

  const perClaim: RailOutcome[] = [
    ...withheld.map((claim) => ({
      rail: 'grounding',
      outcome: 'withheld' as const,
      detail: claim.text,
    })),
    ...openWorld,
  ];
  const railOutcomes: RailOutcome[] =
    perClaim.length === 0 ? [{ rail: 'grounding', outcome: 'passed' }] : perClaim;

  return { surviving, withheld, railOutcomes };
}

function refKey(ref: SourceRef): string {
  return 'versionId' in ref ? `version:${ref.versionId}` : `authority:${ref.authorityRef}`;
}
