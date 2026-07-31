// T-249 acceptance, the policy half (finding F2): the lattice, the
// intersection across a source set, and the refusal. Pure functions over
// facts — no database, because this package holds no handle to one.
import { describe, expect, it } from 'vitest';
import {
  ACCESS_LABELS,
  checkPropagation,
  destinationAudience,
  labelRank,
  sourceAudience,
  UNCONSTRAINED,
} from './label';
import type { SourceAccessFacts } from './label';

const OWNER = 'org-owner';
const CONSULTANT = 'org-consultant';
const THIRD = 'org-third';

const produced = (over: Partial<SourceAccessFacts> = {}): SourceAccessFacts => ({
  producingOrganisationId: CONSULTANT,
  ownerOrganisationId: OWNER,
  sharedWithOrganisationIds: [],
  narrowedToParticipantIds: null,
  ...over,
});

describe('the lattice', () => {
  it('orders most restrictive first, and the order is the meaning', () => {
    expect(ACCESS_LABELS).toEqual([
      'participant_narrowed',
      'single_organisation',
      'multi_organisation',
      'project_wide',
    ]);
    expect(labelRank('participant_narrowed')).toBeLessThan(labelRank('single_organisation'));
    expect(labelRank('multi_organisation')).toBeLessThan(labelRank('project_wide'));
  });
});

describe('the source audience', () => {
  it('is the producer and the project owner, ungated (ADR-0035 §2)', () => {
    const audience = sourceAudience([produced()], 3);
    expect(audience.organisationIds).toEqual([CONSULTANT, OWNER].sort());
    expect(audience.label).toBe('multi_organisation');
  });

  it('counts a live share, and reads project-wide only when every member organisation is in', () => {
    const shared = sourceAudience([produced({ sharedWithOrganisationIds: [THIRD] })], 3);
    expect(shared.label).toBe('project_wide'); // owner + consultant + third = all three
    expect(sourceAudience([produced({ sharedWithOrganisationIds: [THIRD] })], 4).label).toBe(
      'multi_organisation',
    );
  });

  it('a live participant grant narrows below organisation grain (ADR-0035 §3)', () => {
    const audience = sourceAudience([produced({ narrowedToParticipantIds: ['p-a', 'p-b'] })], 3);
    expect(audience.label).toBe('participant_narrowed');
    expect(audience.participantIds).toEqual(['p-a', 'p-b']);
  });

  it('intersects across sources: output is no more reachable than its least reachable input', () => {
    const audience = sourceAudience(
      [
        produced({ sharedWithOrganisationIds: [THIRD] }),
        produced({ sharedWithOrganisationIds: [] }), // not shared with the third org
      ],
      3,
    );
    expect(audience.organisationIds).not.toContain(THIRD);
    expect(audience.label).toBe('multi_organisation');
  });

  it('narrowing beats not-narrowing, and two narrowings intersect', () => {
    expect(
      sourceAudience([produced(), produced({ narrowedToParticipantIds: ['p-a'] })], 3).participantIds,
    ).toEqual(['p-a']);
    expect(
      sourceAudience(
        [
          produced({ narrowedToParticipantIds: ['p-a', 'p-b'] }),
          produced({ narrowedToParticipantIds: ['p-b', 'p-c'] }),
        ],
        3,
      ).participantIds,
    ).toEqual(['p-b']);
  });

  it('an empty source set constrains nothing — an ungrounded chat turn is not a leak', () => {
    expect(sourceAudience([], 3)).toEqual(UNCONSTRAINED);
  });
});

describe('the destination audience', () => {
  it('an organisation-granted sandbox reads at organisation grain', () => {
    const audience = destinationAudience(
      { organisationIds: [CONSULTANT, THIRD], participantIds: [], participantOrganisationIds: [] },
      3,
    );
    expect(audience.label).toBe('multi_organisation');
    expect(audience.participantIds).toBeNull();
  });

  it('a participant-granted sandbox is narrowed, and names the organisations behind it', () => {
    const audience = destinationAudience(
      {
        organisationIds: [],
        participantIds: ['p-a'],
        participantOrganisationIds: [CONSULTANT],
      },
      3,
    );
    expect(audience.label).toBe('participant_narrowed');
    expect(audience.organisationIds).toEqual([CONSULTANT]);
  });
});

describe('the propagation check', () => {
  it('refuses a broader destination and names both labels', () => {
    const source = sourceAudience([produced({ narrowedToParticipantIds: ['p-a'] })], 3);
    const destination = destinationAudience(
      { organisationIds: [CONSULTANT, THIRD], participantIds: [], participantOrganisationIds: [] },
      3,
    );
    const verdict = checkPropagation(source, destination);

    expect(verdict.allowed).toBe(false);
    // finding F2, in one sentence a user can act on
    expect(verdict).toMatchObject({
      source: 'participant_narrowed',
      destination: 'multi_organisation',
    });
    if (verdict.allowed) throw new Error('unreachable');
    expect(verdict.reason).toContain('participant narrowed');
    expect(verdict.reason).toContain('multi organisation');
  });

  it('allows a narrower destination', () => {
    const source = sourceAudience([produced({ sharedWithOrganisationIds: [THIRD] })], 4);
    const destination = destinationAudience(
      { organisationIds: [CONSULTANT], participantIds: [], participantOrganisationIds: [] },
      4,
    );
    expect(checkPropagation(source, destination).allowed).toBe(true);
  });

  it('refuses an equal-rank destination that reaches an organisation the sources do not', () => {
    // the case a rank comparison alone would wave through
    const source = sourceAudience([produced()], 4); // {consultant, owner}
    const destination = destinationAudience(
      { organisationIds: [CONSULTANT, THIRD], participantIds: [], participantOrganisationIds: [] },
      4,
    );
    expect(source.label).toBe(destination.label);
    const verdict = checkPropagation(source, destination);
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error('unreachable');
    expect(verdict.reason).toContain('1 organisation the sources do not');
  });

  it('refuses an equal-rank destination narrowed to DIFFERENT people', () => {
    // the second case a rank comparison alone would wave through: {A} → {B, C}
    const source = sourceAudience([produced({ narrowedToParticipantIds: ['p-a'] })], 4);
    const destination = destinationAudience(
      {
        organisationIds: [],
        participantIds: ['p-b', 'p-c'],
        participantOrganisationIds: [CONSULTANT],
      },
      4,
    );
    expect(source.label).toBe('participant_narrowed');
    expect(destination.label).toBe('participant_narrowed');
    expect(checkPropagation(source, destination).allowed).toBe(false);
  });

  it('allows a destination narrowed within the source’s own people', () => {
    const source = sourceAudience([produced({ narrowedToParticipantIds: ['p-a', 'p-b'] })], 4);
    const destination = destinationAudience(
      { organisationIds: [], participantIds: ['p-a'], participantOrganisationIds: [CONSULTANT] },
      4,
    );
    expect(checkPropagation(source, destination).allowed).toBe(true);
  });

  it('an ungrounded answer constrains no destination', () => {
    const destination = destinationAudience(
      { organisationIds: [CONSULTANT, THIRD], participantIds: [], participantOrganisationIds: [] },
      3,
    );
    expect(checkPropagation(UNCONSTRAINED, destination).allowed).toBe(true);
  });
});
