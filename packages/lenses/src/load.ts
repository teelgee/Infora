// T-281 — the Lens loader: extension without a code change.
//
// All files in one directory, read and validated AT STARTUP. Adding a Lens is
// adding a file; the loader is the only code involved, and it does not change.
//
// Two lifetimes, and the difference is deliberate:
//   • production — the set is read once and immutable for the process
//     lifetime, so a Lens cannot change underneath a run that is already
//     recording which Lens produced it;
//   • non-production — re-read on every call, so a domain expert editing a file
//     sees the effect without restarting anything.
// The same rule as the workflow definitions (T-264) and the routing table
// (T-284), and it is the rule that keeps this layer domain-expert-owned.
//
// Draft Lenses load in non-production ONLY. In production a `status: draft`
// file is absent from the registry entirely — not present-but-disabled — for
// the same reason an unentitled worker is absent rather than greyed out.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Lens, LensSummary } from '@infora/contracts';
import { validateLens } from './validate';

/** The shipped definitions — domain content, versioned like code. */
export const DEFINITIONS_DIR = fileURLToPath(new URL('../definitions/', import.meta.url));

export class LensValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(
      [
        `${errors.length} problem${errors.length === 1 ? '' : 's'} in the Lens definitions:`,
        ...errors.map((e) => `  • ${e}`),
        'See packages/lenses/definitions/AUTHORING.md.',
      ].join('\n'),
    );
    this.name = 'LensValidationError';
    this.errors = errors;
  }
}

export type LensRegistry = {
  /** Every Lens available in this environment, by declaration order of id. */
  list(): Lens[];
  /** Just what a picker needs — never the prohibitions or worked exchanges. */
  summaries(): LensSummary[];
  get(id: string): Lens | undefined;
  has(id: string): boolean;
};

export type LoadLensesOptions = {
  dir?: string;
  /**
   * Production semantics: drafts excluded, set frozen for the process lifetime.
   * Defaults to true — the FAIL-SAFE default, because a deployment that forgets
   * to say so should lose hot reload, not gain draft Lenses in front of a
   * customer.
   */
  production?: boolean;
};

const cache = new Map<string, LensRegistry>();

export function loadLenses(options: LoadLensesOptions = {}): LensRegistry {
  const dir = options.dir ?? DEFINITIONS_DIR;
  const production = options.production ?? true;

  if (production) {
    const key = dir;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const registry = read(dir, production);
    cache.set(key, registry);
    return registry;
  }
  return read(dir, production);
}

/** Test seam: drop the production cache so a fixture directory can be re-read. */
export function clearLensCache(): void {
  cache.clear();
}

function read(dir: string, production: boolean): LensRegistry {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort();

  const errors: string[] = [];
  const loaded: Lens[] = [];
  const seen = new Map<string, string>(); // id → the file that claimed it

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = parse(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      // A YAML syntax error is the one message this layer cannot phrase itself,
      // so it is passed through with the file named in front of it — the parser
      // reports the line and column, which is what the author needs.
      errors.push(`${file}: could not be read as YAML — ${(error as Error).message}`);
      continue;
    }

    const result = validateLens(file, parsed);
    if (!result.ok) {
      errors.push(...result.errors);
      continue;
    }

    const claimed = seen.get(result.lens.id);
    if (claimed !== undefined) {
      errors.push(
        `${file}: \`id\` "${result.lens.id}" is already used by \`${claimed}\`. ` +
          `Two Lenses cannot share an id — an answer records the id that produced it.`,
      );
      continue;
    }
    seen.set(result.lens.id, file);
    loaded.push(result.lens);
  }

  // Validation failures are build failures. Every problem across every file is
  // reported at once — an author fixing one per restart learns to resent this.
  if (errors.length > 0) throw new LensValidationError(errors);

  const available = production ? loaded.filter((lens) => lens.status === 'active') : loaded;
  const byId = new Map(available.map((lens) => [lens.id, lens]));

  return {
    list: () => [...available],
    summaries: () =>
      available.map(({ id, label, description, version }) => ({ id, label, description, version })),
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
  };
}
