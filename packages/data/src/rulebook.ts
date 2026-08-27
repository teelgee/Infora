// T-308 — the rulebook loader (ADR-0048 §4/§5).
//
// THIS IS NOT THE CHUNKER, AND THE DIFFERENCE IS THE TICKET. `chunkText` packs
// sentences greedily to a size cap, trimming each and rejoining with a single
// space — so a chunk is not a substring of its own source (T-270 finding 1).
// That is exactly right for retrieval and exactly wrong here.
//
// ADR-0048 §5 lets a finding quote a rule VERBATIM while never citing it:
//
//   > Your Drafting Manual §4.2 says "avoid the passive voice"; this paragraph
//   > uses it three times.
//
// Two things have to survive the load for that sentence to be constructible —
// the **words as the manual really writes them**, and the **number the manual
// gives them**. A rulebook chunked for steer alone would satisfy the guiding
// channel perfectly and leave the ruling unimplementable at the surface, which
// is the trap T-308's ticket names and the reason this file exists at all.
//
// So the unit is the CLAUSE, not the chunk: split at numbered headings, keep
// the text between them untouched, and record the span it came from.
import { and, eq, isNull } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

/** One clause of a rulebook, as the manual reads it. */
export type RulebookClause = {
  index: number;
  /**
   * the clause number as digits and dots — `4.2`, `12.4.7`. `§` is a rendering
   * convention and not part of the address, so it is not stored.
   *
   * **`null` is honest, not a gap.** Text before the first numbered heading,
   * and a manual with no numbering at all, still steer the checker; they just
   * cannot be quoted *with a reference*. Never guess one: an invented address
   * looks checkable, which is worse than an absent one (T-305's rule for
   * `page`, applied here).
   */
  clause: string | null;
  /** the heading text beside the number, when the heading carried any */
  heading: string | null;
  /** the clause verbatim — `text.slice(start, end)`, never re-joined */
  content: string;
  start: number;
  end: number;
};

export type RulebookParse = {
  clauses: RulebookClause[];
  /**
   * how many clauses carry a number. Reported rather than assumed, because a
   * manual that parsed to one unlabelled clause is a manual whose rules can
   * never be quoted with a reference — and the person who uploaded it should
   * learn that at upload, not from a finding that reads oddly six weeks later.
   */
  labelled: number;
};

/**
 * A numbered heading at the head of a line: `4.2 Voice`, `12.4.7. Cross-refs`,
 * `§4.2 Voice`.
 *
 * **Anchored to the line, following T-307.** The chunker learned the same
 * lesson from the other side: what separates a heading from a sentence is not
 * the digit but that a heading number STARTS ITS LINE. A rule keyed on "digit,
 * dot, capital" also fires inside *"The level is 54. The barrier is 3 m."*,
 * which would carve a rulebook at every measurement in it.
 *
 * The trailing dot is optional because manuals write both `4.2` and `4.2.`, and
 * a lone `4.` is admitted because a top-level section is still a section.
 */
const HEADING = /^[ \t]*§?[ \t]*(\d+(?:\.\d+)*)\.?(?:[ \t]+(.*))?$/;

/**
 * Parse extracted rulebook text into clauses.
 *
 * Deterministic and total: every character of the input lands in exactly one
 * clause, so `clauses.map(c => text.slice(c.start, c.end)).join('')` is the
 * input again. That property is what makes a span checkable — a loader that
 * dropped whitespace between clauses would produce quotes that no longer sit
 * where they say they do.
 */
export function parseRulebook(text: string): RulebookParse {
  const boundaries: Array<{ at: number; clause: string; heading: string | null; bodyAt: number }> = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const match = HEADING.exec(line);
    if (match !== null) {
      boundaries.push({
        at: offset,
        clause: match[1]!,
        heading: match[2]?.trim() ? match[2].trim() : null,
        bodyAt: offset,
      });
    }
    offset += line.length + 1; // the '\n' the split consumed
  }

  const clauses: RulebookClause[] = [];
  const push = (start: number, end: number, clause: string | null, heading: string | null) => {
    const content = text.slice(start, end);
    // a run of pure whitespace between two headings is not a clause; it is the
    // gap between them, and it belongs to the one above so the spans stay total
    if (clauses.length > 0 && clause === null && !/\S/.test(content)) {
      clauses[clauses.length - 1]!.end = end;
      clauses[clauses.length - 1]!.content = text.slice(clauses[clauses.length - 1]!.start, end);
      return;
    }
    if (!/\S/.test(content) && clause === null) return;
    clauses.push({ index: clauses.length, clause, heading, content, start, end });
  };

  // the preamble: everything before the first numbered heading. It steers and
  // cannot be quoted with a reference — see `clause`'s note above.
  const firstAt = boundaries[0]?.at ?? text.length;
  if (firstAt > 0) push(0, firstAt, null, null);

  for (const [at, boundary] of boundaries.entries()) {
    const end = boundaries[at + 1]?.at ?? text.length;
    push(boundary.bodyAt, end, boundary.clause, boundary.heading);
  }

  // a manual with no numbering at all is one unlabelled clause, not a refusal:
  // it still steers, and refusing it would be refusing a firm's own rulebook
  // for the formatting of its headings
  if (clauses.length === 0 && /\S/.test(text)) {
    clauses.push({ index: 0, clause: null, heading: null, content: text, start: 0, end: text.length });
  }

  return { clauses, labelled: clauses.filter((c) => c.clause !== null).length };
}

/**
 * Load a parsed rulebook into org context — **the org-context binding**.
 *
 * The organisation is the only scope key there is (ADR-0020): no project, and
 * therefore no wall predicate to get wrong. Everything a Participant of this
 * organisation asks reaches it, on every project, which is what "portable to
 * every project the organisation touches" means as a query.
 */
export async function loadRulebook(
  db: Db,
  input: {
    organisationId: string;
    title: string;
    sourceFormat: string;
    loadedByUserId: string;
    text: string;
  },
): Promise<{ rulebookId: string; clauses: number; labelled: number }> {
  const parsed = parseRulebook(input.text);
  const [rulebook] = await db
    .insert(s.rulebooks)
    .values({
      organisationId: input.organisationId,
      title: input.title,
      sourceFormat: input.sourceFormat,
      loadedByUserId: input.loadedByUserId,
    })
    .returning({ id: s.rulebooks.id });
  if (parsed.clauses.length > 0) {
    await db.insert(s.rulebookClauses).values(
      parsed.clauses.map((clause) => ({
        rulebookId: rulebook!.id,
        ordinal: clause.index,
        clause: clause.clause,
        heading: clause.heading,
        content: clause.content,
        spanStart: clause.start,
        spanEnd: clause.end,
      })),
    );
  }
  return { rulebookId: rulebook!.id, clauses: parsed.clauses.length, labelled: parsed.labelled };
}

/**
 * Retire a rulebook: currency by state, never a delete (drawer 1's discipline,
 * and the reason is sharper here). A finding written against a rule the firm
 * has since withdrawn still has to resolve to the words it quoted, or the
 * record of the review becomes unreadable.
 */
export async function retireRulebook(
  db: Db,
  input: { rulebookId: string; organisationId: string },
): Promise<boolean> {
  const retired = await db
    .update(s.rulebooks)
    .set({ retiredAt: new Date() })
    .where(
      and(
        eq(s.rulebooks.id, input.rulebookId),
        // the ceiling binds: an organisation retires its own rulebook and
        // nobody else's, checked here rather than trusted from the caller
        eq(s.rulebooks.organisationId, input.organisationId),
        isNull(s.rulebooks.retiredAt),
      ),
    )
    .returning({ id: s.rulebooks.id });
  return retired.length > 0;
}
