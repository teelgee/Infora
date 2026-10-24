// T-476 (ADR-0053 addendum A9) — the disproving pass is declared in the plan,
// priced like any step, off by default, and counted in the coverage sentence.
// *In plain terms: switch it on and the plan lists one more step with a number
// of model calls; leave it off and the plan is exactly what it was.*
import { describe, expect, it } from 'vitest';
import type { CheckFamily, ReachCounts, Workflow } from '@infora/contracts';
import { coverageAfterQaCheck, planQaCheck } from './qa-plan';
import { splitIntoSections } from './workers/qa-sections';

const WORKFLOW: Workflow = {
  id: 'qa-check',
  version: 4,
  label: 'Check a document',
  description: 'x',
  status: 'active',
  parameters: [],
  outputSchema: {},
  steps: [],
  requiresWorkers: ['qa_section_check'],
  writes: 'none',
};
const DRAFT = ['Intro\n\nOne.\n', 'Baseline\n\nTwo.\n', 'Assessment\n\nThree.\n'].join('\n');
const input = (over: Partial<Parameters<typeof planQaCheck>[0]> = {}) => ({
  workflow: WORKFLOW,
  sections: splitIntoSections(DRAFT),
  families: ['style', 'corpus_accuracy', 'readability'] as readonly CheckFamily[],
  depth: 'quick' as const,
  styleClauses: { count: 2, tokens: 100 },
  reach: { visibleLive: 4, inScope: 4, excludedByState: { superseded: 0, withdrawn: 0 }, leftOutByScope: 0 } as ReachCounts,
  scoped: false,
  attachedDocuments: 0,
  attachedUploads: [] as readonly string[],
  checkModelId: 'check-model',
  rates: { 'check-model': { promptPerMTok: 3, completionPerMTok: 15 } },
  tokenLimit: 60_000,
  ...over,
});

describe('the disproving pass in the plan', () => {
  it('off: nothing in the plan, and the plan is identical to one that never heard of it', () => {
    const off = planQaCheck(input({ disprovingPass: false }));
    expect(planQaCheck(input())).toEqual(off);
    expect(off.plan.steps.some((step) => step.key === 'disprove')).toBe(false);
    expect(off.plan.coverage).not.toContain('argued against');
  });

  it('on: declares a disprove step after the section reads, with a call count and a price', () => {
    const on = planQaCheck(input({ disprovingPass: true }));
    const keys = on.plan.steps.map((step) => step.key);
    const disprove = on.plan.steps.find((step) => step.key === 'disprove')!;
    expect(disprove.stage).toBe('analyse');
    // one expected judgement finding per section read, which is the plan's own count
    expect(disprove.estimate.calls).toBe(on.passes.length);
    expect(disprove.estimate.cost).toBeGreaterThan(0);
    // after every check step, before the arithmetic step
    const lastCheck = Math.max(...keys.map((key, at) => (key.startsWith('check') ? at : -1)));
    expect(keys.indexOf('disprove')).toBeGreaterThan(lastCheck);
    expect(on.plan.coverage).toContain('argued against before you see it');
    // and the plan total includes it
    const off = planQaCheck(input());
    expect(on.plan.cost.total!).toBeGreaterThan(off.plan.cost.total!);
  });

  it('is deterministic: the same inputs give the same declared step', () => {
    expect(planQaCheck(input({ disprovingPass: true }))).toEqual(planQaCheck(input({ disprovingPass: true })));
  });

  it('on with only arithmetic checks: no step, and the plan says there is nothing to examine', () => {
    const plan = planQaCheck(input({ disprovingPass: true, families: ['readability', 'completeness'] }));
    expect(plan.plan.steps.some((step) => step.key === 'disprove')).toBe(false);
    expect(plan.plan.caveats?.join(' ')).toContain('nothing for it to examine');
  });
});

describe('the coverage sentence counts the withdrawals', () => {
  const base = {
    sectionsRead: 3, sectionsPlanned: 3, checksRun: 3, clausesRead: 0, clausesTotal: 0, clausePasses: 1,
    passagesRead: 0, sectionsWithNoPassages: 0, attachedRead: 0, discarded: 0, contradictionGroups: 1,
  };
  it('says "N raised, M withdrawn by the disproving pass" when the pass ran', () => {
    expect(coverageAfterQaCheck({ ...base, disproving: { raised: 12, withdrawn: 3 } })).toContain(
      '12 raised, 3 withdrawn by the disproving pass',
    );
  });
  it('says nothing about it when it did not', () => {
    expect(coverageAfterQaCheck(base)).not.toContain('disproving');
  });
});
