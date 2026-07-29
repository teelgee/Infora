// T-245 — the conflict register predicate (ADR-0046). The ethical wall's first
// POSITIVE-EXCLUSION form: every other access rule in this package grants, this
// one alone denies. Holding a live Participant on one project can bar holding
// one on another.
//
// Pure, like resolveAccess: callers load rows, this decides. The threat is the
// one ADR-0018 explicitly does not reach — not organisation-to-organisation on
// one project, but ONE PERSON across two projects, carrying what they know.
// ADR-0026 closed the machine path (what may enter portable org context); this
// closes the human one.
import type { Id } from '@infora/contracts';

export type ConflictGrain = 'organisation' | 'individual';

/**
 * A declared exclusion, as loaded. The pair is stored canonically
 * (projectAId < projectBId, CHECK-enforced) because the relation is unordered
 * — declaring X↔Y and Y↔X is one row (ADR-0046 §9). This predicate therefore
 * never has to consider ordering.
 */
export type ConflictExclusion = {
  id: Id;
  declaringOrganisationId: Id;
  grain: ConflictGrain;
  /** the named person at individual grain; null at organisation grain */
  subjectUserId: Id | null;
  projectAId: Id;
  projectBId: Id;
  withdrawnAt: Date | null;
};

export type ConflictFacts = {
  user: { id: Id; organisationId: Id };
  /** the project access is being sought on, or re-checked for */
  targetProjectId: Id;
  /**
   * Projects where this user already holds a LIVE Participant, excluding the
   * target. The caller supplies these; a closed interval is not access and
   * must not be included (ADR-0033).
   */
  otherLiveProjectIds: readonly Id[];
  /** exclusions to judge against — the caller may pre-filter, this re-checks */
  exclusions: readonly ConflictExclusion[];
};

/**
 * The blocking exclusion, or null.
 *
 * ADR-0046 §7's invariant — "the organisation grain is the ceiling and the
 * individual grain narrows within it, and can never widen it" — holds **by
 * construction rather than by check**: exclusions only ever deny. There is no
 * permit form, so no individual-grain row can license what an
 * organisation-grain row bars. Adding a permit form would break the invariant
 * silently, which is why one does not exist.
 *
 * Fails closed by shape: a malformed individual-grain row with no subject binds
 * nobody rather than everybody (the DB CHECK makes it unreachable; the
 * predicate does not rely on that).
 */
export function conflictBlocks(facts: ConflictFacts): ConflictExclusion | null {
  const { user, targetProjectId, otherLiveProjectIds, exclusions } = facts;
  const held = new Set(otherLiveProjectIds);
  held.delete(targetProjectId); // holding the target is not a conflict with itself

  for (const exclusion of exclusions) {
    if (exclusion.withdrawnAt !== null) continue; // a closed interval denies nothing
    // an exclusion binds only its declaring organisation's own people
    if (exclusion.declaringOrganisationId !== user.organisationId) continue;

    const other = otherSideOf(exclusion, targetProjectId);
    if (other === null) continue; // this exclusion does not name the target
    if (!held.has(other)) continue; // the user holds nothing on the other side

    if (exclusion.grain === 'organisation') return exclusion; // binds every Participant
    if (exclusion.subjectUserId === user.id) return exclusion; // binds this person
  }
  return null;
}

/** The other project in the pair, or null when the pair does not name this one. */
function otherSideOf(exclusion: ConflictExclusion, projectId: Id): Id | null {
  if (exclusion.projectAId === projectId) return exclusion.projectBId;
  if (exclusion.projectBId === projectId) return exclusion.projectAId;
  return null;
}

/**
 * The canonical storage order for a declared pair (ADR-0046 §9). Callers write
 * through this so the CHECK constraint and the live unique index can collapse
 * X↔Y and Y↔X into one row.
 */
export function canonicalPair(one: Id, two: Id): { projectAId: Id; projectBId: Id } {
  return one < two ? { projectAId: one, projectBId: two } : { projectAId: two, projectBId: one };
}

/**
 * The refusal message, fixed here so every path uses the same words (ADR-0046
 * §9). It confirms that a control fired and names nothing it protects — not the
 * conflicting scheme, not the engagement, not the other party. The requester is
 * routed to the only party entitled to explain: their own org admin.
 *
 * The bare unexplained denial was considered and rejected because it leaks
 * MORE: an unexplained refusal gets investigated, and the fact surfaces through
 * conversations within a day, in more inboxes and with no audit trail.
 */
export const CONFLICT_REFUSAL =
  "An ethical wall applies to this grant. Contact your organisation's administrator.";
