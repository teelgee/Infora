// T-265 — `workflow_runner` and the first declared workflow.
//
// The board says keeping the runner from becoming a general escape hatch is
// review discipline, not a test, and that is true of the intent. What a test
// CAN hold is the two structural halves of that discipline, and both are here:
// it binds a workflow from the registry rather than a step list, and it adds,
// removes and reorders nothing.
import { describe, expect, it } from 'vitest';
import { bindWorkflow, WORKFLOW_RUNNER, WorkflowNotRunnable } from './runner';
import { loadWorkflows } from './load';
import type { KnownWorkers } from './validate';

// the registry the shipped definitions are validated against — T-309 added
// `document-creation.yaml`, which names the built writing capability
const BUILT = ['corpus_retrieval', 'extractor', 'document_builder'];
const workers: KnownWorkers = {
  has: (worker) => BUILT.includes(worker),
  list: () => BUILT,
};

const shipped = () => loadWorkflows({ workers }).get('project-question')!;

describe('the first declared workflow (T-265)', () => {
  it('the shipped definition loads against the REAL worker registry', () => {
    const workflow = shipped();
    // v2 since T-396 — the descriptive `worker:` on the retrieve step came off
    expect(workflow.version).toBe(2);
    expect(workflow.status).toBe('active');
    expect(workflow.writes).toBe('none');
  });

  it('IS THE CODED CHAIN: the same four stages, in the same order', () => {
    // this ticket changes no behaviour, and this is that claim as data
    expect(shipped().steps.map((step) => step.stage)).toEqual([
      'search_corpus',
      'analyse',
      'verify',
      'present',
    ]);
  });

  // T-396 — INVERTED. It used to read "names a worker only where a worker runs
  // the step", and the retrieve step's `corpus_retrieval` was the one that did.
  // Under the executor rule a named capability RUNS, and Ask's retrieval is the
  // orchestrator's own leaf — baseline assembly plus the sub-agent's child run,
  // carrying the steering channels a leaf worker does not return. So the name
  // came off, and every step here is one the stage runs.
  it('names no worker at all: every step is one the orchestrator runs itself', () => {
    expect(shipped().steps.map((step) => step.worker)).toEqual([
      undefined, // the retrieve leaf and its retrieval sub-agent
      undefined, // the orchestrator's own thinking leaf (ADR-0027 §6)
      undefined, // the ground-check — code, outside the plan
      undefined, // citation resolution
    ]);
  });
});

describe('bindWorkflow (T-265)', () => {
  it('binds a parameter into the step inputs that reference it', () => {
    const bound = bindWorkflow(shipped(), { question: 'what did the GI record?' });
    expect(bound.workflowId).toBe('project-question');
    expect(bound.workflowVersion).toBe(2);
    expect(bound.stages[0]!.inputs).toEqual({ query: 'what did the GI record?' });
  });

  it('adds, removes and reorders nothing — it executes, it does not compose', () => {
    const workflow = shipped();
    const bound = bindWorkflow(workflow, { question: 'anything' });
    expect(bound.stages.map((stage) => stage.stage)).toEqual(
      workflow.steps.map((step) => step.stage),
    );
    expect(bound.stages).toHaveLength(workflow.steps.length);
  });

  it('REFUSES an unbound required parameter rather than substituting one', () => {
    // a declared workflow run on a parameter nobody supplied produces an answer
    // to a question nobody asked, and the fact that it reads like a real answer
    // is what makes it expensive
    expect(() => bindWorkflow(shipped(), {})).toThrow(WorkflowNotRunnable);
    expect(() => bindWorkflow(shipped(), {})).toThrow(/required parameter 'question' is unbound/);
    // and the message carries the parameter's own description, which is the
    // copy a user would be shown if they were being asked for it (T-266)
    expect(() => bindWorkflow(shipped(), {})).toThrow(/in the requester's own words/);
  });

  it('leaves {{steps.x.output}} alone — a step output does not exist at bind time', () => {
    const bound = bindWorkflow(shipped(), { question: 'q' });
    expect(bound.stages[1]!.inputs['passages']).toBe('{{steps.retrieve.output}}');
  });

  it('takes a WORKFLOW, not a step list — there is no shape for an improvised plan', () => {
    // the structural half of the review discipline: `bindWorkflow`'s first
    // argument is a loaded, validated `Workflow`, so the only route to a plan
    // through this runner is a definition somebody wrote down and reviewed
    const registry = loadWorkflows({ workers });
    expect(registry.get('improvised')).toBeUndefined();
  });
});

describe('the workflow_runner declaration (T-265)', () => {
  it('is the single non-leaf worker — non-negotiable 7s only exception', () => {
    expect(WORKFLOW_RUNNER.leaf).toBe(false);
    expect(WORKFLOW_RUNNER.name).toBe('workflow_runner');
  });

  it('inherits scope and cannot widen, and is not cacheable', () => {
    expect(WORKFLOW_RUNNER.reach).toBe('inherited');
    expect(WORKFLOW_RUNNER.scopeNote).toContain('cannot widen');
    // its steps' own cacheability is theirs; the composition is not cached,
    // because what it composes may not be
    expect(WORKFLOW_RUNNER.cacheable).toBe(false);
  });
});

// ── T-396 — THE FAN-OUT EXPANDS IN CODE ────────────────────────────────────
//
// The one place a bound plan's step count differs from its declaration's, and
// the count is arithmetic over a list the CALLER computed. Nothing here reaches
// a model, and the validator has already refused a `fan_out` pointing anywhere
// but at a parameter — so a fanned-out plan is still `declared`: the same
// inputs produce the same steps in the same order, every time.
describe('the fan-out (T-396)', () => {
  const fanned = (): ReturnType<typeof shipped> => {
    const workflow = shipped();
    return {
      ...workflow,
      parameters: [
        ...workflow.parameters,
        { name: 'sections', type: 'id_list', required: true, description: 'the sections' },
      ],
      steps: workflow.steps.map((step) =>
        step.id === 'draft'
          ? { ...step, fanOut: '{{parameters.sections}}', inputs: { section: '{{item}}' } }
          : step,
      ),
    };
  };

  it('becomes one step per element, each carrying its own item', () => {
    const bound = bindWorkflow(fanned(), { question: 'q', sections: ['s1', 's2', 's3'] });
    // four declared steps, one of which fanned to three: six
    expect(bound.stages).toHaveLength(6);
    expect(bound.stages.filter((stage) => stage.stage === 'analyse').map((s) => s.inputs)).toEqual([
      { section: 's1' },
      { section: 's2' },
      { section: 's3' },
    ]);
  });

  it('keys each expansion distinctly, so two expansions are two outputs', () => {
    const bound = bindWorkflow(fanned(), { question: 'q', sections: ['s1', 's2'] });
    expect(bound.stages.map((stage) => stage.key)).toEqual([
      'retrieve',
      'draft#0',
      'draft#1',
      'verify',
      'present',
    ]);
  });

  it('is the same width every time for the same input — the declared promise', () => {
    const once = bindWorkflow(fanned(), { question: 'q', sections: ['a', 'b'] });
    const twice = bindWorkflow(fanned(), { question: 'q', sections: ['a', 'b'] });
    expect(twice.stages).toEqual(once.stages);
  });

  it('a width of zero produces no steps for that declaration, and says nothing else', () => {
    const bound = bindWorkflow(fanned(), { question: 'q', sections: [] });
    expect(bound.stages.map((stage) => stage.stage)).toEqual([
      'search_corpus',
      'verify',
      'present',
    ]);
  });

  it('REFUSES an unbound fan-out rather than silently running zero steps', () => {
    // the required-parameter refusal catches it first, and names the parameter
    expect(() => bindWorkflow(fanned(), { question: 'q' })).toThrow(
      /required parameter 'sections' is unbound/,
    );
    // and where the parameter is OPTIONAL, so nothing earlier catches it, the
    // expansion itself refuses: a fan-out silently producing zero steps is a
    // run that did none of the work it was asked for and reported success
    const optional = fanned();
    const workflow = {
      ...optional,
      parameters: optional.parameters.map((parameter) =>
        parameter.name === 'sections' ? { ...parameter, required: false } : parameter,
      ),
    };
    expect(() => bindWorkflow(workflow, { question: 'q' })).toThrow(WorkflowNotRunnable);
    expect(() => bindWorkflow(workflow, { question: 'q' })).toThrow(/fans out over 'sections'/);
  });
});

// T-396 — the bound plan carries the write declaration to the executor, which
// is where validator rule 4 finally bites.
describe('the write declaration travels with the bound plan (T-396)', () => {
  it('carries `writes`, so the executor can refuse a writing capability', () => {
    expect(bindWorkflow(shipped(), { question: 'q' }).writes).toBe('none');
  });
});
