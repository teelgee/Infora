// T-471 — the working set a run was handed (ADR-0022's addendum of 2026-10-24).
//
// *In plain terms: a person may pin a few of their own drafts — files from a
// working area they are part of — to a conversation, and ask a question with
// those drafts in view. The AI reads them as background the person vouches for.
// It never cites them, and it says on its answer that it drew on the working
// area. Someone who is not in that working area sees only that documents were
// pinned, never which.*
//
// 🔒 A working set NEVER GROUNDS AND NEVER CITES. Nothing in these types can
// become a citation: an entry is a document id and the title it had when it was
// pinned, and the assembler never sees it as a corpus. The server checks each
// document's reach when it is pinned and again when a run starts.
import { z } from 'zod';
import type { Id } from './shared';

/**
 * One document a run was handed. `label` is the title it had when it was
 * pinned, kept so the record says what was vouched for even if it is renamed.
 */
export type WorkingSetDocument = { sandboxDocumentId: Id; label: string };

/**
 * What a READER is shown of one entry. A reader who can access the document's
 * own sandbox sees the document; every other reader sees only that an entry
 * exists. The titles and ids of a working area are visible to its participants
 * and to no one else.
 */
export type WorkingSetEntry = WorkingSetDocument | { hidden: true };

export const isHiddenEntry = (entry: WorkingSetEntry): entry is { hidden: true } => 'hidden' in entry;

/** The page size of the working-area read. */
export const WORKING_AREA_PAGE_SIZE = 50;

export const workingAreaQuery = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type WorkingAreaQuery = z.infer<typeof workingAreaQuery>;

/** A document the requester may pin: one in a working area they are part of. */
export type WorkingAreaDocument = {
  id: Id;
  title: string;
  sandboxId: Id;
  /** the name of the working area (sandbox) the document sits in */
  sandboxName: string;
  updatedAt: string;
};
export type GetWorkingAreaResponse = {
  items: WorkingAreaDocument[];
  page: number;
  pageSize: number;
  /** true when a further page exists — the picker says to type to narrow */
  hasMore: boolean;
  q: string | null;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The words beside an answer, a draft or a set of findings.
 *
 * `null` for a run that was handed nothing: no line, rather than a line saying
 * "0 documents". A reader who is in none of the pinned documents' working areas
 * is told how many there were and that they are not in the working area — never
 * a title.
 */
export function workingSetStatement(
  entries: readonly WorkingSetEntry[] | undefined,
): { line: string; titles: string[]; hiddenCount: number } | null {
  if (entries === undefined || entries.length === 0) return null;
  const titles = entries.filter((entry): entry is WorkingSetDocument => !isHiddenEntry(entry)).map((entry) => entry.label);
  const hiddenCount = entries.length - titles.length;
  const line =
    titles.length === 0
      ? `${plural(hiddenCount, 'document')} from a working area you are not in`
      : `Drawing on your working area — ${plural(entries.length, 'document')}`;
  return { line, titles, hiddenCount };
}
