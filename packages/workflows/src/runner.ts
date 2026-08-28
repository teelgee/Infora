// T-265 — `workflow_runner`, the one non-leaf worker.
//
// Non-negotiable 7 says workers are leaves and only the chat agent
// orchestrates. This is the single declared exception, and the exception is
// narrow on purpose: it executes a **pre-declared** DAG and cannot compose one.
// The distinction is the whole of why it is not non-negotiable 8's generic
// escape hatch — `workflow_runner` can only run a workflow somebody wrote down,
// reviewed and versioned, and a workflow that has not been declared cannot be
// reached through it at all.
//
// **Keeping it from becoming a general escape hatch is review discipline, not a
// test**, and the board says so. What a test CAN hold is the two structural
// halves of that discipline, and both are asserted: it takes a workflow id
// rather than a step list, so there is no shape in which a caller hands it an
// improvised plan; and it binds parameters into a plan without adding, removing
// or reordering a step.
import type { PlanStage, Workflow, WorkerDeclaration } from '@infora/contracts';

export const WORKFLOW_RUNNER: WorkerDeclaration = {
  name: 'workflow_runner',
  purpose: 'Execute a declared workflow, in the order that workflow declares.',
  tier: 'triage', // the runner itself spends nothing; its STEPS carry their own tiers
  inputSchema: {
    workflow_id: 'the id of a workflow in the registry',
    parameters: 'the workflow\'s declared parameters, bound to values',
  },
  outputSchema: { output: "the workflow's own declared output_schema" },
  tools: ['the leaf workers named by its DAG'],
  reach: 'inherited',
  scopeNote: 'inherits, cannot widen — every step runs on the caller\'s own slice',
  // the single exception to non-negotiable 7, and the only declaration that
  // may ever set this false
  leaf: false,
  // per its steps: this workflow writes nothing, and a writing workflow must
  // declare its label propagation (T-264 rule 4) before it can be run at all
  writes: false,
  cacheable: false,
  externalEgress: false,
  requiresAuthorityShelf: false,
};

/** A workflow bound to its arguments: exactly what the plan writer needs. */
export type BoundPlan = {
  workflowId: string;
  workflowVersion: number;
  stages: Array<{ stage: PlanStage; worker: string | null; inputs: Record<string, unknown> }>;
};

export class WorkflowNotRunnable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'WorkflowNotRunnable';
  }
}

/**
 * Bind a declared workflow's parameters and hand back the plan it becomes.
 *
 * Refuses on an unbound REQUIRED parameter rather than substituting a
 * plausible value: a declared workflow run on a parameter nobody supplied
 * produces an answer to a question nobody asked, and the fact that it looks
 * like a real answer is what makes it expensive. (T-266's outcome 2 is the
 * other half of this — clarify, then run — and this refusal is what it catches.)
 *
 * `{{steps.x.output}}` is deliberately NOT substituted here. Step outputs do
 * not exist until the plan runs, and the executor already carries them between
 * steps; resolving them at bind time would mean inventing them.
 */
export function bindWorkflow(
  workflow: Workflow,
  parameters: Record<string, unknown>,
): BoundPlan {
  const bound: Record<string, unknown> = {};
  for (const parameter of workflow.parameters) {
    const supplied = parameters[parameter.name];
    if (supplied !== undefined) {
      bound[parameter.name] = supplied;
      continue;
    }
    if (parameter.default !== undefined) {
      bound[parameter.name] = parameter.default;
      continue;
    }
    if (parameter.required) {
      throw new WorkflowNotRunnable(
        `${workflow.id}: required parameter '${parameter.name}' is unbound — ${parameter.description}`,
      );
    }
  }

  return {
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    // The step list is carried through in the workflow's OWN order, with
    // nothing added, removed or reordered. `depends_on` is what the executor
    // walks (T-262) and `openPlan` rebuilds those edges from this order; a
    // runner that re-sorted here would be composing rather than executing.
    stages: workflow.steps.map((step) => ({
      stage: step.stage,
      worker: step.worker ?? null,
      inputs: substitute(step.inputs, bound),
    })),
  };
}

function substitute(inputs: Record<string, unknown>, bound: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value !== 'string') {
      out[key] = value;
      continue;
    }
    const whole = /^\{\{\s*parameters\.([A-Za-z0-9_]+)\s*\}\}$/.exec(value);
    out[key] = whole ? bound[whole[1]!] : value;
  }
  return out;
}
