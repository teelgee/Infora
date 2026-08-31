// T-397 — THE GUIDING CHANNEL, AND THE FIRST MATERIAL IT HAS EVER CARRIED.
//
// In plain terms: a project can have its own writing rules, set by the owner,
// and every organisation working on that project is held to them. This is the
// read that puts them in front of the model.
//
// **The project-context binding** (ADR-0020, ADR-0053 §3). A project style
// guide belongs to the PROJECT: owner-curated, binding every organisation on
// it. So the query has ONE key — the project the run is executing in — and no
// organisation, no share and no wall predicate. That is not an oversight in the
// wall: quoting a project style guide across the wall is the point of it, which
// is why ADR-0053 §9 makes a quoted style-guide clause **not** org-private
// where a quoted firm-rulebook clause is. Privacy is a property of the source's
// SCOPE, not of the word "rulebook".
//
// **It never grounds and is never cited.** Every item comes back with no
// `source`, which is the type saying so: `sourcesOf` records only grounded
// items, so nothing here enters a run's source set and no claim can be admitted
// against it by the ground-check. ADR-0048 §5's quotable-but-uncited ruling
// lives in `rule` instead — the clause address a finding needs to write
// *"the project style guide §4.2 says …"*.
//
// 🔒 **ON CONFLICT, GUIDING WINS AND FIRM KNOW-HOW FILLS THE GAPS.** ADR-0029's
// precedence, refined 2026-07-06, which ADR-0048's channel mislabel had made
// unreachable — with both style sources in one bucket there was nothing to rank
// them by. It is reachable now in two places, and both are pinned by tests:
// `mergeChannels` orders guiding before informing and drops informing FIRST, so
// a firm's manual is what the budget takes; and the draft prompt states the
// precedence in a SENTENCE rather than leaving it to ordering, because ordering
// is not an instruction — a model reading two conflicting house rules has
// nothing in the order to tell it which one governs.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { AssembledItem } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

/**
 * Every live style-guide clause of one project, in reading order.
 *
 * **In its entirety, and not retrieved**, for the rulebook's reason exactly
 * (ADR-0048 §4): selecting "the relevant clauses" would mean deciding which
 * rules a draft is allowed to breach before reading it. The token budget is the
 * only thing that narrows this — and for a CHECKER it does not narrow it at
 * all, because ADR-0053 §5 makes the planner split rather than drop.
 */
/**
 * T-406 — `styleGuideIds` narrows the read to the guides the author SELECTED.
 *
 * The checker reads every live guide, because a rule that binds you binds you
 * whether you remembered it or not. **Drafting is the other case**: the author
 * says which guides this document is written to, and a guide they did not
 * choose is not a rule the draft broke — it is a rule about another document.
 * Omitting the argument keeps the checker's behaviour exactly as it was; an
 * **empty array is a real answer** and returns nothing, which is different
 * again from "no guides are loaded" and is why it is not folded into the
 * undefined case.
 */
export async function guidingStyleGuide(
  db: Db,
  projectId: string,
  styleGuideIds?: readonly string[],
): Promise<AssembledItem[]> {
  if (styleGuideIds !== undefined && styleGuideIds.length === 0) return [];
  const rows = await db
    .select({
      styleGuideId: s.projectStyleGuides.id,
      clause: s.projectStyleGuideClauses.clause,
      heading: s.projectStyleGuideClauses.heading,
      content: s.projectStyleGuideClauses.content,
      ordinal: s.projectStyleGuideClauses.ordinal,
    })
    .from(s.projectStyleGuideClauses)
    .innerJoin(
      s.projectStyleGuides,
      eq(s.projectStyleGuides.id, s.projectStyleGuideClauses.styleGuideId),
    )
    .where(
      and(
        eq(s.projectStyleGuides.projectId, projectId),
        isNull(s.projectStyleGuides.retiredAt),
        // the project key is still the ceiling: a selected id belonging to
        // another project matches nothing rather than reaching across
        ...(styleGuideIds === undefined
          ? []
          : [inArray(s.projectStyleGuides.id, [...styleGuideIds])]),
      ),
    )
    .orderBy(asc(s.projectStyleGuides.loadedAt), asc(s.projectStyleGuideClauses.ordinal));

  return rows.map((row) => ({
    channel: 'guiding' as const,
    // no `source`: not citable, and the absence is the guarantee
    rule: { rulebookRef: row.styleGuideId, clause: row.clause, heading: row.heading },
    content: row.content,
  }));
}
