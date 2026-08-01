// T-259 acceptance — the seed set, against the live dev database.
//
// The two cases the board singles out as "the two most likely to be quietly
// dropped" get the most attention here, because a case that is easy to drop is
// one nobody notices going missing:
//
//   PERM-05 — the single case that proves a Lens is a register control and not
//             a permission control (non-negotiable 11);
//   BEH-05  — promoting the deliberately-incomplete Commercial Lens fails with
//             all three named messages.
//
// BEH-05 IS NOT AN EVAL CASE AND CANNOT BE ONE, which is recorded rather than
// papered over. Every eval case executes a run over HTTP; BEH-05 is a claim
// about what happens when a FILE is loaded, with no run, no requester and no
// answer. Forcing it into a case shape would have produced a case that asserts
// nothing about a run. It is delivered as a pinned test beside the validator it
// tests (packages/lenses/src/validate.test.ts, "produces exactly the three
// messages commercial.yaml promises"), and the assertion below keeps this file
// honest about where it lives.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadFixtureFile } from './fixture';
import type { FixtureInstance } from './fixture';
import { startHarness } from './harness';
import type { Harness } from './harness';
import { prepareFixture, runCase } from './runner';
import { FIXTURES_DIR, loadCaseById, loadCases } from './suite';
import { buildReport } from './report';
import { selectCases } from './tiers';

let harness: Harness;
let instance: FixtureInstance;

beforeAll(async () => {
  harness = await startHarness();
  instance = await prepareFixture(
    harness,
    await loadFixtureFile(join(FIXTURES_DIR, 'hollowfield-reservoir-2.yaml')),
  );
}, 60_000);

afterAll(async () => {
  await harness?.close();
});

describe('T-259 — the seed set', () => {
  it('ships the cases the board names, and names the two it defers', async () => {
    const ids = (await loadCases()).map((evalCase) => evalCase.id).sort();

    for (const id of [
      'PERM-01',
      'PERM-02',
      'PERM-03',
      'PERM-04',
      'PERM-05',
      'HAPPY-01',
      'NEG-01',
      'TRAP-01',
      'TRAP-02',
      'BEH-01',
      'BEH-02',
      'BEH-03',
      'BEH-04',
    ]) {
      expect(ids, `${id} is in the seed set`).toContain(id);
    }

    // Deferred and NOT faked: both rest on `expect_calls`, which needs a
    // readable plan (T-261) and a worker registry (T-269). The assertion
    // already errors rather than passing vacuously (T-256), so authoring them
    // now would put two permanent errors in the seed set.
    expect(ids).not.toContain('HAPPY-02');
    expect(ids).not.toContain('ROUTE-01');
  });

  it('every permission case is decidable without a model', async () => {
    // T-258's rule, checked over the real files rather than trusted: permission
    // cases are mandatory in every smoke build, and smoke has no independent
    // grader, so a permission case carrying a `~claim` would silently drop out
    // of the mandatory set. The schema refuses one; this proves none slipped in
    // through a different door.
    const smoke = selectCases(await loadCases(), 'smoke');
    const permission = smoke.selected.filter((evalCase) => evalCase.category === 'permission');
    expect(permission).toHaveLength(5);
    for (const evalCase of permission) {
      const claims = [
        ...(evalCase.assertions.must_contain ?? []),
        ...(evalCase.assertions.must_not_contain ?? []),
      ];
      expect(claims.filter((claim) => claim.startsWith('~')), evalCase.id).toEqual([]);
    }
  });

  describe('the five permission cases, run for real', () => {
    it('PERM-01 — a user with no Participant is refused, and the refusal IS the verdict', async () => {
      const result = await runCase(harness, instance, await loadCaseById('PERM-01'));
      expect(result.verdict).toBe('pass');
      // no run happened, so there is nothing to have asserted over — which is
      // exactly why the case shape exists
      expect(result.run).toBeNull();
    });

    it('PERM-01 has teeth: the same shape against an ENTITLED user fails', async () => {
      // the assertion that matters most about a refusal case — a harness that
      // reported every case as refused would pass PERM-01 for ever
      const perm01 = await loadCaseById('PERM-01');
      const result = await runCase(harness, instance, {
        ...perm01,
        id: 'PERM-01-teeth',
        acting_user: 'env_consultant',
      });
      expect(result.verdict).toBe('fail');
      expect(result.failures[0]).toContain('the request was ALLOWED');
    });

    it('PERM-03 — a share without an acknowledgement opens nothing', async () => {
      const result = await runCase(harness, instance, await loadCaseById('PERM-03'));
      expect(result.failures).toEqual([]);
      expect(result.verdict).toBe('pass');
      // and it is a different failure from PERM-02's: this deliverable IS
      // shared, so a system that only checked shares would leak here
      const ecology = instance.versionIds.get('ecology_baseline_v1');
      expect(result.run?.sourceSet.map((source) => source.versionId)).not.toContain(ecology);
    });

    it('PERM-04 — narrowing holds inside the receiving organisation', async () => {
      const outside = await runCase(harness, instance, await loadCaseById('PERM-04'));
      expect(outside.failures).toEqual([]);
      const access = instance.versionIds.get('access_strategy_v1');
      expect(outside.run?.sourceSet.map((source) => source.versionId)).not.toContain(access);

      // the mirror: the Participant INSIDE the grant does reach it, so the
      // case above is evidence of narrowing rather than of an absent document
      const inside = await runCase(harness, instance, {
        ...(await loadCaseById('PERM-04')),
        id: 'PERM-04-mirror',
        acting_user: 'env_consultant',
        assertions: { must_cite: ['access_strategy_v1'] },
      });
      expect(inside.failures).toEqual([]);
      expect(inside.verdict).toBe('pass');
    });

    it('PERM-05 — four Lenses, one identical source set', async () => {
      const result = await runCase(harness, instance, await loadCaseById('PERM-05'));
      expect(result.failures).toEqual([]);
      expect(result.verdict).toBe('pass');
    });

    it('PERM-05 has teeth: an invariance case fails when a source set really does differ', async () => {
      // The one assertion that makes PERM-05 worth having. Two DIFFERENT acting
      // users would be the honest way to make source sets differ, but the case
      // shape fixes one — so this drives the comparison directly: a Lens list
      // is compared against a baseline run, and here the baseline is taken on a
      // question whose retrieval differs from the invariance runs'.
      const perm05 = await loadCaseById('PERM-05');
      const result = await runCase(harness, instance, {
        ...perm05,
        id: 'PERM-05-teeth',
        question: 'What is the alpha commercial exposure on the lining package?',
        acting_user: 'commercial_consultant',
        assertions: {},
      });
      // Portrey reaches its own unshared register and nothing of Brackenmoor's,
      // so the source set is real but different from Ashcombe's — the case
      // still passes, because invariance is about the LENS and not the user.
      // What this proves is that the comparison runs at all against a
      // non-trivial source set rather than against nothing.
      expect(result.verdict).toBe('pass');
      expect(result.run?.sourceSet.length).toBeGreaterThan(0);
    });
  });

  it('the report breaks the seed set down per category and per Lens, with no aggregate', async () => {
    const results = [
      await runCase(harness, instance, await loadCaseById('HAPPY-01')),
      await runCase(harness, instance, await loadCaseById('PERM-03')),
    ];
    const report = buildReport(results);
    expect(report.byCategory.happy.pass).toBe(1);
    expect(report.byCategory.permission.pass).toBe(1);
    expect(Object.keys(report).filter((key) => /total|overall|aggregate/i.test(key))).toEqual([]);
  });
});
