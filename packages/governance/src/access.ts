// T-020 — the access-resolution predicate: (organisation, participant,
// project) → entitled slice. The wall (ADR-0015/0016/0018), as a pure
// function of the data: callers load rows, this decides. Resolution runs
// before any store is touched (ADR-0022, ADR-0029 §2) — a hard predicate,
// not a post-filter. Deny is null; the API layer renders it as the same
// 404 as nonexistence (contracts principle 4).

import type { Id } from '@infora/contracts';

export type MembershipRole = 'owner' | 'member';
export type MembershipState = 'proposed' | 'active';

// The rows the predicate judges — shaped after Drawer 1, loaded by the caller
// (the API boundary at T-023, the assembly gateway at T-030).
export type AccessFacts = {
  user: { id: Id; organisationId: Id } | null;
  project: { id: Id } | null;
  /** the requesting user's organisation's Membership on the project, if any */
  membership: { organisationId: Id; projectId: Id; role: MembershipRole; state: MembershipState } | null;
  /** the requesting user's Participant on the project, if any */
  participant: { id: Id; userId: Id; projectId: Id; removedAt: Date | null } | null;
};

// What resolution admits: the scope every read is derived from. Nothing wider
// than these ids ever reaches a store query (contracts principle 2).
export type EntitledSlice = {
  organisationId: Id;
  participantId: Id;
  projectId: Id;
  membershipRole: MembershipRole;
};

/**
 * Level one: Membership sets the organisation's ceiling. Level two: the
 * Participant grant narrows within it. The organisation boundary binds —
 * a Participant row can never admit what the user's organisation is not
 * permitted (ADR-0015's hard subset invariant), so every edge is checked
 * to belong to the same (user, organisation, project) triangle before
 * anything resolves.
 */
export function resolveAccess(facts: AccessFacts): EntitledSlice | null {
  const { user, project, membership, participant } = facts;
  if (!user || !project || !membership || !participant) return null;

  // level one — the organisation is on the project, on an *active* seat:
  // a proposed Membership confers nothing until the owner confirms (ADR-0033)
  if (membership.organisationId !== user.organisationId) return null;
  if (membership.projectId !== project.id) return null;
  if (membership.state !== 'active') return null;

  // level two — this user holds a *live* Participant grant on this project:
  // a Participant is an interval, and a closed interval is no access, while
  // the row survives so past-round attribution stands (ADR-0033)
  if (participant.userId !== user.id) return null;
  if (participant.projectId !== project.id) return null;
  if (participant.removedAt !== null) return null;

  return {
    organisationId: user.organisationId,
    participantId: participant.id,
    projectId: project.id,
    membershipRole: membership.role,
  };
}

// Per-deliverable visibility (ADR-0016): default-deny, decided per
// deliverable, per organisation. Drawer 2 does not yet store authorship or
// owner-share facts (they land with the review drawer, per the
// drawer-by-drawer rule), so the skeleton's library wiring (T-031) supplies
// them explicitly; the rule itself is fixed here.
export type DeliverableVisibilityFacts = {
  projectOwnerOrganisationId: Id;
  authorOrganisationId: Id | null;
  /** organisations the owner has deliberately shared this deliverable with */
  sharedWithOrganisationIds: readonly Id[];
};

/**
 * An organisation may read a deliverable only if it is the owner, the
 * author, or an organisation the owner has shared it with (ADR-0016).
 */
export function canReadDeliverable(
  slice: EntitledSlice,
  deliverable: DeliverableVisibilityFacts,
): boolean {
  return (
    slice.organisationId === deliverable.projectOwnerOrganisationId ||
    slice.organisationId === deliverable.authorOrganisationId ||
    deliverable.sharedWithOrganisationIds.includes(slice.organisationId)
  );
}
