// T-479 — threads, progress and the response link: the pure parts.
//
// *In plain terms: every review comment is a thread, and a thread is in one of
// four states worked out from what is stored — never typed in by anyone. No
// state here is an approval: whether a reviewer is satisfied with an answer is
// Q-038, still open, and nothing below pretends to know it.*
//
// The four states:
//   no change  — the response says no change was made, and why
//   answered   — the response points at a revised passage in the next version
//   overtaken  — no response, and a later round exists: a later version went
//                out without this comment being answered
//   open       — anything else (no response yet)
//
// Overtaken cannot arise through the API today: both ways of cutting the next
// version (the project promotion and the internal freeze) refuse with
// `unanswered_comments` while the previous round has an unanswered comment. The
// state is still derived rather than assumed away, so it reads correctly the
// day that rule changes, and so the record never calls an abandoned comment
// "open".
import type { ReviewComment, ReviewCycle, Round } from '@infora/contracts';

export type ThreadState = 'open' | 'answered' | 'no_change' | 'overtaken';

export const THREAD_STATES: ReadonlyArray<{ value: ThreadState; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'answered', label: 'Answered' },
  { value: 'no_change', label: 'No change' },
  { value: 'overtaken', label: 'Overtaken' },
];

export type ThreadRound = Pick<Round, 'id' | 'number' | 'versionId' | 'versionReference'>;

export type Thread = { comment: ReviewComment; round: ThreadRound; state: ThreadState };

/** The state of one comment, given the round it was written in and the cycle's rounds. */
export function threadState(
  comment: Pick<ReviewComment, 'response'>,
  round: Pick<Round, 'number'>,
  rounds: ReadonlyArray<Pick<Round, 'number'>>,
): ThreadState {
  const response = comment.response;
  if (response !== null) {
    // a response carries a reason for no change or a revised passage (ADR-0004);
    // either way it is an answer
    return response.noChangeReason !== null ? 'no_change' : 'answered';
  }
  return rounds.some((r) => r.number > round.number) ? 'overtaken' : 'open';
}

/** Every comment the reader may see, newest round first, each round oldest comment first. */
export function buildThreads(cycle: Pick<ReviewCycle, 'rounds'>): Thread[] {
  const out: Thread[] = [];
  for (const round of [...cycle.rounds].sort((a, b) => b.number - a.number)) {
    const ordered = [...round.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const comment of ordered) {
      out.push({
        comment,
        round: { id: round.id, number: round.number, versionId: round.versionId, versionReference: round.versionReference },
        state: threadState(comment, round, cycle.rounds),
      });
    }
  }
  return out;
}

export type ThreadFilter = {
  state: ThreadState | null;
  reviewerId: string | null;
  codeId: string | null;
};

export const NO_FILTER: ThreadFilter = { state: null, reviewerId: null, codeId: null };

export const isFiltered = (f: ThreadFilter) => f.state !== null || f.reviewerId !== null || f.codeId !== null;

/** `ignore` leaves one facet out — a chip's count is what choosing it WOULD show, given the other filters. */
export function filterThreads(
  threads: ReadonlyArray<Thread>,
  f: ThreadFilter,
  ignore?: keyof ThreadFilter,
): Thread[] {
  return threads.filter(
    (t) =>
      (ignore === 'state' || f.state === null || t.state === f.state) &&
      (ignore === 'reviewerId' || f.reviewerId === null || t.comment.author.participantId === f.reviewerId) &&
      (ignore === 'codeId' || f.codeId === null || t.comment.acceptanceCode?.id === f.codeId),
  );
}

/** The distinct authors present, in the order they first appear. */
export function threadReviewers(threads: ReadonlyArray<Thread>): Array<{ participantId: string; name: string }> {
  const seen = new Map<string, string>();
  for (const t of threads) seen.set(t.comment.author.participantId, t.comment.author.name);
  return [...seen].map(([participantId, name]) => ({ participantId, name }));
}

/** The distinct acceptance codes present, in the order they first appear. */
export function threadCodes(threads: ReadonlyArray<Thread>): Array<{ id: string; code: string }> {
  const seen = new Map<string, string>();
  for (const t of threads) if (t.comment.acceptanceCode) seen.set(t.comment.acceptanceCode.id, t.comment.acceptanceCode.code);
  return [...seen].map(([id, code]) => ({ id, code }));
}

export type ProgressLine = { participantId: string; name: string; comments: number; done: boolean };

/**
 * ADR-0052 — one line per confirmed reviewer for a round that is open. `null`
 * (draw nothing, not zeros) when the round is not open or when the read
 * withheld the comments or the completions: for the authoring side an empty
 * list means "not yours to know", and a line reading "0 comments" would assert
 * the very absence the wall denies. Nothing here counts toward anything — no
 * "x of y", no lateness (ADR-0005).
 */
export function progressLines(
  round: Pick<Round, 'state' | 'comments' | 'reviewerCompletions' | 'commentsWithheld' | 'completionsWithheld'>,
  reviewers: ReadonlyArray<{
    participantId: string;
    name: string;
    confirmedAt: string | null;
    revokedAt: string | null;
    declinedAt: string | null;
  }>,
): ProgressLine[] | null {
  if (round.state !== 'open' || round.commentsWithheld || round.completionsWithheld) return null;
  return reviewers
    .filter((g) => g.confirmedAt !== null && g.revokedAt === null && g.declinedAt === null)
    .map((g) => ({
      participantId: g.participantId,
      name: g.name,
      comments: round.comments.filter((c) => c.author.participantId === g.participantId).length,
      done: round.reviewerCompletions.some((rc) => rc.participantId === g.participantId),
    }));
}

export function progressWords(line: ProgressLine): string {
  return `${line.name} — ${line.comments} comment${line.comments === 1 ? '' : 's'} · ${line.done ? 'done' : 'still reading'}`;
}

/** The link a response's revised passage becomes: the next version, opened at the change. */
export function responseLinkPath(
  projectId: string,
  containerId: string,
  response: Pick<NonNullable<ReviewComment['response']>, 'nextVersionId' | 'nextVersionAnchor'>,
): string | null {
  const quote = response.nextVersionAnchor?.quote;
  if (!response.nextVersionId || !quote) return null;
  const query = new URLSearchParams({ version: response.nextVersionId, quote });
  if (response.nextVersionAnchor?.page !== undefined) query.set('page', String(response.nextVersionAnchor.page));
  return `/projects/${projectId}/documents/${containerId}?${query.toString()}`;
}
