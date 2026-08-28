// T-266 — classification into four outcomes, and the model-chosen plan.
//
// This is the decision that sets a run's ORCHESTRATION MODE, and the design is
// ADR-0027's first pattern — **code with an LLM escape hatch** — rather than a
// model call with a code fallback. The distinction is load-bearing:
//
//   • Deciding *whether a question matches a declared workflow* is judgement in
//     language, so it is the LLM's. That is the escape hatch.
//   • Deciding *whether the workflow's parameters are bound*, *which workers
//     the requester is entitled to*, and *what the plan therefore is* are all
//     definite questions with right answers, so they are code. A model asked
//     those would be spending money to be less reliable.
//
// **The largest risk in this ticket is classification quality**, and it is
// stated on the board rather than hidden: a weak classifier routes everything
// to model-chosen, and the product quietly becomes the generic agent the design
// forbids. That is why the FALL-THROUGH RATE is a reported metric (outcome 3
// below) rather than an internal detail — a rising share of model-chosen runs
// on repeated question shapes means a workflow is missing, and the shapes
// cluster into the ticket that declares it. It is how "avoid the generic
// powerful agent" becomes measurable rather than aspirational.
import type {
  PlanStage,
  Workflow,
  WorkflowSummary,
  WorkerDeclaration,
} from '@infora/contracts';

/**
 * The four outcomes. Named as a union rather than a boolean plus extras,
 * because each carries different evidence and a caller that could ignore the
 * difference would eventually label one as another.
 */
export type Classification =
  /** 1 — a declared workflow, fully bound. Run it. Repeatable and evaluable. */
  | { outcome: 'declared'; workflowId: string; parameters: Record<string, unknown> }
  /**
   * 2 — a declared workflow whose required parameters are not all bound.
   * Clarify, then run it. The clarification DIALOGUE is Wave 6 and deferred
   * beyond V1, so V1 runs the workflow on stated assumptions named at the top
   * of the answer — which is exactly what Wave 6 specifies for a user who
   * skips every question, and is why this outcome is expressible now.
   */
  | {
      outcome: 'clarify';
      workflowId: string;
      parameters: Record<string, unknown>;
      unbound: string[];
      assumptions: string[];
    }
  /** 3 — no matching workflow. Model-chosen, and its rate is the metric. */
  | { outcome: 'model_chosen'; stages: Array<{ stage: PlanStage; worker: string | null }> }
  /** 4 — out of scope. Say so, AND SAY WHY: a refusal nobody understands reads
   *  as a broken system rather than a careful one. */
  | { outcome: 'out_of_scope'; reason: string };

/**
 * What the model is asked to decide, and the only thing it is asked to decide.
 * It sees the question, the declared workflows' SUMMARIES and the assembled
 * worker set's names and purposes — never a worker the requester is not
 * entitled to, because the set handed here is already assembled (T-269) and
 * the model is never told an unentitled worker exists.
 */
export type ClassifierRequest = {
  question: string;
  workflows: WorkflowSummary[];
  workers: WorkerDeclaration[];
};

/** The model's answer, deliberately narrow. Anything wider it could get wrong. */
export type ClassifierVerdict =
  | { match: 'workflow'; workflowId: string }
  | { match: 'none' }
  | { match: 'out_of_scope'; reason: string };

export type Classifier = (request: ClassifierRequest) => Promise<ClassifierVerdict>;

/**
 * The deterministic default. Used where no model classifier is configured, and
 * it is not a stub: with one declared workflow whose parameter is the question
 * itself, asking a frontier model to choose among one option is spending money
 * to be less reliable (ADR-0027's whole argument). It matches a workflow when
 * exactly one is offered and defers to the model only when there is a genuine
 * choice to make.
 */
export const singleWorkflowClassifier: Classifier = async ({ workflows }) =>
  workflows.length === 1 ? { match: 'workflow', workflowId: workflows[0]!.id } : { match: 'none' };

export type ClassifyInput = {
  question: string;
  /** the workflows this deployment carries, already loaded and validated */
  workflows: Workflow[];
  /** the worker set ASSEMBLED for this requester (T-269) — never the full set */
  workers: WorkerDeclaration[];
  classifier?: Classifier;
};

export async function classify(input: ClassifyInput): Promise<Classification> {
  const classifier = input.classifier ?? singleWorkflowClassifier;
  const summaries: WorkflowSummary[] = input.workflows.map((workflow) => ({
    id: workflow.id,
    label: workflow.label,
    description: workflow.description,
    version: workflow.version,
    writes: workflow.writes,
  }));

  const verdict = await classifier({
    question: input.question,
    workflows: summaries,
    workers: input.workers,
  });

  if (verdict.match === 'out_of_scope') {
    return { outcome: 'out_of_scope', reason: verdict.reason };
  }

  if (verdict.match === 'workflow') {
    const workflow = input.workflows.find((candidate) => candidate.id === verdict.workflowId);
    // A classifier naming a workflow this deployment does not carry falls
    // through rather than failing the run: the answer still gets produced, and
    // the fall-through shows up in the metric that exists to catch exactly
    // this kind of classifier weakness.
    if (workflow !== undefined) return bindOrClarify(workflow, input.question);
  }

  return { outcome: 'model_chosen', stages: modelChosenStages(input.workers) };
}

/**
 * Outcome 1 or 2, decided by CODE. Whether a required parameter is bound is a
 * definite question, and a model asked it would sometimes say yes.
 *
 * V1 binds the question itself to the workflow's single required string
 * parameter where there is one — the shape every declared workflow has today.
 * A workflow with parameters V1 cannot bind produces outcome 2, whose
 * assumptions are **named at the top of the answer, not in a footer**.
 */
function bindOrClarify(workflow: Workflow, question: string): Classification {
  const parameters: Record<string, unknown> = {};
  const unbound: string[] = [];

  for (const parameter of workflow.parameters) {
    if (parameter.type === 'string' && parameters['__question'] === undefined) {
      // the first string parameter takes the question. Recorded as an
      // ASSUMPTION when there is more than one, because binding by position is
      // a guess and a guess the user cannot see is the thing to avoid.
      parameters[parameter.name] = question;
      parameters['__question'] = true;
      continue;
    }
    if (parameter.default !== undefined) {
      parameters[parameter.name] = parameter.default;
      continue;
    }
    if (parameter.required) unbound.push(parameter.name);
  }
  delete parameters['__question'];

  if (unbound.length === 0) {
    return { outcome: 'declared', workflowId: workflow.id, parameters };
  }
  return {
    outcome: 'clarify',
    workflowId: workflow.id,
    parameters,
    unbound,
    // Stated in the user's terms, from the parameter's own description — which
    // is why T-264 requires that description to be user-facing copy.
    assumptions: unbound.map((name) => {
      const parameter = workflow.parameters.find((candidate) => candidate.name === name)!;
      return `No ${name} was given, so none was assumed: ${parameter.description}`;
    }),
  };
}

/**
 * The dispatch loop's plan, over the ENTITLED worker set.
 *
 * A worker the requester is not entitled to is not here, because it was not in
 * the set handed in — assembled, not filtered (T-269). The stages are the
 * orchestrator's own spine around whatever workers it has: retrieval workers
 * first, then the thinking leaf, then verify, then present. The ground-check
 * stage is written into the plan as a RECORD; the check itself runs whether or
 * not it appears (T-262), which is why model-chosen mode costs repeatability of
 * the sequence and nothing else.
 */
export function modelChosenStages(
  workers: readonly WorkerDeclaration[],
): Array<{ stage: PlanStage; worker: string | null }> {
  const retrieval = workers.filter((worker) => worker.name === 'corpus_retrieval');
  return [
    ...retrieval.map((worker) => ({ stage: 'search_corpus' as PlanStage, worker: worker.name })),
    { stage: 'analyse', worker: null },
    { stage: 'verify', worker: null },
    { stage: 'present', worker: null },
  ];
}
