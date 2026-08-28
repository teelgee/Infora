// Contracts — the typed worker (T-269; docs/build/plan-history.md, the Wave 3
// design reference; ADR-0028 §6's typed-tool registry).
//
// A worker declares a name, a purpose, a model tier, its input and output
// shapes, its permitted tools, its scope expression, whether it writes, and
// whether it is cacheable. Three non-negotiables are properties of this type
// rather than of any worker's code:
//
//   6. **Workers return structured data, never prose.** The chat agent sees a
//      worker's output OBJECT, never its reasoning trace — which is what keeps
//      the orchestrator's context unpolluted and the audit record checkable
//      rather than narrative.
//   7. **Workers are leaves.** Only the chat agent orchestrates. The single
//      exception is `workflow_runner`, which executes a pre-declared DAG, and
//      `leaf: false` is the one place that exception is written down.
//   8. **There is no generic worker.** No `research_agent`, no
//      `code_execution`, no `do_the_thing`. A capability that seems to want an
//      eighth worker is almost always a workflow that has not been declared
//      yet — which is the good outcome, because a declared workflow is
//      evaluable end to end and an improvised worker is not.
//
// WHAT IS ABSENT, and is the whole entitlement design: there is no `enabled`,
// no `disabled`, no `availableTo`. **The tool set is ASSEMBLED, not filtered.**
// An unentitled worker is absent from the set and the model is never told it
// exists — the same principle as the API's "denial and nonexistence read
// identically". A boolean here would be the filtered version wearing the
// assembled version's name, and something would eventually render it greyed
// out with a tooltip naming a capability the viewer cannot have.

/** The model tier a worker's own calls run at (the Wave 3 table). */
export type WorkerModelTier = 'triage' | 'mid' | 'frontier';

/**
 * How far a worker can reach. Deliberately only two values, and neither is a
 * control: `inherited` means the worker runs on the caller's already-resolved
 * `EntitledSlice` and cannot widen it (it may be handed a NARROWER one —
 * T-248); `none` means the worker touches no store at all, which is the whole
 * safety case for `web_research` (the code holding a prompt injection has
 * nothing to reach with).
 */
export type WorkerReach = 'inherited' | 'none';

export type WorkerDeclaration = {
  name: string;
  purpose: string;
  tier: WorkerModelTier;
  /** field → a description of its shape. Structured in, structured out. */
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  /** the tools this worker may use, named for the register and the review */
  tools: string[];
  reach: WorkerReach;
  /** the Wave 3 table's scope column, in words, for the register */
  scopeNote: string;
  /** false for `workflow_runner` alone — non-negotiable 7's single exception */
  leaf: boolean;
  writes: boolean;
  cacheable: boolean;
  /**
   * Whether this worker sends data to a THIRD PARTY outside the deployment's
   * own inference route. It is the fact the sovereign-tier rule reads, and it
   * is a declaration rather than a switch: a sovereign deployment permits only
   * `self-hosted` provider eligibility (ADR-0037 §2), so a worker declaring
   * third-party egress is not assemblable there — the exclusion falls out of
   * the router policy that already exists rather than out of a per-worker
   * toggle somebody has to remember to set.
   */
  externalEgress: boolean;
  /**
   * Whether this worker needs the requesting organisation's own authority
   * shelf (ADR-0023's organisation tier). The third assembly input: an
   * organisation with no shelf assembles no `authority_lookup`.
   */
  requiresAuthorityShelf: boolean;
};

/** What may be shown about a worker. Never its prompt or its tool arguments. */
export type WorkerSummary = {
  name: string;
  purpose: string;
  writes: boolean;
};
