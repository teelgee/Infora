// T-248 — scope attenuation on `EntitledSlice` (Wave 0 finding F8).
//
// A HARDENING, NOT A GAP. Escalation is already structurally impossible: a
// worker runs inside the caller's one assembly environment (ADR-0025) and the
// gateway carries no scope-widening parameter (ADR-0029 §2), so the scope a
// sub-step inherits is *equal* to the caller's and equal scope leaks nothing.
// What was missing is the other direction — the ability to hand a step LESS
// than the caller holds, so a worker that only needs three named documents is
// not handed the whole entitled library.
//
// Three properties, and each is the reason a line below is written the way it
// is rather than the obvious way:
//
//   1. INTERSECTED, NEVER UNIONED. Composing two narrowings keeps what both
//      admit. A union would let a second narrowing hand back reach the first
//      removed, which is escalation arriving through the door marked "narrow".
//   2. MONOTONIC. attenuate(attenuate(s, a), b) ⊆ attenuate(s, a) ⊆ s, for
//      every a and b. There is no value of `narrowing` that widens.
//   3. ABSENT IS NOT EMPTY. An absent `containerIds` means "not narrowed on
//      containers" and an empty one means "narrowed to nothing" — which
//      grounds on nothing rather than on everything. Conflating the two is
//      how a narrowing quietly becomes a no-op.
//
// The attenuation rides the RESOLVED slice, never the request. Since T-469 the
// request may carry a person's `scope` (ADR-0029's addendum of 2026-10-24), and
// the invariant pinned by wall.test.ts is the one above, stated for both
// spellings: a narrowing is an INTERSECTION with the access-resolved set, never
// a union — `scope ∩ visible == what is retrieved`. A scope naming a document
// the requester may not see retrieves, and counts, nothing from it.
import type { Id } from '@infora/contracts';
import type { EntitledSlice } from './access';

/**
 * An optional narrowing of an already-resolved slice. Every field can only
 * ever remove reach; there is deliberately no field that adds any.
 */
export type Attenuation = {
  /**
   * The containers this sub-scope may reach. **Absent means "no container
   * narrowing"**, not "every container" — the slice's own project pre-filter
   * already bounds that, and this set can only cut into it.
   */
  containerIds?: readonly Id[];
  /**
   * Whether the elevated (super-user) capability travels into the sub-scope.
   * Only `false` does anything: `true` cannot grant it to a slice that does
   * not already hold it (T-174 — elevation is never granted implicitly).
   */
  elevated?: boolean;
};

/**
 * Narrow a resolved slice. The result is provably a subset of the input for
 * every possible `narrowing`, which is what makes this composable without a
 * caller having to reason about ordering.
 */
export function attenuate(slice: EntitledSlice, narrowing: Attenuation): EntitledSlice {
  const containerIds = intersectContainers(slice.attenuation?.containerIds, narrowing.containerIds);
  return {
    ...slice,
    // `&&`, never assignment: a narrowing asking for elevation it was not
    // given gets the answer the resolver already gave.
    elevated: slice.elevated && (narrowing.elevated ?? true),
    attenuation: {
      ...(containerIds !== null && { containerIds }),
    },
  };
}

/**
 * The containers a slice may reach, or `null` where it is unnarrowed. Callers
 * building a pre-filter must distinguish the two: `null` adds no clause, an
 * empty array admits nothing.
 */
export function reachableContainerIds(slice: EntitledSlice): readonly Id[] | null {
  return slice.attenuation?.containerIds ?? null;
}

function intersectContainers(
  held: readonly Id[] | undefined,
  narrowing: readonly Id[] | undefined,
): readonly Id[] | null {
  if (narrowing === undefined) return held ?? null;
  if (held === undefined) return [...new Set(narrowing)];
  const kept = new Set(held);
  return [...new Set(narrowing)].filter((id) => kept.has(id));
}
