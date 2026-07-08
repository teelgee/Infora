// The workspace dependency matrix, from docs/build/repo-structure.md:
// dependencies flow inward and down — surfaces depend only on contracts and ui;
// api composes workflows; workflows use capabilities and orchestration; those
// draw on model, data, knowledge; governance and db are depended on, never
// depend back. Widening an entry is a deliberate, reviewed act.

export const ALLOWED = {
  '@infora/contracts': [],
  '@infora/db': [],
  '@infora/ui': ['@infora/contracts'],
  '@infora/model': ['@infora/contracts'],
  '@infora/governance': ['@infora/contracts', '@infora/db'],
  '@infora/data': ['@infora/contracts', '@infora/db', '@infora/model'],
  '@infora/knowledge': [
    '@infora/contracts',
    '@infora/db',
    '@infora/data',
    '@infora/model',
    '@infora/governance',
  ],
  '@infora/capabilities': [
    '@infora/contracts',
    '@infora/model',
    '@infora/knowledge',
    '@infora/governance',
  ],
  '@infora/orchestration': [
    '@infora/contracts',
    '@infora/db',
    '@infora/model',
    '@infora/data',
    '@infora/knowledge',
    '@infora/capabilities',
    '@infora/governance',
  ],
  '@infora/workflows': [
    '@infora/contracts',
    '@infora/capabilities',
    '@infora/orchestration',
    '@infora/governance',
  ],
  '@infora/api': [
    '@infora/contracts',
    '@infora/db',
    '@infora/model',
    '@infora/data',
    '@infora/knowledge',
    '@infora/capabilities',
    '@infora/orchestration',
    '@infora/workflows',
    '@infora/governance',
  ],
  '@infora/e2e': ['@infora/contracts'], // the harness drives HTTP + browser only
  '@infora/web-consultant': ['@infora/contracts', '@infora/ui'],
  '@infora/web-owner': ['@infora/contracts', '@infora/ui'],
  '@infora/word-addin': ['@infora/contracts', '@infora/ui'],
  '@infora/copilot-agent': ['@infora/contracts', '@infora/ui'],
};

const SCOPE = '@infora/';

/**
 * @param {Array<{name: string, dependencies?: Record<string,string>, devDependencies?: Record<string,string>}>} manifests
 * @returns {string[]} human-readable violations; empty means the matrix holds
 */
export function checkDeps(manifests) {
  const violations = [];
  for (const m of manifests) {
    const allowed = ALLOWED[m.name];
    if (!allowed) {
      violations.push(
        `${m.name}: not in the dependency matrix (scripts/dep-rules.mjs) — add it deliberately`,
      );
      continue;
    }
    const internal = Object.keys({ ...m.dependencies, ...m.devDependencies }).filter((d) =>
      d.startsWith(SCOPE),
    );
    for (const dep of internal) {
      if (!allowed.includes(dep)) {
        violations.push(`${m.name} → ${dep}: not allowed by the dependency matrix`);
      }
    }
  }
  return violations;
}
