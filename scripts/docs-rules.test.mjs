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

/**
 * Every folder in INDEXED must exist, or the guard now reports it (a typo in
 * that list used to switch the guard off silently). So a temp tree scaffolds
 * the siblings the case under test is not about — an empty folder with an
 * empty table is valid: no files to orphan, no rows to dangle.
 */
// every folder in INDEXED, because a folder named there and not present is now
// a violation in its own right. Keep this in step with docs-rules.mjs — the
// tests failing loudly when it drifts is the guard's own rule applying to it.
const SIBLINGS = [
  'docs/architecture',
  'docs/build',
  'docs/build/spikes',
  'docs/design',
  'docs/design/mockups',
  'docs/reference',
  'docs/grill-sessions',
];

/**
 * @param at       temp root
 * @param except   a folder to create WITHOUT a README (the no-index case)
 * @param omit     folders not to create at all (the missing-folder case)
 */
function scaffold(at, except, omit = []) {
  for (const folder of SIBLINGS) {
    if (omit.includes(folder)) continue;
    mkdirSync(join(at, folder), { recursive: true });
    if (folder !== except) writeFileSync(join(at, folder, 'README.md'), index());
  }
}

function tree(files, folder = 'docs/build') {
  root = mkdtempSync(join(tmpdir(), 'infora-docs-rules-'));
  scaffold(root);
  mkdirSync(join(root, folder), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(root, folder, name), body);
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
    expect(violations[0]).toContain('Live / Living reference / Finished / Derived');
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
    scaffold(root, 'docs/build'); // every sibling valid; this one has no index
    writeFileSync(join(root, 'docs/build/plan.md'), '');
    const violations = checkDocsIndex(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('no README.md');
  });

  it('reports a folder named in INDEXED that is not there', () => {
    // the typo case: `docs/architecure`. This used to `continue` silently, so
    // one transposed letter unguarded a whole folder with CI still green.
    root = mkdtempSync(join(tmpdir(), 'infora-docs-rules-'));
    scaffold(root, null, ['docs/architecture']); // every folder but this one
    const violations = checkDocsIndex(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('docs/architecture');
    expect(violations[0]).toContain('INDEXED');
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

describe('the legend cannot fork (2026-08-28)', () => {
  // vocabulary checking, not lifecycle judging: WHICH glyph a row carries stays
  // a human call, but a legend glyph paired with a word the legend does not
  // define is how "✅ Closed" survived its own rename in three files
  const withCell = (cell) =>
    '| Doc | Lifecycle | Purpose | Maturity |\n|---|---|---|---|\n' +
    `| \`plan.md\` | ${cell} | a doc | 🟢 |\n`;

  it('rejects the renamed-away word', () => {
    const violations = checkDocsIndex(tree({ 'README.md': withCell('✅ **Closed**'), 'plan.md': '' }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('✅ Finished');
  });

  it('rejects an invented value on a legend glyph', () => {
    const violations = checkDocsIndex(tree({ 'README.md': withCell('♻ **Open** — not built yet'), 'plan.md': '' }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('Living reference');
  });

  it('accepts every legend pairing, with or without bold and a suffix', () => {
    for (const cell of ['▶ **Live**', '♻ Living reference', '✅ **Finished** — built by T-271', '⚙ Derived']) {
      expect(checkDocsIndex(tree({ 'README.md': withCell(cell), 'plan.md': '' }))).toEqual([]);
    }
  });

  it('leaves a non-lifecycle cell alone — maturity glyphs and prose are not the legend', () => {
    for (const cell of ['🔴 **Status unresolved — needs a decision**', 'The written rulebook']) {
      expect(checkDocsIndex(tree({ 'README.md': withCell(cell), 'plan.md': '' }))).toEqual([]);
    }
  });
});

describe('every indexed folder, not just the first', () => {
  it('guards docs/architecture — the folder the 2026-08-28 move added', () => {
    // a guard that covers a folder in name only is the failure it exists to
    // prevent, one directory along
    const violations = checkDocsIndex(tree({ 'README.md': index(), 'stray.md': '' }, 'docs/architecture'));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('not in docs/architecture/README.md');
  });

  it('is non-recursive, as documented — a subfolder orphan is NOT caught', () => {
    // asserted so the limit is a decision on the record rather than a surprise:
    // adr/, components/ and diagrams/ carry their own conventions
    root = tree({ 'README.md': index('plan.md'), 'plan.md': '' });
    mkdirSync(join(root, 'docs/build/nested'), { recursive: true });
    writeFileSync(join(root, 'docs/build/nested/orphan.md'), '');
    expect(checkDocsIndex(root)).toEqual([]);
  });
});

describe('the guard against its own documentation', () => {
  it('ignores an example row inside a fenced block', () => {
    // a README explaining the convention by SHOWING a row must not thereby
    // index the file that row names
    const readme =
      index('plan.md') +
      '\n```\n| `ghost.md` | \u25b6 **Live** | an example, not an index row | \ud83d\udfe2 |\n```\n';
    const violations = checkDocsIndex(tree({ 'README.md': readme, 'plan.md': '' }));
    expect(violations).toEqual([]); // `ghost.md` is neither indexed nor dangling
  });

  it('still reads real rows, whose filenames are themselves inline code', () => {
    // the asymmetry with link-rules.mjs: fences are blanked, inline spans are not
    const violations = checkDocsIndex(tree({ 'README.md': index('plan.md'), 'plan.md': '' }));
    expect(violations).toEqual([]);
  });
});

describe('the real repository', () => {
  it('passes its own guard', async () => {
    const { fileURLToPath } = await import('node:url');
    const repo = join(join(fileURLToPath(import.meta.url), '..'), '..');
    expect(checkDocsIndex(repo)).toEqual([]);
  });
});
