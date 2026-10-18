// T-358/T-359 — a minimal .xlsx writer and reader: the template export and the
// plan batch import need exactly one workbook shape (a header row + data rows +
// a legend sheet), which does not justify a workbook dependency. Entries are
// stored uncompressed; cells are written as inline strings and read back from
// inline, shared or raw values.
//
// T-306 took the zip READER out to zip.ts — docx, xlsx and pptx all need it and
// the copies had drifted — and generalised the sheet walk from "the first tab"
// to "every tab, named", because corpus extraction wants all of them and two
// walks of the same relationship graph would be two chances to disagree.
import { unzipEntry } from './zip';

// ── CRC-32 (the zip checksum) ───────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── zip container (stored entries only — the files are small) ───────────────
export function zipStore(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralStart = offset;
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}


// ── writing ─────────────────────────────────────────────────────────────────
const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function columnRef(index: number): string {
  let ref = '';
  let n = index;
  do {
    ref = String.fromCharCode(65 + (n % 26)) + ref;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return ref;
}

export type XlsxSheet = {
  name: string;
  rows: (string | null)[][];
  /** Excel list validation per zero-based column — inline lists only (the
   * format caps an inline formula at 255 chars; longer sets ride the legend
   * sheet without a dropdown). Applied from row 2 down. */
  validations?: { column: number; values: string[] }[];
};

function sheetXml(sheet: XlsxSheet): string {
  const rows = sheet.rows
    .map((cells, r) => {
      const xmlCells = cells
        .map((value, i) =>
          value === null || value === ''
            ? ''
            : `<c r="${columnRef(i)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
        )
        .join('');
      return `<row r="${r + 1}">${xmlCells}</row>`;
    })
    .join('');
  const validations = (sheet.validations ?? [])
    // a comma splits a code in two and a quote ends Excel's string literal, so
    // any such value forfeits the dropdown (the legend sheet still lists it);
    // the format's cap counts the quoted formula, hence 253
    .filter(({ values }) => values.every((v) => !v.includes(',') && !v.includes('"')))
    .map(({ column, values }) => ({ column, list: values.join(',') }))
    .filter(({ list }) => list.length > 0 && list.length <= 253)
    .map(
      ({ column, list }) =>
        `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${columnRef(column)}2:${columnRef(column)}1000"><formula1>"${escapeXml(list)}"</formula1></dataValidation>`,
    );
  const validationsXml = validations.length
    ? `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData>${validationsXml}</worksheet>`;
}

export function buildXlsx(sheets: XlsxSheet[]): Buffer {
  const sheetEntries = sheets.map((sheet, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    data: Buffer.from(sheetXml(sheet), 'utf8'),
  }));
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')}</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')}</Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    ...sheetEntries,
  ]);
}

// ── reading ─────────────────────────────────────────────────────────────────
const unescapeXml = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

function textOf(cellXml: string): string {
  // every <t> run concatenated (rich-text cells split one value across runs)
  const runs = [...cellXml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
  if (runs.length > 0) return runs.map((m) => unescapeXml(m[1]!)).join('');
  const v = cellXml.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
  return v ? unescapeXml(v[1]!) : '';
}

/** Every worksheet in TAB ORDER, with its name, resolved through the workbook
 * rels the way Excel maps tabs to parts (a rebuilt tab can live in sheet2.xml,
 * and a reordered workbook is not in file-name order at all).
 *
 * T-306 generalised this from "the first sheet" — the plan import wants one
 * sheet and corpus extraction wants all of them, and two walks of the same
 * relationship graph would be two chances to disagree about which tab is which. */
function sheetParts(bytes: Buffer): Array<{ name: string; xml: Buffer }> {
  const workbook = unzipEntry(bytes, 'xl/workbook.xml')?.toString('utf8');
  const rels = unzipEntry(bytes, 'xl/_rels/workbook.xml.rels')?.toString('utf8');
  const parts: Array<{ name: string; xml: Buffer }> = [];
  for (const sheet of workbook?.matchAll(/<sheet\s[^>]*\/?>/g) ?? []) {
    const relId = sheet[0].match(/r:id="([^"]+)"/)?.[1];
    const name = unescapeXml(sheet[0].match(/name="([^"]*)"/)?.[1] ?? '');
    if (!relId) continue;
    const target = rels
      ?.match(new RegExp(`<Relationship\\s[^>]*Id="${relId}"[^>]*/?>`))?.[0]
      ?.match(/Target="([^"]+)"/)?.[1];
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = unzipEntry(bytes, path);
    if (xml) parts.push({ name, xml });
  }
  if (parts.length > 0) return parts;
  // a workbook with no readable rels: the conventional first sheet, or nothing
  const fallback = unzipEntry(bytes, 'xl/worksheets/sheet1.xml');
  return fallback ? [{ name: '', xml: fallback }] : [];
}

/** The workbook's shared string table, which cells of type `s` index into. */
function sharedStrings(bytes: Buffer): string[] {
  const sharedXml = unzipEntry(bytes, 'xl/sharedStrings.xml');
  return sharedXml
    ? [...sharedXml.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!))
    : [];
}

/**
 * T-451 — one cell as Excel stored it, typed. **A formula's RESULT, never the
 * formula** (ADR-0059 decision 5): `<f>` is skipped and the cached `<v>` read,
 * which is what Excel writes on every save and is the honest reading of "the
 * figures the firm submitted". A formula Excel never calculated (a file written
 * by a tool that does not compute) has no `<v>`, and is `uncalculated` rather
 * than quietly blank — an import over it has to fail in words, not read zero.
 */
export type XlsxCell =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number; text: string }
  | { kind: 'boolean'; value: boolean; text: string }
  /** `#DIV/0!`, `#REF!`… — the cached result of a broken formula */
  | { kind: 'error'; text: string }
  | { kind: 'uncalculated' };

function cellOf(attrs: string, body: string, shared: string[]): XlsxCell {
  const type = attrs.match(/\bt="([^"]+)"/)?.[1];
  const hasFormula = /<f[\s>/]/.test(body);
  const hasValue = /<v[\s>]/.test(body) || /<is[\s>]/.test(body);
  if (hasFormula && !hasValue) return { kind: 'uncalculated' };
  const raw = textOf(body);
  if (type === 's') {
    const text = (shared[Number(raw)] ?? '').trim();
    return text === '' ? { kind: 'empty' } : { kind: 'text', text };
  }
  if (type === 'inlineStr' || type === 'str') {
    const text = raw.trim();
    return text === '' ? { kind: 'empty' } : { kind: 'text', text };
  }
  if (type === 'b') return { kind: 'boolean', value: raw.trim() === '1', text: raw.trim() };
  if (type === 'e') return { kind: 'error', text: raw.trim() };
  const text = raw.trim();
  if (text === '') return { kind: 'empty' };
  const value = Number(text);
  // `n`, absent, or `d` (an ISO date some writers emit) — a number when it
  // parses as one, text otherwise
  return Number.isFinite(value) ? { kind: 'number', value, text } : { kind: 'text', text };
}

/** One worksheet as a typed grid — the sparse grid densified in both axes, so
 * indices match Excel's on-screen row and column numbers (an import error can
 * then name the row the user sees). Null when the sheet is not plausibly a
 * document. */
function parseSheetCells(sheet: Buffer, shared: string[]): XlsxCell[][] | null {
  const rows: XlsxCell[][] = [];
  for (const rowMatch of sheet.toString('utf8').matchAll(/<row\s([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    // honour the row's r attribute: Excel omits blank rows from the XML, and
    // collapsing them would misnumber every row beneath one. A row reference
    // beyond any plausible plan refuses the file rather than densifying to it.
    const rowRef = rowMatch[1]!.match(/r="(\d+)"/);
    if (rowRef && Number(rowRef[1]) > 100_000) return null;
    if (rowRef) while (rows.length < Number(rowRef[1]) - 1) rows.push([]);
    const cells: XlsxCell[] = [];
    // a self-closing <row …/> (a formatted empty row) has no body at all —
    // the same lazy-match discipline as the cell fix (review 2026-10-18)
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1]!;
      const ref = attrs.match(/r="([A-Z]+)\d+"/);
      let column = cells.length;
      if (ref) {
        column = 0;
        for (const ch of ref[1]!) column = column * 26 + (ch.charCodeAt(0) - 64);
        column -= 1;
      }
      // a column reference beyond Excel's own last column (XFD) is not a sheet
      if (column > 16_383) return null;
      while (cells.length < column) cells.push({ kind: 'empty' });
      cells[column] = cellOf(attrs, cellMatch[2] ?? '', shared);
    }
    rows.push(cells);
  }
  return rows;
}

/** A typed cell as the trimmed text the string readers have always returned —
 * a formula's cached result included, `TRUE`/`FALSE` as Excel stores them. */
function cellText(cell: XlsxCell): string {
  return cell.kind === 'empty' || cell.kind === 'uncalculated' ? '' : cell.text;
}

/** One worksheet as trimmed string rows — the plan import's and corpus
 * extraction's view, read through the same typed walk as the file source's. */
function parseSheet(sheet: Buffer, shared: string[]): string[][] | null {
  return parseSheetCells(sheet, shared)?.map((row) => row.map(cellText)) ?? null;
}

/** T-451 — does the workbook count its dates from 1904 (Excel for Mac's old
 * default) rather than 1900? A date cell is a day count, so reading one against
 * the wrong origin is four years out with nothing on the cell to say so. */
export function usesDate1904(bytes: Buffer): boolean {
  const workbook = unzipEntry(bytes, 'xl/workbook.xml')?.toString('utf8') ?? '';
  return /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(workbook);
}

/** T-451 — every sheet, named, in tab order, as typed cells: the file source's
 * view, which needs to tell a number from the text "12" and a broken formula
 * from an empty cell. Null when the bytes are not a readable workbook. */
export function readXlsxCells(bytes: Buffer): Array<{ name: string; rows: XlsxCell[][] }> | null {
  const parts = sheetParts(bytes);
  if (parts.length === 0) return null;
  const shared = sharedStrings(bytes);
  const sheets: Array<{ name: string; rows: XlsxCell[][] }> = [];
  for (const part of parts) {
    const rows = parseSheetCells(part.xml, shared);
    if (rows === null) return null;
    sheets.push({ name: part.name, rows });
  }
  return sheets;
}

/** Every sheet, named, in tab order — corpus extraction's view (T-306). */
export function parseXlsxSheets(bytes: Buffer): Array<{ name: string; rows: string[][] }> | null {
  const parts = sheetParts(bytes);
  if (parts.length === 0) return null;
  const shared = sharedStrings(bytes);
  const sheets: Array<{ name: string; rows: string[][] }> = [];
  for (const part of parts) {
    const rows = parseSheet(part.xml, shared);
    if (rows === null) return null;
    sheets.push({ name: part.name, rows });
  }
  return sheets;
}

/** The first worksheet in tab order, as rows — the plan import's view (T-359).
 * Returns null when the bytes are not a readable workbook. */
export function parseXlsx(bytes: Buffer): string[][] | null {
  return parseXlsxSheets(bytes)?.[0]?.rows ?? null;
}
