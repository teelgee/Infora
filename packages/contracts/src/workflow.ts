// Contracts — the declared workflow (T-264; docs/build/plan-history.md, the
// Wave 2 design reference; ADR-0028 §5's declared mode, ADR-0027 §3's amended
// ordering claim).
//
// A workflow definition is A PLAN TEMPLATE: the plan artefact's step shape with
// PARAMETERS where a plan has bound values. That is the whole idea, and it is
// what makes declared mode evaluable end to end — the steps and their order are
// written down before the run, so the same inputs produce the same sequence,
// which is precisely what model-chosen mode cannot promise.
//
// The shape lives in contracts for the same reason the Lens's does: three
// layers need it and none may depend on the others — `@infora/workflows` loads
// and validates the files, `@infora/orchestration` turns one into a plan, and
// the API names the workflow on a run.
//
// WHAT IS DELIBERATELY ABSENT is the whole security half of this file. A step
// has no `scope`, no `corpus`, no `visibility`, no `as_organisation`: scope
// derives from the run's `EntitledSlice` and is **not expressible here**, so a
// workflow — declared, edited or authored by a customer — has no field with
// which to widen reach. The validator rejects `scope` by name rather than as a
// generic unknown field, because an author who reached for it needs to be told
// why it does not exist, not that it is misspelt.

/** `draft` loads in non-production only — the same rule as a Lens. */
export type WorkflowStatus = 'active' | 'draft';

export type WorkflowParameterType = 'string' | 'number' | 'boolean' | 'id' | 'id_list';

export type WorkflowParameter = {
  name: string;
  type: WorkflowParameterType;
  required: boolean;
  default?: string | number | boolean | string[];
  /**
   * Shown to the USER when this parameter needs clarifying (T-266's outcome 2 —
   * a declared workflow with unbound required parameters). It is therefore
   * user-facing copy, not a code comment, and the validator holds it to that.
   */
  description: string;
};

/**
 * What a workflow does to the record. `none` is a read-only analysis; anything
 * that writes must say how the label travels (finding F2).
 */
export type WorkflowWrites = 'none' | 'sandbox_document';

/**
 * How a writing workflow behaves when the computed label of its sources is
 * broader than its destination's (T-249).
 *
 * Declared per workflow rather than decided per run, because "may this output
 * be written here" is a property of the recipe, not of the moment. Both values
 * refuse by default; they differ in whether a human may override:
 *
 *   • `refuse` — the write does not happen and the workflow reports it
 *     withheld. There is no override path at all.
 *   • `require_override` — the write happens only when the request carries an
 *     explicit, attributed, reasoned override, which is a `label_overrides`
 *     row (T-249). Never a config key, and never automatic.
 */
export type WorkflowLabelPropagation = 'refuse' | 'require_override';

export type WorkflowStep = {
  id: string; // unique within the workflow; `depends_on` names these
  /** the plan stage this step occupies — what the progress rail shows */
  stage: PlanStageName;
  /** the worker that executes it; must be in the registry at load (T-269) */
  worker: string;
  /**
   * Bound at plan time from `{{parameters.x}}` and `{{steps.y.output}}`. A
   * reference to anything else is a load failure: a template that resolves to
   * nothing at run time would produce a step running on an empty input and
   * reporting success.
   */
  inputs: Record<string, unknown>;
  dependsOn: string[];
};

// The stage vocabulary is `PlanStage` in shared.ts and is not restated here;
// this alias exists only so this file reads without a forward import cycle.
import type { PlanStage } from './shared';
type PlanStageName = PlanStage;

export type Workflow = {
  id: string; // kebab-case, never reused
  version: number; // bumped on any change, recorded on every plan it produces
  label: string;
  description: string;
  status: WorkflowStatus;
  parameters: WorkflowParameter[];
  /** the shape the workflow promises to return, as named fields */
  outputSchema: Record<string, string>;
  steps: WorkflowStep[];
  /**
   * The workers this workflow cannot run without. Distinct from the union of
   * its steps' workers on purpose: a workflow may be assembled for a requester
   * entitled to only some of them, and this is the set whose absence means the
   * workflow is **absent from the tool set**, not offered and then failing.
   */
  requiresWorkers: string[];
  writes: WorkflowWrites;
  /** required when `writes` is not `none`, forbidden when it is */
  labelPropagation?: WorkflowLabelPropagation;
};

/** What a picker may show. Never the step inputs — those are prompt material. */
export type WorkflowSummary = {
  id: string;
  label: string;
  description: string;
  version: number;
  writes: WorkflowWrites;
};
