// T-358/T-359 — a minimal .xlsx writer and reader, in the spirit of upload.ts's
// minimal zip reader: the template export and the plan batch import need exactly
// one workbook shape (a header row + data rows + a legend sheet), which does not
// justify a workbook dependency. Entries are stored uncompressed; cells are
// written as inline strings and read back from inline, shared or raw values.
import { inflateRawSync } from 'node:zlib';

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

function unzipEntry(zip: Buffer, wanted: string): Buffer | null {
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 65536; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name === wanted) {
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const payload = zip.subarray(dataStart, dataStart + compressedSize);
      return method === 8 ? inflateRawSync(payload) : Buffer.from(payload);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
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

/** The first worksheet in tab order, resolved through the workbook rels the way
 * Excel maps tabs to parts (a rebuilt tab can live in sheet2.xml). */
function firstSheetXml(bytes: Buffer): Buffer | null {
  const workbook = unzipEntry(bytes, 'xl/workbook.xml')?.toString('utf8');
  const relId = workbook?.match(/<sheet\s[^>]*r:id="([^"]+)"/)?.[1];
  if (relId) {
    const rels = unzipEntry(bytes, 'xl/_rels/workbook.xml.rels')?.toString('utf8');
    const target = rels
      ?.match(new RegExp(`<Relationship\\s[^>]*Id="${relId}"[^>]*/?>`))?.[0]
      ?.match(/Target="([^"]+)"/)?.[1];
    if (target) {
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      const entry = unzipEntry(bytes, path);
      if (entry) return entry;
    }
  }
  return unzipEntry(bytes, 'xl/worksheets/sheet1.xml');
}

/** First worksheet as trimmed string rows — the sparse grid densified in both
 * axes, so indices match Excel's on-screen row and column numbers (an import
 * error can then name the row the user sees). Returns null when the bytes are
 * not a readable workbook. */
export function parseXlsx(bytes: Buffer): string[][] | null {
  const sheet = firstSheetXml(bytes);
  if (!sheet) return null;
  const sharedXml = unzipEntry(bytes, 'xl/sharedStrings.xml');
  const shared: string[] = sharedXml
    ? [...sharedXml.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!))
    : [];
  const rows: string[][] = [];
  for (const rowMatch of sheet.toString('utf8').matchAll(/<row\s([^>]*)>([\s\S]*?)<\/row>/g)) {
    // honour the row's r attribute: Excel omits blank rows from the XML, and
    // collapsing them would misnumber every row beneath one
    const rowRef = rowMatch[1]!.match(/r="(\d+)"/);
    if (rowRef) while (rows.length < Number(rowRef[1]) - 1) rows.push([]);
    const cells: string[] = [];
    for (const cellMatch of rowMatch[2]!.matchAll(/<c\s([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1]!;
      const body = cellMatch[2] ?? '';
      const ref = attrs.match(/r="([A-Z]+)\d+"/);
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      let column = cells.length;
      if (ref) {
        column = 0;
        for (const ch of ref[1]!) column = column * 26 + (ch.charCodeAt(0) - 64);
        column -= 1;
      }
      let value = textOf(body);
      if (type === 's') value = shared[Number(value)] ?? '';
      while (cells.length < column) cells.push('');
      cells[column] = value.trim();
    }
    rows.push(cells);
  }
  return rows;
}
