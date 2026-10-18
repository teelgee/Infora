// T-451 — a test workbook with the cells a real one carries: numbers, formulas
// with the result Excel stored beside them, a formula nobody calculated, and an
// error. `buildXlsx` writes text only, because the template export needs
// nothing else; the file source's reader has to be tested against the shapes
// Excel actually saves, so this writes them. Test-only, like `test-router.ts`.
import { columnRef, zipStore } from './xlsx';

export type TestCell =
  | string
  | number
  | boolean
  | null
  /** a formula; `result` is the cached value Excel writes on save, absent for a
   * file whose writer never calculated it */
  | { formula: string; result?: number | string }
  /** a cell holding a spreadsheet error, e.g. `#DIV/0!` */
  | { error: string };

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cellXml(cell: TestCell, ref: string): string {
  if (cell === null || cell === '') return '';
  if (typeof cell === 'string') {
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
  }
  if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
  if (typeof cell === 'boolean') return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  if ('error' in cell) return `<c r="${ref}" t="e"><v>${escapeXml(cell.error)}</v></c>`;
  const formula = `<f>${escapeXml(cell.formula)}</f>`;
  if (cell.result === undefined) return `<c r="${ref}">${formula}</c>`;
  return typeof cell.result === 'number'
    ? `<c r="${ref}">${formula}<v>${cell.result}</v></c>`
    : `<c r="${ref}" t="str">${formula}<v>${escapeXml(cell.result)}</v></c>`;
}

/** A workbook of named sheets; `null` rows are omitted from the XML, the way
 * Excel omits a blank row, so row numbers still match Excel's. */
export function testWorkbook(
  sheets: Array<{ name: string; rows: Array<TestCell[] | null> }>,
  options: { date1904?: boolean } = {},
): Buffer {
  const sheetEntries = sheets.map((sheet, i) => {
    const rows = sheet.rows
      .map((cells, r) =>
        cells === null
          ? ''
          : `<row r="${r + 1}">${cells.map((cell, c) => cellXml(cell, `${columnRef(c)}${r + 1}`)).join('')}</row>`,
      )
      .join('');
    return {
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
        'utf8',
      ),
    };
  });
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${options.date1904 ? '<workbookPr date1904="1"/>' : ''}<sheets>${sheets
    .map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')}</Relationships>`;
  return zipStore([
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    ...sheetEntries,
  ]);
}
