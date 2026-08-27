// T-255 — the case and fixture schemas as data contracts. No database and no
// harness here: this is about what a file is allowed to say.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { caseSchema, RETRIEVAL_BUDGET, declaredAssertions } from './case';
import { loadFixtureFile } from './fixture';
import { FIXTURES_DIR, loadCases } from './suite';

const perm02 = {
  id: 'PERM-02',
  category: 'permission',
  description: 'x',
  fixture: 'hollowfield-reservoir',
  acting_user: 'env_consultant',
  question: 'q',
  assertions: { must_not_cite: ['commercial_risk_v1'] },
};

describe('the case schema (evals/README.md)', () => {
  it('loads every case in cases/, with unique ids', async () => {
    const cases = await loadCases();
    expect(cases.map((c) => c.id)).toContain('PERM-02');
    // Every case asserts something — except a refused one, which by
    // construction may not (T-259): there is no answer, no citation and no
    // source set, so an assertion over it would be an assertion over nothing.
    for (const evalCase of cases) {
      if (evalCase.expect_refused) {
        expect(declaredAssertions(evalCase)).toEqual([]);
        continue;
      }
      expect(
        declaredAssertions(evalCase).length + (evalCase.lens_invariance === undefined ? 0 : 1),
        evalCase.id,
      ).toBeGreaterThan(0);
    }
  });

  it('rejects an unknown key rather than ignoring it', () => {
    // the failure this guards: `must_not_site:` parses, asserts nothing, and
    // the case passes for ever
    const parsed = caseSchema.safeParse({ ...perm02, assertions: { must_not_site: ['x'] } });
    expect(parsed.success).toBe(false);
  });

  it('refuses a hand-set `flaky` — §8 says the runner sets it, never an author', () => {
    expect(caseSchema.safeParse({ ...perm02, flaky: true }).success).toBe(false);
  });

  it('defaults mode to any and hold_out to false', () => {
    const parsed = caseSchema.parse(perm02);
    expect(parsed.mode).toBe('any');
    expect(parsed.hold_out).toBe(false);
  });
});

describe('the fixture schema (evals/README.md)', () => {
  it('loads the Hollowfield fixture and its access graph', async () => {
    const fixture = await loadFixtureFile(join(FIXTURES_DIR, 'hollowfield-reservoir.yaml'));
    expect(fixture.version).toBe(1);
    expect(fixture.embedding_model).toBe('eval-embed');
    // the two halves the permission case needs: one shared and acknowledged,
    // one shared with nobody
    const shared = fixture.containers.find((c) => c.key === 'water_quality')!;
    const unshared = fixture.containers.find((c) => c.key === 'commercial_risk')!;
    expect(shared.shares.map((s) => s.organisation)).toEqual(['ashcombe']);
    expect(shared.versions[0]!.acknowledged_by.map((a) => a.organisation)).toEqual(['ashcombe']);
    expect(unshared.shares).toEqual([]);
    expect(unshared.producer).not.toBe('ashcombe');
  });
});

// T-312 — a precision floor above `gold ÷ budget` can only fail, and a case
// that can only fail reports a defect in the system under test that is really a
// defect in the assertion. Found by authoring one.
describe('an unsatisfiable precision floor is refused at authoring time (T-312)', () => {
  const base = {
    id: 'X-01',
    category: 'happy',
    description: 'x',
    fixture: 'f',
    acting_user: 'u',
    question: 'q',
  };

  it('refuses a floor above the ceiling, and names the arithmetic', () => {
    const result = caseSchema.safeParse({
      ...base,
      assertions: { gold_passages: ['v1#0'], min_precision: 0.25 },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain('unsatisfiable');
    expect(result.error.message).toContain(`budget of ${RETRIEVAL_BUDGET}`);
  });

  it('admits a floor at or below the ceiling', () => {
    // three gold passages in a budget of eight caps precision at 0.375
    expect(
      caseSchema.safeParse({
        ...base,
        assertions: { gold_passages: ['v1#0', 'v1#1', 'v2#0'], min_precision: 0.25 },
      }).success,
    ).toBe(true);
  });

  it('leaves a recall-only case alone — recall has no such ceiling', () => {
    expect(
      caseSchema.safeParse({ ...base, assertions: { gold_passages: ['v1#0'], min_recall: 1.0 } })
        .success,
    ).toBe(true);
  });
});
