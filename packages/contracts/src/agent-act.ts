// T-370 — the agent act and its receipt (ADR-0027's S10 amendment, owner-ruled
// 2026-08-09).
//
// **This is a substrate with no consumer yet, deliberately.** The amendment
// licenses an embedded agent to execute **administrative** work directly —
// folder structures, schema setup, plan housekeeping — within the invoker's own
// permissions, on two conditions: the act is **audited as agent-performed**, and
// there is a visible **"what the agent did" receipt with undo**. It then says
// plainly that **nothing adopts that lane until those substrates exist**. T-337
// and T-364 stay preview-confirm, which the amendment reads as interaction
// design rather than doctrine.
//
// So the types here describe a mechanism, not a feature, and two of the choices
// only make sense in that light:
//
//   * **`act` is a bare string with no union.** A closed set of act kinds would
//     be values no code can produce — T-301's rule (*a value the schema carries
//     and no code can set is a claim the schema makes falsely*) applied to a
//     type instead of a column. The first adopting ticket names its own act.
//   * **there is no `undoable` field.** Whether an act can still be undone is a
//     runtime question the undo handler answers at the moment of asking, not a
//     boolean frozen when the act was recorded. An added folder that has since
//     filled with documents is additive and no longer safely removable.
//
// The amendment's boundary is absolute and lives outside this type: **no agent
// act ever crosses the wall or fires a gate.** Promotion, issue, acceptance,
// transmittal, reviewer confirmation, purge and library removal are human acts,
// always. Nothing here is a licence to record one of those.

import type { Id } from './shared';

/**
 * One act an agent run performed.
 *
 * `runId` is the **first-class actor identity** the amendment asks for: every
 * write in the platform is attributed to the invoking participant alone, and
 * the run is recorded, but the act itself never says an agent performed it.
 * This field is that sentence — and it carries a precondition worth stating,
 * because it is not free: an agent adopting the direct lane **must record a
 * Run**, and T-364's structure agent writes none today (its own named
 * residual).
 */
export type AgentAct = {
  id: Id;
  runId: Id;
  /** the act kind, owned by whichever ticket first performs one */
  act: string;
  /** what it acted on — polymorphic, resolved by the undo handler for its kind */
  subject: { kind: string; id: Id };
  /**
   * What the agent did, in words. Stored rather than derived, for
   * `purge_events`' reason: after an undo the subject is gone, and a receipt
   * naming only a uuid answers "something happened" and nothing else.
   */
  summary: string;
  performedAt: string;
  /** null = still standing. Currency by state; an undone act is never deleted */
  undoneAt: string | null;
};

/**
 * The receipt: **what the agent did, in one place**, designed once so every
 * administrative agent renders the same thing rather than inventing its own.
 *
 * It is keyed on the run because the run is the unit of work a person invoked —
 * *"what did that do?"* is a question about a turn, not about a folder.
 */
export type AgentReceipt = {
  runId: Id;
  acts: AgentAct[];
  /**
   * Whether THIS requester may undo — true only for the run's own requester.
   * The receipt belongs to the run, the run names its requester, and no ruling
   * gives anybody else authority over another person's agent turn; deciding
   * server-side keeps the surface from offering a control it will be refused on.
   */
  canUndo: boolean;
};

export type GetAgentReceiptResponse = AgentReceipt;

/** `POST /agent-acts/:id/undo` — the act as it now stands. Idempotence is not
 * offered: undoing twice is refused rather than silently accepted, because the
 * second call means the caller believes something is still standing that is not. */
export type UndoAgentActResponse = { act: AgentAct };
