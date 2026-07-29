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
const CHUNK_READERS = ['packages/knowledge', 'packages/data', 'packages/db'];

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
  const roots = ['apps', 'packages', 'e2e', 'scripts'].filter((d) => {
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
