// The guard must fail on the collision it exists to prevent — two sessions
// minting the same ADR number — and on a file that ignores the folder's one
// naming rule. It must not fire on gaps: an abandoned number is history.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAdrNumbers } from './adr-rules.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function tree(...files) {
  root = mkdtempSync(join(tmpdir(), 'infora-adr-rules-'));
  mkdirSync(join(root, 'docs/architecture/adr'), { recursive: true });
  for (const f of files) writeFileSync(join(root, 'docs/architecture/adr', f), '# a decision\n');
  return root;
}

describe('one file per number', () => {
  it('rejects two files claiming one number', () => {
    const { violations } = checkAdrNumbers(tree('0052-per-reviewer-completion-signal.md', '0052-a-second-decision.md'));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('ADR-0052 is claimed twice');
    expect(violations[0]).toContain('renumber');
  });

  it('rejects a file outside the naming rule', () => {
    const { violations } = checkAdrNumbers(tree('0001-fine.md', 'notes-on-walls.md'));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('NNNN-kebab-title.md');
  });

  it('accepts gaps — an abandoned number is history, not rot', () => {
    const { violations, highest, next } = checkAdrNumbers(tree('0001-first.md', '0007-later.md'));
    expect(violations).toEqual([]);
    expect(highest).toBe(7);
    expect(next).toBe(8);
  });

  it('says so plainly when the folder is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'infora-adr-rules-'));
    const { violations } = checkAdrNumbers(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('nothing to check');
  });
});

describe('the real decision record', () => {
  it('passes its own guard', async () => {
    const { fileURLToPath } = await import('node:url');
    const repo = join(join(fileURLToPath(import.meta.url), '..'), '..');
    const { violations } = checkAdrNumbers(repo);
    expect(violations).toEqual([]);
  });
});
