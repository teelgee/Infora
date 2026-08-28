// T-262 — the ordering, on its own. Pure, so the cases that matter are the
// refusals: a plan that cannot be ordered must not be half-run.
import { describe, expect, it } from 'vitest';
import { orderPlanSteps, PlanNotExecutable } from './plan-order';
import type { PlannedStep } from './plan-order';

const step = (
  id: string,
  ordinal: number,
  dependsOn: string[] = [],
  stage: PlannedStep['stage'] = 'analyse',
): PlannedStep => ({ id, ordinal, stage, dependsOn });

describe('orderPlanSteps (T-262)', () => {
  it('walks a chain in dependency order, whatever order the rows arrive in', () => {
    const chain = [
      step('c', 2, ['b']),
      step('a', 0),
      step('b', 1, ['a']),
    ];
    expect(orderPlanSteps(chain).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks ties on ordinal, so an unordered pair still runs the same way every time', () => {
    // b and c are genuinely unordered — no edge between them. Resolving that by
    // row order would make a DECLARED workflow non-repeatable, which is the one
    // property declared mode exists to promise.
    const fan = [step('c', 2, ['a']), step('b', 1, ['a']), step('a', 0)];
    expect(orderPlanSteps(fan).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(orderPlanSteps([...fan].reverse()).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('a diamond runs both branches, each after what it depends on', () => {
    const diamond = [
      step('a', 0),
      step('left', 1, ['a']),
      step('right', 2, ['a']),
      step('join', 3, ['left', 'right']),
    ];
    expect(orderPlanSteps(diamond).map((s) => s.id)).toEqual(['a', 'left', 'right', 'join']);
  });

  it('refuses a cycle, naming the steps caught in it', () => {
    const cycle = [step('a', 0, ['b']), step('b', 1, ['a'])];
    expect(() => orderPlanSteps(cycle)).toThrow(PlanNotExecutable);
    expect(() => orderPlanSteps(cycle)).toThrow(/steps 0, 1 form a dependency cycle/);
  });

  it('refuses an edge naming a step outside this plan', () => {
    const dangling = [step('a', 0), step('b', 1, ['somewhere-else'])];
    expect(() => orderPlanSteps(dangling)).toThrow(/depends on somewhere-else/);
  });

  it('an empty plan orders to nothing rather than throwing — the run fails later, for the honest reason', () => {
    expect(orderPlanSteps([])).toEqual([]);
  });
});
