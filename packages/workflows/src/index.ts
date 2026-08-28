// @infora/workflows — standard + custom workflows composing capabilities.
//
// A workflow definition is a PLAN TEMPLATE (T-264): the plan artefact's step
// shape with parameters where a plan has bound values. Declared orchestration
// runs one; model-chosen orchestration does not, and that difference is the
// whole of what the two modes' guarantees differ by (ADR-0028 §5 as amended).
export { loadWorkflows, DEFINITIONS_DIR, WorkflowValidationError } from './load';
export type { LoadOptions, WorkflowRegistry } from './load';
export { validateWorkflow } from './validate';
export type { KnownWorkers, ValidationOptions, ValidationResult } from './validate';
// T-265 — `workflow_runner`, the one non-leaf worker, and the binding that
// turns a declared workflow into a plan. It executes a PRE-DECLARED DAG and
// cannot compose one, which is why it is not the generic escape hatch
// non-negotiable 8 forbids.
export { bindWorkflow, WORKFLOW_RUNNER, WorkflowNotRunnable } from './runner';
export type { BoundPlan } from './runner';
