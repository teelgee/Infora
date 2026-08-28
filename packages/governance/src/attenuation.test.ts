// T-248 — the narrowing is provably a narrowing (finding F8). The claims worth
// testing are the three the module exists to make: intersection rather than
// union, monotonicity under composition, and absent ≠ empty.
import { describe, expect, it } from 'vitest';
import { attenuate, reachableContainerIds } from './attenuation';
import type { Attenuation } from './attenuation';
import type { EntitledSlice } from './access';

const base: EntitledSlice = {
  organisationId: 'org-b',
  participantId: 'part-1',
  projectId: 'proj-1',
  membershipRole: 'member',
  elevated: true,
};

/** Does `narrowed` admit a subset of what `wider` admits, on every axis? */
function narrowerOrEqual(narrowed: EntitledSlice, wider: EntitledSlice): boolean {
  if (narrowed.organisationId !== wider.organisationId) return false;
  if (narrowed.participantId !== wider.participantId) return false;
  if (narrowed.projectId !== wider.projectId) return false;
  if (narrowed.membershipRole !== wider.membershipRole) return false;
  if (narrowed.elevated && !wider.elevated) return false;
  const held = reachableContainerIds(wider);
  const after = reachableContainerIds(narrowed);
  if (held === null) return true; // anything is a subset of "unnarrowed"
  if (after === null) return false; // dropping the narrowing would be widening
  return after.every((id) => held.includes(id));
}

describe('scope attenuation (T-248, finding F8)', () => {
  it('a resolved slice is unattenuated — resolution says what is held, not what is spent', () => {
    expect(base.attenuation).toBeUndefined();
    expect(reachableContainerIds(base)).toBeNull();
  });

  it('narrowing to a container set restricts reach to that set', () => {
    const narrowed = attenuate(base, { containerIds: ['c1', 'c2'] });
    expect(reachableContainerIds(narrowed)).toEqual(['c1', 'c2']);
    expect(narrowerOrEqual(narrowed, base)).toBe(true);
  });

  it('composition INTERSECTS and never unions — the second narrowing cannot hand back what the first removed', () => {
    const once = attenuate(base, { containerIds: ['c1', 'c2'] });
    const twice = attenuate(once, { containerIds: ['c2', 'c3'] });
    // 'c3' was outside the first narrowing, so it stays outside: a union would
    // have produced ['c1','c2','c3'], which is escalation through the door
    // marked "narrow".
    expect(reachableContainerIds(twice)).toEqual(['c2']);
    expect(narrowerOrEqual(twice, once)).toBe(true);
    expect(narrowerOrEqual(twice, base)).toBe(true);
  });

  it('narrowing to a disjoint set admits NOTHING, not everything', () => {
    const once = attenuate(base, { containerIds: ['c1'] });
    const twice = attenuate(once, { containerIds: ['c9'] });
    expect(reachableContainerIds(twice)).toEqual([]);
  });

  it('absent is not empty — narrowing on elevation alone leaves containers unnarrowed', () => {
    const narrowed = attenuate(base, { elevated: false });
    expect(reachableContainerIds(narrowed)).toBeNull();
    expect(narrowed.elevated).toBe(false);
  });

  it('elevation can only be dropped, never granted', () => {
    const ordinary: EntitledSlice = { ...base, elevated: false };
    expect(attenuate(ordinary, { elevated: true }).elevated).toBe(false);
    expect(attenuate(base, {}).elevated).toBe(true);
  });

  it('MONOTONIC: no narrowing widens, over every pair drawn from a spread of cases', () => {
    const cases: Attenuation[] = [
      {},
      { elevated: false },
      { elevated: true },
      { containerIds: [] },
      { containerIds: ['c1'] },
      { containerIds: ['c1', 'c2'] },
      { containerIds: ['c2', 'c3'] },
      { containerIds: ['c9'], elevated: false },
      { containerIds: ['c1', 'c1'] }, // duplicates are not a widening either
    ];
    for (const first of cases) {
      const once = attenuate(base, first);
      expect(narrowerOrEqual(once, base)).toBe(true);
      for (const second of cases) {
        const twice = attenuate(once, second);
        expect(narrowerOrEqual(twice, once)).toBe(true);
        expect(narrowerOrEqual(twice, base)).toBe(true);
      }
    }
  });

  it('the identity fields are untouched — a narrowing is not a way to become someone else', () => {
    const narrowed = attenuate(base, { containerIds: ['c1'], elevated: false });
    expect(narrowed.organisationId).toBe(base.organisationId);
    expect(narrowed.participantId).toBe(base.participantId);
    expect(narrowed.projectId).toBe(base.projectId);
    expect(narrowed.membershipRole).toBe(base.membershipRole);
  });
});
