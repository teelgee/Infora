// T-258 acceptance, part 1 — which cases each tier runs (docs/build/ask/07 §5, §7).
// Pure selection over case data: no harness, no database.
import { describe, expect, it } from 'vitest';
import { caseSchema } from './case';
import type { EvalCase } from './case';
import { defaultRepeats, isTier, selectCases } from './tiers';

const evalCase = (over: Partial<EvalCase> & Pick<EvalCase, 'id' | 'category'>): EvalCase =>
  caseSchema.parse({
    description: 'a case',
    fixture: 'hollowfield-reservoir',
    question: 'q',
    acting_user: 'env_consultant',
    assertions: { must_not_cite: ['commercial_risk_v1'] },
    ...over,
  });

const ids = (cases: EvalCase[]) => cases.map((c) => c.id);

describe('the smoke subset (§5)', () => {
  const library = [
    evalCase({ id: 'PERM-01', category: 'permission' }),
    evalCase({ id: 'PERM-02', category: 'permission' }),
    evalCase({ id: 'PERM-03', category: 'permission' }),
    evalCase({ id: 'HAPPY-01', category: 'happy' }),
    evalCase({ id: 'HAPPY-02', category: 'happy' }),
    evalCase({ id: 'TRAP-01', category: 'trap' }),
  ];

  it('keeps EVERY permission case, and one per other category', () => {
    // Permission cases are mandatory on every build (§2): a regression in one
    // is not a quality problem but an incident, so the subset never thins them
    // — that is the line a "make smoke faster" change would cross first.
    const { selected } = selectCases(library, 'smoke');
    expect(ids(selected).sort()).toEqual(['HAPPY-01', 'PERM-01', 'PERM-02', 'PERM-03', 'TRAP-01']);
  });

  it('names what it left out rather than dropping it silently', () => {
    const { excluded } = selectCases(library, 'smoke');
    expect(excluded).toEqual([{ caseId: 'HAPPY-02', reason: 'not in the smoke subset' }]);
  });

  it('takes one case per Lens as well as per category', () => {
    // no Lens exists until T-281; the grouping is real now so that the subset
    // does not need rethinking when one does
    const lensed = [
      evalCase({ id: 'BEH-01', category: 'behaviour', lens: 'planning' }),
      evalCase({ id: 'BEH-02', category: 'behaviour', lens: 'planning' }),
      evalCase({ id: 'BEH-03', category: 'behaviour', lens: 'commercial' }),
    ];
    expect(ids(selectCases(lensed, 'smoke').selected)).toEqual(['BEH-01', 'BEH-03']);
  });

  it('runs every case in full and release', () => {
    expect(ids(selectCases(library, 'full').selected).sort()).toEqual(ids(library).sort());
    expect(ids(selectCases(library, 'release').selected).sort()).toEqual(ids(library).sort());
  });

  it('excludes a model-graded case from smoke, and runs it in full', () => {
    // smoke has no independent grader by construction (fake router, no provider
    // calls), so every claim would come back `ungraded` — which is not a pass
    const graded = evalCase({
      id: 'BEH-04',
      category: 'behaviour',
      assertions: { must_contain: ['~the answer marks the date as inferred'] },
    });
    const smoke = selectCases([graded], 'smoke');
    expect(smoke.selected).toEqual([]);
    expect(smoke.excluded[0]!.reason).toContain('no independent grader');
    expect(ids(selectCases([graded], 'full').selected)).toEqual(['BEH-04']);
  });

  it('refuses a model-graded PERMISSION case at load, so it cannot fall out of smoke', () => {
    // The two rules collide only here: permission cases are mandatory in smoke,
    // and a graded case cannot run in smoke. Resolved at authoring time.
    const parsed = caseSchema.safeParse({
      id: 'PERM-99',
      category: 'permission',
      description: 'x',
      fixture: 'f',
      question: 'q',
      acting_user: 'u',
      assertions: { must_contain: ['~the answer refuses'] },
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error)).toContain('no independent grader');
  });
});

describe('hold-out (§7)', () => {
  const held = evalCase({ id: 'HOLD-01', category: 'happy', hold_out: true });
  const open = evalCase({ id: 'HAPPY-01', category: 'happy' });

  it('is not RUN outside a release run — not merely hidden afterwards', () => {
    // §7 makes the runner enforce this. Filtering the report is the backstop;
    // never executing the case is the control, and it is the one that also
    // stops a hold-out result reaching a log, a cache or a developer's screen.
    for (const tier of ['smoke', 'full'] as const) {
      const { selected, excluded } = selectCases([held, open], tier);
      expect(ids(selected)).not.toContain('HOLD-01');
      expect(excluded.some((e) => e.caseId === 'HOLD-01' && e.reason.startsWith('hold-out'))).toBe(
        true,
      );
    }
  });

  it('runs at release', () => {
    expect(ids(selectCases([held, open], 'release').selected)).toContain('HOLD-01');
  });
});

describe('repeats (§8)', () => {
  it('repeats in the nightly tiers and not in smoke', () => {
    // smoke runs on every commit and its substrate is deterministic by
    // construction; the repetition buys nothing there and costs every commit
    expect(defaultRepeats('smoke')).toBe(1);
    expect(defaultRepeats('full')).toBe(3);
    expect(defaultRepeats('release')).toBe(3);
  });

  it('knows a tier name from a typo', () => {
    expect(isTier('smoke')).toBe(true);
    expect(isTier('nightly')).toBe(false);
  });
});
