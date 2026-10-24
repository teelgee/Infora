// Appointment helpers shared by the plan routes and the one-step internal
// review request (T-478): who may be named, who stands as lead, and the single
// revoke-and-grant that names a lead reviewer. One copy, so the two doors cannot
// disagree about the one-live-lead rule.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

export async function liveParticipant(db: Db, participantId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(s.participants)
    .where(
      and(
        eq(s.participants.id, participantId),
        eq(s.participants.projectId, projectId),
        isNull(s.participants.removedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The live lead grant that would collide with a new one — the application-side
 * twin of the one-live-lead partial unique index, and it must carry the index's
 * exact rule or the two disagree. T-372: a DECLINED reviewer appointment is not
 * a live lead, so a refusal never blocks the replacement it exists to ask for. */
export async function liveLead(db: Db, side: 'authors' | 'reviewers', containerId: string) {
  const table = side === 'authors' ? s.deliverableAuthors : s.deliverableReviewers;
  const [row] = await db
    .select({ id: table.id, participantId: table.participantId })
    .from(table)
    .where(
      and(
        eq(table.containerId, containerId),
        eq(table.isLead, true),
        isNull(table.revokedAt),
        ...(side === 'reviewers' ? [isNull(s.deliverableReviewers.declinedAt)] : []),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Name a lead reviewer, replacing the standing one in the caller's transaction
 * (T-377): revoke-and-grant are inseparable under the one-live-lead invariant.
 * The caller decides the standing lead and whether the grant auto-confirms. */
export async function nameLeadReviewer(
  tx: Db,
  input: {
    containerId: string;
    targetParticipantId: string;
    standing: { id: string } | null;
    grantedByParticipantId: string;
    autoConfirm: boolean;
  },
): Promise<string> {
  if (input.standing) {
    await tx
      .update(s.deliverableReviewers)
      .set({ revokedAt: sql`now()` })
      .where(eq(s.deliverableReviewers.id, input.standing.id));
  }
  const [grant] = await tx
    .insert(s.deliverableReviewers)
    .values({
      containerId: input.containerId,
      participantId: input.targetParticipantId,
      isLead: true,
      grantedByParticipantId: input.grantedByParticipantId,
      confirmedByParticipantId: input.autoConfirm ? input.grantedByParticipantId : null,
      confirmedAt: input.autoConfirm ? sql`now()` : null,
    })
    .returning();
  return grant!.id;
}
