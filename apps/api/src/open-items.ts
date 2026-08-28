// T-332 — what promotion has to COUNT (ADR-0049 §7, and ADR-0048's own
// consequences handing the obligation back).
//
// Promotion is **blocked** by open comment threads or open findings — owner-
// ruled 2026-08-01, and deliberately against the recommendation to warn. The
// two lists are treated identically so the surface never has to explain why one
// stops you and the other does not, which is why they are counted here, side by
// side, in one call rather than at two call sites that could diverge.
//
// ⚠ **The findings half counts a store that does not exist yet, and that is
// stated rather than hidden.** T-328 built the finding *schema*; the checker
// (T-310) that produces findings is unbuilt and gated on open questions, so
// there is no `findings` table for this to read. The count is therefore
// structurally zero today — and the gate is still built over BOTH lists,
// because T-332's Deps say so and because the alternative is a second ticket
// later that has to find every place the count should have been. **This
// function is the one place the checker's store attaches**; nothing else in the
// promotion path knows a finding exists.
//
// Building it as a seam rather than as an omission is what makes the empty case
// testable: `promotion-gate.test.ts` asserts zero explicitly, so a build that
// wired findings in and broke the shape fails loudly instead of quietly
// counting nothing forever.
import { and, eq, isNull } from 'drizzle-orm';
import type { OpenFindingCount } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

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
 * The findings half — **the seam, and the only place it is**.
 *
 * `OpenFindingCount` is T-328's own type, so when the checker lands this body
 * changes and nothing that reads it does. The parameters are the ones the real
 * query needs (`sandbox_document_id` is the grain ADR-0049 §7's count is taken
 * at, per T-328's own note on the field), so the signature does not change
 * either.
 */
/* eslint-disable @typescript-eslint/no-unused-vars --
 * The parameters are unused ON PURPOSE and are kept rather than added later:
 * they are exactly what the real query needs, so when the checker's store lands
 * only this body changes and no caller does. Deleting them would make the seam
 * cheaper to write and more expensive to close. */
function countOpenFindings(db: Db, sandboxDocumentId: string): Promise<OpenFindingCount> {
  return Promise.resolve(NO_FINDINGS);
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/** Does this document have loose ends? Both lists, one answer — §7's whole
 * point is that the surface never distinguishes them. */
export const hasOpenItems = (items: OpenItems): boolean =>
  items.threads > 0 || items.findings.open > 0;
