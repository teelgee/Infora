// T-247 — source-level guards, checked in CI beside the package dependency
// matrix (dep-rules.mjs). Those rules govern which package may depend on which;
// these govern two things a manifest cannot express.
//
// Both exist because the property they protect is currently TRUE, and the guard
// is what keeps it true. Neither is a lint preference.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * RULE 1 — the grounding index has one reader and one writer.
 *
 * `version_chunks` carries the corpus every grounded answer is drawn from, and
 * its access boundary lives in exactly one query (packages/knowledge —
 * retrieval.ts's liveLibraryFilter). Row-level security backstops that at the
 * database (migration 0034), but the cheapest protection is keeping the number
 * of places that can build such a query at two: knowledge reads it, data
 * ingests into it.
 */
const CHUNK_SYMBOL = 'versionChunks';
// `evals` (T-255) is the one addition to that pair, and it is a WRITER only:
// the fixture loader materialises a frozen corpus into the index under its own
// pinned model (ADR-0024), and reads it back the way a client does — over HTTP,
// through the API, through the assembly gateway. It builds no retrieval query,
// and RLS (migration 0034) would return it nothing if it tried.
const CHUNK_READERS = ['packages/knowledge', 'packages/data', 'packages/db', 'evals'];

/**
 * RULE 2 — permissions are never expressed as prompt instructions.
 *
 * Phase 0 interrogation question 5 searched for these and found ZERO hits: the
 * access boundary is enforced entirely in SQL pre-filters, never by asking a
 * model to keep a secret. A model instructed not to mention something will
 * eventually mention it. This guard is what keeps the count at zero.
 */
const PERMISSION_PHRASES = [
  'do not mention',
  'you may only',
  'do not reveal',
  'is not authorised',
  'is not authorized',
  'never mention',
  'do not disclose',
  'must not reveal',
  'not permitted to',
  'do not share',
];

/**
 * RULE 3 — a Lens changes register, never reach (T-281).
 *
 * The eleventh non-negotiable. A Lens is how an answer READS; it is not, and
 * must never become, a parameter of `resolveAccess` (packages/governance),
 * `groundedLibrary` / `assemble` (packages/knowledge) or the ingest and
 * retrieval scope (packages/data). A Lens that could narrow what is retrieved
 * would be a security control hiding inside a preference — and the failure is
 * silent, because the answer still arrives, still cites, and is simply built on
 * less than the user could reach.
 *
 * `assemble`'s signature is pinned in contracts and asserted at the type level
 * (packages/lenses/src/reach.test.ts). The other two are not in contracts, so
 * this guard is what covers them: the three access-path packages may not so
 * much as mention a Lens. Bluntness is the feature — there is no legitimate
 * reason for the word to appear in any of them.
 */
const LENS_SYMBOL = /\blens(?:es|Id|Version)?\b/i;
const NO_LENS_PACKAGES = ['packages/governance', 'packages/knowledge', 'packages/data'];

const SELF = new Set(['scripts/source-rules.mjs', 'scripts/source-rules.test.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.git', 'test-results', 'migrations']);
const SOURCE = /\.(ts|tsx|mjs)$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (SOURCE.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * @param {string} root repository root
 * @returns {string[]} human-readable violations; empty means both rules hold
 */
export function checkSourceRules(root) {
  const violations = [];
  const roots = ['apps', 'packages', 'e2e', 'evals', 'scripts'].filter((d) => {
    try {
      return statSync(join(root, d)).isDirectory();
    } catch {
      return false;
    }
  });

  for (const group of roots) {
    for (const file of walk(join(root, group))) {
      const rel = relative(root, file).replaceAll('\\', '/');
      // The guard and its test necessarily name the phrases they forbid and the
      // symbol they fence, so they exempt themselves — the only exemption, and
      // narrow enough to be obvious if it is ever widened.
      if (SELF.has(rel)) continue;
      const text = readFileSync(file, 'utf8');

      if (!rel.endsWith('.test.ts') && !rel.endsWith('.test.tsx')) {
        const importsChunks = new RegExp(`\\b${CHUNK_SYMBOL}\\b`).test(text);
        if (importsChunks && !CHUNK_READERS.some((allowed) => rel.startsWith(allowed))) {
          violations.push(
            `${rel}: references \`${CHUNK_SYMBOL}\` — the grounding index is read only by ` +
              `${CHUNK_READERS.join(', ')}. Go through the assembly gateway instead.`,
          );
        }
      }

      if (NO_LENS_PACKAGES.some((pkg) => rel.startsWith(pkg))) {
        const line = text.split('\n').findIndex((l) => LENS_SYMBOL.test(l)) + 1;
        if (line > 0) {
          violations.push(
            `${rel}:${line}: mentions a Lens — the access path (${NO_LENS_PACKAGES.join(', ')}) ` +
              `must not know Lenses exist. A Lens changes register, never reach (T-281, ` +
              `non-negotiable 11). If this is a Lens-shaped retrieval scope, it is a workflow ` +
              `or a scope filter, not a Lens.`,
          );
        }
      }

      const lower = text.toLowerCase();
      for (const phrase of PERMISSION_PHRASES) {
        if (!lower.includes(phrase)) continue;
        // only a prompt is a problem: the phrase is fine in prose about the rule
        const line = text.split('\n').findIndex((l) => l.toLowerCase().includes(phrase)) + 1;
        violations.push(
          `${rel}:${line}: "${phrase}" — permissions are enforced in the data layer, ` +
            `never in a prompt (Phase 0 finding, question 5). If this is prose about the ` +
            `rule rather than an instruction to a model, reword it.`,
        );
      }
    }
  }
  return violations;
}
