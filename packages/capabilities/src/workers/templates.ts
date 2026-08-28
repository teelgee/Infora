// T-280 — document templates: the outline a built document is drafted into.
//
// Content, not code, on the extraction schemas' exact terms (T-274) and for the
// same reason: adding a template is adding a file, validated at startup, and a
// validation failure is a build failure rather than a deployment quietly
// offering one template where two were authored.
//
// **A template supplies no sources, and the asymmetry with an extraction schema
// is deliberate.** A schema carries a `retrieval_hint` because it READS and has
// to find what to read; a template WRITES, and its sources are handed to it
// explicitly by the orchestrator (`sources: {version_ids}` — never "whatever
// you find"). A template able to name its own corpus would be a write path that
// chose what it saw, which is the propagation guarantee undone from the inside.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';

export type TemplateSection = {
  id: string;
  heading: string;
  /**
   * What belongs in the section — scope and register, NEVER a finding to reach.
   * A template that told the model what to conclude would make every document
   * produced from it agree with the template rather than with the sources.
   */
  guidance: string;
};

export type DocumentTemplate = {
  id: string;
  version: number;
  label: string;
  description: string;
  sections: TemplateSection[];
};

export const TEMPLATES_DIR = fileURLToPath(new URL('../../templates/', import.meta.url));

export class DocumentTemplateError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(
      [
        `${errors.length} problem${errors.length === 1 ? '' : 's'} in the document templates:`,
        ...errors.map((error) => `  • ${error}`),
        'See packages/capabilities/templates/AUTHORING.md.',
      ].join('\n'),
    );
    this.name = 'DocumentTemplateError';
    this.errors = errors;
  }
}

const ID = /^[a-z][a-z0-9-]*$/;
const SECTION_ID = /^[a-z][a-z0-9_-]*$/;

export function validateTemplate(file: string, value: unknown): string[] {
  const errors: string[] = [];
  const at = (message: string) => errors.push(`${file}: ${message}`);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [`${file}: is not a template — the file must contain one mapping`];
  }
  const raw = value as Record<string, unknown>;
  const expected = file.replace(/\.ya?ml$/, '');
  if (typeof raw['id'] !== 'string' || !ID.test(raw['id'])) {
    at('`id` must be kebab-case letters, digits and hyphens');
  } else if (raw['id'] !== expected) {
    at(`\`id\` is "${raw['id']}" but the file is "${file}" — they must match`);
  }
  if (typeof raw['version'] !== 'number' || !Number.isInteger(raw['version']) || raw['version'] < 1) {
    at('`version` must be a whole number from 1, bumped on any change');
  }
  for (const field of ['label', 'description'] as const) {
    if (typeof raw[field] !== 'string' || (raw[field] as string).trim() === '') {
      at(`\`${field}\` is required and must say something`);
    }
  }
  const sections = raw['sections'];
  if (!Array.isArray(sections) || sections.length === 0) {
    at('`sections` must list at least one section — a template with no sections is not one');
  } else {
    const seen = new Set<string>();
    for (const [index, entry] of sections.entries()) {
      const where = `sections[${index}]`;
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        at(`${where} is not a section — each entry must be a mapping`);
        continue;
      }
      const section = entry as Record<string, unknown>;
      const id = section['id'];
      if (typeof id !== 'string' || !SECTION_ID.test(id)) at(`${where}.id must be snake_case or kebab-case`);
      else if (seen.has(id)) at(`${where}.id "${id}" is declared twice`);
      else seen.add(id);
      for (const field of ['heading', 'guidance'] as const) {
        if (typeof section[field] !== 'string' || (section[field] as string).trim() === '') {
          at(`${where}.${field} is required`);
        }
      }
      // the one content rule with teeth: a template names no sources, so it
      // cannot smuggle in a corpus the builder was not handed
      for (const forbidden of ['sources', 'retrieval_hint', 'query', 'scope']) {
        if (forbidden in section || forbidden in raw) {
          at(`\`${forbidden}\` is not a template field — a template supplies no sources`);
        }
      }
    }
  }
  return errors;
}

export type TemplateRegistry = {
  list(): DocumentTemplate[];
  get(id: string): DocumentTemplate | undefined;
  has(id: string): boolean;
  ids(): string[];
};

function readAll(dir: string): DocumentTemplate[] {
  const errors: string[] = [];
  const templates: DocumentTemplate[] = [];
  const byId = new Map<string, string>();
  for (const file of readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    let parsed: unknown;
    try {
      parsed = parse(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      errors.push(`${file}: is not valid YAML — ${(error as Error).message}`);
      continue;
    }
    const problems = validateTemplate(file, parsed);
    if (problems.length > 0) {
      errors.push(...problems);
      continue;
    }
    const raw = parsed as Record<string, unknown>;
    const id = raw['id'] as string;
    const clash = byId.get(id);
    if (clash !== undefined) {
      errors.push(`${file}: \`id\` "${id}" is already declared by ${clash}`);
      continue;
    }
    byId.set(id, file);
    templates.push({
      id,
      version: raw['version'] as number,
      label: raw['label'] as string,
      description: raw['description'] as string,
      sections: (raw['sections'] as Array<Record<string, unknown>>).map((section) => ({
        id: section['id'] as string,
        heading: section['heading'] as string,
        guidance: section['guidance'] as string,
      })),
    });
  }
  if (errors.length > 0) throw new DocumentTemplateError(errors);
  return templates;
}

export function loadDocumentTemplates(
  options: { dir?: string; production?: boolean } = {},
): TemplateRegistry {
  const dir = options.dir ?? TEMPLATES_DIR;
  const production = options.production ?? true;
  const cached: DocumentTemplate[] | null = production ? readAll(dir) : null;
  const all = () => cached ?? readAll(dir);
  return {
    list: () => [...all()],
    get: (id) => all().find((template) => template.id === id),
    has: (id) => all().some((template) => template.id === id),
    ids: () => all().map((template) => template.id),
  };
}
