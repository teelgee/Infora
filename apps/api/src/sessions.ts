// T-251 — the session record, and the two clocks that end one.
//
// Finding F4, half one. A signed cookie cannot be revoked: it is valid because
// it verifies. Removing a user, or signing out on a lost laptop, changed
// nothing, and the skeleton's cookie carried no expiry at all — so a cookie
// captured once was good for ever. The cookie now carries an opaque token
// rather than the user id, which turns it from a bearer assertion of identity
// into a pointer to a row the server controls.
//
// TWO CLOCKS, and conflating them is the mistake this file exists to avoid:
//
//   * the ABSOLUTE lifetime bounds how long a stolen cookie is useful AT ALL.
//     It is fixed at creation and never extended by activity — a session that
//     slid forward every time it was used would have no absolute bound, which
//     is the property being bought.
//   * the IDLE timeout ends a session someone walked away from. It slides, and
//     that is the whole point of it.
//
// Both thresholds are deployment configuration. The right numbers are a
// security-session decision, not a build-time one, so nothing here picks them.
import { randomBytes } from 'node:crypto';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

export type SessionPolicy = {
  /** the absolute lifetime, never extended by use */
  absoluteHours: number;
  /** the sliding idle window */
  idleMinutes: number;
};

/**
 * The out-of-the-box posture: a working day's absolute lifetime, a long-lunch
 * idle window. Deliberately modest — the skeleton's cookie was unbounded, and
 * an unbounded default is the one this ticket exists to remove. A deployment
 * that wants longer says so, and says it in its own configuration.
 */
export const DEFAULT_SESSION_POLICY: SessionPolicy = { absoluteHours: 12, idleMinutes: 60 };

export type SessionRow = typeof s.sessions.$inferSelect;

/** 256 bits of randomness, hex. Not a uuid: a uuid is 122 bits with structure. */
function mintToken(): string {
  return randomBytes(32).toString('hex');
}

export async function openSession(
  db: Db,
  userId: string,
  policy: SessionPolicy,
): Promise<SessionRow> {
  const [row] = await db
    .insert(s.sessions)
    .values({
      id: mintToken(),
      userId,
      // set ONCE, here. Nothing in this file or any other extends it.
      expiresAt: new Date(Date.now() + policy.absoluteHours * 3_600_000),
    })
    .returning();
  return row!;
}

export type SessionCheck =
  | { live: true; session: SessionRow }
  | { live: false; reason: 'unknown' | 'revoked' | 'expired' | 'idle' };

/**
 * Resolve a token to a live session, touching the idle clock if it is.
 *
 * Every ending is DISTINGUISHED internally — unknown, revoked, expired, idle —
 * because a support question is always "why was I signed out". None of it
 * reaches the client: the API answers `401 unauthenticated` for all four, the
 * same way denial and nonexistence read identically everywhere else.
 *
 * An idle or absolute expiry is WRITTEN DOWN when it is first noticed, not
 * merely computed. A session that quietly stops working leaves a row that still
 * says `revoked_at IS NULL`, and "is this session live" would then have two
 * answers depending on who asked.
 */
export async function resolveSession(
  db: Db,
  token: string,
  policy: SessionPolicy,
): Promise<SessionCheck> {
  const [row] = await db.select().from(s.sessions).where(eq(s.sessions.id, token)).limit(1);
  if (!row) return { live: false, reason: 'unknown' };
  if (row.revokedAt !== null) return { live: false, reason: 'revoked' };

  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await endSession(db, row.id, 'expired_idle');
    return { live: false, reason: 'expired' };
  }
  if (now - row.lastSeenAt.getTime() >= policy.idleMinutes * 60_000) {
    await endSession(db, row.id, 'expired_idle');
    return { live: false, reason: 'idle' };
  }

  // the idle clock slides; the absolute one does not, and is not touched here
  const [touched] = await db
    .update(s.sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(s.sessions.id, row.id))
    .returning();
  return { live: true, session: touched ?? row };
}

/** End one session. Idempotent: a session already ended keeps its first reason. */
export async function endSession(
  db: Db,
  token: string,
  reason: 'signed_out' | 'expired_idle' | 'revoked',
): Promise<void> {
  await db
    .update(s.sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(s.sessions.id, token), isNull(s.sessions.revokedAt)));
}

/**
 * End every live session of a user, and report how many.
 *
 * This is the capability the whole ticket is for. Nothing in the product calls
 * it yet — removing a Participant is a project act and a session is an account
 * one, and conflating them would sign a consultant out of every project because
 * one client ended. Wiring it to an org admin's "remove user" is its own
 * decision, and it is a decision that can now be made; before this it could not.
 */
export async function revokeUserSessions(db: Db, userId: string): Promise<number> {
  const ended = await db
    .update(s.sessions)
    .set({ revokedAt: new Date(), revokedReason: 'revoked' })
    .where(and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt)))
    .returning({ id: s.sessions.id });
  return ended.length;
}

/**
 * Close out sessions that ended by a clock and were never seen again.
 *
 * Without this, a session abandoned rather than signed out keeps
 * `revoked_at IS NULL` for ever, and "how many live sessions are there" — the
 * question an incident asks — answers wrongly. Not scheduled anywhere yet; the
 * job runner is an infra-session decision, and a function nothing calls is
 * honest about that in a way a cron entry pointing at nothing would not be.
 */
export async function sweepExpiredSessions(
  db: Db,
  policy: SessionPolicy,
  /**
   * Sweep one account rather than all of them. Not a test affordance bolted
   * on: "end everything stale for this user" is what an incident actually
   * asks, and it is the form an org admin's account action would take. It also
   * happens to be what makes this safe to exercise on a shared development
   * database, where an unscoped time-based sweep signs every other suite out —
   * which is how this parameter was discovered.
   */
  userId?: string,
): Promise<number> {
  const idleCutoff = new Date(Date.now() - policy.idleMinutes * 60_000);
  const stale = or(lt(s.sessions.expiresAt, sql`now()`), lt(s.sessions.lastSeenAt, idleCutoff));
  const swept = await db
    .update(s.sessions)
    .set({ revokedAt: new Date(), revokedReason: 'expired_idle' })
    .where(
      userId === undefined
        ? and(isNull(s.sessions.revokedAt), stale)
        : and(isNull(s.sessions.revokedAt), stale, eq(s.sessions.userId, userId)),
    )
    .returning({ id: s.sessions.id });
  return swept.length;
}
