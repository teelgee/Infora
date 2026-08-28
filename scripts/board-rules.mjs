// The board-hygiene guard, checked in CI beside the docs index (docs-rules.mjs),
// the link guard (link-rules.mjs), the dependency matrix (dep-rules.mjs), the
// source guards (source-rules.mjs) and the two counters (ticket-rules.mjs,
// question-rules.mjs).
//
// Why it exists: on 2026-08-28, 52% of plan.md — 135 KB across 59 entries — was
// work that had already shipped. Not one of them was somebody ignoring the rule.
// The rule itself was the problem: "when a SLICE closes, its block moves to
// plan-history.md" works only while slices close in a day, and Slice Ask had
// been part-closed for four weeks with 22 finished tickets that could never
// become movable. The board carried its own history because the convention had
// no way to let go of it.
//
// The rule now runs at ticket grain, and this is what keeps it running. Every
// other guard in this folder was written after a prose convention failed; this
// one is written the same day its convention changes, which is the only time
// the cost of writing it is lower than the cost of the drift.
//
// WHAT IT CHECKS, mechanically, under `## Building for V1` and nowhere else:
//
//   1. a CLOSED entry is exactly ONE line. That is the enforceable form of
//      "its record moved" — a closed entry with continuation lines is a record
//      that stayed.
//   2. a closed entry links to plan-history.md, so the record is reachable
//      rather than merely gone.
//   3. the ticket number appears in plan-history.md, so the link is not a
//      promise the archive cannot keep.
//
// WHAT IT DELIBERATELY DOES NOT CHECK. Whether an entry *should* be closed is a
// human call — the same restraint docs-rules.mjs takes with lifecycle markers.
// A guard that guessed at doneness would be wrong often enough to get switched
// off, and being switched off is the failure mode every guard here is built
// against.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The section the rule applies to. The deferred register is not live work. */
const SECTION_START = '## Building for V1';
const SECTION_END = '## Beyond V1';

/** An entry opens a bullet and names its ticket, struck or not. */
const ENTRY = /^- (?:~~)?\*\*(?:~~)?(T-\d{3})/;

/**
 * A ticket is DONE when it was built, or a spike returned findings.
 *
 * `✅ Unblocked` is the trap and is excluded by name: it records a GATE
 * clearing, not the ticket closing. T-310 and T-311 both carry it and are both
 * open — a rule keyed on the tick alone would have filed two live tickets into
 * the archive, which is how a guard causes the loss it was written to prevent.
 */
const DONE = /✅\s*\*{0,2}(?:Built|built|Findings|Minted and built|Closed)/;

const HISTORY_LINK = /\]\(plan-history\.md(#[^)]*)?\)/;

/**
 * @param {string} root repository root
 * @returns {string[]} human-readable violations; empty means the board has let
 *   go of everything it has finished
 */
export function checkBoard(root) {
  const violations = [];

  let plan;
  let history;
  try {
    plan = readFileSync(join(root, 'docs/build/plan.md'), 'utf8');
    history = readFileSync(join(root, 'docs/build/plan-history.md'), 'utf8');
  } catch {
    return ['docs/build/plan.md or plan-history.md is missing — the board guard has nothing to check.'];
  }

  const from = plan.indexOf(SECTION_START);
  const to = plan.indexOf(SECTION_END);
  if (from === -1 || to === -1 || to < from) {
    return [
      `docs/build/plan.md: could not find "${SECTION_START}" … "${SECTION_END}". The guard is scoped to that section; if it was renamed, rename it here too.`,
    ];
  }

  const lines = plan.slice(from, to).split('\n');
  for (let at = 0; at < lines.length; at += 1) {
    const match = ENTRY.exec(lines[at]);
    if (match === null) continue;

    // gather the entry: its own line plus every line until the next entry,
    // heading or blank-line boundary
    const entry = [lines[at]];
    for (let next = at + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (ENTRY.test(line) || line.startsWith('#') || line.startsWith('**') || line.startsWith('*') || line.trim() === '') break;
      entry.push(line);
    }

    const text = entry.join('\n');
    const id = match[1];
    if (!DONE.test(text) && !lines[at].startsWith('- ~~')) continue; // open: nothing to enforce

    if (entry.length > 1) {
      violations.push(
        `docs/build/plan.md: ${id} is closed but its entry still runs to ${entry.length} lines. A closed ticket's record moves to plan-history.md in the same commit and leaves a one-line pointer — see the standing conventions at the top of the board.`,
      );
    }
    if (!HISTORY_LINK.test(text)) {
      violations.push(
        `docs/build/plan.md: ${id} is closed but does not link to plan-history.md. The pointer is what makes the record reachable; without it the entry is not archived, it is deleted.`,
      );
    }
    if (!history.includes(id)) {
      violations.push(
        `docs/build/plan-history.md: ${id} is struck off the board and points here, but the archive does not mention it. The move did not happen, or happened to the wrong file.`,
      );
    }
  }

  return violations;
}
