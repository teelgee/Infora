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
import type {
  PlanStage,
  Workflow,
  WorkerDeclaration,
  WorkflowLabelPropagation,
  WorkflowWrites,
} from '@infora/contracts';

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
  /**
   * T-396 — `writes` and `labelPropagation` travel with the bound plan because
   * the EXECUTOR needs them: a capability that writes may run only inside a
   * workflow that declared both (ADR-0053 §7), and the run is where that is
   * checked. Carrying them here is what makes validator rule 4 bite rather than
   * merely be recorded.
   */
  writes: WorkflowWrites;
  labelPropagation?: WorkflowLabelPropagation;
  stages: Array<{
    /**
     * T-396 — the DECLARING step's id, carried in memory so `{{steps.x.output}}`
     * resolves at run time. A fanned-out step's key is `id#0`, `id#1`, … so two
     * expansions of one declaration are two distinct outputs.
     */
    key: string;
    stage: PlanStage;
    worker: string | null;
    inputs: Record<string, unknown>;
  }>;
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
    writes: workflow.writes,
    ...(workflow.labelPropagation !== undefined && { labelPropagation: workflow.labelPropagation }),
    // The step list is carried through in the workflow's OWN order, with
    // nothing added, removed or reordered. `depends_on` is what the executor
    // walks (T-262) and `openPlan` rebuilds those edges from this order; a
    // runner that re-sorted here would be composing rather than executing.
    //
    // T-396 — a fan-out step is the ONE place a step count changes, and the
    // count is arithmetic over a bound list. Nothing here consults a model, and
    // there is no shape in which it could: `expand` reads `bound`, which the
    // caller computed, and the validator has already refused a `fan_out`
    // pointing anywhere but at a parameter.
    stages: workflow.steps.flatMap((step) => expand(workflow, step, bound)),
  };
}

function expand(
  workflow: Workflow,
  step: Workflow['steps'][number],
  bound: Record<string, unknown>,
): BoundPlan['stages'] {
  const base = { stage: step.stage, worker: step.worker ?? null };
  if (step.fanOut === undefined) {
    return [{ key: step.id, ...base, inputs: substitute(step.inputs, bound) }];
  }

  const name = /^\{\{\s*parameters\.([A-Za-z0-9_]+)\s*\}\}$/.exec(step.fanOut)?.[1];
  const width = name === undefined ? undefined : bound[name];
  if (!Array.isArray(width)) {
    // A fan-out whose list is unbound would silently produce ZERO steps, and a
    // run that quietly did none of the work it was asked for reports success.
    // Refusing names the parameter, exactly as an unbound required one does.
    throw new WorkflowNotRunnable(
      `${workflow.id}: step '${step.id}' fans out over '${name ?? step.fanOut}', which is not bound to a list — its width is computed before the run and cannot be guessed here`,
    );
  }

  // Zero is legal and is NOT silent: it means the code that bound the list
  // found nothing to fan out over, and the plan then records no steps for this
  // declaration — which is what the coverage statement reads.
  return width.map((item, at) => ({
    key: `${step.id}#${at}`,
    ...base,
    inputs: substitute(step.inputs, bound, item),
  }));
}

function substitute(
  inputs: Record<string, unknown>,
  bound: Record<string, unknown>,
  /** T-396 — this expansion's element, where the step fans out */
  item?: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value !== 'string') {
      out[key] = value;
      continue;
    }
    if (item !== undefined && /^\{\{\s*item\s*\}\}$/.test(value)) {
      out[key] = item;
      continue;
    }
    const whole = /^\{\{\s*parameters\.([A-Za-z0-9_]+)\s*\}\}$/.exec(value);
    out[key] = whole ? bound[whole[1]!] : value;
  }
  return out;
}
