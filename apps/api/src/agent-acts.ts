// T-370 — the two substrates ADR-0027's S10 amendment requires before any build
// may let an embedded agent act directly.
//
// The amendment (owner-ruled 2026-08-09) splits an agent's licence by the
// **nature of the work**, not by the surface. Content work keeps
// suggestion → human acceptance as doctrine. **Administrative** work — folder
// structures, schema setup, plan housekeeping; the menial coordination a person
// would otherwise click through the same endpoints — may be executed directly
// **within the invoker's own permissions**, on two conditions:
//
//   1. **the act is audited as agent-performed** — "agent runs gain first-class
//      actor identity in the audit trail" is the amendment's own phrase, and
//      `recordAgentAct` is where that identity is written;
//   2. **a visible "what the agent did" receipt with undo**, designed once and
//      reused by every administrative agent.
//
// It then says plainly that **nothing adopts the lane until this exists**. So
// this file is a mechanism with no caller: T-337 and T-364 stay preview-confirm,
// which the amendment reads as interaction design rather than doctrine.
//
// ⚠ **THE BOUNDARY IS ABSOLUTE AND IS NOT ENFORCED HERE, WHICH IS WHY IT IS
// WRITTEN HERE.** No agent act ever crosses the wall or fires a gate: promotion,
// issue, acceptance, transmittal, reviewer confirmation, purge and library
// removal are human acts, always. Nothing in this module makes any of those
// reachable — an agent still calls the same endpoints under the same guards, and
// what this records is that it was an agent doing so. A ticket that recorded an
// `agent_act` for a promotion would be breaking the amendment, not using it.
//
// ⚠ **`recordAgentAct` is deliberately not a wrapper that performs acts.** It is
// called BESIDE the ordinary write, in the same transaction where one exists,
// because the governance the amendment relies on is *the endpoint's ordinary
// guards* — a helper that performed writes on an agent's behalf would be a
// second write path, which is exactly what the amendment refuses to create.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type {
  AgentAct,
  ApiError,
  GetAgentReceiptResponse,
  UndoAgentActResponse,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { resolveSlice } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

type AgentActRow = typeof s.agentActs.$inferSelect;

/**
 * How an act kind is undone — **one handler per kind, registered at
 * composition**, exactly as workers and lenses are.
 *
 * It returns a REASON rather than throwing, because "cannot be undone" is a
 * normal answer the receipt has to render: the amendment permits direct
 * execution only for reversible or additive acts, and whether an additive act is
 * *still* removable is a runtime question — a folder the agent created that has
 * since filled with documents is one the handler must refuse.
 */
export type AgentActUndo = (
  db: Db,
  act: AgentActRow,
) => Promise<{ ok: true } | { ok: false; reason: string }>;

/**
 * The registry, **empty by default and empty in this deployment**.
 *
 * That is the substrate working rather than the substrate missing: nothing
 * performs an administrative act yet, so there is nothing to undo, and an act
 * kind with no handler is refused `not_undoable` rather than quietly succeeding.
 * The first adopting ticket adds one act kind and one entry here.
 */
export type AgentActUndoRegistry = Record<string, AgentActUndo>;

const toAct = (row: AgentActRow): AgentAct => ({
  id: row.id,
  runId: row.runId,
  act: row.act,
  subject: { kind: row.subjectKind, id: row.subjectId },
  summary: row.summary,
  performedAt: row.performedAt.toISOString(),
  undoneAt: row.undoneAt?.toISOString() ?? null,
});

/**
 * Record that an agent run performed an act. **Called beside the ordinary
 * write**, never instead of it.
 *
 * `tx` is accepted so an adopter can write the act and its record in one
 * transaction: an audit that can fail separately from the act it audits is an
 * audit with a gap in it (T-332's rule, one substrate along).
 */
export async function recordAgentAct(
  db: Db,
  act: {
    runId: string;
    act: string;
    subjectKind: string;
    subjectId: string;
    summary: string;
  },
): Promise<AgentAct> {
  const [row] = await db.insert(s.agentActs).values(act).returning();
  return toAct(row!);
}

export function agentActRoutes(deps: { db: Db; agentActUndo?: AgentActUndoRegistry }) {
  const app = new Hono<AppEnv>();
  const undoHandlers = deps.agentActUndo ?? {};

  /** A run this requester may read, with the participant who invoked it. The
   * run's own visibility rules are unchanged — this resolves through the
   * conversation's project exactly as the run read does. */
  async function runScope(c: Context, runId: string) {
    if (!isUuid(runId)) return null;
    const [row] = await deps.db
      .select({
        requesterParticipantId: s.runs.requesterParticipantId,
        projectId: s.conversations.projectId,
      })
      .from(s.runs)
      .innerJoin(s.conversations, eq(s.runs.conversationId, s.conversations.id))
      .where(eq(s.runs.id, runId))
      .limit(1);
    if (!row) return null;
    const slice = await resolveSlice(deps.db, c.get('user'), row.projectId);
    if (!slice) return null;
    return { ...row, slice };
  }

  // The receipt — "what the agent did", keyed on the RUN because the run is the
  // unit of work a person invoked: "what did that do?" is a question about a
  // turn, not about a folder.
  app.get('/runs/:runId/agent-acts', async (c) => {
    const scope = await runScope(c, c.req.param('runId'));
    if (!scope) return notFound(c);
    const rows = await deps.db
      .select()
      .from(s.agentActs)
      .where(eq(s.agentActs.runId, c.req.param('runId')))
      .orderBy(asc(s.agentActs.performedAt));
    return c.json({
      runId: c.req.param('runId'),
      acts: rows.map(toAct),
      // the receipt belongs to the run, and no ruling gives anybody authority
      // over another person's agent turn — decided here so the surface never
      // offers a control it will be refused on
      canUndo: scope.requesterParticipantId === scope.slice.participantId,
    } satisfies GetAgentReceiptResponse);
  });

  app.post('/agent-acts/:id/undo', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return notFound(c);
    const [row] = await deps.db.select().from(s.agentActs).where(eq(s.agentActs.id, id)).limit(1);
    if (!row) return notFound(c);
    const scope = await runScope(c, row.runId);
    // the run's own visibility first, so an act on a project the requester
    // cannot reach reads as nonexistence rather than as a refusal
    if (!scope) return notFound(c);
    if (scope.requesterParticipantId !== scope.slice.participantId) {
      return notFound(c);
    }
    if (row.undoneAt !== null) {
      // refused rather than silently accepted: a second call means the caller
      // believes something is still standing that is not
      return c.json({ error: 'conflict', detail: 'already_undone' } satisfies ApiError, 409);
    }
    const handler = undoHandlers[row.act];
    if (!handler) {
      return c.json({ error: 'conflict', detail: 'not_undoable' } satisfies ApiError, 409);
    }
    const result = await handler(deps.db, row);
    if (!result.ok) {
      // the handler's own reason, passed through rather than unified: "the
      // folder now holds documents" and "the plan row has been promoted" are
      // different answers and the receipt should say which
      return c.json({ error: 'conflict', detail: result.reason } satisfies ApiError, 409);
    }
    const [updated] = await deps.db
      .update(s.agentActs)
      .set({ undoneAt: new Date() })
      // guard the interval in the statement: two concurrent undos must not both
      // stamp it, or the receipt would show one act undone twice
      .where(and(eq(s.agentActs.id, row.id), isNull(s.agentActs.undoneAt)))
      .returning();
    if (!updated) {
      return c.json({ error: 'conflict', detail: 'already_undone' } satisfies ApiError, 409);
    }
    return c.json({ act: toAct(updated) } satisfies UndoAgentActResponse);
  });

  return app;
}
