// T-044 — the ground-check verifier (ADR-0027 §2's deterministic verifier,
// ADR-0028 §6): every claim either resolves to a source in the step's
// admitted source set or is withheld. Pure code — no model call, no
// probability: "every surviving claim is grounded" is provable. Withholding
// is recorded per claim in rail outcomes, the detail carrying the withheld
// text for the UI (contracts §2).
import type { Id, Step } from '@infora/contracts';

export type SourceRef = { versionId: Id } | { authorityRef: string };
export type CheckedClaim = { text: string; sourceRef?: SourceRef };
export type RailOutcome = Step['railOutcomes'][number];

export type GroundCheckResult = {
  surviving: Array<{ text: string; sourceRef: SourceRef }>;
  withheld: CheckedClaim[];
  railOutcomes: RailOutcome[];
};

export function groundCheck(input: {
  claims: CheckedClaim[];
  sourceSet: SourceRef[];
}): GroundCheckResult {
  const admitted = new Set(input.sourceSet.map(refKey));

  const surviving: GroundCheckResult['surviving'] = [];
  const withheld: CheckedClaim[] = [];
  for (const claim of input.claims) {
    if (claim.sourceRef !== undefined && admitted.has(refKey(claim.sourceRef))) {
      surviving.push({ text: claim.text, sourceRef: claim.sourceRef });
    } else {
      withheld.push(claim);
    }
  }

  const railOutcomes: RailOutcome[] =
    withheld.length === 0
      ? [{ rail: 'grounding', outcome: 'passed' }]
      : withheld.map((claim) => ({
          rail: 'grounding',
          outcome: 'withheld' as const,
          detail: claim.text,
        }));

  return { surviving, withheld, railOutcomes };
}

function refKey(ref: SourceRef): string {
  return 'versionId' in ref ? `version:${ref.versionId}` : `authority:${ref.authorityRef}`;
}
