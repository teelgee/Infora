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

// T-281 — RULE 3. The failure this catches is silent: a Lens that narrows
// retrieval still returns an answer, still cites it, and is simply built on
// less than the user could reach.
describe('the Lens-out-of-the-access-path guard', () => {
  it('rejects a Lens reaching resolveAccess', () => {
    const violations = checkSourceRules(
      tree({
        'packages/governance/src/access.ts':
          'export function resolveAccess(req, lens) { return slice(req, lens); }',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/changes register, never reach/i);
  });

  it('rejects a Lens reaching the retrieval query', () => {
    expect(
      checkSourceRules(
        tree({ 'packages/knowledge/src/retrieval.ts': 'const terms = lensId ? byLens(lensId) : [];' }),
      ),
    ).toHaveLength(1);
  });

  it('catches it in a test too — a fixture proving the wrong thing is still the wrong thing', () => {
    expect(
      checkSourceRules(tree({ 'packages/knowledge/src/wall.test.ts': 'assemble({ lens })' })),
    ).toHaveLength(1);
  });

  it('leaves the packages that legitimately hold a Lens alone', () => {
    expect(
      checkSourceRules(
        tree({
          'packages/lenses/src/load.ts': 'export function loadLenses() { return lenses; }',
          'packages/orchestration/src/chain.ts': 'const lensId = input.lensId ?? null;',
          'apps/api/src/runs.ts': 'const lens = registry.get(body.lensId);',
        }),
      ),
    ).toHaveLength(0);
  });

  it('reports the first offending line, so the fix has somewhere to start', () => {
    const violations = checkSourceRules(
      tree({ 'packages/data/src/ingest.ts': 'const a = 1;\nconst b = 2;\nconst lensId = null;' }),
    );
    expect(violations[0]).toContain('packages/data/src/ingest.ts:3');
  });
});

// T-442 — rule 4: the generated-screen renderer has no outward reach.
describe('the generated-screen fence', () => {
  it('rejects a fetch in the module that renders a generated screen', () => {
    const violations = checkSourceRules(
      tree({
        'apps/web/src/screens/app-screen.tsx':
          'export function Screen() { void fetch(block.url); return null; }',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/outward reach/i);
  });

  it('rejects markup that could carry a URL out of a generated screen', () => {
    expect(
      checkSourceRules(
        tree({ 'apps/web/src/screens/app-screen.tsx': 'return <img src={block.image} />;' }),
      ),
    ).toHaveLength(1);
    expect(
      checkSourceRules(
        tree({ 'apps/web/src/screens/app-screen.tsx': 'return <a href={block.link}>go</a>;' }),
      ),
    ).toHaveLength(1);
  });

  it('rejects evaluating a screen as code, which is the lane ADR-0056 declined', () => {
    expect(
      checkSourceRules(
        tree({ 'apps/web/src/screens/app-screen.tsx': 'const run = new Function(source);' }),
      ),
    ).toHaveLength(1);
  });

  it('leaves the renderer alone when it only draws the grammar', () => {
    expect(
      checkSourceRules(
        tree({
          'apps/web/src/screens/app-screen.tsx':
            "if (block.kind === 'heading') return <h2>{block.text}</h2>;",
        }),
      ),
    ).toHaveLength(0);
  });

  it('fences that one module and not the rest of the app', () => {
    expect(
      checkSourceRules(tree({ 'apps/web/src/api.ts': 'return fetch(`${base}${path}`);' })),
    ).toHaveLength(0);
  });
});
