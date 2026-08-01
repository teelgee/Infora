// The guard must fail on the orphan it was written for, and on the reverse
// case, and must stay quiet on the shapes a real README uses.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDocsIndex } from './docs-rules.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function tree(files) {
  root = mkdtempSync(join(tmpdir(), 'infora-docs-rules-'));
  mkdirSync(join(root, 'docs/build'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(root, 'docs/build', name), body);
  }
  return root;
}

const index = (...rows) =>
  '# The build layer\n\n| Doc | Lifecycle | Purpose | Maturity |\n|---|---|---|---|\n' +
  rows.map((r) => `| \`${r}\` | ▶ **Live** | a doc | 🟢 |`).join('\n') +
  '\n';

describe('orphans', () => {
  it('rejects a file the index does not name', () => {
    // the real case: tickets-a2-polish.md, superseded and unnoticed for weeks
    const violations = checkDocsIndex(
      tree({ 'README.md': index('plan.md'), 'plan.md': '', 'tickets-a2-polish.md': '' }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('tickets-a2-polish.md');
    expect(violations[0]).toContain('not in docs/build/README.md');
  });

  it('names the lifecycle vocabulary in the message, so the fix is obvious', () => {
    const violations = checkDocsIndex(tree({ 'README.md': index(), 'stray.md': '' }));
    expect(violations[0]).toContain('Live / Living reference / Closed / Derived');
  });

  it('guards html as well as markdown', () => {
    const violations = checkDocsIndex(tree({ 'README.md': index(), 'data-model.html': '' }));
    expect(violations).toHaveLength(1);
  });
});

describe('dangling rows', () => {
  it('rejects an index row whose file does not exist', () => {
    const violations = checkDocsIndex(tree({ 'README.md': index('plan.md', 'gone.md'), 'plan.md': '' }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('`gone.md`, which does not exist');
  });

  it('rejects an indexed folder with no README at all', () => {
    root = mkdtempSync(join(tmpdir(), 'infora-docs-rules-'));
    mkdirSync(join(root, 'docs/build'), { recursive: true });
    writeFileSync(join(root, 'docs/build/plan.md'), '');
    const violations = checkDocsIndex(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('no README.md');
  });
});

describe('what the guard must not do', () => {
  it('does not demand the README index itself', () => {
    const violations = checkDocsIndex(tree({ 'README.md': index('plan.md'), 'plan.md': '' }));
    expect(violations).toEqual([]);
  });

  it('ignores non-documented files', () => {
    const violations = checkDocsIndex(
      tree({ 'README.md': index('plan.md'), 'plan.md': '', '.gitkeep': '', 'notes.txt': '' }),
    );
    expect(violations).toEqual([]);
  });

  it('does not judge the lifecycle marker a row carries', () => {
    // deciding whether a doc is still live is a human call; a guard that
    // guessed would be wrong often enough to get switched off
    const readme =
      '| Doc | Lifecycle | Purpose | Maturity |\n|---|---|---|---|\n' +
      '| `plan.md` | 🦆 nonsense | a doc | 🟢 |\n';
    expect(checkDocsIndex(tree({ 'README.md': readme, 'plan.md': '' }))).toEqual([]);
  });
});

describe('the real repository', () => {
  it('passes its own guard', async () => {
    const { fileURLToPath } = await import('node:url');
    const repo = join(join(fileURLToPath(import.meta.url), '..'), '..');
    expect(checkDocsIndex(repo)).toEqual([]);
  });
});
