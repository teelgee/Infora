// T-312 — the corpus a seed case has to find its answer *in*.
//
// **Why this exists.** v1.md: *"the eval seed set must run against a few hundred
// fixture documents, not five, or it proves nothing about the real corpus."*
// `hollowfield-reservoir-2` is seven documents, sized for the access conditions
// the permission cases need and for nothing else. At seven documents retrieval
// fetches essentially the whole library for any question, so **precision has
// nothing to mean** — which is why HAPPY-01 asserts recall only and says so.
//
// **Why it is generated rather than written.** A document a case points at is
// hand-written and carries a comment saying which condition it exists to
// create — that is what makes a fixture a designed instrument rather than a pile
// of data. A document whose only job is *to be in the way* has no such reason,
// and three hundred of them written by hand would be three hundred chances to
// accidentally answer a question. So the fixture declares a **recipe** and this
// expands it.
//
// **It stays frozen (§3) because it is deterministic.** Same seed, same count,
// same documents, byte for byte, on every load and every machine — the PRNG
// below is seeded from the fixture and nothing here reads the clock, the
// filesystem or `Math.random`. A fixture whose corpus differed between runs
// would break the one promise a frozen fixture makes.
//
// **The load-bearing property is what these documents CANNOT say.** Background
// is competition, not noise: it must be plausible enough to be a genuine
// candidate for a vector search, and it must never contain a term a case's
// answer turns on. A filler document that mentioned phosphate would not make
// HAPPY-01 harder, it would make it *ambiguous* — and an eval that cannot say
// whether a hit was right is worse than one that measures too little.
// `RESERVED_TERMS` is that guarantee, and `background.test.ts` asserts it.

/** A tiny seeded PRNG (mulberry32). Deterministic, and that is its whole job. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Terms a case's answer turns on. **No background document may contain any of
 * them**, and the fixture's own test proves it.
 *
 * The list is deliberately over-broad rather than minimal: `heritage` is not
 * currently load-bearing for any case, but a Lens exchange about it is one
 * ticket away, and a term added here costs nothing while a term missing from
 * here costs a silently ambiguous eval.
 */
export const RESERVED_TERMS = [
  // HAPPY-01 / TRAP-01 — the phosphate figure and its baseline
  'phosphate',
  'mg/l',
  'hollow brook',
  // TRAP-02 — the contradicting crossing lengths
  'flood zone',
  '380',
  '420',
  // PERM-* — the documents that must or must not be reachable
  'waterfowl',
  'protected mammal',
  'provisional sum',
  'haul route',
  'village lane',
  // the twelve worked Lens exchanges (packages/lenses/definitions)
  'northern compound',
  'night-time',
  'night time',
  'acoustic barrier',
  'hoarding',
  'rochdale',
  'deck level',
  'attenuation',
  'deadline 3',
  'ries',
  'rule 8',
  'appropriate assessment',
  'sunday',
  'holding line',
  'representation',
] as const;

/**
 * The document kinds a real NSIP application actually carries. Structural
 * realism is the ticket's own word for what matters here: the corpus must be
 * shaped like a scheme's document set — chapters, appendices, plans,
 * statements — because that shape is what a retrieval has to cut through. It
 * is emphatically **not** about plausible prose, and nobody reads these.
 */
const KINDS = [
  { code: 'ENV', label: 'Environmental Statement Chapter', topics: ['Air Quality', 'Traffic and Transport', 'Socio-economics', 'Climate Resilience', 'Materials and Waste', 'Ground Conditions', 'Agriculture and Soils', 'Major Accidents'] },
  { code: 'APX', label: 'Technical Appendix', topics: ['Survey Methodology', 'Modelling Inputs', 'Consultation Log', 'Baseline Data Tables', 'Sensitivity Testing'] },
  { code: 'PLN', label: 'Plan', topics: ['General Arrangement', 'Land Interests', 'Works Extent', 'Access and Rights of Way', 'Special Category Land'] },
  { code: 'DES', label: 'Design Statement', topics: ['Structures Approach', 'Materials Palette', 'Lighting Strategy', 'Public Realm'] },
  { code: 'SCG', label: 'Statement of Common Ground', topics: ['County Council', 'District Council', 'Statutory Undertaker', 'Highway Authority', 'Drainage Board'] },
  { code: 'PRO', label: 'Procedural Submission', topics: ['Hearing Action Points', 'Post-hearing Note', 'Compulsory Acquisition Schedule', 'Book of Reference Update'] },
  { code: 'MGT', label: 'Management Plan', topics: ['Materials Handling', 'Site Waste', 'Traffic Management', 'Pollution Prevention', 'Emergency Response'] },
] as const;

const PLACES = [
  'Ledworth Cutting', 'Marple Sidings', 'Ashfen Marsh', 'Cardrey Interchange', 'Penhallow Ridge',
  'Wraybourne Halt', 'Tarnside Depot', 'Great Ockley', 'Fenwold Drain', 'Silverhow Bank',
  'Deneby Junction', 'Marchgate Farm', 'Hesketh Wharf', 'Oldcastle Green', 'Ryehill Bridge',
] as const;

const PHRASES = [
  'The assessment reports no residual effect of greater than minor adverse significance at any receptor identified in the baseline.',
  'Monitoring is proposed for the construction period only, reverting to the operational regime at handover.',
  'Values are carried forward from the modelling inputs appendix without adjustment.',
  'The scope was agreed with the relevant authority prior to submission and is recorded in the consultation log.',
  'Mitigation is secured through the management plan referenced in the requirements schedule.',
  'No change is proposed to the arrangement described at the preliminary environmental information stage.',
  'The design fixes the parameter within the range previously reported and no revision is sought.',
  'Cumulative effects with the consented adjacent scheme were screened and taken no further.',
] as const;

const pick = <T>(items: readonly T[], next: () => number): T => items[Math.floor(next() * items.length)]!;

export type BackgroundRecipe = {
  count: number;
  seed: number;
  /** whose material it is — the same wall rules apply to it as to anything else */
  producer: string;
  /** the reference prefix, so a generated code cannot collide with a written one */
  prefix: string;
};

/**
 * Exactly the shape a *written* container parses to — `state` and `chunks`
 * included — so a generated one goes through the same validation and the same
 * materialiser with no branch anywhere. A generator whose output the loader
 * treated specially would be a second code path nobody tests.
 */
export type BackgroundContainer = {
  key: string;
  project: string;
  producer: string;
  reference: string;
  in_library: boolean;
  state: 'live';
  shares: Array<{ organisation: string; granted_by: string; narrowed_to?: string[] }>;
  versions: Array<{
    key: string;
    reference: string;
    current: boolean;
    content: string;
    chunks?: string[];
    acknowledged_by: Array<{ organisation: string; participant: string }>;
  }>;
};

/**
 * Expand a recipe into containers.
 *
 * They are **shared and acknowledged**, which is the point: a background
 * document the acting user cannot see is filtered out before the vector
 * comparison and competes with nothing. Precision is only measurable against a
 * corpus the requester can actually reach.
 */
export function expandBackground(
  recipe: BackgroundRecipe,
  audience: { project: string; shares: Array<{ organisation: string; granted_by: string }>; acknowledged_by: Array<{ organisation: string; participant: string }> },
): BackgroundContainer[] {
  const next = rng(recipe.seed);
  const containers: BackgroundContainer[] = [];
  for (let n = 1; n <= recipe.count; n++) {
    const kind = pick(KINDS, next);
    const topic = pick(kind.topics, next);
    const place = pick(PLACES, next);
    const serial = String(n).padStart(3, '0');
    const content = [
      `${kind.label}: ${topic}.`,
      `This document covers the works at ${place} and the areas immediately adjoining it.`,
      pick(PHRASES, next),
      pick(PHRASES, next),
    ].join(' ');
    containers.push({
      key: `bg_${serial}`,
      project: audience.project,
      producer: recipe.producer,
      reference: `${recipe.prefix}-${kind.code}-${serial}`,
      in_library: true,
      state: 'live',
      shares: audience.shares,
      versions: [
        {
          key: `bg_${serial}_v1`,
          reference: 'v1',
          current: true,
          content,
          acknowledged_by: audience.acknowledged_by,
        },
      ],
    });
  }
  return containers;
}

/** Every reserved term a generated document contains — empty is the contract. */
export function reservedTermsIn(text: string): string[] {
  const lower = text.toLowerCase();
  return RESERVED_TERMS.filter((term) => lower.includes(term));
}
