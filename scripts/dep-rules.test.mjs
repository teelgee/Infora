import { describe, it, expect } from 'vitest';
import { checkDeps, ALLOWED } from './dep-rules.mjs';

const pkg = (name, deps = {}) => ({ name, dependencies: deps });

describe('checkDeps', () => {
  it('passes a surface depending only on contracts and ui', () => {
    expect(
      checkDeps([
        pkg('@infora/web', {
          '@infora/contracts': 'workspace:*',
          '@infora/ui': 'workspace:*',
          react: '^19.0.0',
        }),
      ]),
    ).toEqual([]);
  });

  it('rejects a surface reaching below the API', () => {
    const violations = checkDeps([
      pkg('@infora/web', { '@infora/db': 'workspace:*' }),
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('@infora/web → @infora/db');
  });

  it('rejects db or contracts depending on anything internal', () => {
    expect(
      checkDeps([pkg('@infora/db', { '@infora/governance': 'workspace:*' })]),
    ).toHaveLength(1);
    expect(
      checkDeps([pkg('@infora/contracts', { '@infora/model': 'workspace:*' })]),
    ).toHaveLength(1);
  });

  it('rejects a package missing from the matrix', () => {
    const violations = checkDeps([pkg('@infora/rogue')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('not in the dependency matrix');
  });

  it('checks devDependencies too', () => {
    const violations = checkDeps([
      { name: '@infora/ui', devDependencies: { '@infora/orchestration': 'workspace:*' } },
    ]);
    expect(violations).toHaveLength(1);
  });

  it('matrix invariant: governance and db are depended on, never depend back', () => {
    expect(ALLOWED['@infora/db']).toEqual([]);
    expect(
      ALLOWED['@infora/governance'].every((d) =>
        ['@infora/contracts', '@infora/db'].includes(d),
      ),
    ).toBe(true);
  });

  it('matrix invariant: no cycles', () => {
    const visiting = new Set();
    const done = new Set();
    const visit = (name) => {
      if (done.has(name)) return;
      expect(visiting.has(name), `cycle through ${name}`).toBe(false);
      visiting.add(name);
      for (const dep of ALLOWED[name] ?? []) visit(dep);
      visiting.delete(name);
      done.add(name);
    };
    Object.keys(ALLOWED).forEach(visit);
  });
});
