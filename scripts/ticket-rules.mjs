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
  moveAdvice: 'A closing slice MOVES to plan-history.md, it is not copied there.',
};

/**
 * @param {string} root repository root
 * @returns {{ violations: string[], highest: number, next: number, counter: number|null }}
 */
export function checkTicketNumbers(root) {
  return checkNumbering(root, TICKETS);
}
