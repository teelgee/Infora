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
 */
const INDEXED = ['docs/build'];

/** Documented file types. The README itself is the index, never a row in it. */
const DOCUMENTED = /\.(md|html)$/;
const NOT_A_ROW = new Set(['README.md']);

/** A row names its file in backticks: `| \`plan.md\` | ▶ Live | … |` */
const ROW = /^\|\s*`([^`]+)`\s*\|/gm;

function listed(readme) {
  return new Set([...readme.matchAll(ROW)].map((m) => m[1]));
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
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
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
