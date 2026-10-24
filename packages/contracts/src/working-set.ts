// T-471 — the working set a run was handed (ADR-0022's addendum of 2026-10-24).
//
// *In plain terms: a person may pin a few of their own drafts — files from a
// working area they are part of — to a conversation, and ask a question with
// those drafts in view. The AI reads them as background the person vouches for.
// It never cites them, and it says on its answer that it drew on the working
// area. Someone who is not in that working area still reads the TITLES of the
// pinned drafts, each marked "not open to you", but cannot open any of them —
// the document's id is withheld. A draft deleted for good keeps its title, with
// "document removed" after it (T-482, the owner's rulings on Q-057 and Q-058).*
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
 * What a READER is shown of one entry. The TITLE (the one recorded when the
 * draft was pinned) is shown to every reader. The document's id is shown only
 * to a reader who is in the draft's working area — `openToYou: true`. Any other
 * reader gets `openToYou: false` and no id: the title is public, the door is
 * not. `removed` is set when the draft has been deleted for good; it is worked
 * out when the entry is read, never written into the run's recorded plan.
 */
export type WorkingSetEntry =
  | { sandboxDocumentId: Id; label: string; openToYou: true }
  | { label: string; openToYou: false; removed?: true };

export const isOpenEntry = (entry: WorkingSetEntry): entry is Extract<WorkingSetEntry, { openToYou: true }> =>
  entry.openToYou;

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

/** The small mark after a title, or null when the reader can open the draft. */
export type WorkingSetMark = null | 'not open to you' | 'document removed';

/**
 * The words beside an answer, a draft or a set of findings.
 *
 * `null` for a run that was handed nothing: no line, rather than a line saying
 * "0 documents". The line reads the same for every reader. Every entry
 * contributes its title; an entry the reader cannot open carries a mark.
 */
export function workingSetStatement(
  entries: readonly WorkingSetEntry[] | undefined,
): { line: string; entries: { title: string; mark: WorkingSetMark }[] } | null {
  if (entries === undefined || entries.length === 0) return null;
  const line = `Drawing on your working area — ${entries.length} document${entries.length === 1 ? '' : 's'}`;
  return {
    line,
    entries: entries.map((entry) => ({
      title: entry.label,
      mark: entry.openToYou ? null : entry.removed === true ? 'document removed' : 'not open to you',
    })),
  };
}
