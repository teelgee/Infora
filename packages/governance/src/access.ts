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
  participant: { id: Id; userId: Id; projectId: Id; removedAt: Date | null; elevated?: boolean } | null;
};

// What resolution admits: the scope every read is derived from. Nothing wider
// than these ids ever reaches a store query (contracts principle 2).
export type EntitledSlice = {
  organisationId: Id;
  participantId: Id;
  projectId: Id;
  membershipRole: MembershipRole;
  // the elevated (super-user) capability holds destructive lifecycle actions
  // (T-174) — never granted implicitly by role; a per-participant capability
  elevated: boolean;
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
    elevated: participant.elevated ?? false,
  };
}

// Per-deliverable visibility (ADR-0016, extended by ADR-0035): default-deny,
// decided per deliverable, per organisation, then — on the share branch only —
// gated by the receiving organisation's acknowledgement and narrowed by any
// per-participant grants. Drawer 2 does not store these facts directly; the
// caller (retrieval T-031/T-119, the API surfaces) supplies them; the rule is
// fixed here.
export type DeliverableVisibilityFacts = {
  projectOwnerOrganisationId: Id;
  authorOrganisationId: Id | null;
  /** organisations the owner has deliberately shared this deliverable with */
  sharedWithOrganisationIds: readonly Id[];
  /**
   * ADR-0035 §4 — organisations that have acknowledged the transmittal for the
   * deliverable's current version. ORGANISATION grain: presence clears the gate
   * for every entitled Participant of the organisation, by whichever Participant
   * fired it. Producer and owner never appear here and never need to (§2).
   */
  acknowledgedOrganisationIds: readonly Id[];
  /**
   * ADR-0035 §3 — the intra-organisation narrowing for the requester's
   * organisation, if any per-participant grant is present. PARTICIPANT grain.
   * `null` = no narrowing (the whole-organisation default: every entitled
   * Participant sees it); a set = visible only to these Participants.
   */
  narrowedToParticipantIds: readonly Id[] | null;
};

/**
 * An organisation may read a deliverable if it is the owner or the author,
 * with no gate (ADR-0035 §2); or if the owner has shared it AND the receiving
 * organisation has acknowledged the transmittal for the current version AND the
 * Participant is within any narrowing present (ADR-0035 §3–§4). The
 * acknowledgement (organisation grain) and the narrowing (participant grain)
 * are an order-independent conjunction; the acknowledgement never gates the
 * producer or owner branch.
 */
export function canReadDeliverable(
  slice: EntitledSlice,
  deliverable: DeliverableVisibilityFacts,
): boolean {
  // producer and owner see it with no transmittal and no gate (§2)
  if (slice.organisationId === deliverable.projectOwnerOrganisationId) return true;
  if (slice.organisationId === deliverable.authorOrganisationId) return true;

  // the share branch: entitlement is the owner share, then the two conditions
  if (!deliverable.sharedWithOrganisationIds.includes(slice.organisationId)) return false;
  const organisationAcknowledged = deliverable.acknowledgedOrganisationIds.includes(
    slice.organisationId,
  );
  const withinNarrowing =
    deliverable.narrowedToParticipantIds === null ||
    deliverable.narrowedToParticipantIds.includes(slice.participantId);
  return organisationAcknowledged && withinNarrowing;
}
