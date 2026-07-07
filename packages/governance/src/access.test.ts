// The wall, unit-tested (T-020). Fixtures mirror the seed's shape: an owner
// organisation, a member organisation with a consultant Participant, and the
// wall-test subjects — a member-org user with no Participant, and a third
// organisation with no Membership at all.
import { describe, expect, it } from 'vitest';
import { canReadDeliverable, resolveAccess } from './access';
import type { AccessFacts, EntitledSlice } from './access';

const ownerOrg = 'org-owner';
const memberOrg = 'org-member';
const strangerOrg = 'org-stranger'; // no Membership on the project
const projectId = 'project-1';

const consultantFacts: AccessFacts = {
  user: { id: 'user-consultant', organisationId: memberOrg },
  project: { id: projectId },
  membership: { organisationId: memberOrg, projectId, role: 'member' },
  participant: { id: 'participant-consultant', userId: 'user-consultant', projectId },
};

describe('resolveAccess — the two-level predicate (ADR-0015)', () => {
  it('resolves the consultant Participant on the project', () => {
    expect(resolveAccess(consultantFacts)).toEqual({
      organisationId: memberOrg,
      participantId: 'participant-consultant',
      projectId,
      membershipRole: 'member',
    });
  });

  it('resolves the owner with its role carried on the slice', () => {
    const slice = resolveAccess({
      user: { id: 'user-owner', organisationId: ownerOrg },
      project: { id: projectId },
      membership: { organisationId: ownerOrg, projectId, role: 'owner' },
      participant: { id: 'participant-owner', userId: 'user-owner', projectId },
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

  it('denies edges belonging to a different project or user', () => {
    expect(
      resolveAccess({
        ...consultantFacts,
        membership: { organisationId: memberOrg, projectId: 'project-2', role: 'member' },
      }),
    ).toBeNull();
    expect(
      resolveAccess({
        ...consultantFacts,
        participant: { id: 'participant-other', userId: 'user-other', projectId },
      }),
    ).toBeNull();
    expect(
      resolveAccess({
        ...consultantFacts,
        participant: { id: 'participant-elsewhere', userId: 'user-consultant', projectId: 'project-2' },
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
  };
  const memberSlice: EntitledSlice = {
    organisationId: memberOrg,
    participantId: 'participant-consultant',
    projectId,
    membershipRole: 'member',
  };

  const unshared = {
    projectOwnerOrganisationId: ownerOrg,
    authorOrganisationId: null,
    sharedWithOrganisationIds: [] as const,
  };

  it('the owner organisation sees the whole library', () => {
    expect(canReadDeliverable(ownerSlice, unshared)).toBe(true);
  });

  it('default-deny: a member sees nothing it did not author and was not shared', () => {
    expect(canReadDeliverable(memberSlice, unshared)).toBe(false);
  });

  it('an authoring organisation always sees its own deliverables', () => {
    expect(
      canReadDeliverable(memberSlice, { ...unshared, authorOrganisationId: memberOrg }),
    ).toBe(true);
  });

  it('an owner share opens exactly the named organisation', () => {
    expect(
      canReadDeliverable(memberSlice, { ...unshared, sharedWithOrganisationIds: [memberOrg] }),
    ).toBe(true);
    expect(
      canReadDeliverable(memberSlice, { ...unshared, sharedWithOrganisationIds: [strangerOrg] }),
    ).toBe(false);
  });
});
