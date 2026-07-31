// T-249 — label propagation on write-back (finding F2, Phase 0 finding F2).
//
// THE GAP THIS CLOSES. Written output takes the writer's own organisation
// (apps/api/src/sandbox.ts), not the most restrictive label among the sources
// that produced it. So an answer grounded on a deliverable narrowed to named
// Participants (ADR-0035 §3) can be carried into a document in a
// multi-organisation sandbox (ADR-0036) — one of the two findings that describe
// a real leak, and the only one a user performs without ever being told what
// they moved.
//
// POLICY ONLY, NO STORE. This package resolves policy over facts handed to it;
// it holds no database handle, and this file keeps that property. The queries
// that gather the facts live in packages/knowledge beside the visibility SQL
// they share a definition with (label-facts.ts).
//
// TWO CHECKS, NOT ONE. The requirement names a lattice — participant-narrowed
// ⊂ single-organisation ⊂ multi-organisation ⊂ project-wide — and the lattice
// is what the refusal message and the destination selector (T-295) speak in.
// A rank comparison alone is not sufficient, and it is worth being precise
// about why: material narrowed to participants {A}, written into a team
// sandbox granted to {B, C}, carries the SAME rank and is still a leak. So the
// audience is compared as a set and the rank is the readable summary of it.
// Where they disagree the set wins, because the set is the fact.
//
// NOTHING HERE IS STORED. The label is computed from the access facts on every
// call — a stored label is a cache of an access decision, and a stale one would
// keep saying "single organisation" after the share that made it so was revoked.

/** The lattice, most restrictive first. The order is meaning, not style. */
export const ACCESS_LABELS = [
  'participant_narrowed',
  'single_organisation',
  'multi_organisation',
  'project_wide',
] as const;
export type AccessLabel = (typeof ACCESS_LABELS)[number];

export function labelRank(label: AccessLabel): number {
  return ACCESS_LABELS.indexOf(label);
}

/**
 * Who can actually reach something: the organisations entitled to it and —
 * when it is narrowed below organisation grain — the named participants.
 * `participantIds: null` means "everyone in those organisations".
 */
export type Audience = {
  label: AccessLabel;
  organisationIds: string[];
  participantIds: string[] | null;
};

/**
 * One source's access facts, as the wall defines them (ADR-0035 §2–§5): the
 * producer and the project owner are ungated, a receiving organisation reaches
 * it through a live share, and a live grant set narrows to named participants.
 */
export type SourceAccessFacts = {
  producingOrganisationId: string;
  ownerOrganisationId: string;
  sharedWithOrganisationIds: string[];
  narrowedToParticipantIds: string[] | null;
};

/** A destination's access facts: the live scope grants of its sandbox (ADR-0036). */
export type DestinationAccessFacts = {
  organisationIds: string[];
  participantIds: string[];
  /** the home organisation of each granted participant, so the two are comparable */
  participantOrganisationIds: string[];
};

/**
 * Material resting on no source at all constrains no destination — the run's
 * own scope already did that work. Stated as a named constant rather than
 * left as a fall-through, because "no sources" is a real answer here and
 * silently treating it as maximally restrictive would refuse every ungrounded
 * chat turn.
 */
export const UNCONSTRAINED: Audience = {
  label: 'project_wide',
  organisationIds: [],
  participantIds: null,
};

/**
 * The audience of a whole source set: the INTERSECTION across its sources,
 * because output resting on several sources is no more reachable than its
 * least reachable input.
 */
export function sourceAudience(
  sources: readonly SourceAccessFacts[],
  memberOrganisationCount: number,
): Audience {
  if (sources.length === 0) return UNCONSTRAINED;

  let organisations: Set<string> | null = null;
  let participants: Set<string> | null | undefined;

  for (const source of sources) {
    const reachable = new Set<string>([
      source.producingOrganisationId,
      source.ownerOrganisationId,
      ...source.sharedWithOrganisationIds,
    ]);
    const narrowed =
      source.narrowedToParticipantIds === null
        ? null
        : new Set<string>(source.narrowedToParticipantIds);

    organisations = organisations === null ? reachable : intersect(organisations, reachable);
    participants = participants === undefined ? narrowed : narrowMost(participants, narrowed);
  }

  const finalParticipants = participants ?? null;
  return audience(organisations ?? new Set(), finalParticipants, memberOrganisationCount);
}

export function destinationAudience(
  facts: DestinationAccessFacts,
  memberOrganisationCount: number,
): Audience {
  const organisations = new Set(facts.organisationIds);
  // A participant-granted sandbox with no organisation grant is narrowed below
  // organisation grain; its participants' home organisations come in so the two
  // audiences are expressed in the same terms.
  const narrowed = organisations.size === 0 && facts.participantIds.length > 0;
  if (narrowed) for (const id of facts.participantOrganisationIds) organisations.add(id);

  return audience(
    organisations,
    narrowed ? new Set(facts.participantIds) : null,
    memberOrganisationCount,
  );
}

export type PropagationVerdict =
  | { allowed: true; source: AccessLabel; destination: AccessLabel }
  | { allowed: false; reason: string; source: AccessLabel; destination: AccessLabel };

/**
 * May material with the `source` audience be written into `destination`?
 *
 * Refused by default when the destination is broader — by rank, or by reaching
 * an organisation or a person the sources do not. The reason NAMES BOTH
 * LABELS: "refused" on its own tells a user nothing they can act on, and
 * invites them to conclude the system is broken rather than careful.
 */
export function checkPropagation(source: Audience, destination: Audience): PropagationVerdict {
  const labels = { source: source.label, destination: destination.label };
  const named = `the sources are ${describe(source.label)}; the destination is ${describe(destination.label)}`;

  if (labelRank(destination.label) > labelRank(source.label)) {
    return { allowed: false, reason: named, ...labels };
  }

  if (source.organisationIds.length > 0) {
    const beyond = destination.organisationIds.filter((id) => !source.organisationIds.includes(id));
    if (beyond.length > 0) {
      return {
        allowed: false,
        reason: `${named} — it reaches ${beyond.length} organisation${beyond.length === 1 ? '' : 's'} the sources do not`,
        ...labels,
      };
    }
  }

  // rank can agree while the audiences do not: narrowed to {A}, written to a
  // team of {B, C}
  if (source.participantIds !== null) {
    const outside =
      destination.participantIds === null
        ? destination.organisationIds.length > 0
        : destination.participantIds.some((id) => !source.participantIds!.includes(id));
    if (outside) {
      return {
        allowed: false,
        reason: `${named} — the sources are narrowed to named participants and the destination is not within them`,
        ...labels,
      };
    }
  }

  return { allowed: true, ...labels };
}

function audience(
  organisations: Set<string>,
  participants: Set<string> | null,
  memberOrganisationCount: number,
): Audience {
  return {
    label: summarise(organisations, participants, memberOrganisationCount),
    organisationIds: [...organisations].sort(),
    participantIds: participants === null ? null : [...participants].sort(),
  };
}

function summarise(
  organisations: Set<string>,
  participants: Set<string> | null,
  memberOrganisationCount: number,
): AccessLabel {
  if (participants !== null) return 'participant_narrowed';
  if (organisations.size <= 1) return 'single_organisation';
  if (memberOrganisationCount > 0 && organisations.size >= memberOrganisationCount) {
    return 'project_wide';
  }
  return 'multi_organisation';
}

function describe(label: AccessLabel): string {
  return label.replaceAll('_', ' ');
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter((value) => b.has(value)));
}

// null means "not narrowed": narrowing beats not-narrowing, and two narrowings
// intersect — the output is reachable only where every source is.
function narrowMost(a: Set<string> | null, b: Set<string> | null): Set<string> | null {
  if (a === null) return b;
  if (b === null) return a;
  return intersect(a, b);
}
