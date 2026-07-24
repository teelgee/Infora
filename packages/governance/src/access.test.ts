// The wall, unit-tested (T-020). Fixtures mirror the seed's shape: an owner
// organisation, a member organisation with a consultant Participant, and the
// wall-test subjects — a member-org user with no Participant, and a third
// organisation with no Membership at all.
import { describe, expect, it } from 'vitest';
import {
  canEditPlan,
  canEditScheme,
  canProposeScheme,
  canReadDeliverable,
  resolveAccess,
  userClass,
} from './access';
import type { AccessFacts, EntitledSlice } from './access';

const ownerOrg = 'org-owner';
const memberOrg = 'org-member';
const strangerOrg = 'org-stranger'; // no Membership on the project
const projectId = 'project-1';

const consultantFacts: AccessFacts = {
  user: { id: 'user-consultant', organisationId: memberOrg },
  project: { id: projectId },
  membership: { organisationId: memberOrg, projectId, role: 'member', state: 'active' },
  participant: { id: 'participant-consultant', userId: 'user-consultant', projectId, removedAt: null },
};

describe('resolveAccess — the two-level predicate (ADR-0015)', () => {
  it('resolves the consultant Participant on the project', () => {
    expect(resolveAccess(consultantFacts)).toEqual({
      organisationId: memberOrg,
      participantId: 'participant-consultant',
      projectId,
      membershipRole: 'member',
      elevated: false,
    });
  });

  it('resolves the owner with its role carried on the slice', () => {
    const slice = resolveAccess({
      user: { id: 'user-owner', organisationId: ownerOrg },
      project: { id: projectId },
      membership: { organisationId: ownerOrg, projectId, role: 'owner', state: 'active' },
      participant: { id: 'participant-owner', userId: 'user-owner', projectId, removedAt: null },
    });
    expect(slice?.membershipRole).toBe('owner');
  });

  it('denies a member-org user with no Participant (the seeded wall subject)', () => {
    expect(resolveAccess({ ...consultantFacts, participant: null })).toBeNull();
  });

  it('denies a user whose organisation has no Membership on the project', () => {
    expect(
      resolveAccess({
        user: { id: 'user-stranger', organisationId: strangerOrg },
        project: { id: projectId },
        membership: null,
        participant: null,
      }),
    ).toBeNull();
  });

  it('denies when the project itself is unknown', () => {
    expect(resolveAccess({ ...consultantFacts, project: null })).toBeNull();
  });

  it("denies a Membership that is not the user's own organisation — the subset invariant", () => {
    // a Participant grant can never outrun the user's organisation (ADR-0015):
    // pairing the stranger's user with the member org's Membership resolves nothing
    expect(
      resolveAccess({
        ...consultantFacts,
        user: { id: 'user-consultant', organisationId: strangerOrg },
      }),
    ).toBeNull();
  });

  it('denies a proposed Membership — the seat confers nothing until the owner confirms (ADR-0033)', () => {
    expect(
      resolveAccess({
        ...consultantFacts,
        membership: { organisationId: memberOrg, projectId, role: 'member', state: 'proposed' },
      }),
    ).toBeNull();
  });

  it('denies a removed Participant — a closed interval is no access, while the row survives (ADR-0033)', () => {
    expect(
      resolveAccess({
        ...consultantFacts,
        participant: {
          id: 'participant-consultant',
          userId: 'user-consultant',
          projectId,
          removedAt: new Date('2026-07-18T09:00:00Z'),
        },
      }),
    ).toBeNull();
  });

  it('denies edges belonging to a different project or user', () => {
    expect(
      resolveAccess({
        ...consultantFacts,
        membership: { organisationId: memberOrg, projectId: 'project-2', role: 'member', state: 'active' },
      }),
    ).toBeNull();
    expect(
      resolveAccess({
        ...consultantFacts,
        participant: { id: 'participant-other', userId: 'user-other', projectId, removedAt: null },
      }),
    ).toBeNull();
    expect(
      resolveAccess({
        ...consultantFacts,
        participant: { id: 'participant-elsewhere', userId: 'user-consultant', projectId: 'project-2', removedAt: null },
      }),
    ).toBeNull();
  });
});

describe('canReadDeliverable — per-deliverable visibility (ADR-0016)', () => {
  const ownerSlice: EntitledSlice = {
    organisationId: ownerOrg,
    participantId: 'participant-owner',
    projectId,
    membershipRole: 'owner',
    elevated: false,
  };
  const memberSlice: EntitledSlice = {
    organisationId: memberOrg,
    participantId: 'participant-consultant',
    projectId,
    membershipRole: 'member',
    elevated: false,
  };

  const unshared = {
    projectOwnerOrganisationId: ownerOrg,
    authorOrganisationId: null,
    sharedWithOrganisationIds: [] as const,
    acknowledgedOrganisationIds: [] as const,
    narrowedToParticipantIds: null,
  };

  // a share the receiving org has acknowledged, no narrowing (the whole-org
  // default) — the ADR-0035 baseline that grounds
  const acknowledgedShare = {
    ...unshared,
    sharedWithOrganisationIds: [memberOrg],
    acknowledgedOrganisationIds: [memberOrg],
  };

  it('the owner organisation sees the whole library, ungated (§2)', () => {
    expect(canReadDeliverable(ownerSlice, unshared)).toBe(true);
  });

  it('default-deny: a member sees nothing it did not author and was not shared', () => {
    expect(canReadDeliverable(memberSlice, unshared)).toBe(false);
  });

  it('an authoring organisation always sees its own deliverables, ungated (§2)', () => {
    expect(
      canReadDeliverable(memberSlice, { ...unshared, authorOrganisationId: memberOrg }),
    ).toBe(true);
  });

  it('an acknowledged owner share opens exactly the named organisation', () => {
    expect(canReadDeliverable(memberSlice, acknowledgedShare)).toBe(true);
    expect(
      canReadDeliverable(memberSlice, {
        ...acknowledgedShare,
        sharedWithOrganisationIds: [strangerOrg],
        acknowledgedOrganisationIds: [strangerOrg],
      }),
    ).toBe(false);
  });

  // ── ADR-0035: the acknowledgement gate (§4) ──────────────────────────────
  it('a share withholds visibility until the receiving org acknowledges (§4)', () => {
    // shared but not acknowledged — the gate is closed
    expect(
      canReadDeliverable(memberSlice, { ...unshared, sharedWithOrganisationIds: [memberOrg] }),
    ).toBe(false);
    // acknowledged — the gate opens
    expect(canReadDeliverable(memberSlice, acknowledgedShare)).toBe(true);
  });

  it('the acknowledgement never gates the producer or owner branch (§2)', () => {
    // owner and author see it even with no acknowledgement present
    expect(canReadDeliverable(ownerSlice, unshared)).toBe(true);
    expect(
      canReadDeliverable(memberSlice, { ...unshared, authorOrganisationId: memberOrg }),
    ).toBe(true);
  });

  // ── ADR-0035: intra-organisation narrowing (§3) ──────────────────────────
  it('no narrowing = whole-org default: every entitled participant sees it (§3)', () => {
    expect(canReadDeliverable(memberSlice, acknowledgedShare)).toBe(true);
  });

  it('a narrowing restricts to the granted participants only (§3)', () => {
    // granted
    expect(
      canReadDeliverable(memberSlice, {
        ...acknowledgedShare,
        narrowedToParticipantIds: ['participant-consultant'],
      }),
    ).toBe(true);
    // not granted — same org, same acknowledgement, but outside the narrowing
    expect(
      canReadDeliverable(memberSlice, {
        ...acknowledgedShare,
        narrowedToParticipantIds: ['participant-someone-else'],
      }),
    ).toBe(false);
  });

  // ── ADR-0035: the conjunction is independent (§4) ────────────────────────
  it('within the narrowing but the org has not acknowledged: nothing (§4)', () => {
    expect(
      canReadDeliverable(memberSlice, {
        ...unshared,
        sharedWithOrganisationIds: [memberOrg],
        acknowledgedOrganisationIds: [],
        narrowedToParticipantIds: ['participant-consultant'],
      }),
    ).toBe(false);
  });

  it('acknowledged but the participant is outside the narrowing: nothing (§4)', () => {
    expect(
      canReadDeliverable(memberSlice, {
        ...acknowledgedShare,
        narrowedToParticipantIds: ['participant-someone-else'],
      }),
    ).toBe(false);
  });
});

describe('classes of user — the super-user capability matrix (T-176)', () => {
  const cls = (membershipRole: 'owner' | 'member', elevated: boolean) => ({ membershipRole, elevated });
  const ownerSuper = cls('owner', true);
  const guestSuper = cls('member', true);
  const ownerOrdinary = cls('owner', false);
  const guestOrdinary = cls('member', false);

  it('derives the class from (membershipRole × elevated)', () => {
    expect(userClass(ownerSuper)).toBe('owner_super');
    expect(userClass(guestSuper)).toBe('guest_super');
    expect(userClass(ownerOrdinary)).toBe('ordinary');
    expect(userClass(guestOrdinary)).toBe('ordinary');
  });

  it('editing the plan (TIDP) needs any super-user', () => {
    expect(canEditPlan(ownerSuper)).toBe(true);
    expect(canEditPlan(guestSuper)).toBe(true);
    expect(canEditPlan(guestOrdinary)).toBe(false);
    expect(canEditPlan(ownerOrdinary)).toBe(false);
  });

  it('editing the scheme is the owner super-user only; guests propose', () => {
    expect(canEditScheme(ownerSuper)).toBe(true);
    expect(canEditScheme(guestSuper)).toBe(false); // a guest cannot edit
    expect(canProposeScheme(guestSuper)).toBe(true);
    expect(canProposeScheme(ownerSuper)).toBe(false); // the owner edits directly
    expect(canProposeScheme(guestOrdinary)).toBe(false);
  });
});
