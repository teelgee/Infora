// T-469 — the run's scope, and its reach (ADR-0029's addendum of 2026-10-24).
//
// *In plain terms: a person may tell a run which part of the library to read —
// a discipline, a document type, a handful of named documents, or a saved
// choice. Afterwards the run says, in one sentence, how many documents it read,
// how many it could not read and why, and how many the person's own choice left
// out.*
//
// 🔒 A scope only NARROWS. The gateway resolves the wall, record state and the
// entitled slice first and intersects the scope with that set afterwards, so a
// scope naming a document the requester may not see yields nothing from it and
// is never counted. These types carry no widening parameter, and neither does
// the call they ride on.
import { z } from 'zod';

const id = z.uuid();

/**
 * What a person asks a run to read. Terms of ONE facet are OR'd; terms of
 * different facets are AND'd ("geotechnical and report"); named containers are
 * AND'd with the terms. A saved scope is resolved to term and container ids by
 * the API before the gateway sees it — the gateway never sees `savedScopeId`
 * as anything but a record of where the choice came from.
 *
 * **One convention for every surface:** scope absent → the whole visible
 * library; scope present → exactly it; an empty scope is refused, in words.
 */
export const scopeSchema = z
  .object({
    termIds: z.array(id).optional(),
    containerIds: z.array(id).optional(),
    savedScopeId: id.optional(),
  })
  .strict()
  .refine(
    (scope) =>
      (scope.termIds?.length ?? 0) > 0 ||
      (scope.containerIds?.length ?? 0) > 0 ||
      scope.savedScopeId !== undefined,
    {
      message:
        'a scope must name at least one discipline, document type or document — leave the scope out to read the whole library',
    },
  );
export type Scope = z.infer<typeof scopeSchema>;

/** The scope as the gateway sees it: a saved scope already resolved away. */
export type ResolvedScope = { termIds?: string[]; containerIds?: string[]; savedScopeId?: string };

/**
 * The counts behind the reach sentence. **Documents, not passages**: the unit
 * is the thing a person recognises. Every number is taken under the
 * requester's own visibility, so none of them can move because of a share
 * between two other organisations.
 */
export type ReachCounts = {
  /** documents the requester may see that are live and readable by the AI */
  visibleLive: number;
  /** …of those, the ones the scope admits (all of them where there is no scope) */
  inScope: number;
  /** documents the requester may see that record state keeps out */
  excludedByState: { superseded: number; withdrawn: number };
  /** `visibleLive − inScope`: what the person's own choice left out */
  leftOutByScope: number;
  /**
   * T-472 — live, visible documents held but unreadable (a scanned file with no
   * text layer): in the library, never read by a run. Optional because runs
   * recorded before it existed carry no such count; absent reads as none.
   */
  notCitable?: number;
  /**
   * T-473 — live, visible documents in scope whose re-check date has passed
   * (confirmed current once, now due again). They still ground; the sentence
   * says how many. Optional for the same reason as `notCitable`.
   */
  awaitingRecheck?: number;
};

/** What a finished run writes: the counts, plus what was actually read. */
export type RunReach = ReachCounts & {
  /** distinct documents in the run's steps' source sets — the passage-grain audit */
  read: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The one sentence every surface renders from the same numbers.
 *
 * *"Read 14 documents in your scope. Excluded: 2 superseded, 1 withdrawn. Your
 * scope left out 31 you could have included."*
 *
 * A zero part is OMITTED, never printed ("0 not citable" would be noise), and a
 * part for a state that does not exist yet is simply not in this function.
 * `read` is optional because a plan states the sentence before anything has
 * been read ("14 documents in your scope can be read.").
 */
export function reachStatement(reach: ReachCounts & { read?: number }): string {
  const scoped = reach.leftOutByScope > 0;
  const parts: string[] = [];
  if (reach.read !== undefined) {
    parts.push(
      reach.read === 0
        ? 'Read no documents.'
        : `Read ${plural(reach.read, 'document')}${scoped ? ' in your scope' : ''}.`,
    );
  } else {
    parts.push(
      reach.inScope === 0
        ? 'No documents can be read.'
        : `${plural(reach.inScope, 'document')}${scoped ? ' in your scope' : ''} can be read.`,
    );
  }
  const excluded: string[] = [];
  if (reach.excludedByState.superseded > 0) excluded.push(`${reach.excludedByState.superseded} superseded`);
  if (reach.excludedByState.withdrawn > 0) excluded.push(`${reach.excludedByState.withdrawn} withdrawn`);
  if (excluded.length > 0) parts.push(`Excluded: ${excluded.join(', ')}.`);
  if (scoped) parts.push(`Your scope left out ${reach.leftOutByScope} you could have included.`);
  // T-472 — a held-but-unreadable file is a fact the person is owed, named once
  // and only when there is one ("0 not citable" would be noise)
  if ((reach.notCitable ?? 0) > 0) parts.push(`${reach.notCitable} not citable (scan).`);
  // T-473 — documents read but due a re-check; named once and only when there are some
  if ((reach.awaitingRecheck ?? 0) > 0) parts.push(`${reach.awaitingRecheck} awaiting re-check.`);
  return parts.join(' ');
}

/**
 * The refusal said before any spend, when there is nothing the requester may
 * read to run against. In words, with the reason a person can act on. `scoped`
 * is whether the person declared a scope: the words differ, because "widen your
 * scope" is advice only a scoped run can take.
 */
export function nothingToReadRefusal(reach: ReachCounts, scoped: boolean): string {
  if (!scoped) {
    return 'There is nothing to read: the library holds no documents you can read yet. Once a document is in the library and live, this will run.';
  }
  const why =
    reach.visibleLive === 0
      ? 'there are no documents in the library you can read yet.'
      : `it leaves out all ${plural(reach.visibleLive, 'readable document')}.`;
  return `Your scope leaves nothing to read: ${why} Widen the scope, or leave it out to read the whole library.`;
}
