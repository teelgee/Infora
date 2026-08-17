// R1 — the PARKED-PROPOSAL number guard. The third configuration of the shared
// counter engine (counter-rules.mjs), beside the board's (ticket-rules.mjs) and
// the tracker's (question-rules.mjs).
//
// It exists for the reason the other two do, before the failure rather than
// after it: `T-###` was guarded only once two sessions collided on a number,
// and `Q-###` only once two sessions reached for `Q-034` on the same day. The
// parking lot is written to by exactly the kind of session that produced both
// collisions — a long design conversation that mints a number at its end — so
// it gets the mutex on day one rather than after the third incident.
//
// The archive is `grill-history.md`: a parked proposal leaves the lot by being
// taken up, and taking it up is a grill session, whose record is what
// grill-history holds. A struck one-line pointer stays behind in the lot, the
// convention the tracker already uses and this engine already understands.
import { checkNumbering } from './counter-rules.mjs';

export const PARKED = {
  prefix: 'P',
  noun: 'parked proposal',
  nounPlural: 'parked proposals',
  live: 'docs/grill-sessions/parking-lot.md',
  archive: 'docs/grill-sessions/grill-history.md',
  // the same shape as the tracker's line, full stop inside the bold run
  counter: /\*\*Next free number:\s*P-(\d+)\.?\*\*/,
  moveAdvice:
    'A proposal that has been taken up MOVES to grill-history.md with its session record; the lot keeps only a struck one-line pointer.',
  strikeThroughIsAPointer: true,
};

/**
 * @param {string} root repository root
 * @returns {{ violations: string[], highest: number, next: number, counter: number|null }}
 */
export function checkParkedNumbers(root) {
  return checkNumbering(root, PARKED);
}
