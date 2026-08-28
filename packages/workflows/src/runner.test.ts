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

const workers: KnownWorkers = {
  has: (worker) => worker === 'corpus_retrieval',
  list: () => ['corpus_retrieval'],
};

const shipped = () => loadWorkflows({ workers }).get('project-question')!;

describe('the first declared workflow (T-265)', () => {
  it('the shipped definition loads against the REAL worker registry', () => {
    const workflow = shipped();
    expect(workflow.version).toBe(1);
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

  it('names a worker only where a worker runs the step', () => {
    expect(shipped().steps.map((step) => step.worker)).toEqual([
      'corpus_retrieval',
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
    expect(bound.workflowVersion).toBe(1);
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
