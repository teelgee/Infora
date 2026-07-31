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
  // T-250 — untrusted external content. THIS ENTRY IS THE SECURITY CONTROL
  // (docs/build/ask/09 R3): `web_research` reads public pages, so the worker holding
  // a prompt injection must be unable to hold client data. Contracts only —
  // no db, no knowledge, no governance — so it cannot query a store, resolve
  // an access slice or read a chunk. Widening this line is the event code
  // review exists to catch.
  '@infora/external': ['@infora/contracts'],
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
  // T-255 — the eval harness. A deliberate widening, and the only entry that
  // depends on a deployable: a case must execute through the real API boundary
  // (that is where identity is established, apps/api/src/requester.ts), so the
  // harness boots the real app over real HTTP; and a fixture is DATA that must
  // be materialised, so it writes through @infora/db. Nothing depends on evals,
  // it ships in no deployable, and the direction stays one-way.
  '@infora/evals': ['@infora/contracts', '@infora/db', '@infora/api'],
  // one web app, role-scoped views (T-110, 2026-07-14) — the formerly
  // planned web-owner split is superseded
  '@infora/web': ['@infora/contracts', '@infora/ui'],
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
