// T-453 — the editing engine's lock, riding the check-out (ADR-0043 §2).
//
// *In plain terms: when someone opens a file to edit in the browser, Infora
// marks it checked out — exactly as a freeze does — so nobody can replace,
// convert, freeze or delete it underneath them. The only new fact is which
// editing engine holds it, because the engine proves it is the holder by
// repeating a string it chose when it took the file.*
//
// ONE MECHANISM. Every function here moves `head_locked` and appends to
// `sandbox_checkout_events` — the same column and the same trail ADR-0032's
// freeze uses (T-180). `wopi_lock` only names which engine lock holds the head;
// migration 0070's CHECK makes an engine lock beside an unlocked head
// impossible in the database itself.
//
// A WOPI lock lapses 30 minutes after it was last asserted (the WOPI
// protocol's own rule — an engine that crashed must not hold a file for ever).
// Nothing sweeps: a lapsed lock is released the next time anything asks,
// attributed to the person whose pass took it, with the reason written down.
import { and, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

export const ENGINE_LOCK_MINUTES = 30;
const lapseAt = () => new Date(Date.now() + ENGINE_LOCK_MINUTES * 60_000);

/** Who checked the document out, and when — the most recent check-out row. */
export async function checkoutHolder(
  db: Db,
  documentId: string,
): Promise<{ participantId: string; name: string; since: Date } | null> {
  const [row] = await db
    .select({
      participantId: s.sandboxCheckoutEvents.byParticipantId,
      name: s.users.name,
      since: s.sandboxCheckoutEvents.createdAt,
    })
    .from(s.sandboxCheckoutEvents)
    .innerJoin(s.participants, eq(s.participants.id, s.sandboxCheckoutEvents.byParticipantId))
    .innerJoin(s.users, eq(s.users.id, s.participants.userId))
    .where(
      and(
        eq(s.sandboxCheckoutEvents.sandboxDocumentId, documentId),
        eq(s.sandboxCheckoutEvents.action, 'checked_out'),
      ),
    )
    .orderBy(desc(s.sandboxCheckoutEvents.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Release an engine lock whose 30 minutes ran out, if there is one. Called
 * before any act that a held head would refuse, and at the top of every WOPI
 * lock call, so a crashed engine never keeps a file checked out. A no-op on a
 * person's freeze (no `wopi_lock`) and on a live engine lock.
 */
export async function releaseLapsedEngineLock(db: Db, documentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [doc] = await tx
      .select({ wopiLock: s.sandboxDocuments.wopiLock })
      .from(s.sandboxDocuments)
      .where(
        and(
          eq(s.sandboxDocuments.id, documentId),
          isNotNull(s.sandboxDocuments.wopiLock),
          lte(s.sandboxDocuments.wopiLockExpiresAt, sql`now()`),
        ),
      )
      .for('update');
    if (!doc) return;
    const holder = await checkoutHolder(tx as unknown as Db, documentId);
    await releaseEngineLock(tx as unknown as Db, documentId, doc.wopiLock!, holder!.participantId, 'engine lock lapsed');
  });
}

/**
 * The in-transaction form (review 2026-10-18): the caller already holds the
 * document row FOR UPDATE, so a lapsed lock is released on the spot and the
 * effective lock state handed back. It exists so the WOPI routes have NO
 * pre-authentication write path — the standalone form above now serves only
 * the authenticated, non-WOPI acts (replace, convert, freeze, delete).
 */
export async function releaseIfLapsed(
  tx: Db,
  doc: { id: string; headLocked: boolean; wopiLock: string | null; wopiLockExpiresAt: Date | null },
): Promise<{ headLocked: boolean; wopiLock: string | null }> {
  if (doc.wopiLock === null || doc.wopiLockExpiresAt === null || doc.wopiLockExpiresAt.getTime() > Date.now()) {
    return { headLocked: doc.headLocked, wopiLock: doc.wopiLock };
  }
  const holder = await checkoutHolder(tx, doc.id);
  await releaseEngineLock(tx, doc.id, doc.wopiLock, holder!.participantId, 'engine lock lapsed');
  return { headLocked: false, wopiLock: null };
}

/** The engine takes an unlocked head: the check-out, with the engine's string. */
export async function takeEngineLock(tx: Db, documentId: string, lock: string, participantId: string) {
  await tx
    .update(s.sandboxDocuments)
    .set({ headLocked: true, wopiLock: lock, wopiLockExpiresAt: lapseAt() })
    .where(eq(s.sandboxDocuments.id, documentId));
  await tx.insert(s.sandboxCheckoutEvents).values({
    sandboxDocumentId: documentId,
    action: 'checked_out',
    byParticipantId: participantId,
    wopiLock: lock,
  });
}

/** The holder re-asserts its lock: the 30 minutes start again. Not an event. */
export async function extendEngineLock(tx: Db, documentId: string) {
  await tx
    .update(s.sandboxDocuments)
    .set({ wopiLockExpiresAt: lapseAt() })
    .where(eq(s.sandboxDocuments.id, documentId));
}

/**
 * WOPI's UnlockAndRelock: the holder swaps its string for a new one. The head
 * stays locked throughout, and the trail records both halves so "which lock
 * held this at 3pm" still has an answer.
 */
export async function swapEngineLock(
  tx: Db,
  documentId: string,
  oldLock: string,
  newLock: string,
  participantId: string,
) {
  await tx
    .update(s.sandboxDocuments)
    .set({ wopiLock: newLock, wopiLockExpiresAt: lapseAt() })
    .where(eq(s.sandboxDocuments.id, documentId));
  await tx.insert(s.sandboxCheckoutEvents).values([
    { sandboxDocumentId: documentId, action: 'released', byParticipantId: participantId, wopiLock: oldLock },
    { sandboxDocumentId: documentId, action: 'checked_out', byParticipantId: participantId, wopiLock: newLock },
  ]);
}

/** The check-in: the head unlocks and the trail says which engine lock ended. */
export async function releaseEngineLock(
  tx: Db,
  documentId: string,
  lock: string,
  participantId: string,
  reason: string | null = null,
) {
  await tx
    .update(s.sandboxDocuments)
    .set({ headLocked: false, wopiLock: null, wopiLockExpiresAt: null })
    .where(eq(s.sandboxDocuments.id, documentId));
  await tx.insert(s.sandboxCheckoutEvents).values({
    sandboxDocumentId: documentId,
    action: 'released',
    byParticipantId: participantId,
    wopiLock: lock,
    reason,
  });
}
