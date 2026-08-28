// The docs-index guard, checked in CI beside the dependency matrix
// (dep-rules.mjs), the source guards (source-rules.mjs) and the ticket counter
// (ticket-rules.mjs).
//
// Why it exists: `docs/build/tickets-a2-polish.md` was a 363-line ticket pack
// for work that shipped on 2026-07-26. It was never in the folder's index,
// nothing linked to it, and it sat there superseded for five weeks before
// anyone noticed. The index convention was written down and still failed,
// because a convention nobody executes is a convention nobody follows.
//
// Two rules, in both directions:
//   1. every documented file in an indexed folder appears in that folder's
//      README table — no orphans
//   2. every file the README names exists — no dangling rows
//
// Deliberately narrow: this checks *presence in the index*, not the lifecycle
// or maturity marker a row carries. Judging whether a document is still live is
// a human call and a guard that guessed at it would be wrong often enough to
// get switched off.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Folders whose README carries an artefact table. Add a folder here and its
 * contents become guarded; that is the intended way to extend this.
 *
 * `docs/architecture` joined on 2026-08-28, when the operating envelope and the
 * personal-data register moved up out of the build layer. It had four loose
 * files and no index at all, so extending the guard was the price of the move
 * rather than an extra: a file leaving a guarded folder for an unguarded one is
 * how the thing this guard exists to prevent happens again.
 *
 * NON-RECURSIVE, deliberately. `adr/`, `components/`, `diagrams/` and
 * `user-story-screens/` sit under `docs/architecture` and are NOT covered:
 * each carries its own convention (ADR numbering, the component-N naming rule,
 * tldraw sources, generated captures), and an index table restating them would
 * be a second place to keep current. Their README says so, so nobody assumes
 * an orphan in one of them would be caught here.
 */
const INDEXED = ['docs/architecture', 'docs/build', 'docs/build/spikes'];

/** Documented file types. The README itself is the index, never a row in it. */
const DOCUMENTED = /\.(md|html)$/;
const NOT_A_ROW = new Set(['README.md']);

/** A row names its file in backticks: `| \`plan.md\` | ▶ Live | … |` */
const ROW = /^\|\s*`([^`]+)`\s*\|/gm;

/**
 * Blank fenced code blocks, preserving line structure, so an EXAMPLE row shown
 * inside a fence is not read as a real index row.
 *
 * Without this the guard is defeated by its own documentation: the moment a
 * README explains the convention by showing `| \`plan.md\` | ▶ Live | … |` in a
 * fence, `plan.md` counts as indexed whether or not the table names it — and
 * the orphan this guard exists to catch walks straight through.
 *
 * NOTE the asymmetry with `link-rules.mjs`'s `withoutCode`, which also blanks
 * inline spans. It must not here: a row's filename IS an inline code span, so
 * stripping those would blank every real row and the guard would pass on
 * everything.
 */
function withoutFences(text) {
  return text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
}

function listed(readme) {
  return new Set([...withoutFences(readme).matchAll(ROW)].map((m) => m[1]));
}

function present(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && DOCUMENTED.test(e.name) && !NOT_A_ROW.has(e.name))
    .map((e) => e.name);
}

/**
 * @param {string} root repository root
 * @returns {string[]} human-readable violations; empty means the index agrees
 *   with the folder in both directions
 */
export function checkDocsIndex(root) {
  const violations = [];

  for (const folder of INDEXED) {
    const dir = join(root, folder);
    let exists;
    try {
      exists = statSync(dir).isDirectory();
    } catch {
      exists = false;
    }
    // A folder named here that is not there is a VIOLATION, not a skip. Skipping
    // it meant a single typo in INDEXED silently switched the guard off for that
    // folder while CI stayed green — the guard reporting success for a folder it
    // was no longer looking at, which is worse than not guarding it at all.
    if (!exists) {
      violations.push(
        `${folder}: named in INDEXED but not a directory — fix the path in scripts/docs-rules.mjs, or remove the entry if the folder is genuinely gone.`,
      );
      continue;
    }

    let readme;
    try {
      readme = readFileSync(join(dir, 'README.md'), 'utf8');
    } catch {
      violations.push(`${folder}: no README.md — an indexed folder must carry its index.`);
      continue;
    }

    const indexed = listed(readme);
    const files = present(dir);

    for (const file of files) {
      if (indexed.has(file)) continue;
      violations.push(
        `${folder}/${file}: not in ${folder}/README.md. Add a row naming its lifecycle ` +
          `(Live / Living reference / Closed / Derived) — or delete the file if it is spent.`,
      );
    }

    for (const row of indexed) {
      if (files.includes(row)) continue;
      violations.push(
        `${folder}/README.md names \`${row}\`, which does not exist. ` +
          `Remove the row, or restore the file if it was moved by mistake.`,
      );
    }
  }

  return violations;
}
