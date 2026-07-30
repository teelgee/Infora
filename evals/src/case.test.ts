// T-255 — the case and fixture schemas as data contracts. No database and no
// harness here: this is about what a file is allowed to say.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { caseSchema, declaredAssertions } from './case';
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

describe('the case schema (docs/ask/07 §1)', () => {
  it('loads every case in cases/, with unique ids', async () => {
    const cases = await loadCases();
    expect(cases.map((c) => c.id)).toContain('PERM-02');
    for (const evalCase of cases) expect(declaredAssertions(evalCase).length).toBeGreaterThan(0);
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

describe('the fixture schema (docs/ask/07 §3)', () => {
  it('loads the Hollowfield fixture and its access graph', async () => {
    const fixture = await loadFixtureFile(join(FIXTURES_DIR, 'hollowfield-reservoir.yaml'));
    expect(fixture.version).toBe(1);
    expect(fixture.embedding_model).toBe('fake-embed');
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
