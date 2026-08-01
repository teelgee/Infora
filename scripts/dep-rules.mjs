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
  // (finding F3): `web_research` reads public pages, so the worker holding
  // a prompt injection must be unable to hold client data. Contracts only —
  // no db, no knowledge, no governance — so it cannot query a store, resolve
  // an access slice or read a chunk. Widening this line is the event code
  // review exists to catch.
  '@infora/external': ['@infora/contracts'],
  // T-281 — Lens definitions as domain content, plus their loader and
  // validator. THIS ENTRY IS HALF OF THE ELEVENTH NON-NEGOTIABLE: contracts
  // only — no db, no knowledge, no governance — so there is nothing in this
  // package with which to reach a store, resolve an access slice or narrow a
  // retrieval. A Lens changes register, never reach, and widening this line is
  // how that would stop being structurally true. The other half is RULE 3 in
  // scripts/source-rules.mjs, which keeps the access path from reaching back.
  '@infora/lenses': ['@infora/contracts'],
  '@infora/knowledge': [
    '@infora/contracts',
    '@infora/db',
    '@infora/data',
    '@infora/model',
    '@infora/governance',
  ],
  // T-299 widened this line deliberately, and it is reviewable in one
  // sentence: `capabilities` composes the system prompt, and a Lens is prompt
  // material, so the one place that turns a Lens into words needs to see the
  // Lens type's renderer. The direction is safe because `lenses` is itself
  // confined to `contracts` — depending on it grants `capabilities` no reach
  // it did not already have. RULE 3 in source-rules.mjs still keeps the
  // ACCESS path (governance, knowledge, data) from ever doing the same.
  '@infora/capabilities': [
    '@infora/contracts',
    '@infora/lenses',
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
  // T-299 — the api loads the Lens registry at composition and resolves
  // `lensId` off the request before the chain runs; an unknown id is a 400,
  // never a silent fall-back to a default.
  '@infora/api': [
    '@infora/contracts',
    '@infora/db',
    '@infora/lenses',
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
  // T-282 added `@infora/lenses`: a case declares the Lens it runs under, and
  // the harness resolves it against the same registry the app was composed
  // with, so a case naming an id the deployment does not offer is an `error`
  // with the available ids named rather than an opaque 400 from the API.
  '@infora/evals': ['@infora/contracts', '@infora/db', '@infora/lenses', '@infora/api'],
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
