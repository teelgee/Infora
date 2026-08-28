// T-329 acceptance at the DB layer (migration 0056), beside the T-008
// append-only suite and the T-260 plan suite it takes its shape from: a
// notification is IMMUTABLE IN ITS EVENT and mutable only in its read state.
//
// Why the trigger rather than a convention: a notification is evidence that
// somebody was told. If the recipient, the event or the subject could be
// rewritten after the fact, "who was told what, when" would be an assertion
// rather than a property — and the row would be forgeable by exactly the people
// with reason to forge it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import * as s from './schema/index.js';

const { db, pool } = createDb();

// drizzle wraps PG errors (DrizzleQueryError); the trigger text is on .cause
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => {
      throw new Error('expected the statement to be rejected');
    },
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(`${error.message} ${error.cause?.message ?? ''}`).toMatch(pattern);
}

const stamp = Date.now();
let participantId: string;
let otherParticipantId: string;

async function newNotification(): Promise<string> {
  const [row] = await db
    .insert(s.notifications)
    .values({
      recipientParticipantId: participantId,
      eventType: 'round-issued',
      subjectKind: 'round',
      subjectId: crypto.randomUUID(),
    })
    .returning();
  return row!.id;
}

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t329db org ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t329db project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId: project!.id, role: 'owner' });
  const [user] = await db
    .insert(s.users)
    .values({ name: 't329db-una', email: `t329db-una-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  const [other] = await db
    .insert(s.users)
    .values({ name: 't329db-otto', email: `t329db-otto-${stamp}@test.local`, organisationId: org!.id })
    .returning();
  const [p] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId: project!.id })
    .returning();
  const [q] = await db
    .insert(s.participants)
    .values({ userId: other!.id, projectId: project!.id })
    .returning();
  participantId = p!.id;
  otherParticipantId = q!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('notifications: immutable event, mutable read state (migration 0056)', () => {
  it('lets the read state move, which is the whole point of the carve-out', async () => {
    const id = await newNotification();
    await db.update(s.notifications).set({ readAt: new Date() }).where(eq(s.notifications.id, id));
    const [row] = await db.select().from(s.notifications).where(eq(s.notifications.id, id));
    expect(row!.readAt).not.toBeNull();
  });

  it('rejects a rewritten recipient — the row names who was told', async () => {
    const id = await newNotification();
    await expectDbError(
      db
        .update(s.notifications)
        .set({ recipientParticipantId: otherParticipantId })
        .where(eq(s.notifications.id, id)),
      /immutable/,
    );
  });

  it('rejects a rewritten event type or subject', async () => {
    const id = await newNotification();
    await expectDbError(
      db.update(s.notifications).set({ eventType: 'mention' }).where(eq(s.notifications.id, id)),
      /immutable/,
    );
    await expectDbError(
      db
        .update(s.notifications)
        .set({ subjectKind: 'sandbox-comment' })
        .where(eq(s.notifications.id, id)),
      /immutable/,
    );
    await expectDbError(
      db
        .update(s.notifications)
        .set({ subjectId: crypto.randomUUID() })
        .where(eq(s.notifications.id, id)),
      /immutable/,
    );
  });

  it('takes any event type and subject kind the store is given — ADR-0049 §2’s guard', async () => {
    // the deferred `lock-flipped` event over an EXISTING subject kind, inserted
    // with no migration and no DDL: that is the guard passing. The vocabulary is
    // closed in `packages/contracts`, never in an enum here.
    const [row] = await db
      .insert(s.notifications)
      .values({
        recipientParticipantId: participantId,
        eventType: 'lock-flipped',
        subjectKind: 'sandbox-document',
        subjectId: crypto.randomUUID(),
      })
      .returning();
    expect(row!.eventType).toBe('lock-flipped');
  });
});
