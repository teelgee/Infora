// T-465 — the record-state change record: one append-only line per change.
//
// *In plain terms: whenever a document is withdrawn, restored, superseded or
// returned to live, a line is kept saying what it was, what it became, who did
// it, when and why. Undo is safe to offer because the undone act stays on the
// record beside its undoing.*
//
// Every route that changes `containers.state` calls `recordStateChange` in the
// same breath, so the record and the state cannot disagree about what happened.
import { desc, eq } from 'drizzle-orm';
import type { ContainerStateChange } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

type State = 'live' | 'superseded' | 'withdrawn' | 'rejected';

export async function recordStateChange(
  db: Db,
  change: { containerId: string; projectId: string; from: State; to: State; reason?: string | null; participantId: string },
): Promise<void> {
  if (change.from === change.to) return;
  await db.insert(s.containerStateChanges).values({
    containerId: change.containerId,
    projectId: change.projectId,
    fromState: change.from,
    toState: change.to,
    reason: change.reason ?? null,
    changedByParticipantId: change.participantId,
  });
}

export async function listStateChanges(db: Db, containerId: string): Promise<ContainerStateChange[]> {
  const rows = await db
    .select({
      id: s.containerStateChanges.id,
      fromState: s.containerStateChanges.fromState,
      toState: s.containerStateChanges.toState,
      reason: s.containerStateChanges.reason,
      participantId: s.containerStateChanges.changedByParticipantId,
      name: s.users.name,
      at: s.containerStateChanges.changedAt,
    })
    .from(s.containerStateChanges)
    .innerJoin(s.participants, eq(s.participants.id, s.containerStateChanges.changedByParticipantId))
    .innerJoin(s.users, eq(s.users.id, s.participants.userId))
    .where(eq(s.containerStateChanges.containerId, containerId))
    .orderBy(desc(s.containerStateChanges.changedAt));
  return rows.map((r) => ({
    id: r.id,
    fromState: r.fromState,
    toState: r.toState,
    reason: r.reason,
    changedBy: { participantId: r.participantId, name: r.name },
    changedAt: r.at.toISOString(),
  }));
}
