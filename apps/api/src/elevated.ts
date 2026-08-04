// T-301 — the elevated tier's refusal record (the 2026-07-31 ruling).
//
// The gate itself was built by T-174/T-176. What this adds is the trace: a
// refusal left nothing behind, so "did anyone try to end this deliverable and
// get stopped" had no answer. The conflict register's refusal audit (T-246) is
// the precedent — a control nobody can see operating is a control nobody can
// audit.
//
// Recording and refusing are ONE call on purpose. Split into two, a later
// caller adds the gate and forgets the record, and the omission is invisible
// until someone asks the question the table exists to answer.
import type { Context } from 'hono';
import type { ApiError } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';

type ElevatedAction = (typeof s.elevatedAction.enumValues)[number];

/**
 * Record the refusal and return the 403. The caller's `detail` is passed
 * through rather than unified: `close-rejected` has answered
 * `elevated_required` and the plan routes `super_user_required` since T-174,
 * and quietly changing either would be a contract change dressed as an audit
 * ticket.
 */
export async function refuseElevated(
  c: Context,
  db: Db,
  detail: 'elevated_required' | 'super_user_required',
  refusal: {
    projectId: string;
    containerId: string;
    attemptedByParticipantId: string;
    action: ElevatedAction;
  },
): Promise<Response> {
  // identity from the record, never from the caller (contracts principle 3) —
  // the participant id comes off the resolved slice, not off the request
  await db.insert(s.elevatedRefusals).values(refusal);
  return c.json({ error: 'forbidden', detail } satisfies ApiError, 403);
}
