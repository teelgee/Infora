// The sandbox access predicate, unit-tested (T-145, ADR-0036). Fixtures mirror
// a cross-org shared sandbox: Org B and Org C both admitted, plus a stranger
// org, plus a named-participant grant for the team/named-user rungs.
import { describe, expect, it } from 'vitest';
import { canAccessSandbox } from './sandbox';
import type { SandboxScopeGrant } from './sandbox';
import type { EntitledSlice } from './access';

const orgB = 'org-b';
const orgC = 'org-c';
const orgStranger = 'org-stranger';

const sliceB: EntitledSlice = {
  organisationId: orgB,
  participantId: 'participant-b1',
  projectId: 'project-1',
  membershipRole: 'member',
};
const sliceC: EntitledSlice = {
  organisationId: orgC,
  participantId: 'participant-c1',
  projectId: 'project-1',
  membershipRole: 'member',
};
const sliceStranger: EntitledSlice = {
  organisationId: orgStranger,
  participantId: 'participant-x',
  projectId: 'project-1',
  membershipRole: 'member',
};

const orgGrant = (organisationId: string, removedAt: Date | null = null): SandboxScopeGrant => ({
  granteeType: 'organisation',
  organisationId,
  participantId: null,
  removedAt,
});
const participantGrant = (
  participantId: string,
  removedAt: Date | null = null,
): SandboxScopeGrant => ({
  granteeType: 'participant',
  organisationId: null,
  participantId,
  removedAt,
});

describe('canAccessSandbox (ADR-0036)', () => {
  it('admits an organisation that holds a live organisation-grant (single/multi-org rung)', () => {
    const grants = [orgGrant(orgB), orgGrant(orgC)];
    expect(canAccessSandbox(sliceB, grants)).toBe(true);
    expect(canAccessSandbox(sliceC, grants)).toBe(true);
  });

  it('denies an organisation outside the grant set — separation is by a narrower sandbox, not a wall inside', () => {
    expect(canAccessSandbox(sliceStranger, [orgGrant(orgB), orgGrant(orgC)])).toBe(false);
  });

  it('narrower ⊆ broader: a single-org sandbox admits only its org', () => {
    const grants = [orgGrant(orgB)];
    expect(canAccessSandbox(sliceB, grants)).toBe(true);
    expect(canAccessSandbox(sliceC, grants)).toBe(false);
  });

  it('revoking (closing the interval) drops access immediately, without deleting the row', () => {
    const grants = [orgGrant(orgB), orgGrant(orgC, new Date('2026-07-22T00:00:00Z'))];
    expect(canAccessSandbox(sliceB, grants)).toBe(true);
    expect(canAccessSandbox(sliceC, grants)).toBe(false); // C revoked
  });

  it('admits a named participant on the team / named-user rung', () => {
    const grants = [participantGrant('participant-b1')];
    expect(canAccessSandbox(sliceB, grants)).toBe(true); // participant matches
    expect(canAccessSandbox(sliceC, grants)).toBe(false); // different participant
  });

  it('a closed participant-grant admits nothing', () => {
    const grants = [participantGrant('participant-b1', new Date('2026-07-22T00:00:00Z'))];
    expect(canAccessSandbox(sliceB, grants)).toBe(false);
  });

  it('an empty grant set admits no one', () => {
    expect(canAccessSandbox(sliceB, [])).toBe(false);
  });
});
