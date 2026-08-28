// R1 — the ADR-number guard (2026-08-28). The decision record's equivalent of
// the three counter configurations (ticket-rules.mjs, question-rules.mjs,
// parking-rules.mjs), added before the failure rather than after it: `T-###`
// collided twice and `Q-###` once before each got its mutex, and an ADR is
// minted by exactly the session type that produced all three collisions — a
// long design conversation that claims a number at its end. Unlike the
// counters, ADRs are files, so the rule reads the directory rather than a
// document: no counter line exists to check, and none is added — the
// filesystem listing is the register.
//
// Two rules, both mechanical:
//   1. every file matches `NNNN-kebab-title.md` — the one naming rule the
//      architecture README states for the folder
//   2. no two files claim the same NNNN
//
// Deliberately NOT checked: gaps in the sequence (a number reserved and
// abandoned is history, not rot), and anything about content — an ADR is
// amended in place with a dated addendum or superseded by a later one, and
// judging that is a human call.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ADR_DIR = 'docs/architecture/adr';
const FILENAME = /^(\d{4})-[a-z0-9][a-z0-9-]*\.md$/;

/**
 * @param {string} root repository root
 * @returns {{ violations: string[], highest: number, next: number }}
 */
export function checkAdrNumbers(root) {
  const violations = [];
  let entries;
  try {
    entries = readdirSync(join(root, ADR_DIR), { withFileTypes: true });
  } catch {
    return {
      violations: [`${ADR_DIR}: not a directory — the ADR guard has nothing to check.`],
      highest: 0,
      next: 1,
    };
  }

  const byNumber = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = FILENAME.exec(entry.name);
    if (!match) {
      violations.push(
        `${ADR_DIR}/${entry.name}: does not match \`NNNN-kebab-title.md\` — the folder's one ` +
          `naming rule (docs/architecture/README.md). Rename it, or move it out of the decision record.`,
      );
      continue;
    }
    const number = Number(match[1]);
    const prior = byNumber.get(number);
    if (prior) {
      violations.push(
        `ADR-${match[1]} is claimed twice — ${ADR_DIR}/${prior} and ${ADR_DIR}/${entry.name}. ` +
          `Two sessions minted the same number; renumber the later one ` +
          `(derive it: \`pnpm run check:adrs -- --next\`).`,
      );
      continue;
    }
    byNumber.set(number, entry.name);
  }

  const highest = byNumber.size > 0 ? Math.max(...byNumber.keys()) : 0;
  return { violations, highest, next: highest + 1 };
}
