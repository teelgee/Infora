// T-245 — the conflict register predicate (ADR-0046). The wall's first
// positive-exclusion form, so the negative cases matter more than the positive
// ones: a rule that denies must deny exactly what it should and nothing else.
import { describe, expect, it } from 'vitest';
import { CONFLICT_REFUSAL, canonicalPair, conflictBlocks } from './conflict';
import type { ConflictExclusion } from './conflict';

const ORG = 'org-calderhale';
const OTHER_ORG = 'org-halvern';
const ALICE = 'user-alice';
const BOB = 'user-bob';
const PROMOTER = 'project-a-promoter';
const OBJECTOR = 'project-b-objector';
const UNRELATED = 'project-c-unrelated';

// stored canonically (project_a_id < project_b_id) as the CHECK enforces
const pair = canonicalPair(PROMOTER, OBJECTOR);

function exclusion(over: Partial<ConflictExclusion> = {}): ConflictExclusion {
  return {
    id: 'x-1',
    declaringOrganisationId: ORG,
    grain: 'individual',
    subjectUserId: ALICE,
    ...pair,
    withdrawnAt: null,
    ...over,
  };
}

const alice = { id: ALICE, organisationId: ORG };

describe('conflictBlocks — the positive-exclusion predicate (ADR-0046)', () => {
  it('blocks the named person holding the other side (§7, individual grain)', () => {
    expect(
      conflictBlocks({
        user: alice,
        targetProjectId: PROMOTER,
        otherLiveProjectIds: [OBJECTOR],
        exclusions: [exclusion()],
      }),
    ).not.toBeNull();
  });

  it('does not block when the user holds nothing on the other side', () => {
    expect(
      conflictBlocks({
        user: alice,
        targetProjectId: PROMOTER,
        otherLiveProjectIds: [UNRELATED],
        exclusions: [exclusion()],
      }),
    ).toBeNull();
  });

  it('does not block a different person at individual grain — the whole point of §7', () => {
    expect(
      conflictBlocks({
        user: { id: BOB, organisationId: ORG },
        targetProjectId: PROMOTER,
        otherLiveProjectIds: [OBJECTOR],
        exclusions: [exclusion()], // names Alice
      }),
    ).toBeNull();
  });

  it('blocks every person of the firm at organisation grain (§7 ceiling)', () => {
    const orgWide = exclusion({ grain: 'organisation', subjectUserId: null });
    for (const id of [ALICE, BOB]) {
      expect(
        conflictBlocks({
          user: { id, organisationId: ORG },
          targetProjectId: PROMOTER,
          otherLiveProjectIds: [OBJECTOR],
          exclusions: [orgWide],
        }),
      ).not.toBeNull();
    }
  });

  it('an individual row can never widen past the organisation ceiling (§7)', () => {
    // the invariant holds BY CONSTRUCTION: exclusions only ever deny, so no
    // individual-grain row can license what an organisation-grain row bars.
    // Bob is named by neither individual row, yet the org row still binds him.
    const blocking = conflictBlocks({
      user: { id: BOB, organisationId: ORG },
      targetProjectId: PROMOTER,
      otherLiveProjectIds: [OBJECTOR],
      exclusions: [
        exclusion({ grain: 'organisation', subjectUserId: null }),
        exclusion({ id: 'x-2', subjectUserId: ALICE }),
      ],
    });
    expect(blocking?.grain).toBe('organisation');
  });

  it('a withdrawn exclusion denies nothing, and the row survives (§5)', () => {
    const withdrawn = exclusion({ withdrawnAt: new Date('2026-07-01') });
    expect(
      conflictBlocks({
        user: alice,
        targetProjectId: PROMOTER,
        otherLiveProjectIds: [OBJECTOR],
        exclusions: [withdrawn],
      }),
    ).toBeNull();
    // the row is still there to attribute a past refusal to
    expect(withdrawn.id).toBe('x-1');
  });

  it("never binds another organisation's people — an exclusion is the declaring firm's own wall", () => {
    expect(
      conflictBlocks({
        user: { id: ALICE, organisationId: OTHER_ORG },
        targetProjectId: PROMOTER,
        otherLiveProjectIds: [OBJECTOR],
        exclusions: [exclusion()],
      }),
    ).toBeNull();
  });

  it('is symmetric: the pair binds whichever side is the target (§9)', () => {
    const facts = { user: alice, exclusions: [exclusion()] };
    expect(
      conflictBlocks({ ...facts, targetProjectId: PROMOTER, otherLiveProjectIds: [OBJECTOR] }),
    ).not.toBeNull();
    expect(
      conflictBlocks({ ...facts, targetProjectId: OBJECTOR, otherLiveProjectIds: [PROMOTER] }),
    ).not.toBeNull();
  });

  it('ignores an exclusion that does not name the target project at all', () => {
    expect(
      conflictBlocks({
        user: alice,
        targetProjectId: UNRELATED,
        otherLiveProjectIds: [PROMOTER, OBJECTOR],
        exclusions: [exclusion()],
      }),
    ).toBeNull();
  });

  it('the target appearing in otherLiveProjectIds is not a conflict with itself', () => {
    expect(
      conflictBlocks({
        user: alice,
        targetProjectId: PROMOTER,
        otherLiveProjectIds: [PROMOTER],
        exclusions: [exclusion({ ...canonicalPair(PROMOTER, PROMOTER) })],
      }),
    ).toBeNull();
  });

  it('fails closed by shape: a subjectless individual row binds nobody, not everybody', () => {
    // unreachable through the DB (a CHECK forbids it) — asserted so the
    // predicate does not silently depend on the constraint for its safety
    expect(
      conflictBlocks({
        user: alice,
        targetProjectId: PROMOTER,
        otherLiveProjectIds: [OBJECTOR],
        exclusions: [exclusion({ subjectUserId: null })],
      }),
    ).toBeNull();
  });

  it('returns the blocking exclusion so a refusal can be audited to it', () => {
    const blocking = conflictBlocks({
      user: alice,
      targetProjectId: PROMOTER,
      otherLiveProjectIds: [OBJECTOR],
      exclusions: [exclusion({ id: 'x-audit' })],
    });
    expect(blocking?.id).toBe('x-audit');
  });
});

describe('canonicalPair — symmetry by construction (§9)', () => {
  it('orders the pair so X↔Y and Y↔X are the same row', () => {
    expect(canonicalPair(PROMOTER, OBJECTOR)).toEqual(canonicalPair(OBJECTOR, PROMOTER));
  });

  it('puts the lesser id first, matching the CHECK constraint', () => {
    const { projectAId, projectBId } = canonicalPair(OBJECTOR, PROMOTER);
    expect(projectAId < projectBId).toBe(true);
  });
});

describe('the refusal message (§9)', () => {
  it('names that a wall applies and routes to the requester’s own org admin', () => {
    expect(CONFLICT_REFUSAL).toMatch(/ethical wall/i);
    expect(CONFLICT_REFUSAL).toMatch(/administrator/i);
  });

  it('names nothing it protects — no scheme, project, party or engagement', () => {
    for (const leak of [PROMOTER, OBJECTOR, ORG, ALICE, 'scheme', 'objector', 'promoter']) {
      expect(CONFLICT_REFUSAL.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });
});
