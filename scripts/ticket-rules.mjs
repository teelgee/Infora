// R1 — the ticket-number guard, checked in CI beside the dependency matrix
// (dep-rules.mjs) and the source guards (source-rules.mjs).
//
// This one exists because the convention it enforces has already been broken
// twice. Concurrent agent sessions minted overlapping numbers at T-208–T-210
// and again at T-223–T-233, the second forcing a mid-slice renumber. The board
// carries a hand-maintained `Next free number:` line as the mutex, and a mutex
// maintained by prose is a mutex two agents can both walk past.
//
// Two rules, both mechanical:
//   1. a ticket number is DEFINED at most once across the board and history
//   2. the counter line is strictly ahead of every number claimed anywhere
//
// Rule 1 catches the true collision (two different tickets, one number) and the
// hygiene failure it hides behind (a closed slice copied into history rather
// than moved). Rule 2 catches the stale counter that lets the next session
// collide again.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BOARD = 'docs/build/plan.md';
const HISTORY = 'docs/build/plan-history.md';

// A DEFINITION is the board's ticket form: a bullet whose bold run opens with
// the number and an em-dash. Strikethrough (~~T-123 — …~~) is admitted so a
// struck ticket still holds its number. Prose mentions, ranges ("T-220–T-222
// built") and status notes deliberately do not match — they are references,
// and only a definition claims a number.
const DEFINITION = /^\s*-\s*~{0,2}\*\*T-(\d+)\s*—\s*(.+?)(?:\*\*|~~)/gm;

// A MENTION is any ticket reference at all, anywhere. Used only by rule 2,
// where over-matching is the safe direction: a number named in prose is a
// number in use, whatever shape it was named in.
const MENTION = /\bT-(\d+)\b/g;

const COUNTER = /\*\*Next free number:\s*T-(\d+)\*\*/;

function read(root, file) {
  try {
    return readFileSync(join(root, file), 'utf8');
  } catch {
    return '';
  }
}

/** Commit subjects claim numbers too — `T-250: the untrusted-content barrier`. */
function gitSubjects(root) {
  try {
    return execFileSync('git', ['log', '--format=%s', '-500'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // no git, shallow clone, or not a repository — the file rules still hold,
    // and a guard that fails when history is unavailable would be worse than
    // one that checks a little less.
    return '';
  }
}

function normalise(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 48);
}

function definitions(text, source) {
  const found = [];
  for (const match of text.matchAll(DEFINITION)) {
    const line = text.slice(0, match.index).split('\n').length;
    found.push({
      number: Number(match[1]),
      title: match[2].trim(),
      source,
      line,
    });
  }
  return found;
}

function mentions(text) {
  return [...text.matchAll(MENTION)].map((m) => Number(m[1]));
}

/**
 * @param {string} root repository root
 * @returns {{ violations: string[], highest: number, next: number, counter: number|null }}
 */
export function checkTicketNumbers(root) {
  const board = read(root, BOARD);
  const history = read(root, HISTORY);
  const log = gitSubjects(root);
  const violations = [];

  // ---- rule 1: one definition per number -------------------------------
  const defined = new Map();
  for (const def of [...definitions(board, BOARD), ...definitions(history, HISTORY)]) {
    const prior = defined.get(def.number);
    if (!prior) {
      defined.set(def.number, def);
      continue;
    }
    const collision = normalise(prior.title) !== normalise(def.title);
    violations.push(
      collision
        ? `T-${def.number} is defined twice, for different tickets — ` +
            `${prior.source}:${prior.line} "${prior.title}" vs ${def.source}:${def.line} "${def.title}". ` +
            `Two sessions claimed the same number; renumber the later one and bump the counter.`
        : `T-${def.number} is defined twice, same ticket — ` +
            `${prior.source}:${prior.line} and ${def.source}:${def.line}. ` +
            `A closing slice MOVES to plan-history.md, it is not copied there.`,
    );
  }

  // ---- rule 2: the counter is ahead of every claim ----------------------
  const counterMatch = board.match(COUNTER);
  const counter = counterMatch ? Number(counterMatch[1]) : null;

  // The counter line names a number in order to declare it FREE, so it is the
  // one mention that is not a claim. Scanning it as one makes the guard fail
  // the instant it is correct — which is exactly what it did on its first run.
  const claimed = [
    ...mentions(board.replace(COUNTER, '')),
    ...mentions(history),
    ...mentions(log),
  ];
  const highest = claimed.length > 0 ? Math.max(...claimed) : 0;
  const next = highest + 1;

  if (counter === null) {
    violations.push(
      `${BOARD}: no "**Next free number: T-###**" line found — that line is the ` +
        `mutex every session reads before minting a number.`,
    );
  } else if (counter <= highest) {
    violations.push(
      `${BOARD}: counter says T-${counter} is free, but T-${highest} is already claimed. ` +
        `The next session to trust the counter would collide. Set it to T-${next}.`,
    );
  }

  return { violations, highest, next, counter };
}
