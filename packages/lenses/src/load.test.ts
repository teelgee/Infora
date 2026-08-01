// T-281 — the loader: the directory, the two lifetimes, and the draft rule.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearLensCache, LensValidationError, loadLenses } from './load';

const dirs: string[] = [];

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'infora-lenses-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body, 'utf8');
  return dir;
}

function lensFile(id: string, overrides = ''): string {
  return `id: ${id}
label: ${id}
description: A fixture Lens.
status: active
version: 1
register:
  jargon: peer
  acronyms: unexpanded
  reading_level: A test reader.
default_depth: high
answer_shape:
  - One
default_output: prose
citation_display: inline
clarifying_bias:
  - Which version
escalation_language:
  - "this would be probed"
preferred_workers:
  - corpus_retrieval
prohibitions:
  - Never predict an examination outcome.
example_exchanges:
  - question: q1
    answer_sketch: a1
    why: w1
  - question: q2
    answer_sketch: a2
    why: w2
${overrides}`;
}

afterEach(() => {
  clearLensCache();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('T-281 — loading a directory of Lenses', () => {
  it('reads every .yaml in the directory — adding a Lens is adding a file', () => {
    const dir = fixtureDir({ 'alpha.yaml': lensFile('alpha'), 'beta.yaml': lensFile('beta') });
    expect(loadLenses({ dir }).list().map((l) => l.id)).toEqual(['alpha', 'beta']);
  });

  it('throws on a validation failure — a bad Lens is a build failure, never a degradation', () => {
    const dir = fixtureDir({ 'alpha.yaml': lensFile('alpha', 'default_depth: enormous\n') });
    expect(() => loadLenses({ dir })).toThrow(LensValidationError);
  });

  it('reports every problem across every file in one throw', () => {
    const dir = fixtureDir({
      'alpha.yaml': lensFile('alpha', 'default_output: powerpoint\n'),
      'beta.yaml': lensFile('beta', 'citation_display: marginalia\n'),
    });
    try {
      loadLenses({ dir });
      expect.unreachable('should have thrown');
    } catch (error) {
      const errors = (error as LensValidationError).errors;
      expect(errors).toHaveLength(2);
      expect(errors.some((e) => e.startsWith('alpha.yaml:'))).toBe(true);
      expect(errors.some((e) => e.startsWith('beta.yaml:'))).toBe(true);
    }
  });

  it('refuses a duplicate id, naming both files', () => {
    const dir = fixtureDir({ 'alpha.yaml': lensFile('alpha'), 'zeta.yaml': lensFile('alpha') });
    try {
      loadLenses({ dir });
      expect.unreachable('should have thrown');
    } catch (error) {
      const [message] = (error as LensValidationError).errors;
      // zeta.yaml declares `id: alpha`, so it also trips the filename rule —
      // the duplicate is the one that must be reported either way
      expect((error as LensValidationError).errors.join('\n')).toContain('alpha.yaml');
      expect(message).toContain('zeta.yaml');
    }
  });

  it('a YAML syntax error names the file and passes the parser\'s own line report through', () => {
    const dir = fixtureDir({ 'alpha.yaml': 'id: alpha\n  label: [unclosed\n' });
    try {
      loadLenses({ dir });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as LensValidationError).errors[0]).toContain('alpha.yaml: could not be read as YAML');
    }
  });

  describe('draft Lenses load in non-production only', () => {
    const files = () => ({
      'alpha.yaml': lensFile('alpha'),
      'sketch.yaml': lensFile('sketch').replace('status: active', 'status: draft'),
    });

    it('is ABSENT in production, not present-and-disabled', () => {
      const registry = loadLenses({ dir: fixtureDir(files()), production: true });
      expect(registry.list().map((l) => l.id)).toEqual(['alpha']);
      expect(registry.get('sketch')).toBeUndefined();
      expect(registry.has('sketch')).toBe(false);
    });

    it('is available outside production, where it exists to be worked on', () => {
      const registry = loadLenses({ dir: fixtureDir(files()), production: false });
      expect(registry.list().map((l) => l.id)).toEqual(['alpha', 'sketch']);
    });

    it('defaults to production semantics — forgetting the flag loses hot reload, never gains a draft', () => {
      expect(loadLenses({ dir: fixtureDir(files()) }).list().map((l) => l.id)).toEqual(['alpha']);
    });
  });

  describe('the two lifetimes', () => {
    it('production freezes the set for the process lifetime', () => {
      const dir = fixtureDir({ 'alpha.yaml': lensFile('alpha') });
      const first = loadLenses({ dir, production: true });
      writeFileSync(join(dir, 'alpha.yaml'), lensFile('alpha', 'version: 9\n'), 'utf8');
      const second = loadLenses({ dir, production: true });
      // same object, so a Lens cannot change underneath a run that is already
      // recording which Lens version produced it
      expect(second).toBe(first);
      expect(second.get('alpha')?.version).toBe(1);
    });

    it('non-production re-reads, so an author sees an edit without a restart', () => {
      const dir = fixtureDir({ 'alpha.yaml': lensFile('alpha') });
      expect(loadLenses({ dir, production: false }).get('alpha')?.version).toBe(1);
      writeFileSync(join(dir, 'alpha.yaml'), `${lensFile('alpha')}\n`.replace('version: 1', 'version: 2'), 'utf8');
      expect(loadLenses({ dir, production: false }).get('alpha')?.version).toBe(2);
    });
  });

  it('summaries carry what a picker needs and no prompt material', () => {
    const dir = fixtureDir({ 'alpha.yaml': lensFile('alpha') });
    const [summary] = loadLenses({ dir }).summaries();
    expect(Object.keys(summary!).sort()).toEqual(['description', 'id', 'label', 'version']);
  });
});
