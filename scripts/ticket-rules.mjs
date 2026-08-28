// R1 — the TICKET-number guard. The engine is shared with the question guard
// (counter-rules.mjs, T-343); this file is only the board's configuration.
//
// It exists because the convention it enforces has already been broken twice:
// concurrent agent sessions minted overlapping numbers at T-208–T-210 and again
// at T-223–T-233, the second forcing a mid-slice renumber.
import { checkNumbering } from './counter-rules.mjs';

export const TICKETS = {
  prefix: 'T',
  noun: 'ticket',
  nounPlural: 'tickets',
  live: 'docs/build/plan.md',
  archive: 'docs/build/plan-history.md',
  counter: /\*\*Next free number:\s*T-(\d+)\*\*/,
  moveAdvice:
    "A closed ticket's RECORD moves to plan-history.md and a struck one-line pointer stays on the board; " +
    'what is here is a second full entry, not a pointer.',
  // 2026-08-28 — the board adopted the tracker's convention, so it adopts the
  // tracker's tolerance with it. Until then the board's rule was that a closing
  // SLICE moved whole, leaving nothing behind, and this flag was correctly off.
  //
  // That rule stopped fitting when slices stopped closing in a day: Slice Ask
  // was part-closed for four weeks, so its finished tickets could never become
  // movable and 52% of the board was work already done. The move now runs at
  // ticket grain and leaves a struck one-liner — which is exactly what
  // `question-rules.mjs` has always done, for exactly the same reason: a reader
  // who looks up T-259 should find where it went, not an absence.
  //
  // What this does NOT relax is the collision it exists for. Two DIFFERENT
  // tickets on one number still fire, struck or not (counter-rules.mjs), and
  // that is the failure that cost two renumbers.
  strikeThroughIsAPointer: true,
};

/**
 * @param {string} root repository root
 * @returns {{ violations: string[], highest: number, next: number, counter: number|null }}
 */
export function checkTicketNumbers(root) {
  return checkNumbering(root, TICKETS);
}
