// The personal-data register's reader (2026-08-28). CLAUDE.md's working rule —
// a ticket that introduces, stores or derives data about a NAMED PERSON says
// so, and names where that data is deleted — was enforced by nothing: no
// script read docs/architecture/personal-data.md, and an audit found the
// register missing every attribution column in a whole built drawer while
// claiming to be "derived from the schema". The register is the one record
// with external consequences (the DPA and a customer's DPIA are drafted from
// it), so quiet undercounting is the failure this guard exists to stop.
//
// WHAT IT CHECKS, mechanically: every schema column matching
// `*_by_participant_id` / `*_by_user_id` — the "which named person did this"
// shape — belongs to a table the register mentions by name. Table grain,
// deliberately: the register's rows group columns into narrative, and a guard
// demanding one row per column would fight the document's own shape.
//
// WHAT IT DELIBERATELY DOES NOT CHECK: whether the register's row is TRUE, or
// whether a person-referencing column outside the `_by_` shape (an assignee,
// a mentions array, a subject id) is registered — those need judgement, and
// the register's own audit trail is the control. This guard is the mechanical
// floor: a new who-did-this column cannot merge while the register has never
// heard of its table.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA_DIR = 'packages/db/src/schema';
const REGISTER = 'docs/architecture/personal-data.md';

const TABLE = /pgTable\(\s*'([a-z0-9_]+)'/g;
const ACTOR_COLUMN = /'([a-z0-9_]*_by_(?:participant|user)_id)'/g;

/**
 * @param {string} root repository root
 * @returns {string[]} human-readable violations; empty means every table
 *   holding a who-did-this column is named in the register
 */
export function checkPersonalData(root) {
  const violations = [];

  let register;
  try {
    register = readFileSync(join(root, REGISTER), 'utf8');
  } catch {
    return [`${REGISTER}: missing — the personal-data guard has nothing to check against.`];
  }

  let files;
  try {
    files = readdirSync(join(root, SCHEMA_DIR)).filter((f) => f.endsWith('.ts'));
  } catch {
    return [`${SCHEMA_DIR}: not a directory — the personal-data guard has nothing to scan.`];
  }

  for (const file of files.sort()) {
    const text = readFileSync(join(root, SCHEMA_DIR, file), 'utf8');

    // attribute each actor column to the nearest preceding pgTable declaration
    const tables = [...text.matchAll(TABLE)].map((m) => ({ name: m[1], at: m.index }));
    if (tables.length === 0) continue;

    for (const match of text.matchAll(ACTOR_COLUMN)) {
      const owner = [...tables].reverse().find((t) => t.at < match.index);
      if (!owner) continue;
      if (new RegExp(`\\b${owner.name}\\b`).test(register)) continue;
      violations.push(
        `${SCHEMA_DIR}/${file}: \`${owner.name}.${match[1]}\` names a person, and ${REGISTER} ` +
          `does not mention \`${owner.name}\` anywhere. The working rule (CLAUDE.md): data about ` +
          `a named person is registered where it is introduced — add the table's row, and say ` +
          `where the data is deleted.`,
      );
    }
  }

  // one violation per table reads better than one per column
  return [...new Set(violations)];
}
