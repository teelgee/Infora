// T-274 — the named schemas: versioned domain content, on the same terms as the
// Lens definitions.
//
// **ADDING A SCHEMA IS A CONTENT CHANGE AND THE EXTRACTOR'S CODE DOES NOT
// CHANGE.** That is the ticket's own sentence and it is the only design
// property this file exists to make true: one directory, read and validated at
// startup, no registry entry to update and no ticket to raise. A domain
// specialist adds `programme_risks.yaml` and the worker extracts against it.
//
// **Validation failures are build failures, never degradations** — the Lens
// loader's rule, for the Lens loader's reason: a deployment that quietly
// offered five schemas where six were authored would be wrong in a way nobody
// would notice until an extraction came back empty.
//
// Two lifetimes, as the Lens loader has: production reads once and the set is
// immutable for the process lifetime, so a schema cannot change underneath an
// extraction that is already recording which version it ran against;
// non-production re-reads on every call so an author sees the effect without a
// restart.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';

/** What a column may hold. Deliberately three: a register is not a database. */
export type ExtractionFieldType = 'string' | 'number' | 'date';

export type ExtractionField = {
  name: string;
  type: ExtractionFieldType;
  required: boolean;
  /**
   * USER-FACING wording. It is what the model is told the column means AND
   * what a person reads in the failure that says a row did not conform, so
   * "ISO date" is a schema and "the date it must be met by, as it appears in
   * the document" is an instruction someone can act on.
   */
  description: string;
};

export type ExtractionSchema = {
  name: string;
  /** bumped on any change, recorded on every extraction it produces */
  version: number;
  label: string;
  description: string;
  /**
   * The domain words used to FIND the passages this schema extracts from, when
   * the caller gave a document scope rather than a question. It is retrieval
   * vocabulary, not a prompt: the extractor reaches the corpus only through the
   * assembly gateway, which takes text.
   */
  retrievalHint: string;
  fields: ExtractionField[];
};

/** The shipped schemas — domain content, versioned like code. */
export const SCHEMAS_DIR = fileURLToPath(new URL('../../schemas/', import.meta.url));

export class ExtractionSchemaError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(
      [
        `${errors.length} problem${errors.length === 1 ? '' : 's'} in the extraction schemas:`,
        ...errors.map((error) => `  • ${error}`),
        'See packages/capabilities/schemas/AUTHORING.md.',
      ].join('\n'),
    );
    this.name = 'ExtractionSchemaError';
    this.errors = errors;
  }
}

const NAME = /^[a-z][a-z0-9_]*$/;
const TYPES: ExtractionFieldType[] = ['string', 'number', 'date'];

/**
 * Validate one parsed file. Every message names the FILE, the FIELD and the
 * RULE, in words a domain expert can act on — the Lens validator's stated
 * acceptance criterion, and the point at which an "engineers only" system
 * quietly reasserts itself if it is skipped.
 */
export function validateExtractionSchema(file: string, value: unknown): string[] {
  const errors: string[] = [];
  const at = (message: string) => errors.push(`${file}: ${message}`);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [`${file}: is not a schema — the file must contain one mapping`];
  }
  const raw = value as Record<string, unknown>;

  const expected = file.replace(/\.ya?ml$/, '');
  if (typeof raw['name'] !== 'string' || !NAME.test(raw['name'])) {
    at('`name` must be snake_case letters, digits and underscores');
  } else if (raw['name'] !== expected) {
    // the filename IS the address a caller asks for; a disagreement means two
    // names for one schema and one of them is wrong
    at(`\`name\` is "${raw['name']}" but the file is "${file}" — they must match`);
  }
  if (typeof raw['version'] !== 'number' || !Number.isInteger(raw['version']) || raw['version'] < 1) {
    at('`version` must be a whole number from 1, bumped on any change');
  }
  for (const field of ['label', 'description', 'retrieval_hint'] as const) {
    if (typeof raw[field] !== 'string' || (raw[field] as string).trim() === '') {
      at(`\`${field}\` is required and must say something`);
    }
  }

  const fields = raw['fields'];
  if (!Array.isArray(fields) || fields.length === 0) {
    at('`fields` must list at least one column — a register with no columns is not one');
  } else {
    const seen = new Set<string>();
    let required = 0;
    for (const [index, entry] of fields.entries()) {
      const where = `fields[${index}]`;
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        at(`${where} is not a field — each entry must be a mapping`);
        continue;
      }
      const field = entry as Record<string, unknown>;
      const name = field['name'];
      if (typeof name !== 'string' || !NAME.test(name)) {
        at(`${where}.name must be snake_case`);
      } else if (seen.has(name)) {
        at(`${where}.name "${name}" is declared twice`);
      } else {
        seen.add(name);
      }
      // `source` and `locator` are ATTACHED by the extractor from the passage a
      // row came from. A schema declaring them would be claiming to supply the
      // one thing it must never be able to forge.
      if (name === 'source' || name === 'locator') {
        at(`${where}.name "${name}" is reserved — the extractor attaches it from the passage`);
      }
      if (typeof field['type'] !== 'string' || !TYPES.includes(field['type'] as ExtractionFieldType)) {
        at(`${where}.type must be one of ${TYPES.join(', ')}`);
      }
      if (typeof field['required'] !== 'boolean') {
        at(`${where}.required must be true or false`);
      } else if (field['required'] === true) {
        required += 1;
      }
      if (typeof field['description'] !== 'string' || (field['description'] as string).trim() === '') {
        at(`${where}.description is required — it is what a person reads when a row fails to parse`);
      }
    }
    if (required === 0) {
      // a schema every row conforms to cannot fail, and a register that cannot
      // fail cannot report absence — which is the whole reason it exists
      at('at least one field must be `required: true`, or no row can ever fail to conform');
    }
  }
  return errors;
}

export type ExtractionSchemaRegistry = {
  list(): ExtractionSchema[];
  get(name: string): ExtractionSchema | undefined;
  has(name: string): boolean;
  names(): string[];
};

function readAll(dir: string): ExtractionSchema[] {
  const files = readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort();
  const errors: string[] = [];
  const schemas: ExtractionSchema[] = [];
  const byName = new Map<string, string>();

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = parse(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      errors.push(`${file}: is not valid YAML — ${(error as Error).message}`);
      continue;
    }
    const problems = validateExtractionSchema(file, parsed);
    if (problems.length > 0) {
      errors.push(...problems);
      continue;
    }
    const raw = parsed as Record<string, unknown>;
    const name = raw['name'] as string;
    const clash = byName.get(name);
    if (clash !== undefined) {
      errors.push(`${file}: \`name\` "${name}" is already declared by ${clash}`);
      continue;
    }
    byName.set(name, file);
    schemas.push({
      name,
      version: raw['version'] as number,
      label: raw['label'] as string,
      description: raw['description'] as string,
      retrievalHint: raw['retrieval_hint'] as string,
      fields: (raw['fields'] as Array<Record<string, unknown>>).map((field) => ({
        name: field['name'] as string,
        type: field['type'] as ExtractionFieldType,
        required: field['required'] as boolean,
        description: field['description'] as string,
      })),
    });
  }

  if (errors.length > 0) throw new ExtractionSchemaError(errors);
  return schemas;
}

export function loadExtractionSchemas(
  options: { dir?: string; production?: boolean } = {},
): ExtractionSchemaRegistry {
  const dir = options.dir ?? SCHEMAS_DIR;
  // defaults to production — the fail-safe direction, as the Lens loader
  // chose: a deployment that forgets the flag loses hot reload rather than
  // gaining a live re-read under a running extraction.
  const production = options.production ?? true;
  const cached: ExtractionSchema[] | null = production ? readAll(dir) : null;
  const all = () => cached ?? readAll(dir);
  return {
    list: () => [...all()],
    get: (name) => all().find((schema) => schema.name === name),
    has: (name) => all().some((schema) => schema.name === name),
    names: () => all().map((schema) => schema.name),
  };
}
