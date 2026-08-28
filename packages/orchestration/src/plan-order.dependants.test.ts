// T-268 — the transitive closure. Skipping only the IMMEDIATE dependants would
// leave a step two edges downstream to fail on an input that never arrived,
// which reports one outage twice under two different names.
import { describe, expect, it } from 'vitest';
import { dependantsOf } from './plan-order';
import type { PlannedStep } from './plan-order';

const step = (id: string, ordinal: number, dependsOn: string[] = []): PlannedStep => ({
  id,
  ordinal,
  stage: 'analyse',
  dependsOn,
});

describe('dependantsOf (T-268)', () => {
  it('is transitive — two edges downstream is just as unable to run as one', () => {
    const chain = [step('a', 0), step('b', 1, ['a']), step('c', 2, ['b'])];
    expect([...dependantsOf(chain, new Set(['a']))].sort()).toEqual(['b', 'c']);
  });

  it('leaves an INDEPENDENT branch alone — the whole point of the semantics', () => {
    // one failed web search must not discard a completed corpus search
    const fan = [
      step('root', 0),
      step('web', 1, ['root']),
      step('corpus', 2, ['root']),
      step('answer', 3, ['corpus']),
    ];
    expect([...dependantsOf(fan, new Set(['web']))]).toEqual([]);
  });

  it('a join downstream of a failure is skipped, even where its other input survived', () => {
    const diamond = [
      step('root', 0),
      step('left', 1, ['root']),
      step('right', 2, ['root']),
      step('join', 3, ['left', 'right']),
    ];
    // partial inputs are not the same as inputs: a join that ran on half of
    // what it declared would produce an answer nobody could account for
    expect([...dependantsOf(diamond, new Set(['left']))]).toEqual(['join']);
  });

  it('the failed step is not among its own dependants', () => {
    expect([...dependantsOf([step('a', 0)], new Set(['a']))]).toEqual([]);
  });

  it('nothing failed, nothing skipped', () => {
    const chain = [step('a', 0), step('b', 1, ['a'])];
    expect([...dependantsOf(chain, new Set())]).toEqual([]);
  });
});
