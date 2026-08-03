// R1 — the QUESTION-number guard (T-343). The mirror of the ticket guard, on
// the shared engine (counter-rules.mjs); this file is only the grill tracker's
// configuration.
//
// `check:tickets` guarded `T-###` from the day two sessions collided on one.
// Nothing guarded `Q-###`, and on 2026-08-03 two concurrent sessions both
// reached for `Q-034` — caught by eye and by `git diff`, which is to say caught
// by luck. Running the design and build lanes together is now the normal
// condition rather than the exception, so the tracker's counter needs the same
// mutex the board's has.
import { checkNumbering } from './counter-rules.mjs';

export const QUESTIONS = {
  prefix: 'Q',
  noun: 'question',
  nounPlural: 'questions',
  live: 'docs/grill-sessions/grill-questions.md',
  archive: 'docs/grill-sessions/grill-history.md',
  // the tracker's line carries a full stop inside the bold run — `**Next free
  // number: Q-036.**` — where the board's does not. Admitting both is one
  // optional character and saves reformatting a document to suit its guard.
  counter: /\*\*Next free number:\s*Q-(\d+)\.?\*\*/,
  moveAdvice: 'A ruled question MOVES to grill-history.md, it is not copied there.',
  // the tracker deliberately leaves a STRUCK one-line pointer behind when a
  // question is ruled — "✅ Ruled 2026-08-01 → ADR-0048 … Record in
  // grill-history.md" — so a reader who looks up Q-007 finds where it went.
  // Six entries follow that pattern today. Reading them as copy-instead-of-move
  // would make the guard fail on a correct tracker on its first run, which is
  // how a guard gets switched off. Two DIFFERENT questions on one number still
  // fire, struck or not — that is the collision this exists to catch.
  strikeThroughIsAPointer: true,
};

/**
 * @param {string} root repository root
 * @returns {{ violations: string[], highest: number, next: number, counter: number|null }}
 */
export function checkQuestionNumbers(root) {
  return checkNumbering(root, QUESTIONS);
}
