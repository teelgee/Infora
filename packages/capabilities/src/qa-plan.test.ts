// T-336 acceptance — **the planner's determinism is asserted, not assumed.**
//
// 🔒 ADR-0053 §4 makes the planner CODE and says so is load-bearing rather than
// an optimisation: if a model decided the run's shape, the same document would
// produce different plans on different days and the checker could not be a
// **declared** workflow at all — losing the one guarantee (same inputs, same
// steps, same order) a tool is sold on. A test that only checked the plan
// looked sensible would pass just as well against a model-planned run, so the
// first case here plans the same document TWICE and requires the two to be
// identical: step counts, families, and the priced estimate.
import { describe, expect, it } from 'vitest';
import type { CheckFamily, ReachCounts, Workflow } from '@infora/contracts';
import { CHECK_FAMILIES } from '@infora/contracts';
import {
  CHECK_OVERHEAD_TOKENS,
  coverageAfterQaCheck,
  parseGroupKey,
  parsePassKey,
  planQaCheck,
  tokensIn,
} from './qa-plan';
import { splitIntoSections } from './workers/qa-sections';

const WORKFLOW: Workflow = {
  id: 'qa-check',
  version: 1,
  label: 'Check a document',
  description: 'x',
  status: 'active',
  parameters: [],
  outputSchema: {},
  steps: [],
  requiresWorkers: ['qa_section_check'],
  writes: 'none',
};

const RATES = { 'check-model': { promptPerMTok: 3, completionPerMTok: 15 } };

const section = (heading: string, body: string) => `${heading}\n\n${body}\n`;
const DRAFT = [
  section('Introduction', 'This chapter assesses land quality across the scheme.'),
  section('Baseline conditions', 'The site was formerly a gasworks. Made ground extends to 4 m.'),
  section('Assessment', 'The Scheme delivers a 12% reduction in contaminant loading.'),
  section('Mitigation', 'A validation strategy will be agreed with the regulator.'),
].join('\n');

const input = (over: Partial<Parameters<typeof planQaCheck>[0]> = {}) => ({
  workflow: WORKFLOW,
  sections: splitIntoSections(DRAFT),
  families: CHECK_FAMILIES as readonly CheckFamily[],
  depth: 'full' as const,
  styleClauses: { count: 12, tokens: 900 },
  reach: {
    visibleLive: 40,
    inScope: 40,
    excludedByState: { superseded: 0, withdrawn: 0 },
    leftOutByScope: 0,
  } as ReachCounts,
  scoped: false,
  attachedDocuments: 0,
  attachedUploads: [] as readonly string[],
  checkModelId: 'check-model',
  rates: RATES,
  tokenLimit: 4000,
  ...over,
});

describe('🔒 the same document plans the same way, twice', () => {
  it('produces an identical plan on a second call — steps, families and the priced estimate', () => {
    const first = planQaCheck(input());
    const second = planQaCheck(input());
    // deep equality over the WHOLE plan, deliberately: a weaker assertion on
    // step counts alone would pass against a planner that reordered, relabelled
    // or repriced, and a plan that reorders is not the same plan
    expect(second).toEqual(first);
    expect(second.plan.steps.map((step) => step.worker)).toEqual(
      first.plan.steps.map((step) => step.worker),
    );
    expect(second.plan.cost).toEqual(first.plan.cost);
    expect(second.passes).toEqual(first.passes);
  });

  it('prices the run, and a code step costs a real zero rather than an unpriced null', () => {
    const { plan } = planQaCheck(input());
    expect(plan.cost.priced).toBe(true);
    expect(plan.cost.total).toBeGreaterThan(0);
    const measure = plan.steps.find((step) => step.worker === 'qa_document_check')!;
    // 0 is a price (it genuinely spends nothing); null is "nobody priced it"
    expect(measure.estimate.cost).toBe(0);
    expect(measure.estimate.calls).toBe(0);
  });

  it('an unpriced deployment says so rather than showing a plausible zero (T-254)', () => {
    const { plan } = planQaCheck({ ...input(), rates: undefined });
    expect(plan.cost.priced).toBe(false);
    expect(plan.cost.total).toBeNull();
  });

  it('changing a parameter changes the plan — the user shapes it by asking a different question', () => {
    const full = planQaCheck(input());
    const quick = planQaCheck(input({ depth: 'quick' }));
    expect(quick.plan.cost.total).toBeLessThan(full.plan.cost.total!);
    // the arithmetic step ALWAYS appears, because it is also where the run
    // totals up what it read — but its LABEL says which job it is doing
    const styleOnly = planQaCheck(input({ families: ['style'] }));
    const measure = styleOnly.plan.steps.find((step) => step.worker === 'qa_document_check')!;
    expect(measure.label).toContain('Total up what was actually read');
    expect(measure.estimate.cost).toBe(0);
    const withCode = planQaCheck(input({ families: ['style', 'readability'] }));
    expect(
      withCode.plan.steps.find((step) => step.worker === 'qa_document_check')!.label,
    ).toContain('readability');
    // and no per-section model call is planned where no per-section family was
    // chosen — the fan-out width IS the plan, so the run cannot disagree
    const codeOnly = planQaCheck(input({ families: ['readability', 'completeness'] }));
    expect(codeOnly.passes).toEqual([]);
    expect(codeOnly.plan.steps.every((step) => step.worker === 'qa_document_check')).toBe(true);
  });
});

describe('three shapes, and the plan names which it took (ADR-0053 §4)', () => {
  it('short — one pass over the whole draft, and the consistency check comes free', () => {
    const short = planQaCheck(input({ tokenLimit: 60_000 }));
    expect(short.shape).toBe('short');
    expect(short.passes).toEqual(['s0p0of1']);
    // free, so there is no comparison STEP at all — one reader saw everything
    expect(short.groups).toEqual([]);
    expect(short.plan.steps.some((step) => step.worker === 'qa_contradiction_check')).toBe(false);
    expect(short.plan.shape).toContain('comes free');
  });

  it('ordinary — a pass per section, then one comparison', () => {
    const ordinary = planQaCheck(input());
    expect(ordinary.shape).toBe('ordinary');
    expect(ordinary.groups).toHaveLength(1);
    expect(
      ordinary.plan.steps.filter((step) => step.worker === 'qa_contradiction_check'),
    ).toHaveLength(1);
    expect(ordinary.plan.shape).toContain('4 sections');
  });

  it('very long — the summaries are compared in GROUPS, and the plan says it is weaker', () => {
    const many = Array.from({ length: 400 }, (_, at) =>
      section(`Section ${at + 1}`, 'A short paragraph of assessment text.'),
    ).join('\n');
    const long = planQaCheck({ ...input(), sections: splitIntoSections(many), tokenLimit: 4000 });
    expect(long.shape).toBe('very_long');
    expect(long.groups.length).toBeGreaterThan(1);
    // 🔒 it degrades LOUDLY or not at all
    expect(long.plan.caveats?.join(' ')).toContain('different groups will not be found');
  });
});

describe('🔒 split rather than drop (ADR-0053 §5)', () => {
  it('a style guide too long for one call is run over the section in two passes', () => {
    const tight = planQaCheck(input({ styleClauses: { count: 80, tokens: 3000 }, tokenLimit: 4000 }));
    const perSection = new Map<number, number>();
    for (const key of tight.passes) {
      const pass = parsePassKey(key)!;
      perSection.set(pass.section, (perSection.get(pass.section) ?? 0) + 1);
    }
    expect([...perSection.values()].every((count) => count > 1)).toBe(true);
    // and the coverage SAYS SO — the split is visible rather than silent
    expect(tight.plan.coverage).toContain('80 of 80 clauses');
    expect(tight.plan.coverage).toMatch(/in \d+ passes/);
  });

  it('a manual that grows costs more and covers everything — no day on which it silently weakens', () => {
    const sixty = planQaCheck(input({ styleClauses: { count: 60, tokens: 2000 }, tokenLimit: 4000 }));
    const ninety = planQaCheck(input({ styleClauses: { count: 90, tokens: 3200 }, tokenLimit: 4000 }));
    expect(ninety.passes.length).toBeGreaterThan(sixty.passes.length);
    expect(ninety.plan.cost.total!).toBeGreaterThan(sixty.plan.cost.total!);
    // BOTH state their full clause count: the growth changes the plan visibly
    expect(sixty.plan.coverage).toContain('60 of 60 clauses');
    expect(ninety.plan.coverage).toContain('90 of 90 clauses');
  });

  it('refuses in the plan — before any spend — where even a split cannot fit', () => {
    const enormous = section('One', 'x'.repeat(400_000));
    const { plan } = planQaCheck({
      ...input(),
      sections: splitIntoSections(`${enormous}\n${section('Two', 'short')}`),
      tokenLimit: 4000,
    });
    expect(plan.refusal).not.toBeNull();
    expect(plan.refusal).toContain('too long to check');
  });
});

describe('T-474 — stale grounding is a code family, planned like any other', () => {
  it('adds no model call and no cost, and the coverage sentence says it ran', () => {
    const only = planQaCheck(input({ families: ['stale_grounding'] }));
    // no section reads, no comparison: just the arithmetic step, which is free
    expect(only.passes).toEqual([]);
    expect(only.groups).toEqual([]);
    const measure = only.plan.steps.find((step) => step.key === 'measure')!;
    expect(measure.worker).toBe('qa_document_check');
    expect(measure.estimate).toMatchObject({ calls: 0, cost: 0 });
    expect(measure.label).toContain('cited sources are still current');
    expect(only.plan.coverage).toContain('every cited source compared with the library as it stands now');
    expect(only.plan.cost.total).toBe(0);
  });

  it('is silent about the family where it was switched off', () => {
    const without = planQaCheck(input({ families: ['readability'] }));
    expect(without.plan.coverage).not.toContain('cited source');
  });

  it('is counted after the run, in the same shape', () => {
    const sentence = coverageAfterQaCheck({
      sectionsRead: 4, sectionsPlanned: 4, checksRun: 1, clausesRead: 0, clausesTotal: 0, clausePasses: 1,
      passagesRead: 0, sectionsWithNoPassages: 0, attachedRead: 0, discarded: 0, contradictionGroups: 1,
      staleClaimsChecked: 3,
    });
    expect(sentence).toContain('3 cited claims checked for out-of-date sources');
  });
});

describe('coverage is stated twice, in the same shape', () => {
  it('before the run: sections, checks, the record’s reach and the clause ratio', () => {
    const { plan } = planQaCheck(input());
    expect(plan.coverage).toContain('4 sections');
    expect(plan.coverage).toContain('6 checks');
    expect(plan.coverage).toContain('the library searched');
    expect(plan.coverage).toContain('40 documents can be read.');
    expect(plan.coverage).toContain('statement by statement');
    expect(plan.coverage).toContain('12 of 12 clauses');
  });

  it('a narrowed scope is named in the plan the narrowing produced (Q-028’s explicit case)', () => {
    const { plan } = planQaCheck(
      input({
        scoped: true,
        reach: { visibleLive: 40, inScope: 3, excludedByState: { superseded: 2, withdrawn: 0 }, leftOutByScope: 37 },
      }),
    );
    expect(plan.coverage).toContain('3 documents in your scope can be read.');
    expect(plan.coverage).toContain('Excluded: 2 superseded.');
    expect(plan.coverage).toContain('Your scope left out 37 you could have included.');
    expect(plan.refusal).toBeNull();
  });

  it('REFUSES before spend when a declared scope leaves nothing to read, in words (T-469)', () => {
    const { plan } = planQaCheck(
      input({
        scoped: true,
        reach: { visibleLive: 40, inScope: 0, excludedByState: { superseded: 0, withdrawn: 0 }, leftOutByScope: 40 },
      }),
    );
    expect(plan.refusal).toContain('Your scope leaves nothing to read');
  });

  it('does not refuse a whole-library run over an empty library — that is not a choice the person made', () => {
    const { plan } = planQaCheck(
      input({
        reach: { visibleLive: 0, inScope: 0, excludedByState: { superseded: 0, withdrawn: 0 }, leftOutByScope: 0 },
      }),
    );
    expect(plan.refusal).toBeNull();
  });

  it('an attached document is named as never cited, in the plan and in a caveat', () => {
    const { plan } = planQaCheck(input({ attachedDocuments: 2 }));
    expect(plan.coverage).toContain('quoted and never cited');
    expect(plan.caveats?.join(' ')).toContain('never cited');
  });

  it('no style guide loaded is STATED, not silently omitted', () => {
    const { plan } = planQaCheck(input({ styleClauses: { count: 0, tokens: 0 } }));
    expect(plan.coverage).toContain('no writing rules are loaded');
  });

  it('after the run: the same shape, with what actually happened in it', () => {
    const after = coverageAfterQaCheck({
      sectionsRead: 4,
      sectionsPlanned: 4,
      checksRun: 5,
      clausesRead: 12,
      clausesTotal: 12,
      clausePasses: 1,
      passagesRead: 31,
      sectionsWithNoPassages: 1,
      attachedRead: 0,
      discarded: 2,
      contradictionGroups: 1,
    });
    expect(after).toContain('4 of 4 sections read');
    expect(after).toContain('5 checks');
    expect(after).toContain('style guide 12 of 12 clauses');
    // the absences the findings list cannot show, appended rather than omitted
    expect(after).toContain('1 section the library said nothing about');
    expect(after).toContain('2 suggested findings discarded');
  });

  it('“no findings” can never read as an unqualified claim: an empty library SAYS SO', () => {
    const after = coverageAfterQaCheck({
      sectionsRead: 4,
      sectionsPlanned: 4,
      checksRun: 5,
      clausesRead: 0,
      clausesTotal: 0,
      clausePasses: 1,
      passagesRead: 0,
      sectionsWithNoPassages: 4,
      attachedRead: 0,
      discarded: 0,
      contradictionGroups: 1,
    });
    expect(after).toContain('the library returned nothing to check against');
  });
});

describe('the pass and group keys round-trip', () => {
  it('parses what it writes, and refuses what it did not', () => {
    expect(parsePassKey('s3p1of2')).toEqual({ section: 3, index: 1, of: 2 });
    expect(parsePassKey('nonsense')).toBeNull();
    expect(parseGroupKey('g1of3')).toEqual({ index: 1, of: 3 });
    expect(parseGroupKey('s1p0of1')).toBeNull();
  });

  it('token estimation is arithmetic, and the overhead is a constant', () => {
    expect(tokensIn('abcd')).toBe(1);
    expect(tokensIn('abcd')).toBe(tokensIn('abcd'));
    expect(CHECK_OVERHEAD_TOKENS).toBeGreaterThan(0);
  });
});
