// T-266 — the four outcomes, and the two properties that keep model-chosen
// mode from becoming the generic agent the design forbids.
import { describe, expect, it, vi } from 'vitest';
import type { Workflow, WorkerDeclaration } from '@infora/contracts';
import { classify, modelChosenStages, singleWorkflowClassifier } from './classify';
import type { Classifier } from './classify';
import { CORPUS_RETRIEVAL } from './workers/corpus-retrieval';

const workflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'project-question',
  version: 1,
  label: 'Project question',
  description: 'Answer a question from the project library.',
  status: 'active',
  parameters: [
    { name: 'question', type: 'string', required: true, description: 'The question to answer.' },
  ],
  outputSchema: { answer: 'the answer' },
  steps: [{ id: 'retrieve', stage: 'search_corpus', worker: 'corpus_retrieval', inputs: {}, dependsOn: [] }],
  requiresWorkers: ['corpus_retrieval'],
  writes: 'none',
  ...overrides,
});

const workers: WorkerDeclaration[] = [CORPUS_RETRIEVAL];

describe('classification into four outcomes (T-266)', () => {
  it('1 — a declared workflow, fully bound', async () => {
    const result = await classify({ question: 'what did the GI record?', workflows: [workflow()], workers });
    expect(result).toEqual({
      outcome: 'declared',
      workflowId: 'project-question',
      parameters: { question: 'what did the GI record?' },
    });
  });

  it('2 — a declared workflow with an unbound required parameter: clarify, with assumptions in words', async () => {
    const twoParams = workflow({
      parameters: [
        { name: 'question', type: 'string', required: true, description: 'The question to answer.' },
        {
          name: 'deadline',
          type: 'id',
          required: true,
          description: 'Which examination deadline the answer should be current to.',
        },
      ],
    });
    const result = await classify({ question: 'q', workflows: [twoParams], workers });
    expect(result.outcome).toBe('clarify');
    if (result.outcome !== 'clarify') throw new Error('unreachable');
    expect(result.unbound).toEqual(['deadline']);
    // the assumption is stated in the PARAMETER'S OWN user-facing description,
    // which is why T-264 requires that description to be copy rather than a
    // code comment — and why it is named at the top of the answer, not in a
    // footer nobody reads
    expect(result.assumptions[0]).toContain('Which examination deadline');
  });

  it('3 — no matching workflow falls through to model-chosen', async () => {
    const none: Classifier = async () => ({ match: 'none' });
    const result = await classify({ question: 'q', workflows: [workflow()], workers, classifier: none });
    expect(result.outcome).toBe('model_chosen');
  });

  it('4 — out of scope says so AND SAYS WHY', async () => {
    const refuse: Classifier = async () => ({
      match: 'out_of_scope',
      reason: 'Infora answers questions about this project\'s documents; it does not schedule meetings.',
    });
    const result = await classify({ question: 'book a meeting', workflows: [workflow()], workers, classifier: refuse });
    expect(result.outcome).toBe('out_of_scope');
    if (result.outcome !== 'out_of_scope') throw new Error('unreachable');
    // a refusal a user cannot act on reads as a broken system rather than a
    // careful one — the same rule the label-propagation refusal follows
    expect(result.reason.length).toBeGreaterThan(20);
  });

  it('a classifier naming a workflow this deployment does not carry falls through, never fails', async () => {
    // the fall-through then shows up in the metric that exists to catch exactly
    // this kind of classifier weakness, rather than as a 500 the user sees
    const wrong: Classifier = async () => ({ match: 'workflow', workflowId: 'not-shipped' });
    const result = await classify({ question: 'q', workflows: [workflow()], workers, classifier: wrong });
    expect(result.outcome).toBe('model_chosen');
  });
});

describe('what the classifier is allowed to see (T-266)', () => {
  it('is handed the ASSEMBLED worker set, never the full one', async () => {
    const seen = vi.fn<Classifier>(async () => ({ match: 'none' }));
    // the caller assembles first (T-269); what arrives here is already the
    // requester's own set, which is the assembled-not-filtered rule reaching
    // the one place it would be easiest to lose — the model's tool list
    await classify({ question: 'q', workflows: [workflow()], workers: [], classifier: seen });
    expect(seen.mock.calls[0]![0].workers).toEqual([]);
  });

  it('sees workflow SUMMARIES, never the step inputs', async () => {
    const seen = vi.fn<Classifier>(async () => ({ match: 'none' }));
    await classify({ question: 'q', workflows: [workflow()], workers, classifier: seen });
    expect(Object.keys(seen.mock.calls[0]![0].workflows[0]!).sort()).toEqual([
      'description',
      'id',
      'label',
      'version',
      'writes',
    ]);
  });
});

describe('the deterministic default (T-266)', () => {
  it('matches when there is exactly one workflow — one option is not a judgement', () => {
    // ADR-0027's whole argument: asking a frontier model to choose among one
    // option is spending money to be less reliable
    expect(singleWorkflowClassifier({ question: 'q', workflows: [{ id: 'a' } as never], workers })).resolves.toEqual(
      { match: 'workflow', workflowId: 'a' },
    );
  });

  it('defers to model-chosen when there is a genuine choice it cannot make', async () => {
    const two = [{ id: 'a' }, { id: 'b' }] as never[];
    expect(await singleWorkflowClassifier({ question: 'q', workflows: two, workers })).toEqual({
      match: 'none',
    });
  });
});

describe('the model-chosen dispatch plan (T-266)', () => {
  it('is built over the ENTITLED worker set — an unentitled worker is not in it', () => {
    // T-396 — the entitlement decides whether the retrieval STAGE EXISTS, and
    // no longer puts a name on it: under the executor rule a name is an
    // instruction, and a model-chosen turn's retrieval is the orchestrator's
    // own leaf. The presence of the step is the entitlement effect.
    expect(modelChosenStages([CORPUS_RETRIEVAL]).map((stage) => stage.stage)).toEqual([
      'search_corpus',
      'analyse',
      'verify',
      'present',
    ]);
    expect(modelChosenStages([CORPUS_RETRIEVAL]).map((stage) => stage.worker)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    // no corpus worker entitled: the plan has no retrieval stage at all, rather
    // than a stage naming a worker the requester cannot use
    expect(modelChosenStages([]).map((stage) => stage.stage)).toEqual([
      'analyse',
      'verify',
      'present',
    ]);
  });

  it('always carries the verify stage — the ground-check is not the planner\'s to drop', () => {
    // and even this is belt-and-braces: T-262 runs the check whether or not the
    // plan names it, which is what makes "model-chosen costs repeatability of
    // the sequence and nothing else" a true sentence
    for (const set of [[CORPUS_RETRIEVAL], []]) {
      expect(modelChosenStages(set).some((stage) => stage.stage === 'verify')).toBe(true);
    }
  });
});
