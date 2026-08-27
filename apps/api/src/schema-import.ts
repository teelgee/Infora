// T-337 — a firm's spreadsheet becomes **candidate** fields.
//
// Every consultancy already has its schema in a spreadsheet, and the schema
// screen's options editor is a code and a description typed per row, built to
// scale to the long routewide code lists. Retyping one is the highest-friction
// moment in the product and it lands in the pilot's **first hour**, before the
// firm has seen a single benefit.
//
// **Deterministic-first (ADR-0027 §2, pattern 1).** A sheet whose headers are
// recognisable maps to `NamingSchemeField` with **no model call at all** — no
// Run, no prompt, no cost, nothing to attribute. The escape hatch to
// `extractor` (T-274) is for a sheet this cannot read, and it is deliberately
// not built here: the deterministic half is useful alone, which is what keeps
// this off Waypoint B's critical path.
//
// **Candidate is the operative word.** Nothing is written. The parse returns
// what it found, the owner reviews it on screen, and the save goes through the
// existing naming-scheme `PUT` — so an import cannot rewrite a project's
// scheme by arriving.
//
// **Three constraints, from the ticket, and each is a property of this file:**
//
//   1. the file is **never admitted to the library**, never chunked, never
//      retrievable — this module holds no `Db` and imports nothing that does,
//      and the route parses in-request and keeps nothing;
//   2. **no run request echoes the file body** — `runs.request` is persisted,
//      and an existing schema routinely names **authors and reviewers** in its
//      role columns, so echoing an upload would silently create a store of
//      personal data (personal-data.md). The deterministic path writes no Run
//      at all, which is the strongest form of that guarantee available;
//   3. an unparseable file **fails loudly and names the row**, matching V1's
//      per-document ingest ruling — `skipped` carries a row number a person
//      can find in Excel.
import type { NamingSchemeField } from '@infora/contracts';
import { parseXlsx } from './xlsx';

export type SkippedRow = { row: number; reason: string };

export type SchemaImport = {
  /** candidates, never saved — the owner reviews and the existing PUT writes */
  fields: NamingSchemeField[];
  /** every row that did not become a code, by its Excel row number */
  skipped: SkippedRow[];
};

export type SchemaImportRefusal = { reason: string; detail?: string };

/**
 * Header synonyms, because a firm's spreadsheet says whatever the person who
 * made it said. Matching is on a normalised header — lowercased, non-letters
 * dropped — so "Code ", "CODE", "Doc. Code" and "code" are one thing.
 *
 * Kept deliberately small: a synonym list that guesses wrongly is worse than
 * one that refuses, because a wrong guess writes a plausible code list nobody
 * checks. Anything unrecognised is reported by name so the owner can rename
 * the column and re-import — an answer they can act on in ten seconds, which
 * is the alternative to escalating to a model.
 */
const HEADERS = {
  code: ['code', 'codes', 'ref', 'reference', 'abbreviation', 'abbrev', 'value', 'id', 'key', 'short'],
  description: ['description', 'desc', 'meaning', 'label', 'name', 'title', 'definition', 'long'],
  field: ['field', 'category', 'facet', 'attribute', 'group', 'type', 'part', 'element'],
} as const;

const normalise = (header: string) => header.toLowerCase().replace(/[^a-z]/g, '');

function classify(header: string): keyof typeof HEADERS | null {
  const key = normalise(header);
  if (key === '') return null;
  // `field` first: a sheet with Field / Code / Description columns would
  // otherwise match "type" as a code synonym and lose its grouping
  for (const kind of ['field', 'code', 'description'] as const) {
    if ((HEADERS[kind] as readonly string[]).includes(key)) return kind;
  }
  return null;
}

/** a stable, safe key from a human field name: "Document type" → "document_type" */
export function keyFor(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key === '' ? 'field' : key.slice(0, 40);
}

/**
 * Rows → candidate fields.
 *
 * Two shapes are recognised, and they are the two shapes these spreadsheets
 * actually come in:
 *
 *   * **Code / Description** — one code list, which is the options editor's
 *     own shape and the case the ticket names;
 *   * **Field / Code / Description** — several lists in one sheet, grouped by
 *     the field column, which is how a routewide schedule is usually kept.
 *
 * The header row is found by scanning rather than assumed to be row 1: these
 * sheets routinely open with a title and a blank line.
 */
export function parseSchemaRows(rows: string[][]): SchemaImport | SchemaImportRefusal {
  const headerAt = rows.findIndex((row) => {
    const kinds = new Set(row.map(classify).filter((kind) => kind !== null));
    return kinds.has('code') && kinds.has('description');
  });
  if (headerAt < 0) {
    // named, not generic: the owner can rename a column and re-import, which is
    // a ten-second fix and the reason this does not reach for a model
    const seen = rows
      .slice(0, 10)
      .flat()
      .filter((cell) => cell.trim() !== '')
      .slice(0, 12);
    return {
      reason: 'no_recognisable_headers',
      detail:
        seen.length > 0
          ? `expected a code column and a description column; found ${seen.map((h) => `“${h}”`).join(', ')}`
          : 'the sheet is empty',
    };
  }

  const header = rows[headerAt]!;
  const columnOf = (kind: keyof typeof HEADERS) => header.findIndex((cell) => classify(cell) === kind);
  const codeAt = columnOf('code');
  const descriptionAt = columnOf('description');
  const fieldAt = columnOf('field');

  const groups = new Map<string, { label: string; values: string[]; labels: Record<string, string> }>();
  const skipped: SkippedRow[] = [];
  const seenPerGroup = new Map<string, Set<string>>();

  for (let at = headerAt + 1; at < rows.length; at++) {
    const row = rows[at] ?? [];
    // Excel's own row number, so "row 47" is a row the owner can go and look at
    const excelRow = at + 1;
    const code = (row[codeAt] ?? '').trim();
    const description = (row[descriptionAt] ?? '').trim();
    const groupLabel = fieldAt < 0 ? '' : (row[fieldAt] ?? '').trim();

    if (code === '' && description === '' && groupLabel === '') continue; // a blank spacer row
    if (code === '') {
      skipped.push({ row: excelRow, reason: 'no code in the code column' });
      continue;
    }
    if (/\s/.test(code)) {
      // a code with a space in it is nearly always a sentence that landed in
      // the wrong column, and admitting it would put a paragraph in a picker
      skipped.push({ row: excelRow, reason: `“${code}” is not a code — it contains a space` });
      continue;
    }

    const groupKey = keyFor(groupLabel);
    const group = groups.get(groupKey) ?? {
      label: groupLabel === '' ? 'Imported codes' : groupLabel,
      values: [],
      labels: {},
    };
    const seen = seenPerGroup.get(groupKey) ?? new Set<string>();
    if (seen.has(code)) {
      // a duplicate is reported rather than silently collapsed: in a code list
      // it usually means two meanings competing for one code, which is the
      // firm's problem to resolve and not this import's to pick a side in
      skipped.push({ row: excelRow, reason: `“${code}” is already defined above` });
      continue;
    }
    seen.add(code);
    group.values.push(code);
    if (description !== '') group.labels[code] = description;
    groups.set(groupKey, group);
    seenPerGroup.set(groupKey, seen);
  }

  const fields: NamingSchemeField[] = [...groups.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    type: 'select',
    allowedValues: group.values,
    ...(Object.keys(group.labels).length > 0 && { allowedValueLabels: group.labels }),
  }));

  if (fields.length === 0) {
    return { reason: 'no_codes_found', detail: `${skipped.length} row(s) had headers but no usable code` };
  }
  return { fields, skipped };
}

/**
 * A CSV reader that honours quotes, because a description column is exactly
 * where a comma lives ("Engineering – Civils, drainage").
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '') // a BOM, which Excel writes.replace(/\r\n?/g, '\n');
  for (let at = 0; at < source.length; at++) {
    const ch = source[at]!;
    if (quoted) {
      if (ch !== '"') {
        cell += ch;
        continue;
      }
      if (source[at + 1] === '"') {
        cell += '"';
        at += 1;
        continue;
      }
      quoted = false;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

/**
 * The whole deterministic path: bytes and a file name in, candidates out.
 *
 * A format it cannot read is a refusal by name, not an empty result — the same
 * rule the corpus's format reach follows (v1.md), for the same reason: a
 * silent empty answer looks like "your spreadsheet had nothing in it".
 */
export function parseSchemaFile(fileName: string, bytes: Buffer): SchemaImport | SchemaImportRefusal {
  const extension = fileName.split('.').at(-1)?.toLowerCase() ?? '';
  if (extension === 'csv') return parseSchemaRows(parseCsv(bytes.toString('utf8')));
  if (extension === 'xlsx') {
    const rows = parseXlsx(bytes);
    if (rows === null) return { reason: 'unreadable_file' };
    return parseSchemaRows(rows);
  }
  return { reason: 'unsupported_format', detail: 'a .csv or .xlsx file' };
}

export const isRefusal = (result: SchemaImport | SchemaImportRefusal): result is SchemaImportRefusal =>
  'reason' in result;
