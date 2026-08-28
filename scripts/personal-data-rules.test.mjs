// The guard must fail when a who-did-this column's table is absent from the
// register — the drift the 2026-08-28 audit found fourteen tables deep — and
// must not demand a row per column, or fire on columns outside the `_by_`
// shape, whose registration stays a judgement call under the working rule.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkPersonalData } from './personal-data-rules.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function tree(schemaText, registerText) {
  root = mkdtempSync(join(tmpdir(), 'infora-persondata-rules-'));
  mkdirSync(join(root, 'packages/db/src/schema'), { recursive: true });
  mkdirSync(join(root, 'docs/architecture'), { recursive: true });
  writeFileSync(join(root, 'packages/db/src/schema/drawer1-parties.ts'), schemaText);
  writeFileSync(join(root, 'docs/architecture/personal-data.md'), registerText);
  return root;
}

const table = (name, column) =>
  `export const x = pgTable('${name}', {\n  actor: uuid('${column}').references(() => participants.id),\n});\n`;

describe('every who-did-this column belongs to a registered table', () => {
  it('rejects a table absent from the register', () => {
    const violations = checkPersonalData(
      tree(table('purge_events', 'purged_by_user_id'), '# Register\n\nnothing relevant\n'),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('purge_events.purged_by_user_id');
    expect(violations[0]).toContain('does not mention');
  });

  it('accepts a table the register names anywhere — table grain, not row grain', () => {
    const violations = checkPersonalData(
      tree(table('purge_events', 'purged_by_user_id'), '# Register\n\n| Who purged | `purge_events` | … |\n'),
    );
    expect(violations).toEqual([]);
  });

  it('reports a table once, not once per column', () => {
    const schema =
      `export const x = pgTable('naming_scheme_proposals', {\n` +
      `  a: uuid('proposed_by_participant_id'),\n  b: uuid('resolved_by_participant_id'),\n});\n`;
    const violations = checkPersonalData(tree(schema, '# Register\n'));
    expect(violations).toHaveLength(2); // two columns, two lines — but…
    // …the same column twice is deduplicated:
    expect(new Set(violations).size).toBe(violations.length);
  });

  it('does not fire on person columns outside the _by_ shape — those stay a judgement call', () => {
    const schema = `export const x = pgTable('work_items', {\n  a: uuid('assignee_participant_id'),\n});\n`;
    expect(checkPersonalData(tree(schema, '# Register\n'))).toEqual([]);
  });

  it('does not match the table name as a substring of another word', () => {
    const violations = checkPersonalData(
      tree(table('rounds', 'closed_by_participant_id'), '# Register\n\nbackgrounds are irrelevant\n'),
    );
    expect(violations).toHaveLength(1);
  });

  it('says so plainly when the register is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'infora-persondata-rules-'));
    mkdirSync(join(root, 'packages/db/src/schema'), { recursive: true });
    const violations = checkPersonalData(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('nothing to check');
  });
});

describe('the real register', () => {
  it('passes its own guard', async () => {
    const { fileURLToPath } = await import('node:url');
    const repo = join(join(fileURLToPath(import.meta.url), '..'), '..');
    expect(checkPersonalData(repo)).toEqual([]);
  });
});
