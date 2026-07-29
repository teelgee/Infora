// T-247 — the guards must FAIL on the thing they forbid, or they are decoration.
// Each rule gets a fixture that violates it, written to a temp tree.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSourceRules } from './source-rules.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function tree(files) {
  root = mkdtempSync(join(tmpdir(), 'infora-source-rules-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

describe('the grounding-index fence', () => {
  it('rejects a package outside knowledge/data touching versionChunks', () => {
    const violations = checkSourceRules(
      tree({ 'apps/api/src/leak.ts': "import { versionChunks } from '@infora/db';" }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/grounding index/i);
  });

  it('allows the two packages that legitimately read and write it', () => {
    expect(
      checkSourceRules(
        tree({
          'packages/knowledge/src/retrieval.ts': 'select().from(versionChunks)',
          'packages/data/src/ingest.ts': 'insert(versionChunks)',
        }),
      ),
    ).toHaveLength(0);
  });

  it('does not fence tests, which set up fixtures directly', () => {
    expect(
      checkSourceRules(tree({ 'apps/api/src/thing.test.ts': 'insert(versionChunks)' })),
    ).toHaveLength(0);
  });
});

describe('the prompt-permission guard', () => {
  it('rejects a permission expressed as a prompt instruction', () => {
    const violations = checkSourceRules(
      tree({
        'packages/capabilities/src/draft.ts':
          "const SYSTEM = 'You are helpful. Do not mention documents the user cannot see.';",
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/data layer/i);
  });

  it('catches the phrase wherever it sits, including a test fixture', () => {
    expect(
      checkSourceRules(tree({ 'apps/api/src/x.test.ts': "const s = 'you may only see yours';" })),
    ).toHaveLength(1);
  });

  it('passes a tree with no permission phrasing', () => {
    expect(
      checkSourceRules(tree({ 'packages/capabilities/src/draft.ts': "const S = 'Cite every claim.';" })),
    ).toHaveLength(0);
  });
});
