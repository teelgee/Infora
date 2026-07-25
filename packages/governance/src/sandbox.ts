// T-145 — the sandbox access predicate (ADR-0036): who may see a participant-
// private sandbox. A pure function of the live scope grants, resolved before
// any store is touched, exactly like canReadDeliverable (access.ts). Deny is
// false; the API renders it as the same 404 as nonexistence.
//
// The ladder (multi-org ⊃ single-org ⊃ team ⊃ named-user) is not a field to
// branch on — it is emergent from the grant set: a participant is in the
// sandbox if their organisation holds a live organisation-grant, OR they hold a
// live participant-grant. Widening adds a grant; revoking closes one
// (removed_at), and because the store is colocated (ADR-0024) the effect is
// immediate. Separation is by provisioning a narrower sandbox, never by walling
// a shared one, so there is no within-sandbox exclusion to express here.

import type { EntitledSlice } from './access';

// A live grant only — the caller filters to removed_at IS NULL, or passes the
// removedAt through and this function ignores closed intervals.
export type SandboxScopeGrant = {
  granteeType: 'organisation' | 'participant';
  organisationId: string | null;
  participantId: string | null;
  removedAt: Date | null;
};

/**
 * A participant may access a sandbox if, among its scope grants, a live grant
 * admits them — either a live organisation-grant for their organisation, or a
 * live participant-grant for them. Closed intervals (removed_at set) admit
 * nothing, so a revocation drops access in the same read (ADR-0036). The
 * owning organisation's own membership does not implicitly admit it: presence
 * in the sandbox is exactly the grant set, which is what keeps a narrower
 * sandbox a strict subset of a broader one.
 */
export function canAccessSandbox(
  slice: EntitledSlice,
  grants: readonly SandboxScopeGrant[],
): boolean {
  for (const g of grants) {
    if (g.removedAt !== null) continue;
    if (
      g.granteeType === 'organisation' &&
      g.organisationId !== null &&
      g.organisationId === slice.organisationId
    ) {
      return true;
    }
    if (
      g.granteeType === 'participant' &&
      g.participantId !== null &&
      g.participantId === slice.participantId
    ) {
      return true;
    }
  }
  return false;
}

// T-181 — who may configure a sandbox's settings (ADR-0040). A super-user act,
// split along the wall exactly like sandbox provisioning (ADR-0036 §5): the
// project owner super-user may configure any sandbox (the owner-super override),
// and a guest super-user may configure a sandbox its own organisation owns. An
// ordinary participant never configures — settings are a super-user surface. The
// setting itself (e.g. allow_member_folder_create) then governs the ordinary
// participant's reach within the sandbox.
export function canConfigureSandbox(
  slice: Pick<EntitledSlice, 'organisationId' | 'membershipRole' | 'elevated'>,
  sandbox: { owningOrganisationId: string },
): boolean {
  if (!slice.elevated) return false; // configuration is a super-user act
  if (slice.membershipRole === 'owner') return true; // owner-super override
  return slice.organisationId === sandbox.owningOrganisationId; // guest-super, own sandbox
}

// The multiplayer thread's visibility (ADR-0039, T-150). A document-bound
// conversation is a shared thread visible to the document's sandbox participant
// scope; an ad-hoc conversation is org-private (T-104). Run internals stay
// producing-organisation-private in both cases, and the informing channel is
// resolved per-invoker (the run's requester), never pooled by the thread — a
// shared thread shares outputs, never one organisation's private steer.
export type ConversationVisibility =
  | { kind: 'multiplayer'; sandboxGrants: readonly SandboxScopeGrant[] }
  | { kind: 'ad_hoc'; organisationId: string };

export function canSeeConversation(slice: EntitledSlice, visibility: ConversationVisibility): boolean {
  if (visibility.kind === 'multiplayer') {
    return canAccessSandbox(slice, visibility.sandboxGrants);
  }
  return slice.organisationId === visibility.organisationId;
}
