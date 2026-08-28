// T-264 — the workflow loader. Deliberately the Lens loader's twin: same
// directory-of-YAML shape, same two lifetimes, same draft rule. That is not
// duplication for its own sake — it is the rule that keeps both layers
// domain-expert-owned, and two layers a specialist edits should not need two
// mental models.
//
// Two lifetimes, and the difference is the point:
//   • production — read once, immutable for the process lifetime, so a
//     workflow cannot change underneath a run already recording which version
//     of it produced the answer;
//   • non-production — re-read on every call, so an author sees the effect of
//     an edit without restarting anything.
//
// Drafts load in NON-PRODUCTION ONLY. In production a `status: draft` file is
// absent from the registry entirely — not present-but-disabled — for the same
// reason an unentitled worker is absent rather than greyed out.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Workflow, WorkflowSummary } from '@infora/contracts';
import { validateWorkflow } from './validate';
import type { KnownWorkers } from './validate';

/** The shipped definitions — domain content, versioned like code. */
export const DEFINITIONS_DIR = fileURLToPath(new URL('../definitions/', import.meta.url));

export class WorkflowValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(
      [
        `${errors.length} problem${errors.length === 1 ? '' : 's'} in the workflow definitions:`,
        ...errors.map((error) => `  • ${error}`),
        'See packages/workflows/definitions/AUTHORING.md.',
      ].join('\n'),
    );
    this.name = 'WorkflowValidationError';
    this.errors = errors;
  }
}

export type WorkflowRegistry = {
  list(): Workflow[];
  summaries(): WorkflowSummary[];
  get(id: string): Workflow | undefined;
  has(id: string): boolean;
};

export type LoadOptions = {
  dir?: string;
  workers: KnownWorkers;
  /**
   * Defaults to TRUE — the fail-safe direction. A deployment that forgets to
   * set this loses hot reload rather than gaining draft workflows in front of
   * a customer (T-281's ruling, applied unchanged).
   */
  production?: boolean;
};

export function loadWorkflows(options: LoadOptions): WorkflowRegistry {
  const dir = options.dir ?? DEFINITIONS_DIR;
  const production = options.production ?? true;

  const read = (): Map<string, Workflow> => {
    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
      .sort();

    const errors: string[] = [];
    const loaded = new Map<string, Workflow>();
    for (const file of files) {
      let raw: unknown;
      try {
        raw = parse(readFileSync(join(dir, file), 'utf8'));
      } catch (error) {
        errors.push(`${file}: is not valid YAML — ${(error as Error).message}`);
        continue;
      }
      const result = validateWorkflow(raw, { file, workers: options.workers, production });
      if (!result.ok) {
        // A draft in production is not an ERROR, it is an absence. Every other
        // failure is a build failure: a workflow that does not load must not be
        // quietly dropped, because a declared workflow silently missing means
        // the run falls through to model-chosen and nobody is told why.
        const draftInProduction = result.errors.every((message) =>
          message.includes('`draft`, which loads in non-production only'),
        );
        if (!draftInProduction) errors.push(...result.errors);
        continue;
      }
      if (loaded.has(result.workflow.id)) {
        errors.push(`${file}: id '${result.workflow.id}' is declared by more than one file`);
        continue;
      }
      loaded.set(result.workflow.id, result.workflow);
    }
    if (errors.length > 0) throw new WorkflowValidationError(errors);
    return loaded;
  };

  const once = production ? read() : null;
  const current = () => once ?? read();

  return {
    list: () => [...current().values()],
    summaries: () =>
      [...current().values()].map((workflow) => ({
        id: workflow.id,
        label: workflow.label,
        description: workflow.description,
        version: workflow.version,
        writes: workflow.writes,
      })),
    get: (id) => current().get(id),
    has: (id) => current().has(id),
  };
}
