// R1 — the numbering guard, checked in CI beside the dependency matrix
// (dep-rules.mjs) and the source guards (source-rules.mjs).
//
// This exists because the convention it enforces has been broken three times.
// Concurrent agent sessions minted overlapping TICKET numbers at T-208–T-210
// and again at T-223–T-233, the second forcing a mid-slice renumber; those two
// produced `check:tickets`. On 2026-08-03 two sessions both reached for Q-034
// on the grill tracker and it was caught by eye and by `git diff`, because
// `check:tickets` guards `T-###` and nothing guarded `Q-###` (T-343).
//
// Both counters are a hand-maintained "Next free number:" line acting as a
// mutex, and a mutex maintained by prose is a mutex two agents can both walk
// past. The engine is therefore one implementation over two configurations
// (ticket-rules.mjs, question-rules.mjs) — a second copy would drift, and the
// drift would be in the half nobody is currently looking at.
//
// Two rules, both mechanical:
//   1. a number is DEFINED at most once across the live document and its history
//   2. the counter line is strictly ahead of every number claimed anywhere
//
// Rule 1 catches the true collision (two different entries, one number) and the
// hygiene failure it hides behind (a closed slice or a ruled question copied
// into history rather than moved). Rule 2 catches the stale counter that lets
// the next session collide again.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A DEFINITION is the entry form both documents use: a bullet whose bold run
// opens with the number and an em-dash. Strikethrough (~~T-123 — …~~) is
// admitted so a struck entry still holds its number. Prose mentions, ranges
// ("T-220–T-222 built") and status notes deliberately do not match — they are
// references, and only a definition claims a number.
const definitionPattern = (prefix) =>
  new RegExp(String.raw`^\s*-\s*(~{0,2})\*\*${prefix}-(\d+)\s*—\s*(.+?)(?:\*\*|~~)`, 'gm');

// A MENTION is any reference at all, anywhere. Used only by rule 2, where
// over-matching is the safe direction: a number named in prose is a number in
// use, whatever shape it was named in.
const mentionPattern = (prefix) => new RegExp(String.raw`\b${prefix}-(\d+)\b`, 'g');

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

function definitions(text, source, prefix) {
  const found = [];
  for (const match of text.matchAll(definitionPattern(prefix))) {
    const line = text.slice(0, match.index).split('\n').length;
    found.push({
      number: Number(match[2]),
      title: match[3].trim(),
      struck: match[1] === '~~',
      source,
      line,
    });
  }
  return found;
}

/** `Q-7` reads as a typo where `Q-007` reads as the entry. Both counters are
 *  three digits and have been since the first one was minted. */
export const pad = (n) => String(n).padStart(3, '0');

/**
 * @typedef {object} CounterKind
 * @property {string} prefix    the number's letter — `T` or `Q`
 * @property {string} noun      singular, for messages — "ticket" / "question"
 * @property {string} nounPlural
 * @property {string} live      repo-relative path to the document holding open entries
 * @property {string} archive   repo-relative path to its history
 * @property {RegExp} counter   matches the counter line, capturing its number
 * @property {string} moveAdvice  what to do when an entry appears in both files
 * @property {boolean} [strikeThroughIsAPointer]  when true, a STRUCK live entry
 *   beside the same entry in the archive is the document's deliberate
 *   navigation stub, not a copy-instead-of-move. True for the grill tracker,
 *   which leaves a one-line "✅ Ruled … Record in grill-history.md" behind so a
 *   reader who looks up `Q-007` finds where it went; false for the board, whose
 *   convention is that a closing slice moves whole. A guard that fires on a
 *   document's own established convention gets disabled within a week.
 */

/**
 * @param {string} root repository root
 * @param {CounterKind} kind
 * @returns {{ violations: string[], highest: number, next: number, counter: number|null }}
 */
export function checkNumbering(root, kind) {
  const {
    prefix,
    noun,
    nounPlural,
    live,
    archive,
    counter: COUNTER,
    moveAdvice,
    strikeThroughIsAPointer = false,
  } = kind;
  const liveText = read(root, live);
  const archiveText = read(root, archive);
  const log = gitSubjects(root);
  const violations = [];

  // ---- rule 1: one definition per number -------------------------------
  const defined = new Map();
  for (const def of [
    ...definitions(liveText, live, prefix),
    ...definitions(archiveText, archive, prefix),
  ]) {
    const prior = defined.get(def.number);
    if (!prior) {
      defined.set(def.number, def);
      continue;
    }
    const collision = normalise(prior.title) !== normalise(def.title);
    // the pointer stub: same entry, struck in the live document, recorded in
    // the archive. Two DIFFERENT entries on one number are still a collision
    // however either is formatted — that is the failure this rule exists for.
    if (!collision && strikeThroughIsAPointer && prior.struck && prior.source === live) continue;
    violations.push(
      collision
        ? `${prefix}-${pad(def.number)} is defined twice, for different ${nounPlural} — ` +
            `${prior.source}:${prior.line} "${prior.title}" vs ${def.source}:${def.line} "${def.title}". ` +
            `Two sessions claimed the same number; renumber the later one and bump the counter.`
        : `${prefix}-${pad(def.number)} is defined twice, same ${noun} — ` +
            `${prior.source}:${prior.line} and ${def.source}:${def.line}. ` +
            moveAdvice,
    );
  }

  // ---- rule 2: the counter is ahead of every claim ----------------------
  const counterMatch = liveText.match(COUNTER);
  const counter = counterMatch ? Number(counterMatch[1]) : null;

  // The counter line names a number in order to declare it FREE, so it is the
  // one mention that is not a claim. Scanning it as one makes the guard fail
  // the instant it is correct — which is exactly what it did on its first run.
  const mentions = (text) => [...text.matchAll(mentionPattern(prefix))].map((m) => Number(m[1]));
  const claimed = [
    ...mentions(liveText.replace(COUNTER, '')),
    ...mentions(archiveText),
    ...mentions(log),
  ];
  const highest = claimed.length > 0 ? Math.max(...claimed) : 0;
  const next = highest + 1;

  if (counter === null) {
    violations.push(
      `${live}: no "**Next free number: ${prefix}-###**" line found — that line is the ` +
        `mutex every session reads before minting a number.`,
    );
  } else if (counter <= highest) {
    violations.push(
      `${live}: counter says ${prefix}-${pad(counter)} is free, but ${prefix}-${pad(highest)} is already claimed. ` +
        `The next session to trust the counter would collide. Set it to ${prefix}-${pad(next)}.`,
    );
  }

  return { violations, highest, next, counter };
}
