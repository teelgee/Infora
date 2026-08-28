// T-370 — the "what the agent did" receipt, **designed once** so every
// administrative agent renders the same thing (ADR-0027's S10 amendment,
// owner-ruled 2026-08-09).
//
// It lives in the kit rather than beside its first caller because the amendment
// asks for one receipt reused by every administrative agent, and a component
// written next to the first adopter becomes that adopter's receipt — the second
// agent then copies it, and the two drift apart in the direction of whatever
// each was doing. There is no caller yet, deliberately: nothing adopts the
// direct-execution lane until this substrate exists.
//
// **Three things the shape enforces, each from the amendment:**
//
//   * **it lists acts, never a summary of acts.** "The agent tidied your
//     folders" is not a receipt — a receipt is what you can check line by line,
//     and it is what makes direct execution reviewable AFTER THE FACT rather
//     than merely permitted.
//   * **undo is per act.** The amendment's boundary is per act (reversible or
//     additive only), so an "undo everything" control would offer to reverse
//     acts whose handlers may individually refuse.
//   * **an undone act stays on the receipt, struck.** Currency by state: the
//     record of what the agent did is not edited by undoing it, and a receipt
//     that emptied itself would leave a person unable to answer "what did it do
//     that I then reversed".
import type { AgentAct, AgentReceipt as AgentReceiptData } from '@infora/contracts';

export function AgentReceipt(props: {
  receipt: AgentReceiptData;
  /** per-act, because the amendment's boundary is per-act */
  onUndo?: (act: AgentAct) => void;
  /** the act currently being undone, so the row can disable itself */
  undoing?: string | null;
}) {
  const { receipt } = props;
  if (receipt.acts.length === 0) return null;
  const standing = receipt.acts.filter((a) => a.undoneAt === null).length;

  return (
    <div className="agent-receipt">
      <div className="agent-receipt-head">
        What the agent did
        <span className="count">
          {standing} of {receipt.acts.length}
          {standing === receipt.acts.length ? '' : ' still standing'}
        </span>
      </div>
      {receipt.acts.map((act) => (
        <div key={act.id} className={act.undoneAt === null ? 'agent-act' : 'agent-act undone'}>
          <span className="what">{act.summary}</span>
          {act.undoneAt !== null && <span className="state">Undone</span>}
          {act.undoneAt === null && receipt.canUndo && props.onUndo !== undefined && (
            <button
              type="button"
              className="btn quiet"
              disabled={props.undoing === act.id}
              onClick={() => props.onUndo!(act)}
            >
              {props.undoing === act.id ? 'Undoing…' : 'Undo'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
