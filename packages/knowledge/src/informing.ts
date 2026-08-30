// T-308 — the org-context read. T-397 — ON THE INFORMING CHANNEL, corrected.
//
// **The org-context binding** (ADR-0020, ADR-0048 §4 as amended 2026-08-30). A
// firm's rulebook is org context: private to the organisation, portable to
// every project that organisation touches. So the query has ONE key — the
// requester's organisation — and no project, no share, no acknowledgement and
// no wall predicate. That is not a simplification of the grounded path; it is a
// different rule, which is precisely why these rows are not in `version_chunks`
// (the authority-corpus spike's Finding 4, applied a store early).
//
// ⚠ **THE CHANNEL MOVED AND THE ACCESS DID NOT.** ADR-0048 §4 placed the
// rulebook on *guiding* while asserting nothing in ADR-0021 was amended, and
// both cannot hold: ADR-0021 maps org context to **informing** and classifies
// **by ownership, not purpose** — a house drafting manual is the firm's own IP
// and leaves when the firm leaves the project. The substance of §4, §5 and §6
// is unmoved, because *does not ground*, *quotable but never cited* and
// *private to its organisation* hold identically on informing. **The query
// below is byte-for-byte the one T-308 wrote**: no wall predicate was added and
// none was removed, and a test asserts exactly that.
//
// What the mislabel cost was PRECEDENCE and DROP ORDER. A project style guide
// is the guiding channel's definitional occupant, so the two style sources
// would have shared one bucket with nothing to rank them, and ADR-0029's
// *guiding wins, firm know-how fills the gaps* would have been unreachable.
// `mergeChannels` drops informing first, so the correction also means a firm's
// rulebook is dropped **before** a project style guide — which is why ADR-0053
// §5 makes the checker's planner split rather than drop.
//
// **It never grounds and is never cited.** Every item comes back with no
// `source`, which is the type saying so: `sourcesOf` records only grounded
// items, so nothing here enters a run's source set and no claim can be admitted
// against it by the ground-check. ADR-0048 §5's quotable-but-uncited ruling
// lives in `rule` instead — the clause address a finding needs to write
// *"your Drafting Manual §4.2 says …"*.
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AssembledItem } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

/**
 * Every live rulebook clause of one organisation, in reading order.
 *
 * **In its entirety, and not retrieved** (ADR-0048 §4). No vector search, no
 * relevance cut: a rulebook is a few dozen clauses of house style, and
 * selecting "the relevant ones" would mean deciding which rules a draft is
 * allowed to breach before reading it. The token budget is the only thing that
 * narrows this, and it does so in `mergeChannels`, where informing is dropped
 * FIRST — before guiding and before grounded — the ADR-0029 §5 priority,
 * unchanged in kind and now applied to the right bucket.
 *
 * ⚠ **`Q-046`** asks what a checker should do when that budget binds: a
 * rulebook truncated by the merge steers on part of itself and reports "no
 * findings" for the rest, which reads identically to compliance. Raised rather
 * than answered here — it is a product question about what the checker may
 * claim, not a retrieval detail.
 */
export async function informingRules(db: Db, organisationId: string): Promise<AssembledItem[]> {
  const rows = await db
    .select({
      rulebookId: s.rulebooks.id,
      clause: s.rulebookClauses.clause,
      heading: s.rulebookClauses.heading,
      content: s.rulebookClauses.content,
      ordinal: s.rulebookClauses.ordinal,
    })
    .from(s.rulebookClauses)
    .innerJoin(s.rulebooks, eq(s.rulebooks.id, s.rulebookClauses.rulebookId))
    .where(and(eq(s.rulebooks.organisationId, organisationId), isNull(s.rulebooks.retiredAt)))
    .orderBy(asc(s.rulebooks.loadedAt), asc(s.rulebookClauses.ordinal));

  return rows.map((row) => ({
    channel: 'informing' as const,
    // no `source`: not citable, and the absence is the guarantee
    rule: { rulebookRef: row.rulebookId, clause: row.clause, heading: row.heading },
    content: row.content,
  }));
}
