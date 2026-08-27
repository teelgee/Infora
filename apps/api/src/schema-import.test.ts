// T-337 — the deterministic half of schema import. No model call, so every
// case here is a pure function over rows, which is the point: the escape hatch
// to `extractor` (T-274) exists for what this cannot read, not for what it can.
//
// The three constraints the ticket names are properties rather than assertions
// about behaviour, and two of them are structural — this module holds no `Db`
// and the route writes no Run — so what is tested here is the third: an
// unparseable file **fails loudly and names the row**.
import { describe, expect, it } from 'vitest';
import { isRefusal, keyFor, parseCsv, parseSchemaFile, parseSchemaRows } from './schema-import';
import { buildXlsx } from './xlsx';

const found = (result: ReturnType<typeof parseSchemaRows>) => {
  if (isRefusal(result)) throw new Error(`refused: ${result.reason}`);
  return result;
};

describe('parseSchemaRows — the shapes these sheets come in (T-337)', () => {
  it('reads a plain code list, which is the options editor’s own shape', () => {
    const result = found(
      parseSchemaRows([
        ['Code', 'Description'],
        ['ECV', 'Engineering – Civils'],
        ['EEN', 'Environmental'],
      ]),
    );
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]!.allowedValues).toEqual(['ECV', 'EEN']);
    expect(result.fields[0]!.allowedValueLabels).toEqual({
      ECV: 'Engineering – Civils',
      EEN: 'Environmental',
    });
    expect(result.fields[0]!.type).toBe('select');
  });

  it('groups a routewide schedule by its field column', () => {
    const result = found(
      parseSchemaRows([
        ['Field', 'Code', 'Description'],
        ['Discipline', 'ECV', 'Engineering – Civils'],
        ['Discipline', 'EEN', 'Environmental'],
        ['Document type', 'GIR', 'Ground investigation report'],
      ]),
    );
    expect(result.fields.map((f) => f.key)).toEqual(['discipline', 'document_type']);
    expect(result.fields[0]!.label).toBe('Discipline');
    expect(result.fields[0]!.allowedValues).toEqual(['ECV', 'EEN']);
    expect(result.fields[1]!.allowedValues).toEqual(['GIR']);
  });

  it('finds the header row rather than assuming it is the first', () => {
    // these sheets routinely open with a title and a blank line
    const result = found(
      parseSchemaRows([
        ['Calder & Hale document numbering'],
        [],
        ['Code', 'Meaning'],
        ['GIR', 'Ground investigation report'],
      ]),
    );
    expect(result.fields[0]!.allowedValues).toEqual(['GIR']);
  });

  it('accepts the header words a firm actually uses', () => {
    for (const [code, description] of [
      ['Abbreviation', 'Definition'],
      ['Ref', 'Name'],
      ['Value', 'Label'],
    ]) {
      const result = found(parseSchemaRows([[code!, description!], ['X1', 'A thing']]));
      expect(result.fields[0]!.allowedValues).toEqual(['X1']);
    }
  });
});

describe('parseSchemaRows — loud, and naming the row (T-337)', () => {
  it('names every skipped row by the number Excel shows', () => {
    const result = found(
      parseSchemaRows([
        ['Code', 'Description'], // row 1
        ['ECV', 'Engineering – Civils'], // row 2
        ['', 'A description with no code'], // row 3
        ['not a code', 'because it has spaces'], // row 4
        ['ECV', 'A second meaning for the same code'], // row 5
      ]),
    );
    expect(result.fields[0]!.allowedValues).toEqual(['ECV']);
    expect(result.skipped.map((s) => s.row)).toEqual([3, 4, 5]);
    expect(result.skipped[1]!.reason).toContain('space');
    // a duplicate is REPORTED, not silently collapsed: in a code list it means
    // two meanings competing for one code, which is the firm's to resolve
    expect(result.skipped[2]!.reason).toContain('already defined');
  });

  it('refuses an unrecognisable sheet by naming what it did find', () => {
    const result = parseSchemaRows([
      ['Widget', 'Sprocket'],
      ['a', 'b'],
    ]);
    expect(isRefusal(result)).toBe(true);
    if (!isRefusal(result)) return;
    expect(result.reason).toBe('no_recognisable_headers');
    // the point of the hint: "rename the column" is a ten-second fix, and it is
    // the reason this path does not reach for a model when a header is unfamiliar
    expect(result.detail).toContain('Widget');
  });

  it('refuses an empty sheet rather than returning an empty scheme', () => {
    const result = parseSchemaRows([]);
    expect(isRefusal(result) && result.reason).toBe('no_recognisable_headers');
  });

  it('refuses a sheet with headers and no usable codes', () => {
    const result = parseSchemaRows([['Code', 'Description'], ['', 'nothing'], ['', 'nothing either']]);
    expect(isRefusal(result) && result.reason).toBe('no_codes_found');
  });
});

describe('parseSchemaFile — the formats a firm has (T-337)', () => {
  it('reads a CSV, quotes and all', () => {
    // a description column is exactly where a comma lives
    const csv = 'Code,Description\nECV,"Engineering – Civils, drainage"\nEEN,Environmental\n';
    const result = found(parseSchemaFile('codes.csv', Buffer.from(csv)));
    expect(result.fields[0]!.allowedValueLabels!['ECV']).toBe('Engineering – Civils, drainage');
  });

  it('reads an xlsx', () => {
    const workbook = buildXlsx([
      { name: 'Codes', rows: [['Code', 'Description'], ['GIR', 'Ground investigation report']] },
    ]);
    const result = found(parseSchemaFile('codes.xlsx', workbook));
    expect(result.fields[0]!.allowedValues).toEqual(['GIR']);
  });

  it('refuses a format it cannot read, by name', () => {
    const pdf = parseSchemaFile('codes.pdf', Buffer.from('%PDF-1.7'));
    expect(isRefusal(pdf) && pdf.reason).toBe('unsupported_format');
    const broken = parseSchemaFile('codes.xlsx', Buffer.from('not a workbook'));
    expect(isRefusal(broken) && broken.reason).toBe('unreadable_file');
  });
});

describe('parseCsv and keyFor (T-337)', () => {
  it('handles escaped quotes and trailing newlines', () => {
    expect(parseCsv('a,"b ""quoted"" c"\n')).toEqual([['a', 'b "quoted" c']]);
  });

  it('makes a safe, stable key from a human field name', () => {
    expect(keyFor('Document type')).toBe('document_type');
    expect(keyFor('  Discipline / sub-discipline ')).toBe('discipline_sub_discipline');
    expect(keyFor('')).toBe('field');
  });
});
