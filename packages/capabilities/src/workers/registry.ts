// T-269 — the worker registry and entitlement assembly.
//
// THE TOOL SET IS ASSEMBLED, NOT FILTERED. That distinction is the ticket. A
// filtered set is one agent with workers switched off; an assembled set means
// **every user gets a materially different agent** — different Lens overlay,
// different worker set — built per request. The observable difference is what
// the model is told: an unentitled worker is ABSENT, and the model is never
// told it exists, exactly as the API's denial and nonexistence read
// identically. There is no `enabled` flag anywhere in this file, and
// `assembleWorkers` returns a set rather than annotating one.
//
// Three inputs, per the Wave 3 design reference:
//
//   1. the requester's `EntitledSlice`. No slice, NO WORKERS AT ALL — not a
//      reduced set, not the read-only ones. Someone who cannot reach the
//      project has no agent on it.
//   2. the deployment tier. A sovereign deployment assembles no worker that
//      sends data to a third party, and this **falls out of the router policy
//      that already exists** (ADR-0037 §2: the sovereign tier permits only
//      `self-hosted` eligibility) rather than out of a per-worker switch
//      somebody has to remember to set. A new tier gets the rule for free.
//   3. the organisation's own authority shelf. No shelf, no
//      `authority_lookup` — an empty shelf answering nothing is worse than the
//      capability being absent, because the model will try it and report
//      silence as a finding.
//
// The registry holds only workers that are BUILT. Declaring the other six here
// would put capabilities into the model's tool set that no code implements,
// which is a worse failure than their absence: the model would call them.
import type { WorkerDeclaration, WorkerSummary } from '@infora/contracts';
import type { EntitledSlice } from '@infora/governance';
import { TIER_POLICIES } from '@infora/model';
import type { DeploymentTier } from '@infora/model';
import { CORPUS_RETRIEVAL } from './corpus-retrieval';
import { EXTRACTOR } from './extractor';

/** The facts assembly reads. Nothing here is supplied by the request. */
export type WorkerAssemblyFacts = {
  /** null = the requester holds no entitled slice on this environment */
  slice: EntitledSlice | null;
  tier: DeploymentTier;
  /** whether the requesting organisation holds an authority shelf (ADR-0023) */
  authorityShelf: boolean;
};

export type WorkerRegistry = {
  /** every worker this deployment has BUILT — before entitlement */
  declared(): WorkerDeclaration[];
  /** the set assembled for one requester, per request */
  assemble(facts: WorkerAssemblyFacts): WorkerDeclaration[];
  summaries(facts: WorkerAssemblyFacts): WorkerSummary[];
  /** T-264's `KnownWorkers`: is this a worker this deployment could run? */
  has(name: string): boolean;
  list(): string[];
  get(name: string): WorkerDeclaration | undefined;
};

/**
 * Does this deployment tier admit sending data to a third party at all?
 *
 * Read off the tier's existing provider-eligibility policy rather than from a
 * new field: `self-hosted` alone means no third-party inference API, which is
 * the same fact `web_research`'s egress runs into. One source, so a tier added
 * later cannot acquire a web worker by omission.
 */
export function tierAdmitsThirdParty(tier: DeploymentTier): boolean {
  return TIER_POLICIES[tier].eligibility.some((eligibility) => eligibility !== 'self-hosted');
}

/**
 * The assembly rule, pure and separate from the registry so it can be tested
 * against declarations for workers that are not built yet — the sovereign
 * exclusion is a rule about `web_research` and `web_research` does not exist,
 * so testing it through the live registry would be testing nothing.
 */
export function assembleWorkers(
  declared: readonly WorkerDeclaration[],
  facts: WorkerAssemblyFacts,
): WorkerDeclaration[] {
  // input 1 — no slice, no workers. Before every other consideration, because
  // "which workers may someone with no access to this project use" has one
  // answer and it is not a shorter list.
  if (facts.slice === null) return [];

  return declared.filter((worker) => {
    // input 2 — the deployment tier, via the router's own policy
    if (worker.externalEgress && !tierAdmitsThirdParty(facts.tier)) return false;
    // input 3 — the organisation's authority shelf
    if (worker.requiresAuthorityShelf && !facts.authorityShelf) return false;
    return true;
  });
}

/** Every worker this deployment has built. Two, since T-274. */
export const BUILT_WORKERS: readonly WorkerDeclaration[] = [CORPUS_RETRIEVAL, EXTRACTOR];

export function createWorkerRegistry(
  declared: readonly WorkerDeclaration[] = BUILT_WORKERS,
): WorkerRegistry {
  const byName = new Map(declared.map((worker) => [worker.name, worker]));
  return {
    declared: () => [...declared],
    assemble: (facts) => assembleWorkers(declared, facts),
    summaries: (facts) =>
      assembleWorkers(declared, facts).map((worker) => ({
        name: worker.name,
        purpose: worker.purpose,
        writes: worker.writes,
      })),
    has: (name) => byName.has(name),
    list: () => [...byName.keys()],
    get: (name) => byName.get(name),
  };
}
