// T-264 — one failing fixture per rule. A rule with no failing fixture is a
// rule nobody has checked: it is easy to write a validator that accepts
// everything and passes a test suite made only of good definitions.
//
// The good definition is built once and each case breaks exactly one thing, so
// a message is attributable to the rule that produced it rather than to the
// first of five problems.
import { describe, expect, it } from 'vitest';
import { validateWorkflow } from './validate';
import type { KnownWorkers } from './validate';

const workers: KnownWorkers = {
  has: (worker) => ['corpus_retrieval', 'document_builder', 'extractor'].includes(worker),
  list: () => ['corpus_retrieval', 'document_builder', 'extractor'],
};

const good = () => ({
  id: 'project-question',
  version: 1,
  label: 'Project question',
  description: 'Answer a question from the project library.',
  status: 'active',
  parameters: [
    { name: 'question', type: 'string', required: true, description: 'The question to answer.' },
  ],
  output_schema: { answer: 'the grounded, cited answer text' },
  steps: [
    {
      id: 'retrieve',
      stage: 'search_corpus',
      worker: 'corpus_retrieval',
      inputs: { query: '{{parameters.question}}' },
      depends_on: [] as string[],
    },
    {
      id: 'draft',
      stage: 'analyse',
      // no worker: the runner executes workers on no stage but retrieve yet
      // (T-309's stop) — a worker here would validate the silent no-op path
      inputs: { passages: '{{steps.retrieve.output}}' },
      depends_on: ['retrieve'],
    },
  ],
  requires_workers: ['corpus_retrieval'],
  writes: 'none',
});

const validate = (
  mutate: (doc: ReturnType<typeof good>) => void = () => {},
  production = true,
) => {
  const doc = good();
  mutate(doc);
  return validateWorkflow(doc, { file: 'project-question.yaml', workers, production });
};

const errorsOf = (result: ReturnType<typeof validate>) => (result.ok ? [] : result.errors);

// T-396 — THE INTERIM REFUSAL, INVERTED, exactly as its own note said it would
// be. Between 2026-08-28 and the executor rule a worker on any stage but the
// retrieve step was refused at load, because the runner executed a named worker
// on no stage and the definition would have silently run the orchestrator's own
// leaf instead. The engine now runs what a step names (ADR-0053 §7), so the
// definition must LOAD — and this test asserts loading rather than refusal.
it('LOADS a capability on a stage the executor now runs — the interim refusal is gone', () => {
  const result = validate((doc) => {
    (doc.steps[1] as Record<string, unknown>)['worker'] = 'document_builder';
  });
  expect(errorsOf(result)).toEqual([]);
  expect(result.ok && result.workflow.steps[1]!.worker).toBe('document_builder');
});


describe('the declared-workflow validator (T-264)', () => {
  it('accepts a well-formed definition, and returns it in contracts shape', () => {
    const result = validate();
    expect(errorsOf(result)).toEqual([]);
    expect(result.ok && result.workflow.id).toBe('project-question');
    expect(result.ok && result.workflow.steps.map((step) => step.worker)).toEqual([
      'corpus_retrieval',
      undefined,
    ]);
    // `writes: none` carries no label-propagation declaration at all
    expect(result.ok && result.workflow.labelPropagation).toBeUndefined();
  });

  // ── RULE 1 ────────────────────────────────────────────────────────────────
  it('RULE 1: a step naming a worker outside the registry fails to load', () => {
    const errors = errorsOf(validate((doc) => (doc.steps[0]!.worker = 'do_the_thing')));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'do_the_thing' is not in the worker registry");
    // the available set is named: an author who mistyped needs the list, and an
    // author who invented a worker needs to see that it is an invention
    expect(errors[0]).toContain('corpus_retrieval');
  });

  it('RULE 1: a requires_workers entry outside the registry fails to load', () => {
    const errors = errorsOf(validate((doc) => doc.requires_workers.push('web_research')));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("requires_workers — 'web_research' is not in the worker registry");
  });

  // ── RULE 2 ────────────────────────────────────────────────────────────────
  it('RULE 2: a cycle fails to load, naming the steps caught in it', () => {
    const errors = errorsOf(validate((doc) => doc.steps[0]!.depends_on.push('draft')));
    expect(errors).toEqual([
      'project-question.yaml: steps — draft, retrieve form a dependency cycle, so the workflow has no execution order',
    ]);
  });

  it('RULE 2: a depends_on naming a step outside this workflow fails to load', () => {
    const errors = errorsOf(validate((doc) => (doc.steps[1]!.depends_on = ['nowhere'])));
    // the dangling edge is reported; the template that read it is reported too,
    // because the author has to fix both
    expect(errors.some((e) => e.includes("'nowhere' is not a step of this workflow"))).toBe(true);
  });

  it('RULE 2: a step depending on itself fails to load', () => {
    const errors = errorsOf(validate((doc) => (doc.steps[0]!.depends_on = ['retrieve'])));
    expect(errors[0]).toContain('depends on itself');
  });

  // ── RULE 3 ────────────────────────────────────────────────────────────────
  it('RULE 3: a step declaring a scope fails to load, and is told there is no spelling of it', () => {
    const errors = errorsOf(
      validate((doc) => Object.assign(doc.steps[0]!, { scope: { projectId: 'other-project' } })),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('a step may not declare a scope');
    expect(errors[0]).toContain('Scope is inherited from the run');
  });

  it('RULE 3: the scope rejection covers the fields a scope would hide in, not just the word', () => {
    for (const field of ['corpus', 'visibility', 'project_id', 'as_organisation']) {
      const errors = errorsOf(validate((doc) => Object.assign(doc.steps[0]!, { [field]: 'x' })));
      expect(errors[0], field).toContain('may not declare a scope');
    }
  });

  it('RULE 3: a scope at the WORKFLOW level is refused with the same reason', () => {
    const errors = errorsOf(validate((doc) => Object.assign(doc, { scope: 'everything' })));
    expect(errors[0]).toContain('there is no correct spelling of this field');
  });

  it('an ordinary unknown field is refused as a typo, not as a scope', () => {
    const errors = errorsOf(validate((doc) => Object.assign(doc, { requires_worker: [] })));
    expect(errors[0]).toContain('unknown field');
    expect(errors[0]).not.toContain('scope');
  });

  // ── RULE 4 ────────────────────────────────────────────────────────────────
  it('RULE 4: a workflow that writes and does not declare label propagation fails to load', () => {
    const errors = errorsOf(validate((doc) => (doc.writes = 'sandbox_document')));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('label_propagation');
    expect(errors[0]).toContain('finding F2');
  });

  it('RULE 4: a writing workflow that declares it loads, and carries the declaration through', () => {
    const result = validate((doc) =>
      Object.assign(doc, { writes: 'sandbox_document', label_propagation: 'require_override' }),
    );
    expect(errorsOf(result)).toEqual([]);
    expect(result.ok && result.workflow.labelPropagation).toBe('require_override');
  });

  it('RULE 4: declaring label propagation for a workflow that writes nothing fails to load', () => {
    const errors = errorsOf(validate((doc) => Object.assign(doc, { label_propagation: 'refuse' })));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('goes stale unnoticed');
  });

  // ── RULE 5 ────────────────────────────────────────────────────────────────
  it('RULE 5: a draft fails to load in production', () => {
    const errors = errorsOf(validate((doc) => (doc.status = 'draft')));
    expect(errors).toEqual([
      'project-question.yaml: status — is `draft`, which loads in non-production only',
    ]);
  });

  it('RULE 5: the same draft loads outside production', () => {
    expect(errorsOf(validate((doc) => (doc.status = 'draft'), false))).toEqual([]);
  });

  // ── templates ─────────────────────────────────────────────────────────────
  it('a template naming no declared parameter fails to load', () => {
    const errors = errorsOf(validate((doc) => (doc.steps[0]!.inputs.query = '{{parameters.topic}}')));
    expect(errors[0]).toContain('{{parameters.topic}} names no declared parameter');
  });

  it('a template reading a step this one does not depend on fails to load', () => {
    // the reference resolves to a real step, and to one that may not have run:
    // a race dressed as a template, which is exactly the kind of thing that
    // works in testing and fails once steps run concurrently
    const errors = errorsOf(validate((doc) => (doc.steps[1]!.depends_on = [])));
    expect(errors[0]).toContain('reads a step this one does not depend on');
    expect(errors[0]).toContain("Add 'retrieve' to depends_on");
  });

  it('a template that is neither form fails to load', () => {
    const errors = errorsOf(validate((doc) => (doc.steps[0]!.inputs.query = '{{run.organisation}}')));
    expect(errors[0]).toContain('is neither {{parameters.NAME}} nor {{steps.ID.output}}');
  });

  // ── the ordinary structural rules ─────────────────────────────────────────
  it('the id must match the filename, so a plan record leads back to the file', () => {
    const errors = errorsOf(validate((doc) => (doc.id = 'something-else')));
    expect(errors[0]).toContain("is 'something-else' but the file is named 'project-question'");
  });

  it('a parameter with no description fails to load — it is what the user is shown', () => {
    const errors = errorsOf(validate((doc) => (doc.parameters[0]!.description = '  ')));
    expect(errors[0]).toContain('shown to the USER when this parameter needs clarifying');
  });

  it('two steps sharing an id fail to load', () => {
    const errors = errorsOf(validate((doc) => (doc.steps[1]!.id = 'retrieve')));
    expect(errors.some((e) => e.includes("'retrieve' is declared twice"))).toBe(true);
  });

  it('a stage that is not a plan stage fails to load, listing the ones that are', () => {
    const errors = errorsOf(validate((doc) => (doc.steps[0]!.stage = 'searching')));
    expect(errors[0]).toContain("'searching' is not a plan stage");
    expect(errors[0]).toContain('search_corpus');
  });

  it('a version that is not a positive integer fails to load', () => {
    expect(errorsOf(validate((doc) => (doc.version = 0)))[0]).toContain('bumped on any change');
  });
});

// T-265 — the two refinements declaring the FIRST workflow forced. Both came
// from building rather than from review, which is the case for declaring a
// real workflow rather than a plausible one.
describe('worker is optional, and forbidden on `verify` (T-265)', () => {
  it('a step with no worker loads — the orchestrator runs that stage itself', () => {
    // `analyse` is the one thinking leaf and `present` is citation resolution
    // (ADR-0027 §6). Neither is a worker: a worker is a tool the agent may
    // CALL, and the agent does not call its own drafting.
    const result = validate((doc) => {
      delete (doc.steps[1] as Record<string, unknown>)['worker'];
    });
    expect(errorsOf(result)).toEqual([]);
    expect(result.ok && result.workflow.steps[1]!.worker).toBeUndefined();
  });

  it('a `verify` step naming a worker fails to load', () => {
    const errors = errorsOf(
      validate((doc) => {
        doc.steps[1]!.stage = 'verify';
        doc.steps[1]!.worker = 'corpus_retrieval';
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('a `verify` step may not name a worker');
    expect(errors[0]).toContain('outside the plan on every answer');
  });

  it('a `verify` step with no worker loads', () => {
    const result = validate((doc) => {
      doc.steps[1]!.stage = 'verify';
      delete (doc.steps[1] as Record<string, unknown>)['worker'];
    });
    expect(errorsOf(result)).toEqual([]);
  });

  it('an empty `worker` is a mistake, not an omission, and says so', () => {
    const errors = errorsOf(validate((doc) => (doc.steps[0]!.worker = '  ')));
    expect(errors[0]).toContain('Omit it for a stage the orchestrator runs itself');
  });
});

// ── T-396 — RULE 6: THE FAN-OUT ────────────────────────────────────────────
//
// The width is computed in code at plan time and is NEVER model-chosen. The
// validator's whole contribution to that is where a `fan_out` may point: at a
// declared `id_list` parameter, and nowhere else. A step's output can be
// model-written, so a width read from one would make the plan's SHAPE
// model-chosen while it still called itself declared — losing the one
// guarantee (same inputs, same steps, same order) a declared workflow is sold
// on.
describe('the fan-out (T-396, ADR-0053 §7)', () => {
  const withFanOut = (fanOut: unknown, type = 'id_list') =>
    validate((doc) => {
      (doc.parameters as Array<Record<string, unknown>>).push({
        name: 'sections',
        type,
        required: true,
        description: 'The sections to check, computed before the run.',
      });
      (doc.steps[1] as Record<string, unknown>)['fan_out'] = fanOut;
      (doc.steps[1] as Record<string, unknown>)['inputs'] = { section: '{{item}}' };
    });

  it('accepts a fan-out over a declared id_list parameter', () => {
    expect(errorsOf(withFanOut('{{parameters.sections}}'))).toEqual([]);
  });

  it('REFUSES a fan-out over a step output — that width would be model-chosen', () => {
    const errors = errorsOf(withFanOut('{{steps.retrieve.output}}'));
    expect(errors.join(' ')).toContain('model-chosen');
  });

  it('refuses a fan-out over a parameter that is not a list', () => {
    const errors = errorsOf(withFanOut('{{parameters.sections}}', 'string'));
    expect(errors.join(' ')).toContain("parameter 'sections' is `string`");
  });

  it('refuses a fan-out over a parameter nobody declared', () => {
    const errors = errorsOf(
      validate((doc) => {
        (doc.steps[1] as Record<string, unknown>)['fan_out'] = '{{parameters.nope}}';
      }),
    );
    expect(errors.join(' ')).toContain('names no declared parameter');
  });

  it('refuses a fan-out on a `verify` step — the ground-check runs once, outside the plan', () => {
    const errors = errorsOf(
      validate((doc) => {
        (doc.parameters as Array<Record<string, unknown>>).push({
          name: 'sections',
          type: 'id_list',
          required: true,
          description: 'sections',
        });
        (doc.steps[1] as Record<string, unknown>)['stage'] = 'verify';
        delete (doc.steps[1] as Record<string, unknown>)['worker'];
        (doc.steps[1] as Record<string, unknown>)['fan_out'] = '{{parameters.sections}}';
      }),
    );
    expect(errors.join(' ')).toContain('may not fan out');
  });

  it('refuses {{item}} on a step that does not fan out — it would resolve to nothing', () => {
    const errors = errorsOf(
      validate((doc) => {
        (doc.steps[1] as Record<string, unknown>)['inputs'] = { section: '{{item}}' };
      }),
    );
    expect(errors.join(' ')).toContain('only meaningful on a step that declares');
  });
});
