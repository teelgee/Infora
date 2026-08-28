// T-274 — the schema layer's own guarantee: adding a schema is a content
// change, and a broken one is a build failure rather than a quiet gap.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ExtractionSchemaError,
  loadExtractionSchemas,
  validateExtractionSchema,
} from './extraction-schemas';

const good = {
  name: 'commitments',
  version: 1,
  label: 'Commitments',
  description: 'what was undertaken',
  retrieval_hint: 'commitment undertaking',
  fields: [{ name: 'commitment', type: 'string', required: true, description: 'what was said' }],
};

const dir = (files: Record<string, string>) => {
  const path = mkdtempSync(join(tmpdir(), 'infora-schemas-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(path, name), body);
  return path;
};
const yamlOf = (value: unknown) => JSON.stringify(value); // JSON is valid YAML

describe('the shipped schemas', () => {
  // the definitions suite the authoring guide points at: every file a domain
  // expert can add is held to the same rules the loader enforces at boot
  it('all load and all validate', () => {
    const schemas = loadExtractionSchemas().list();
    expect(schemas.map((schema) => schema.name).sort()).toEqual([
      'commitments',
      'consultee_responses',
      'deadlines',
      'exa_questions',
      'mitigation_measures',
      'parameters',
    ]);
    for (const schema of schemas) {
      expect(schema.fields.length).toBeGreaterThan(0);
      expect(schema.retrievalHint.trim()).not.toBe('');
      // absence detection needs something a row can fail to satisfy
      expect(schema.fields.some((field) => field.required)).toBe(true);
    }
  });

  it('the six the ticket names are exactly the six shipped', () => {
    expect(loadExtractionSchemas().names()).toHaveLength(6);
  });
});

describe('validation (T-274)', () => {
  it('accepts a well-formed schema', () => {
    expect(validateExtractionSchema('commitments.yaml', good)).toEqual([]);
  });

  // the filename IS the address a caller asks for: a disagreement means two
  // names for one schema and one of them is wrong
  it('refuses a name that disagrees with its filename', () => {
    expect(validateExtractionSchema('deadlines.yaml', good).join(' ')).toMatch(/they must match/);
  });

  // `source` and `locator` are attached by the extractor from the passage a row
  // came from — a schema declaring them would claim to supply the one thing it
  // must never be able to forge (non-negotiable 1)
  it('refuses a schema that declares its own source or locator column', () => {
    for (const reserved of ['source', 'locator']) {
      const errors = validateExtractionSchema('commitments.yaml', {
        ...good,
        fields: [...good.fields, { name: reserved, type: 'string', required: false, description: 'x' }],
      });
      expect(errors.join(' ')).toMatch(/reserved/);
    }
  });

  // a register that cannot fail cannot report absence, which is what it is for
  it('refuses a schema in which no field is required', () => {
    const errors = validateExtractionSchema('commitments.yaml', {
      ...good,
      fields: [{ name: 'commitment', type: 'string', required: false, description: 'x' }],
    });
    expect(errors.join(' ')).toMatch(/no row can ever fail to conform/);
  });

  it('names the file, the field and the rule', () => {
    const errors = validateExtractionSchema('commitments.yaml', {
      ...good,
      fields: [{ name: 'Commitment', type: 'colour', required: true, description: '' }],
    });
    expect(errors.every((error) => error.startsWith('commitments.yaml:'))).toBe(true);
    expect(errors.join(' ')).toMatch(/fields\[0\]\.name must be snake_case/);
    expect(errors.join(' ')).toMatch(/fields\[0\]\.type must be one of/);
    expect(errors.join(' ')).toMatch(/fields\[0\]\.description is required/);
  });
});

describe('the loader (T-274)', () => {
  // extension without a code change: a new file is a new schema, full stop
  it('picks up a schema nobody wrote code for', () => {
    const path = dir({ 'programme_risks.yaml': yamlOf({ ...good, name: 'programme_risks' }) });
    expect(loadExtractionSchemas({ dir: path }).names()).toEqual(['programme_risks']);
  });

  // a validation failure is a BUILD failure, never a degradation: five schemas
  // where six were authored is wrong in a way nobody would notice
  it('refuses to load at all when one file is broken', () => {
    const path = dir({
      'commitments.yaml': yamlOf(good),
      'deadlines.yaml': yamlOf({ ...good, name: 'deadlines', fields: [] }),
    });
    expect(() => loadExtractionSchemas({ dir: path })).toThrow(ExtractionSchemaError);
  });

  // the filename rule catches the ordinary duplicate first; this pins the
  // second net, for a `.yml`/`.yaml` pair that both satisfy it
  it('refuses two files declaring one name', () => {
    const path = dir({ 'a.yaml': yamlOf({ ...good, name: 'a' }), 'a.yml': yamlOf({ ...good, name: 'a' }) });
    expect(() => loadExtractionSchemas({ dir: path })).toThrow(/already declared by/);
  });
});
