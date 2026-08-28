// T-264 — the declared-workflow validator.
//
// VALIDATED AT LOAD, NEVER AT RUN. That is the design's load-bearing sentence,
// not a performance note: a workflow whose step names a worker that does not
// exist must fail when the deployment starts, in front of whoever changed it,
// rather than half way through a customer's run with two steps already spent
// and an answer that will never arrive. A validation failure is a BUILD
// FAILURE — never a quiet drop, never a silent substitution.
//
// Messages are held to the Lens validator's standard and for the same reason:
// workflow definitions are domain content, authored beside the Lens files by
// the same specialists, and error-message quality is exactly where an
// "engineers only" system quietly reasserts itself. Every message names the
// FILE, the FIELD and the RULE, in the field's YAML spelling (`depends_on`,
// not `dependsOn`), and never a schema-library stack trace.
import type {
  PlanStage,
  Workflow,
  WorkflowLabelPropagation,
  WorkflowParameter,
  WorkflowParameterType,
  WorkflowStatus,
  WorkflowWrites,
} from '@infora/contracts';

/** The registry, as much of it as this validator needs (the real one is T-269). */
export type KnownWorkers = { has(worker: string): boolean; list(): readonly string[] };

const STATUS: readonly WorkflowStatus[] = ['active', 'draft'];
const WRITES: readonly WorkflowWrites[] = ['none', 'sandbox_document'];
const PROPAGATION: readonly WorkflowLabelPropagation[] = ['refuse', 'require_override'];
const PARAM_TYPES: readonly WorkflowParameterType[] = ['string', 'number', 'boolean', 'id', 'id_list'];
const STAGES: readonly PlanStage[] = [
  'understand',
  'load_context',
  'clarify',
  'plan',
  'search_corpus',
  'check_authority',
  'research_web',
  'analyse',
  'verify',
  'present',
];

// The YAML field names and the camelCase key each becomes. This list is also
// the unknown-field check: a field not here is a typo or an invention, and a
// silently ignored `requires_worker:` is a dependency that is not declared.
const FIELDS = {
  id: 'id',
  version: 'version',
  label: 'label',
  description: 'description',
  status: 'status',
  parameters: 'parameters',
  output_schema: 'outputSchema',
  steps: 'steps',
  requires_workers: 'requiresWorkers',
  writes: 'writes',
  label_propagation: 'labelPropagation',
} as const;

const STEP_FIELDS = {
  id: 'id',
  stage: 'stage',
  worker: 'worker',
  inputs: 'inputs',
  depends_on: 'dependsOn',
} as const;

const PARAMETER_FIELDS = {
  name: 'name',
  type: 'type',
  required: 'required',
  default: 'default',
  description: 'description',
} as const;

/**
 * RULE 3, as a list of names rather than as a structural absence.
 *
 * The type has no `scope` field, so a scope cannot be *expressed*; what this
 * adds is that an author who reaches for one is told WHY it does not exist
 * rather than that it is misspelt. The distinction matters because the generic
 * unknown-field message ("unknown field `scope`") reads as an invitation to
 * find the right spelling, and there is no right spelling.
 */
const SCOPE_FIELDS = new Set([
  'scope',
  'corpus',
  'visibility',
  'organisation',
  'organisation_id',
  'project',
  'project_id',
  'as_organisation',
  'entitled_slice',
  'participant',
  'participant_id',
]);

const TEMPLATE = /\{\{\s*([^}]+?)\s*\}\}/g;

export type ValidationOptions = {
  /** the file the definition came from — every message names it */
  file: string;
  workers: KnownWorkers;
  /** false admits `status: draft`; the loader's default is true (fail-safe) */
  production: boolean;
};

export type ValidationResult =
  | { ok: true; workflow: Workflow }
  | { ok: false; errors: string[] };

export function validateWorkflow(raw: unknown, options: ValidationOptions): ValidationResult {
  const errors: string[] = [];
  const at = (field: string, problem: string) => errors.push(`${options.file}: ${field} — ${problem}`);

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [`${options.file}: the file is not a YAML mapping`] };
  }
  const doc = raw as Record<string, unknown>;

  for (const key of Object.keys(doc)) {
    if (key in FIELDS) continue;
    at(
      key,
      SCOPE_FIELDS.has(key)
        ? 'a workflow may not declare a scope. Scope derives from the run\'s entitled slice and is deliberately not expressible here, so a workflow cannot widen what its requester can reach — there is no correct spelling of this field'
        : 'unknown field. A field that is silently ignored is a declaration that does not apply',
    );
  }

  const id = requireString(doc, 'id', at);
  const label = requireString(doc, 'label', at);
  const description = requireString(doc, 'description', at);
  const version = requireInteger(doc, 'version', at);
  const status = requireEnum(doc, 'status', STATUS, at) as WorkflowStatus | undefined;
  const writes = requireEnum(doc, 'writes', WRITES, at) as WorkflowWrites | undefined;

  // the filename is the id, so a definition is findable from a plan record
  const expected = options.file.replace(/^.*\//, '').replace(/\.ya?ml$/, '');
  if (id !== undefined && expected !== '' && id !== expected) {
    at('id', `is '${id}' but the file is named '${expected}'. A plan records the id; the file has to be findable from it`);
  }
  if (id !== undefined && !/^[a-z][a-z0-9-]*$/.test(id)) {
    at('id', `'${id}' is not kebab-case`);
  }

  // ── RULE 5 — drafts load in non-production only ─────────────────────────
  // Absent, not present-and-disabled: the same rule as a Lens, and the same
  // rule as an unentitled worker. A capability the viewer cannot use should
  // never be advertised to them.
  if (status === 'draft' && options.production) {
    at('status', 'is `draft`, which loads in non-production only');
  }

  // ── RULE 4 — a workflow that writes declares how the label travels ──────
  const propagation = doc['label_propagation'];
  if (writes !== undefined && writes !== 'none') {
    if (propagation === undefined) {
      at(
        'label_propagation',
        `is required when \`writes\` is \`${writes}\`. A workflow that writes has to say what it does when its sources' computed label is broader than its destination (finding F2) — 'refuse' or 'require_override'`,
      );
    } else if (!PROPAGATION.includes(propagation as WorkflowLabelPropagation)) {
      at('label_propagation', `'${String(propagation)}' is not one of: ${PROPAGATION.join(', ')}`);
    }
  } else if (writes === 'none' && propagation !== undefined) {
    at(
      'label_propagation',
      'is declared but `writes` is `none`. Behaviour declared for a write that never happens goes stale unnoticed',
    );
  }

  const parameters = readParameters(doc, at);
  const outputSchema = readOutputSchema(doc, at);
  const steps = readSteps(doc, at);
  const requiresWorkers = readStringList(doc, 'requires_workers', at);

  // ── RULE 1 — every worker named is in the registry ──────────────────────
  const known = (worker: string) => options.workers.has(worker);
  for (const step of steps) {
    if (step.worker !== '' && !known(step.worker)) {
      at(
        `steps[${step.id}].worker`,
        `'${step.worker}' is not in the worker registry. Available: ${options.workers.list().join(', ') || '(none)'}`,
      );
    }
  }
  for (const worker of requiresWorkers) {
    if (!known(worker)) {
      at(
        'requires_workers',
        `'${worker}' is not in the worker registry. Available: ${options.workers.list().join(', ') || '(none)'}`,
      );
    }
  }

  // ── RULE 2 — the DAG is acyclic and every edge resolves ─────────────────
  errors.push(...checkGraph(steps, options.file));

  // Templates resolve. A `{{steps.x.output}}` naming a step that does not exist
  // resolves to nothing at run time, and a step running on an empty input
  // reports success — which is the worst available outcome.
  errors.push(...checkTemplates(steps, parameters, options.file));

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    workflow: {
      id: id!,
      version: version!,
      label: label!,
      description: description!,
      status: status!,
      parameters,
      outputSchema,
      steps: steps.map((step) => ({
        id: step.id,
        stage: step.stage as PlanStage,
        ...(step.worker !== '' && { worker: step.worker }),
        inputs: step.inputs,
        dependsOn: step.dependsOn,
      })),
      requiresWorkers,
      writes: writes!,
      ...(writes !== 'none' && { labelPropagation: propagation as WorkflowLabelPropagation }),
    },
  };
}

type RawStep = { id: string; stage: string; worker: string; inputs: Record<string, unknown>; dependsOn: string[] };

function readSteps(doc: Record<string, unknown>, at: (f: string, p: string) => void): RawStep[] {
  const raw = doc['steps'];
  if (!Array.isArray(raw) || raw.length === 0) {
    at('steps', 'is required and must list at least one step');
    return [];
  }
  const steps: RawStep[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    const where = `steps[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      at(where, 'is not a mapping');
      continue;
    }
    const step = entry as Record<string, unknown>;
    for (const key of Object.keys(step)) {
      if (key in STEP_FIELDS) continue;
      at(
        `${where}.${key}`,
        SCOPE_FIELDS.has(key)
          ? 'a step may not declare a scope. Scope is inherited from the run and is not expressible on a step, so no workflow and no plan edit can widen reach'
          : 'unknown field',
      );
    }
    const id = typeof step['id'] === 'string' ? step['id'] : '';
    if (id === '') at(`${where}.id`, 'is required');
    if (id !== '' && seen.has(id)) at(`${where}.id`, `'${id}' is declared twice`);
    seen.add(id);

    const stage = typeof step['stage'] === 'string' ? step['stage'] : '';
    if (!STAGES.includes(stage as PlanStage)) {
      at(`${where}.stage`, `'${stage}' is not a plan stage. One of: ${STAGES.join(', ')}`);
    }
    // T-265 refined this, and the refinement came from declaring the FIRST
    // workflow rather than from review. `worker` was required, and the coded
    // chain has two steps no worker runs: `analyse` is the orchestrator's own
    // thinking leaf and `present` is citation resolution (ADR-0027 §6), and
    // neither is a worker in the Wave 3 sense — a worker is a tool the agent
    // may CALL, and the agent does not call its own drafting.
    //
    // So `worker` is optional, and a step without one is executed by the
    // orchestrator's leaf for that stage. Rule 1 is unchanged in force: every
    // worker NAMED must be in the registry.
    const worker = typeof step['worker'] === 'string' ? step['worker'] : '';
    if (step['worker'] !== undefined && worker.trim() === '') {
      at(`${where}.worker`, 'is present but empty. Omit it for a stage the orchestrator runs itself');
    }
    // The ground-check is CODE, outside the plan, running on every answer in
    // both modes (T-262). A `verify` step is the RECORD of that check, never an
    // instruction — so it may not name a worker, because naming one would
    // suggest an executor that could be asked not to run, which is exactly the
    // thing ADR-0027's and ADR-0028's guarantees rest on being impossible.
    if (stage === 'verify' && worker !== '') {
      at(
        `${where}.worker`,
        `'${worker}' — a \`verify\` step may not name a worker. The ground-check is code that runs outside the plan on every answer, and this step is its record, not an instruction`,
      );
    }

    const inputs = step['inputs'];
    if (inputs !== undefined && (inputs === null || typeof inputs !== 'object' || Array.isArray(inputs))) {
      at(`${where}.inputs`, 'is not a mapping');
    }
    const dependsOn = step['depends_on'];
    if (dependsOn !== undefined && !Array.isArray(dependsOn)) {
      at(`${where}.depends_on`, 'is not a list of step ids');
    }

    steps.push({
      id: id === '' ? `#${index}` : id,
      stage,
      worker,
      inputs: (inputs as Record<string, unknown>) ?? {},
      dependsOn: Array.isArray(dependsOn) ? dependsOn.filter((d): d is string => typeof d === 'string') : [],
    });
  }
  return steps;
}

/** RULE 2. Refuses rather than repairs, and names what is caught in the cycle. */
function checkGraph(steps: RawStep[], file: string): string[] {
  const errors: string[] = [];
  const ids = new Set(steps.map((step) => step.id));
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (dependency === step.id) {
        errors.push(`${file}: steps[${step.id}].depends_on — depends on itself`);
      } else if (!ids.has(dependency)) {
        errors.push(
          `${file}: steps[${step.id}].depends_on — '${dependency}' is not a step of this workflow`,
        );
      }
    }
  }
  if (errors.length > 0) return errors; // a dangling edge makes the cycle check meaningless

  const remaining = new Set(ids);
  let progressed = true;
  while (remaining.size > 0 && progressed) {
    progressed = false;
    for (const step of steps) {
      if (!remaining.has(step.id)) continue;
      if (step.dependsOn.every((d) => !remaining.has(d))) {
        remaining.delete(step.id);
        progressed = true;
      }
    }
  }
  if (remaining.size > 0) {
    errors.push(
      `${file}: steps — ${[...remaining].sort().join(', ')} form a dependency cycle, so the workflow has no execution order`,
    );
  }
  return errors;
}

/**
 * `{{parameters.x}}` and `{{steps.y.output}}` are the only two references a
 * step input may make, and both must resolve. A step may only reference a step
 * it depends on — otherwise the reference is to an output that may not have
 * been produced yet, which is a race dressed as a template.
 */
function checkTemplates(steps: RawStep[], parameters: WorkflowParameter[], file: string): string[] {
  const errors: string[] = [];
  const parameterNames = new Set(parameters.map((parameter) => parameter.name));
  const stepIds = new Set(steps.map((step) => step.id));

  for (const step of steps) {
    const text = JSON.stringify(step.inputs);
    for (const match of text.matchAll(TEMPLATE)) {
      const reference = match[1]!;
      const where = `${file}: steps[${step.id}].inputs`;
      const parameter = /^parameters\.([A-Za-z0-9_]+)$/.exec(reference);
      const output = /^steps\.([A-Za-z0-9_-]+)\.output$/.exec(reference);

      if (parameter) {
        if (!parameterNames.has(parameter[1]!)) {
          errors.push(`${where} — {{${reference}}} names no declared parameter`);
        }
        continue;
      }
      if (output) {
        const target = output[1]!;
        if (!stepIds.has(target)) {
          errors.push(`${where} — {{${reference}}} names no step of this workflow`);
        } else if (!step.dependsOn.includes(target)) {
          errors.push(
            `${where} — {{${reference}}} reads a step this one does not depend on. Add '${target}' to depends_on, or the output may not exist when this step runs`,
          );
        }
        continue;
      }
      errors.push(
        `${where} — {{${reference}}} is neither {{parameters.NAME}} nor {{steps.ID.output}}`,
      );
    }
  }
  return errors;
}

function readParameters(doc: Record<string, unknown>, at: (f: string, p: string) => void): WorkflowParameter[] {
  const raw = doc['parameters'];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    at('parameters', 'is not a list');
    return [];
  }
  const parameters: WorkflowParameter[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    const where = `parameters[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      at(where, 'is not a mapping');
      continue;
    }
    const parameter = entry as Record<string, unknown>;
    for (const key of Object.keys(parameter)) {
      if (!(key in PARAMETER_FIELDS)) at(`${where}.${key}`, 'unknown field');
    }
    const name = typeof parameter['name'] === 'string' ? parameter['name'] : '';
    if (name === '') at(`${where}.name`, 'is required');
    if (seen.has(name)) at(`${where}.name`, `'${name}' is declared twice`);
    seen.add(name);
    const type = parameter['type'];
    if (!PARAM_TYPES.includes(type as WorkflowParameterType)) {
      at(`${where}.type`, `'${String(type)}' is not one of: ${PARAM_TYPES.join(', ')}`);
    }
    if (typeof parameter['required'] !== 'boolean') {
      at(`${where}.required`, 'is required and must be true or false');
    }
    // The description is what a user is shown when the parameter needs
    // clarifying (T-266's outcome 2), so it is copy rather than a comment.
    const description = typeof parameter['description'] === 'string' ? parameter['description'] : '';
    if (description.trim() === '') {
      at(
        `${where}.description`,
        'is required. It is shown to the USER when this parameter needs clarifying, so a workflow without one cannot ask for it in words anybody can answer',
      );
    }
    parameters.push({
      name,
      type: type as WorkflowParameterType,
      required: parameter['required'] === true,
      ...(parameter['default'] !== undefined && { default: parameter['default'] as WorkflowParameter['default'] }),
      description,
    });
  }
  return parameters;
}

function readOutputSchema(doc: Record<string, unknown>, at: (f: string, p: string) => void): Record<string, string> {
  const raw = doc['output_schema'];
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    at('output_schema', 'is required and must be a mapping of field name to a description of its shape');
    return {};
  }
  const schema: Record<string, string> = {};
  for (const [field, shape] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof shape !== 'string') {
      at(`output_schema.${field}`, 'must be a string describing the field\'s shape');
      continue;
    }
    schema[field] = shape;
  }
  return schema;
}

function readStringList(doc: Record<string, unknown>, field: string, at: (f: string, p: string) => void): string[] {
  const raw = doc[field];
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string')) {
    at(field, 'is not a list of strings');
    return [];
  }
  return raw as string[];
}

function requireString(doc: Record<string, unknown>, field: string, at: (f: string, p: string) => void): string | undefined {
  const value = doc[field];
  if (typeof value !== 'string' || value.trim() === '') {
    at(field, 'is required');
    return undefined;
  }
  return value;
}

function requireInteger(doc: Record<string, unknown>, field: string, at: (f: string, p: string) => void): number | undefined {
  const value = doc[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    at(field, 'is required and must be a positive integer, bumped on any change');
    return undefined;
  }
  return value;
}

function requireEnum(
  doc: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
  at: (f: string, p: string) => void,
): string | undefined {
  const value = doc[field];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    at(field, `is required and must be one of: ${allowed.join(', ')}`);
    return undefined;
  }
  return value;
}
