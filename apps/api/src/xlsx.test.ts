// T-358 — the minimal workbook module: what we write, we (and Excel) can read
// back; what Excel writes (shared strings, sparse rows), we can read.
import { describe, expect, it } from 'vitest';
import { buildXlsx, columnRef, parseXlsx, zipStore } from './xlsx';

describe('columnRef', () => {
  it('spells single and double letters', () => {
    expect(columnRef(0)).toBe('A');
    expect(columnRef(25)).toBe('Z');
    expect(columnRef(26)).toBe('AA');
    expect(columnRef(27)).toBe('AB');
  });
});

describe('buildXlsx / parseXlsx round trip', () => {
  it('round-trips rows, including XML-hostile characters and empty cells', () => {
    const rows = [
      ['Title', 'Discipline', 'Security'],
      ['Scoping <Method> & "Statement"', 'GEO', ''],
      ['Baseline report', '', 'OFFICIAL'],
    ];
    const bytes = buildXlsx([{ name: 'Deliverables', rows }]);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const parsed = parseXlsx(bytes);
    expect(parsed).not.toBeNull();
    expect(parsed![0]).toEqual(rows[0]);
    expect(parsed![1]![0]).toBe('Scoping <Method> & "Statement"');
    expect(parsed![1]![1]).toBe('GEO');
    expect(parsed![2]![2]).toBe('OFFICIAL');
  });

  it('keeps a second sheet out of the first-sheet parse', () => {
    const bytes = buildXlsx([
      { name: 'Deliverables', rows: [['Title']] },
      { name: 'Codes', rows: [['Field', 'Code', 'Description'], ['Discipline', 'GEO', 'Geotechnical']] },
    ]);
    const parsed = parseXlsx(bytes)!;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(['Title']);
  });

  it('emits an inline list validation only when it fits the 255-char cap', () => {
    const short = buildXlsx([
      { name: 'S', rows: [['A']], validations: [{ column: 0, values: ['GEO', 'ENV'] }] },
    ]).toString('latin1');
    expect(short).toContain('dataValidation');
    const long = buildXlsx([
      { name: 'S', rows: [['A']], validations: [{ column: 0, values: Array(60).fill('LONGCODE') }] },
    ]).toString('latin1');
    expect(long).not.toContain('dataValidation');
  });
});

describe('parseXlsx against Excel-style output', () => {
  it('resolves shared strings and sparse cell references', () => {
    // hand-built the way Excel writes: t="s" cells indexing xl/sharedStrings.xml,
    // row 2 skipping column A entirely
    const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="B2" t="s"><v>2</v></c><c r="C2"><v>42</v></c></row></sheetData></worksheet>`;
    const shared = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3"><si><t>Title</t></si><si><t>Discipline</t></si><si><r><t>Land </t></r><r><t>Quality</t></r></si></sst>`;
    const bytes = zipStore([
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
      { name: 'xl/sharedStrings.xml', data: Buffer.from(shared) },
    ]);
    const parsed = parseXlsx(bytes)!;
    expect(parsed[0]).toEqual(['Title', 'Discipline']);
    expect(parsed[1]).toEqual(['', 'Land Quality', '42']);
  });

  it('returns null on bytes that are not a workbook', () => {
    expect(parseXlsx(Buffer.from('not a zip'))).toBeNull();
  });
});
