// T-332 — what promotion has to COUNT (ADR-0049 §7, and ADR-0048's own
// consequences handing the obligation back).
//
// Promotion is **blocked** by open comment threads or open findings — owner-
// ruled 2026-08-01, and deliberately against the recommendation to warn. The
// two lists are treated identically so the surface never has to explain why one
// stops you and the other does not, which is why they are counted here, side by
// side, in one call rather than at two call sites that could diverge.
//
// ✅ **THE FINDINGS HALF IS WIRED — T-310, 2026-08-31.** It used to count a
// store that did not exist: T-328 built the finding *schema*, the checker that
// produces findings was unbuilt, and the count was therefore a structural zero
// stated in a comment rather than hidden. The gate was still built over BOTH
// lists, because the alternative was a second ticket later that had to find
// every place the count should have been.
//
// **Building it as a seam rather than as an omission is what made this cheap**,
// and it is worth recording that it worked as intended: closing it changed one
// function body, in one file, and no caller — the signature was already the one
// the real query needed. `promotion-gate.test.ts`'s empty case still asserts
// zero on a document with no findings, and it still passes, which is the other
// half of what the seam bought.
import { and, eq, isNull } from 'drizzle-orm';
import type { OpenFindingCount } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { countOpenFindings } from './findings';

export type OpenItems = { threads: number; findings: OpenFindingCount };

export const NO_FINDINGS: OpenFindingCount = {
  open: 0,
  bySeverity: { required: 0, advisory: 0 },
};

/**
 * Open **threads**, not open comments: the gate is about unresolved
 * conversations, and counting replies would make a thread with four answers
 * look four times as blocking as one with none. A thread is a root comment
 * (`parent_comment_id IS NULL`) whose status is still `open` — the same
 * vocabulary `FindingStatus` deliberately borrowed (T-328), so the count is one
 * shape over both lists.
 */
export async function countOpenItems(db: Db, sandboxDocumentId: string): Promise<OpenItems> {
  const threads = await db
    .select({ id: s.sandboxComments.id })
    .from(s.sandboxComments)
    .where(
      and(
        eq(s.sandboxComments.sandboxDocumentId, sandboxDocumentId),
        isNull(s.sandboxComments.parentCommentId),
        eq(s.sandboxComments.status, 'open'),
      ),
    );
  return { threads: threads.length, findings: await countOpenFindings(db, sandboxDocumentId) };
}

/**
 * The findings half — **the seam, now closed** (T-310).
 *
 * The real query lives in [findings.ts](findings.ts) beside the writes, so
 * there is one file that knows the store's shape. It is re-exported through
 * this module's own name so every caller of the gate still reaches it here:
 * this function is, as it always said it was, **the one place the checker's
 * store attaches to promotion**, and nothing else in the promotion path knows a
 * finding exists.
 *
 * ⚠ `NO_FINDINGS` stays exported. It is no longer this function's answer, but
 * it is still the shape a caller with nothing to count wants, and deleting it
 * would churn call sites for nothing.
 */
export { countOpenFindings };

/** Does this document have loose ends? Both lists, one answer — §7's whole
 * point is that the surface never distinguishes them. */
export const hasOpenItems = (items: OpenItems): boolean =>
  items.threads > 0 || items.findings.open > 0;
