// The link guard must fail on the silent break it exists for — a relative path
// left pointing at a file's old home — and must stay quiet on every link shape
// the docs legitimately use: externals, anchors, line references into code,
// example links inside code fences.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkLinks, slugsOf, withoutBaseline } from './link-rules.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function tree(files) {
  root = mkdtempSync(join(tmpdir(), 'infora-link-rules-'));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(root, dirname(name)), { recursive: true });
    writeFileSync(join(root, name), body);
  }
  return root;
}

describe('broken links', () => {
  it('rejects a relative link whose target does not exist', () => {
    const { violations } = checkLinks(
      tree({ 'docs/a.md': 'see [the plan](build/plan.md)\n' }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('docs/a.md:1');
    expect(violations[0]).toContain('build/plan.md');
    expect(violations[0]).toContain('file does not exist');
  });

  it('rejects a broken image reference', () => {
    const { violations } = checkLinks(tree({ 'docs/a.md': '![diagram](diagrams/gone.svg)\n' }));
    expect(violations).toHaveLength(1);
  });

  it('rejects an anchor into a markdown file with no such heading', () => {
    const { violations } = checkLinks(
      tree({
        'docs/a.md': '[jump](b.md#missing-section)\n',
        'docs/b.md': '# Present\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('no such heading');
  });

  it('rejects a same-file anchor with no such heading', () => {
    const { violations } = checkLinks(tree({ 'docs/a.md': '# Here\n[jump](#gone)\n' }));
    expect(violations).toHaveLength(1);
  });

  it('reports source, line and target so the fix is a lookup', () => {
    const { violations } = checkLinks(
      tree({ 'docs/deep/a.md': 'x\ny\n[dead](../nowhere.md)\n' }),
    );
    expect(violations[0]).toMatch(/^docs\/deep\/a\.md:3 → \.\.\/nowhere\.md/);
  });
});

describe('what the guard must not do', () => {
  it('resolves good links, anchors and directories without complaint', () => {
    const { violations, total } = checkLinks(
      tree({
        'README.md': '[docs](docs/) and [plan](docs/build/plan.md#where-to-start)\n',
        'docs/build/plan.md': '## Where to start\n[up](../../README.md)\n',
      }),
    );
    expect(violations).toEqual([]);
    expect(total).toBe(3);
  });

  it('ignores external and mailto links, and makes no network calls', () => {
    const { violations, total } = checkLinks(
      tree({ 'docs/a.md': '[x](https://example.com/gone) [y](mailto:a@b.c)\n' }),
    );
    expect(violations).toEqual([]);
    expect(total).toBe(0);
  });

  it('checks only file existence for an anchor into a non-markdown target', () => {
    // the board's [cycle.ts:1076](../../apps/api/src/cycle.ts#L1076) shape
    const { violations } = checkLinks(
      tree({
        'docs/build/plan.md': '[cycle.ts:1](../../apps/api/src/cycle.ts#L1)\n',
        'apps/api/src/cycle.ts': 'export {};\n',
      }),
    );
    expect(violations).toEqual([]);
  });

  it('does not read example links inside code fences or inline code', () => {
    const { violations } = checkLinks(
      tree({
        'docs/a.md': '```md\n[example](nowhere.md)\n```\nand `[inline](gone.md)` too\n',
      }),
    );
    expect(violations).toEqual([]);
  });

  it('scans docs/ and the repo root, not the whole tree', () => {
    const { violations } = checkLinks(
      tree({
        'docs/a.md': '# fine\n',
        'packages/x/README.md': '[broken](gone.md)\n',
      }),
    );
    expect(violations).toEqual([]);
  });
});

describe('slugs — the GitHub heading rules the anchors depend on', () => {
  it('slugs headings with emoji, em-dashes and inline code the way GitHub does', () => {
    const slugs = slugsOf(
      '## ⚠ One named build-time decision — skeleton auth\n' +
        '### NavRail (`component.navRail`)\n' +
        '## The roadmap after the skeleton (coarse — ticketed when its slice starts)\n',
    );
    expect(slugs.has('-one-named-build-time-decision--skeleton-auth')).toBe(true);
    expect(slugs.has('navrail-componentnavrail')).toBe(true);
    expect(slugs.has('the-roadmap-after-the-skeleton-coarse--ticketed-when-its-slice-starts')).toBe(
      true,
    );
  });

  it('disambiguates duplicate headings with -1, -2 suffixes', () => {
    const slugs = slugsOf('## Notes\n## Notes\n');
    expect(slugs.has('notes')).toBe(true);
    expect(slugs.has('notes-1')).toBe(true);
  });

  it('admits raw HTML anchors', () => {
    expect(slugsOf('<a name="pinned"></a>\n').has('pinned')).toBe(true);
  });
});

describe('the baseline', () => {
  it('suppresses recorded pre-existing breakage and nothing else', () => {
    const violations = [
      'docs/a.md:3 → old/gone.md (file does not exist)',
      'docs/b.md:9 → new/break.md (file does not exist)',
    ];
    const survived = withoutBaseline(violations, '# pre-existing\ndocs/a.md → old/gone.md\n');
    expect(survived).toEqual(['docs/b.md:9 → new/break.md (file does not exist)']);
  });

  it('matches on source and target, not line number, so edits above do not resurface it', () => {
    const survived = withoutBaseline(
      ['docs/a.md:99 → old/gone.md (file does not exist)'],
      'docs/a.md → old/gone.md\n',
    );
    expect(survived).toEqual([]);
  });
});

describe('the real repository', () => {
  it('passes its own guard, net of the recorded baseline', async () => {
    const { fileURLToPath } = await import('node:url');
    const { readFileSync } = await import('node:fs');
    const repo = join(join(fileURLToPath(import.meta.url), '..'), '..');
    const { violations, total } = checkLinks(repo);
    const baseline = readFileSync(join(repo, 'scripts/link-baseline.txt'), 'utf8');
    expect(withoutBaseline(violations, baseline)).toEqual([]);
    expect(total).toBeGreaterThan(300);
  });
});
