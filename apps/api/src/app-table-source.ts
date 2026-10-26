// T-451 — **the file source: an app table fed from a spreadsheet the project
// already holds** (ADR-0059; drawn in data-model.md, Drawer 9; migration 0069).
//
// *In plain terms: a builder points a table at one spreadsheet in the project —
// a sandbox document or a library record — picks the block of cells that holds
// the data and says what each column means. From then on, every new version of
// that file refills the table the moment it lands: the new rows come in as the
// person who put that version there, and the previous import's rows are
// superseded. A file that no longer fits fails loudly, in words, and changes
// nothing.*
//
// THE ACTS LIVE HERE, ONCE (the app-builder-acts pattern): attach, import,
// detach. The routes below call them; the version-landing hooks — the
// replace-file route (upload.ts) and promotion (cycle.ts) — call
// `importOnVersionLanding`; nothing else writes an imported row.
//
// 🔒 **THE BUILDER'S AGENT HAS NO WAY HERE** (ADR-0059 decision 4). Attaching is
// a person's panel act. `app-builder-agent.ts` and `app-builder-acts.ts` never
// import this file, and `app-builder-agent.test.ts` pins that from the source.
//
// 🔒 **AN IMPORTED ROW NAMES THE PERSON WHOSE ACT PRODUCED THE FILE VERSION**
// (decision 2) — resolved from the document's own record, never from the
// builder and never from a request body:
//   * a SANDBOX document: whoever saved its latest version — the upload, or the
//     replace-file that put the current file there;
//   * a LIBRARY record: whoever ISSUED the current revision — the producing
//     organisation's person on the transmittal that carried it. A contractual
//     (C) revision is the accepted P's file re-issued by acceptance, so it
//     names that P's issuer. A record with no issuer at all (reference material
//     loaded in bulk) fails the import in words: a figure nobody vouched for is
//     not evidence.
//
// 🔒 **AN IMPORTED ROW IS AN ORDINARY ROW** (decision 3). It is checked by the
// same `checkValues` a typed row is, lands `submitted` on a table with an
// acceptance step and stateless otherwise, and is read through the same
// predicate. Nothing here bypasses the row predicate, the freeze, or the
// accepted-row trigger — the supersession below moves rows only along
// transitions the database already permits.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { attachTableSourceBody, publishedColumnsOf, sourceDocumentRef } from '@infora/contracts';
import type {
  ApiError,
  AppColumn,
  AppTableSourceRecord,
  AppTableSourceResponse,
  AttachTableSourceBody,
  ListSourceDocumentsResponse,
  ListSourceRegionsResponse,
  SourceDocumentOption,
  SourceDocumentRef,
  SourceMappingEntry,
  SourceRegion,
} from '@infora/contracts';
import { canAccessSandbox, canBuildApp } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { deliverableVisibleSql } from '@infora/knowledge';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { checkValues } from './app-rows';
import { buildFacts, loadApp } from './apps';
import type { LoadedApp } from './apps';
import { getBlob } from './renditions';
import { resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';
import { readXlsxCells, usesDate1904 } from './xlsx';
import type { XlsxCell } from './xlsx';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail?: string) =>
  c.json({ error: 'invalid', ...(detail !== undefined && { detail }) } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** The most rows one import takes. A cost report is tens to hundreds of rows;
 * a sheet past this is not a table a dashboard is fed from, and refusing it in
 * words beats a request that runs for a minute. */
export const MAX_IMPORT_ROWS = 5000;

/** How many problems a failed import's receipt names before it summarises. */
const PROBLEMS_NAMED = 3;

type StoredSource = typeof s.appTableSources.$inferSelect;

// ── Reading a spreadsheet as table-shaped regions ───────────────────────────

/** Header texts compare as a person reads them: case, padding and doubled
 * spaces are not a different heading. */
const norm = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

const blank = (cell: XlsxCell | undefined) =>
  cell === undefined || cell.kind === 'empty';

const textOfCell = (cell: XlsxCell | undefined): string =>
  cell === undefined || cell.kind === 'empty' || cell.kind === 'uncalculated' ? '' : cell.text;

/** Maximal runs of two or more consecutive TEXT cells in a row — what a header
 * row looks like. A heading is words; a run broken by a number or a gap is two
 * runs, or none. */
function headerRuns(row: XlsxCell[] | undefined): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  if (row === undefined) return runs;
  let start = -1;
  for (let column = 0; column <= row.length; column++) {
    const heading = row[column]?.kind === 'text';
    if (heading && start < 0) start = column;
    if (!heading && start >= 0) {
      if (column - start >= 2) runs.push({ start, end: column - 1 });
      start = -1;
    }
  }
  return runs;
}

const anyIn = (row: XlsxCell[] | undefined, start: number, end: number) => {
  if (row === undefined) return false;
  for (let column = start; column <= end; column++) if (!blank(row[column])) return true;
  return false;
};

/**
 * Every table-shaped region in a workbook: a header row of at least two
 * headings, and the rows beneath it down to the first row blank across those
 * columns. **Never loose cells** — the Power BI lesson ADR-0059 is built on is
 * that a block with a header row is the unit that survives the sheet being
 * edited, and a free cell range is the one that silently breaks.
 *
 * Read top-down, and a cell already inside a region is never the header of
 * another. A short label row sitting directly on a WIDER header row (a
 * "Project: Wrenfield" line over the real table) is skipped rather than
 * offered, because taking it would make the real header row its first data row.
 */
export function findRegions(sheets: Array<{ name: string; rows: XlsxCell[][] }>): SourceRegion[] {
  const regions: SourceRegion[] = [];
  for (const sheet of sheets) {
    const claimed = new Set<string>();
    for (let r = 0; r < sheet.rows.length; r++) {
      for (const run of headerRuns(sheet.rows[r])) {
        let taken = false;
        for (let column = run.start; column <= run.end; column++) {
          if (claimed.has(`${r}:${column}`)) taken = true;
        }
        if (taken) continue;
        const labelOverHeader = headerRuns(sheet.rows[r + 1]).some(
          (below) =>
            below.start <= run.start &&
            below.end >= run.end &&
            below.end - below.start > run.end - run.start,
        );
        if (labelOverHeader) continue;
        let end = r;
        while (
          end + 1 < sheet.rows.length &&
          end - r < MAX_IMPORT_ROWS &&
          anyIn(sheet.rows[end + 1], run.start, run.end)
        ) {
          end++;
        }
        for (let row = r; row <= end; row++) {
          for (let column = run.start; column <= run.end; column++) claimed.add(`${row}:${column}`);
        }
        const columns = Array.from({ length: run.end - run.start + 1 }, (_, i) => run.start + i);
        regions.push({
          sheet: sheet.name,
          headerRowNumber: r + 1,
          headers: columns.map((column) => textOfCell(sheet.rows[r]![column])),
          rowCount: end - r,
          sample: sheet.rows
            .slice(r + 1, Math.min(end, r + 3) + 1)
            .map((row) => columns.map((column) => textOfCell(row[column]))),
        });
      }
    }
  }
  return regions;
}

/**
 * Find the selected region again, BY ITS HEADINGS — the first row on the sheet
 * carrying every mapped heading. A block that moved down the sheet, or gained a
 * column, is found; one whose heading was renamed or deleted is not, and the
 * answer names which heading went missing.
 */
function refindRegion(
  rows: XlsxCell[][],
  headers: string[],
):
  | { ok: true; headerRow: number; columnOf: Map<string, number> }
  | { ok: false; reason: string } {
  const wanted = headers.map(norm);
  let best: { matched: Set<string> } = { matched: new Set() };
  for (let r = 0; r < rows.length; r++) {
    const positions = new Map<string, number[]>();
    rows[r]!.forEach((cell, column) => {
      if (cell.kind !== 'text') return;
      const key = norm(cell.text);
      if (!wanted.includes(key)) return;
      positions.set(key, [...(positions.get(key) ?? []), column]);
    });
    if (positions.size > best.matched.size) best = { matched: new Set(positions.keys()) };
    if (positions.size < wanted.length) continue;
    const twice = wanted.find((key) => positions.get(key)!.length > 1);
    if (twice !== undefined) {
      const heading = headers[wanted.indexOf(twice)]!;
      return {
        ok: false,
        reason: `Row ${r + 1} has two columns headed “${heading}”, so Infora cannot tell which one feeds the table. Rename one of them.`,
      };
    }
    return {
      ok: true,
      headerRow: r,
      columnOf: new Map(wanted.map((key) => [key, positions.get(key)![0]!])),
    };
  }
  const missing = headers.filter((heading) => !best.matched.has(norm(heading)));
  return {
    ok: false,
    reason:
      best.matched.size === 0
        ? `The table headed ${quoteList(headers)} is no longer on this sheet.`
        : `The table's heading${missing.length === 1 ? '' : 's'} ${quoteList(missing)} ${missing.length === 1 ? 'is' : 'are'} no longer on this sheet, so the table could not be found.`,
  };
}

function quoteList(items: string[]): string {
  const quoted = items.map((item) => `“${item}”`);
  return quoted.length <= 1 ? (quoted[0] ?? '') : `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
}

/** Excel's day-count dates, as the ISO date a form stores — counted from the
 * workbook's own origin (1900, or 1904 for a file that says so). */
function serialToIsoDate(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < (date1904 ? 0 : 1) || serial > 2_958_465) return null;
  const origin = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = origin + Math.floor(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * One cell as the value a declared column takes — or, in words, why it cannot
 * be. **Never a guess**: a text date in some local order, a number with a unit
 * stuck to it, a formula Excel never calculated — each is refused with the row
 * and the heading, because a dashboard quietly reading the wrong figure is
 * worse than one that says it could not read this month's file.
 */
function valueFor(
  cell: XlsxCell | undefined,
  column: AppColumn,
  date1904: boolean,
): { ok: true; value: unknown } | { ok: false; problem: string } {
  if (cell === undefined || cell.kind === 'empty') return { ok: true, value: undefined };
  if (cell.kind === 'error') return { ok: false, problem: `holds the spreadsheet error ${cell.text}` };
  if (cell.kind === 'uncalculated') {
    return {
      ok: false,
      problem: 'holds a formula the spreadsheet never calculated — open the file in Excel and save it again',
    };
  }
  switch (column.type) {
    case 'number': {
      if (cell.kind === 'number') return { ok: true, value: cell.value };
      const cleaned = cell.text.replace(/[,\s£$€]/g, '');
      if (/^-?\d+(\.\d+)?$/.test(cleaned)) return { ok: true, value: Number(cleaned) };
      return { ok: false, problem: 'holds something that is not a number' };
    }
    case 'boolean': {
      if (cell.kind === 'boolean') return { ok: true, value: cell.value };
      const said = norm(cell.text);
      if (['yes', 'y', 'true', '1'].includes(said)) return { ok: true, value: true };
      if (['no', 'n', 'false', '0'].includes(said)) return { ok: true, value: false };
      return { ok: false, problem: 'holds something that is not yes or no' };
    }
    case 'date': {
      if (cell.kind === 'number') {
        const iso = serialToIsoDate(cell.value, date1904);
        if (iso !== null) return { ok: true, value: iso };
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(cell.text)) return { ok: true, value: cell.text.slice(0, 10) };
      return {
        ok: false,
        // content-free on purpose (review 2026-10-18): the receipt is readable
        // by every builder in the firm, and a cell can hold anything
        problem: 'holds something Infora cannot read as a date without guessing — format the column as a date in Excel',
      };
    }
    case 'text':
    case 'choice':
      return { ok: true, value: cell.kind === 'boolean' ? (cell.value ? 'TRUE' : 'FALSE') : cell.text };
  }
}

/**
 * The region's rows as the table's values, or every reason it cannot be. Pure:
 * the act decides what to store.
 */
export function rowsFromWorkbook(
  sheets: Array<{ name: string; rows: XlsxCell[][] }>,
  source: { sheet: string; mapping: SourceMappingEntry[] },
  columns: AppColumn[],
  date1904 = false,
): { ok: true; rows: Array<Record<string, unknown>> } | { ok: false; reason: string } {
  const sheet = sheets.find((candidate) => candidate.name === source.sheet);
  if (!sheet) return { ok: false, reason: `The sheet “${source.sheet}” is no longer in the file.` };
  const found = refindRegion(
    sheet.rows,
    source.mapping.map((entry) => entry.header),
  );
  if (!found.ok) return { ok: false, reason: `On the sheet “${source.sheet}”: ${found.reason}` };
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const mapped = source.mapping.map((entry) => ({
    column: byKey.get(entry.columnKey)!,
    header: entry.header,
    at: found.columnOf.get(norm(entry.header))!,
  }));
  const rows: Array<Record<string, unknown>> = [];
  const problems: string[] = [];
  for (let r = found.headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r]!;
    // the region ends at the first row blank across every mapped column
    if (mapped.every((entry) => blank(row[entry.at]))) break;
    if (rows.length === MAX_IMPORT_ROWS) {
      return {
        ok: false,
        reason: `The table runs past ${MAX_IMPORT_ROWS.toLocaleString('en-GB')} rows, which is more than one import takes.`,
      };
    }
    const values: Record<string, unknown> = {};
    let unreadable = false;
    for (const entry of mapped) {
      const converted = valueFor(row[entry.at], entry.column, date1904);
      if (!converted.ok) {
        problems.push(`Row ${r + 1}, “${entry.header}” ${converted.problem}.`);
        unreadable = true;
        continue;
      }
      if (converted.value !== undefined) values[entry.column.key] = converted.value;
    }
    // the typed row's own check, once the cells read — a cell already named
    // as unreadable is not named again as "required"
    const shape = unreadable ? null : checkValues(columns, values);
    if (shape !== null) problems.push(`Row ${r + 1}: ${shape}.`);
    rows.push(values);
  }
  if (problems.length > 0) {
    const more = problems.length - PROBLEMS_NAMED;
    return {
      ok: false,
      reason:
        problems.slice(0, PROBLEMS_NAMED).join(' ') +
        (more > 0 ? ` And ${more} more problem${more === 1 ? '' : 's'}.` : ''),
    };
  }
  if (rows.length === 0) {
    return {
      ok: false,
      reason: `The table on the sheet “${source.sheet}” has no rows under its headings.`,
    };
  }
  return { ok: true, rows };
}

/** The mapping checked against the table it feeds — at attach, and again at
 * every import, because the drawing says so and a table can be retired. */
function mappingProblem(
  mapping: SourceMappingEntry[],
  headerRow: string[],
  columns: AppColumn[],
): string | null {
  const headings = new Set(headerRow.map(norm));
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const seenHeaders = new Set<string>();
  const seenKeys = new Set<string>();
  for (const entry of mapping) {
    if (!headings.has(norm(entry.header))) {
      return `“${entry.header}” is not one of the region's headings`;
    }
    if (seenHeaders.has(norm(entry.header))) return `“${entry.header}” is mapped twice`;
    seenHeaders.add(norm(entry.header));
    const column = byKey.get(entry.columnKey);
    if (!column) return `the table has no column “${entry.columnKey}”`;
    if (seenKeys.has(entry.columnKey)) return `two headings feed the column “${column.label}”`;
    seenKeys.add(entry.columnKey);
  }
  const unfed = columns.filter((column) => column.required && !seenKeys.has(column.key));
  if (unfed.length > 0) {
    return `the table's required column${unfed.length === 1 ? '' : 's'} ${quoteList(unfed.map((c) => c.label))} ${unfed.length === 1 ? 'is' : 'are'} not fed by any heading`;
  }
  return null;
}

// ── The document behind a source ─────────────────────────────────────────────

type CurrentFile =
  | { ok: true; bytes: Buffer; version: string; uploaderParticipantId: string; token: string }
  | { ok: false; reason: string };

/** The document's CURRENT file, its version's label, and the person whose act
 * produced that version — the one fact the rows are stamped with. */
async function currentFile(db: Db, pointer: SourceDocumentRef): Promise<CurrentFile> {
  if (pointer.sandboxDocumentId !== undefined) {
    const [doc] = await db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, pointer.sandboxDocumentId!))
      .limit(1);
    if (!doc) return { ok: false, reason: 'The spreadsheet is no longer in the project.' };
    if (doc.deletedAt !== null) return { ok: false, reason: 'The spreadsheet is in the bin.' };
    if (doc.origin !== 'uploaded' || doc.format !== 'xlsx' || doc.fileRef === null) {
      return { ok: false, reason: 'The document is no longer an uploaded spreadsheet.' };
    }
    // WHO is named: the creator of the newest version that CARRIES the current
    // file — not merely the newest version row. A text edit or a restore also
    // adds a version row without touching the file, and before this check
    // (review 2026-10-18) whoever made one became the named enterer of figures
    // they never uploaded.
    const versions = await db
      .select({ by: s.sandboxDocumentVersions.createdByParticipantId, fileRef: s.sandboxDocumentVersions.fileRef })
      .from(s.sandboxDocumentVersions)
      .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, doc.id))
      .orderBy(asc(s.sandboxDocumentVersions.createdAt), asc(s.sandboxDocumentVersions.id));
    const landed = [...versions].reverse().find((row) => row.fileRef !== null && row.fileRef === doc.fileRef);
    if (!landed) return { ok: false, reason: 'Infora cannot name who saved the current file, so nobody could be named as entering its figures.' };
    const bytes = getBlob(doc.fileRef);
    if (bytes === null) return { ok: false, reason: 'The spreadsheet file could not be read from storage.' };
    return { ok: true, bytes, version: `v0.${versions.length}`, uploaderParticipantId: landed.by, token: doc.fileRef };
  }
  const [container] = await db
    .select()
    .from(s.containers)
    .where(eq(s.containers.id, pointer.containerId!))
    .limit(1);
  if (!container || container.scope !== 'library' || !container.inLibrary || container.state !== 'live') {
    return { ok: false, reason: 'The record is no longer live in the library.' };
  }
  const [current] = await db
    .select()
    .from(s.versions)
    .where(and(eq(s.versions.containerId, container.id), eq(s.versions.isCurrent, true)))
    .limit(1);
  if (!current) return { ok: false, reason: 'The record has no current revision.' };
  const [native] = await db
    .select()
    .from(s.renditions)
    .where(and(eq(s.renditions.versionId, current.id), eq(s.renditions.kind, 'native')))
    .limit(1);
  if (!native || native.format !== 'xlsx') {
    return {
      ok: false,
      reason: `The record's current revision, ${current.versionReference}, is not a spreadsheet.`,
    };
  }
  // WHO ISSUED IT: the producing organisation's sender on the newest
  // transmittal carrying this revision or an earlier one. A promotion is a
  // review transmittal in the `return` direction (its version reached through
  // the round); a non-review or external issue names its version directly. The
  // reviewing side's own `issue` transmittals are excluded by direction, which
  // matters when the producer IS the project owner.
  const [issuer] = await db
    .select({ participantId: s.transmittals.senderParticipantId })
    .from(s.transmittals)
    .leftJoin(s.rounds, eq(s.transmittals.roundId, s.rounds.id))
    .innerJoin(s.versions, sql`${s.versions.id} = coalesce(${s.rounds.versionId}, ${s.transmittals.versionId})`)
    .innerJoin(s.participants, eq(s.participants.id, s.transmittals.senderParticipantId))
    .innerJoin(s.users, eq(s.users.id, s.participants.userId))
    .where(
      and(
        eq(s.versions.containerId, container.id),
        // the CURRENT revision's own transmittal, never an earlier one's
        // (review 2026-10-18): falling back to an older revision's issuer
        // would name a person for figures in a file they never saw
        eq(s.versions.id, current.id),
        sql`(${s.transmittals.kind} <> 'review' or ${s.transmittals.direction} = 'return')`,
        eq(s.users.organisationId, container.producingOrganisationId),
      ),
    )
    .orderBy(desc(s.transmittals.issuedAt))
    .limit(1);
  if (!issuer) {
    return {
      ok: false,
      reason: `Infora cannot name who issued ${current.versionReference} of this record, so nobody could be named as entering its figures. Material loaded into the library in bulk has no issuer.`,
    };
  }
  const bytes = getBlob(native.contentRef);
  if (bytes === null) return { ok: false, reason: 'The spreadsheet file could not be read from storage.' };
  return { ok: true, bytes, version: current.versionReference, uploaderParticipantId: issuer.participantId, token: current.id };
}

/** The document's freshness token NOW — compared, under the import's lock,
 * with the token the file was read at, so a slow import of an older version
 * can never overwrite a newer one's rows (review 2026-10-18). */
async function tokenNow(db: Db, pointer: SourceDocumentRef): Promise<string | null> {
  if ('sandboxDocumentId' in pointer) {
    const [doc] = await db
      .select({ fileRef: s.sandboxDocuments.fileRef })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, pointer.sandboxDocumentId!))
      .limit(1);
    return doc?.fileRef ?? null;
  }
  const [current] = await db
    .select({ id: s.versions.id })
    .from(s.versions)
    .where(and(eq(s.versions.containerId, pointer.containerId!), eq(s.versions.isCurrent, true)))
    .limit(1);
  return current?.id ?? null;
}

const pointerOf = (source: Pick<StoredSource, 'sandboxDocumentId' | 'containerId'>): SourceDocumentRef =>
  source.sandboxDocumentId !== null
    ? { sandboxDocumentId: source.sandboxDocumentId }
    : { containerId: source.containerId! };

/**
 * Can THIS person open the document, and what is it called and at which
 * version? Null is no — the same answer as a document that does not exist.
 * The sandbox half is the sandbox's own grant predicate (ADR-0036); the library
 * half is the one deliverable-visibility filter the library list and grounding
 * share, so a builder can attach exactly what they can read.
 */
async function documentReadable(
  db: Db,
  slice: EntitledSlice,
  pointer: SourceDocumentRef,
): Promise<{ title: string; version: string } | null> {
  if (pointer.sandboxDocumentId !== undefined) {
    const [doc] = await db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, pointer.sandboxDocumentId!))
      .limit(1);
    if (!doc || doc.projectId !== slice.projectId || doc.organisationId !== slice.organisationId) return null;
    if (doc.deletedAt !== null || doc.origin !== 'uploaded' || doc.format !== 'xlsx') return null;
    if (!(await sandboxOpen(db, slice, doc.sandboxId))) return null;
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.sandboxDocumentVersions)
      .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, doc.id));
    return { title: doc.title, version: `v0.${count?.n ?? 0}` };
  }
  const [row] = await db
    .select({
      reference: s.containers.documentReference,
      title: s.workItems.title,
      version: s.versions.versionReference,
      format: s.renditions.format,
    })
    .from(s.containers)
    .innerJoin(s.versions, and(eq(s.versions.containerId, s.containers.id), eq(s.versions.isCurrent, true)))
    .innerJoin(s.renditions, and(eq(s.renditions.versionId, s.versions.id), eq(s.renditions.kind, 'native')))
    .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .where(
      and(
        eq(s.containers.id, pointer.containerId!),
        eq(s.containers.projectId, slice.projectId),
        eq(s.containers.scope, 'library'),
        eq(s.containers.inLibrary, true),
        eq(s.containers.state, 'live'),
        deliverableVisibleSql(slice),
      ),
    )
    .limit(1);
  if (!row || row.format !== 'xlsx') return null;
  const reference = row.reference ?? 'Library record';
  return { title: row.title ? `${reference} — ${row.title}` : reference, version: row.version };
}

async function sandboxOpen(db: Db, slice: EntitledSlice, sandboxId: string): Promise<boolean> {
  const grants = await db
    .select()
    .from(s.sandboxScopeGrants)
    .where(and(eq(s.sandboxScopeGrants.sandboxId, sandboxId), isNull(s.sandboxScopeGrants.removedAt)));
  return canAccessSandbox(
    slice,
    grants.map((g) => ({
      granteeType: g.granteeType,
      organisationId: g.organisationId,
      participantId: g.participantId,
      removedAt: g.removedAt,
    })),
  );
}

// ── The acts ─────────────────────────────────────────────────────────────────

type Derived =
  | { ok: false; reason: string }
  | {
      ok: true;
      rows: Array<Record<string, unknown>>;
      version: string;
      token: string;
      hasAcceptance: boolean;
      enterer: { participantId: string; organisationId: string };
    };

/** Everything an import needs, read and checked BEFORE anything is written. */
async function derive(db: Db, source: StoredSource): Promise<Derived> {
  const [table] = await db
    .select({ table: s.appTables, closedAt: s.apps.closedAt, publishedAt: s.apps.publishedAt })
    .from(s.appTables)
    .innerJoin(s.apps, eq(s.apps.id, s.appTables.appId))
    .where(eq(s.appTables.id, source.appTableId))
    .limit(1);
  if (!table) return { ok: false, reason: 'The table no longer exists.' };
  if (table.closedAt !== null) return { ok: false, reason: 'The app is closed.' };
  if (table.table.retiredAt !== null) return { ok: false, reason: 'The table has been retired.' };
  // T-489 — an import maps the PUBLISHED columns only: a column a builder added
  // since the last publish is theirs alone until then, so a row an import writes
  // can never carry a value the app's people may not yet see
  const columns = publishedColumnsOf(table.table.columns as AppColumn[], table.publishedAt?.toISOString() ?? null);
  const mapping = source.mapping as SourceMappingEntry[];
  const problem = mappingProblem(mapping, source.headerRow as string[], columns);
  if (problem !== null) return { ok: false, reason: `The mapping no longer fits the table: ${problem}.` };
  const file = await currentFile(db, pointerOf(source));
  if (!file.ok) return file;
  const sheets = readXlsxCells(file.bytes);
  if (sheets === null) return { ok: false, reason: `${file.version} is not a workbook Infora can read.` };
  const read = rowsFromWorkbook(sheets, { sheet: source.sheet, mapping }, columns, usesDate1904(file.bytes));
  if (!read.ok) return { ok: false, reason: `Nothing was imported from ${file.version}. ${read.reason}` };
  const [person] = await db
    .select({ organisationId: s.users.organisationId })
    .from(s.participants)
    .innerJoin(s.users, eq(s.users.id, s.participants.userId))
    .where(eq(s.participants.id, file.uploaderParticipantId))
    .limit(1);
  if (!person) return { ok: false, reason: `Infora cannot name who saved ${file.version}.` };
  return {
    ok: true,
    rows: read.rows,
    version: file.version,
    token: file.token,
    hasAcceptance: table.table.hasAcceptance,
    enterer: { participantId: file.uploaderParticipantId, ...person },
  };
}

/**
 * **The import — one deliberate act per version** (ADR-0059; ADR-0057's
 * 2026-10-18 ingest discipline). Called by the version-landing hook and by
 * refresh-now, never by a poll.
 *
 * A FAILURE CHANGES NO ROWS. Everything is read and checked first; only a
 * fully readable file reaches the transaction, and a failure writes nothing
 * but the receipt, which says why in a sentence a person can act on.
 *
 * A SUCCESS SUPERSEDES THE PREVIOUS IMPORT'S ROWS — exactly those, by id, and
 * only along transitions the database already permits:
 *   * a submitted or accepted row becomes `superseded` (an accepted row keeps
 *     its decider: the decision happened, and 0067's carve-out keeps it);
 *   * a stateless row is RETIRED, by the person the new rows name — the
 *     organisation replacing its own figures;
 *   * a REJECTED row stays rejected: flipping it would erase its required
 *     reason (app-rows.ts's correction makes the same choice), and "a
 *     rejection's correction is a corrected file version" — the new rows are it.
 * Rows a person typed into the same table are never touched.
 */
export async function importSourceAct(db: Db, sourceId: string): Promise<void> {
  const [source] = await db
    .select()
    .from(s.appTableSources)
    .where(eq(s.appTableSources.id, sourceId))
    .limit(1);
  if (!source || source.detachedAt !== null) return;
  let derived: Derived;
  try {
    derived = await derive(db, source);
  } catch {
    derived = { ok: false, reason: 'The import stopped unexpectedly. Nothing was imported.' };
  }
  if (!derived.ok) {
    await db
      .update(s.appTableSources)
      .set({ lastImportAt: sql`now()`, lastImportOutcome: derived.reason, lastImportSucceeded: false })
      .where(and(eq(s.appTableSources.id, source.id), isNull(s.appTableSources.detachedAt)));
    return;
  }
  const { rows, version, token, hasAcceptance, enterer } = derived;
  try {
    await db.transaction(async (tx) => {
      // the source row is the lock: two versions landing at once import one
      // after the other, and each supersedes exactly what the other wrote
      const [locked] = await tx
        .select()
        .from(s.appTableSources)
        .where(eq(s.appTableSources.id, source.id))
        .for('update');
      if (!locked || locked.detachedAt !== null) return;
      // (review 2026-10-18) the file was read OUTSIDE this transaction: if a
      // newer version landed meanwhile, the newer import stands and this one
      // walks away without touching anything — not even the receipt
      if ((await tokenNow(tx as unknown as Db, pointerOf(locked))) !== token) return;
      let superseded = 0;
      if (locked.lastImportRowIds.length > 0) {
        // STATE-GUARDED, judged at write time (review 2026-10-18): a client's
        // reject landing between a read and this write used to violate the
        // rejection-reason CHECK and abort the whole import. The supersede
        // takes only rows still in a supersedable state; the retire then
        // takes the stateless AND the rejected — a rejected row is retired on
        // re-import, its state and required reason intact on the retired row,
        // because the corrected file version IS the answer to the rejection
        // and a rejected figure that kept counting on dashboards forever was
        // the double-count T-452's own fix was meant to end.
        const supersededRows = await tx
          .update(s.appRows)
          .set({ state: 'superseded' })
          .where(
            and(
              inArray(s.appRows.id, locked.lastImportRowIds),
              isNull(s.appRows.retiredAt),
              inArray(s.appRows.state, ['submitted', 'accepted', 'draft']),
            ),
          )
          .returning({ id: s.appRows.id });
        const retiredRows = await tx
          .update(s.appRows)
          .set({ retiredAt: sql`now()`, retiredByParticipantId: enterer.participantId })
          .where(
            and(
              inArray(s.appRows.id, locked.lastImportRowIds),
              isNull(s.appRows.retiredAt),
              sql`(${s.appRows.state} is null or ${s.appRows.state} = 'rejected')`,
            ),
          )
          .returning({ id: s.appRows.id });
        superseded = supersededRows.length + retiredRows.length;
      }
      const inserted = await tx
        .insert(s.appRows)
        .values(
          rows.map((values, index) => ({
            appTableId: locked.appTableId,
            values,
            // one transaction is one `now()`, and the rows screen orders by
            // `entered_at` — so each row is a microsecond after the one above
            // it, and the table reads in the spreadsheet's own order
            enteredAt: sql`now() + make_interval(secs => ${index}::double precision / 1000000)`,
            // 🔒 the file version's person and their organisation — never the
            // builder, never a system identity (ADR-0059 decision 2)
            organisationId: enterer.organisationId,
            enteredByParticipantId: enterer.participantId,
            // decision 3: the file version IS the submission
            state: hasAcceptance ? ('submitted' as const) : null,
          })),
        )
        .returning({ id: s.appRows.id });
      const plural = (n: number) => (n === 1 ? '' : 's');
      // 🔒 the receipt names no person: the register's row for this table says
      // the configuration holds the builder's stamp and nothing else about
      // anybody, and the rows themselves already say who entered them
      const outcome =
        `Imported ${rows.length} row${plural(rows.length)} from ${version}` +
        (hasAcceptance ? ', submitted for acceptance' : '') +
        '.' +
        (superseded > 0 ? ` The ${superseded} row${plural(superseded)} from the previous import ${superseded === 1 ? 'was' : 'were'} superseded.` : '');
      await tx
        .update(s.appTableSources)
        .set({
          lastImportVersion: version,
          lastImportAt: sql`now()`,
          lastImportOutcome: outcome,
          lastImportSucceeded: true,
          lastImportRowIds: inserted.map((row) => row.id),
        })
        .where(eq(s.appTableSources.id, locked.id));
    });
  } catch {
    // the transaction rolled back, so no row moved — and the receipt says so
    // rather than leaving the last success standing as if this never happened
    await db
      .update(s.appTableSources)
      .set({
        lastImportAt: sql`now()`,
        lastImportOutcome: `The import of ${version} stopped unexpectedly. Nothing was imported, and the previous rows stand.`,
        lastImportSucceeded: false,
      })
      .where(and(eq(s.appTableSources.id, source.id), isNull(s.appTableSources.detachedAt)));
  }
}

/**
 * **The version-landing hook** — a new version of a document has landed (the
 * replace-file act; a promotion into the library), so every table still
 * attached to it re-derives. Never throws: the version landed whatever the
 * import makes of it, and each source's receipt carries the outcome.
 */
export async function importOnVersionLanding(
  db: Db,
  document: { sandboxDocumentId: string } | { containerId: string },
): Promise<void> {
  const pointer =
    'sandboxDocumentId' in document
      ? eq(s.appTableSources.sandboxDocumentId, document.sandboxDocumentId)
      : eq(s.appTableSources.containerId, document.containerId);
  const sources = await db
    .select({ id: s.appTableSources.id })
    .from(s.appTableSources)
    .where(and(pointer, isNull(s.appTableSources.detachedAt)));
  for (const source of sources) {
    try {
      await importSourceAct(db, source.id);
    } catch {
      // importSourceAct records its own failures; a throw here is the receipt
      // write itself failing, and the version that landed must not be undone
    }
  }
}

/**
 * Attach a source, or change an attached one's region and mapping — and run
 * the first import in the same act. Gated by the route on `canBuildApp`; THIS
 * act gates on the document: the builder must be able to open it now
 * (decision 4), and the region must be in its current file.
 */
export async function attachSourceAct(
  db: Db,
  input: {
    slice: EntitledSlice;
    table: typeof s.appTables.$inferSelect;
    body: AttachTableSourceBody;
  },
): Promise<{ ok: true } | { ok: false; status: 400 | 404; detail?: string }> {
  const { slice, table, body } = input;
  const pointer: SourceDocumentRef =
    body.sandboxDocumentId !== undefined
      ? { sandboxDocumentId: body.sandboxDocumentId }
      : { containerId: body.containerId! };
  // a document this builder cannot open is answered exactly as one that does
  // not exist — its existence is not theirs to learn
  if ((await documentReadable(db, slice, pointer)) === null) return { ok: false, status: 404 };
  // T-489 — published columns only (see `derive`)
  const [owner] = await db.select({ publishedAt: s.apps.publishedAt }).from(s.apps).where(eq(s.apps.id, table.appId)).limit(1);
  const columns = publishedColumnsOf(table.columns as AppColumn[], owner?.publishedAt?.toISOString() ?? null);
  const problem = mappingProblem(body.mapping, body.headerRow, columns);
  if (problem !== null) return { ok: false, status: 400, detail: `${problem}.` };
  const file = await currentFile(db, pointer);
  if (!file.ok) return { ok: false, status: 400, detail: file.reason };
  const sheets = readXlsxCells(file.bytes);
  const sheet = sheets?.find((candidate) => candidate.name === body.sheet);
  if (!sheet) return { ok: false, status: 400, detail: `The sheet “${body.sheet}” is not in the file.` };
  const found = refindRegion(
    sheet.rows,
    body.mapping.map((entry) => entry.header),
  );
  if (!found.ok) return { ok: false, status: 400, detail: found.reason };

  const config = {
    sandboxDocumentId: pointer.sandboxDocumentId ?? null,
    containerId: pointer.containerId ?? null,
    sheet: body.sheet,
    headerRow: body.headerRow,
    mapping: body.mapping,
    configuredByParticipantId: slice.participantId,
    configuredAt: sql`now()`,
    detachedAt: null,
  };
  const [existing] = await db
    .select()
    .from(s.appTableSources)
    .where(eq(s.appTableSources.appTableId, table.id))
    .limit(1);
  let sourceId: string;
  if (existing) {
    const samePointer =
      existing.sandboxDocumentId === config.sandboxDocumentId && existing.containerId === config.containerId;
    await db
      .update(s.appTableSources)
      .set({
        ...config,
        // the version it reflects belongs to the document it reflected; a new
        // document reflects nothing until its first import lands
        ...(!samePointer && { lastImportVersion: null }),
      })
      .where(eq(s.appTableSources.id, existing.id));
    sourceId = existing.id;
  } else {
    const [created] = await db
      .insert(s.appTableSources)
      .values({ appTableId: table.id, ...config })
      .returning({ id: s.appTableSources.id });
    sourceId = created!.id;
  }
  await importSourceAct(db, sourceId);
  return { ok: true };
}

/**
 * Detach — imports stop, and NOTHING IS DELETED (the drawing's own words). The
 * rows already imported keep their ordinary lives: the last import's list is
 * cleared, so a later re-attach does not supersede rows that were released.
 */
export async function detachSourceAct(db: Db, sourceId: string, participantId: string): Promise<void> {
  await db
    .update(s.appTableSources)
    .set({
      detachedAt: sql`now()`,
      configuredByParticipantId: participantId,
      configuredAt: sql`now()`,
      lastImportRowIds: sql`'{}'::uuid[]`,
    })
    .where(and(eq(s.appTableSources.id, sourceId), isNull(s.appTableSources.detachedAt)));
}

// ── Reading a source back ────────────────────────────────────────────────────

async function recordOf(db: Db, source: StoredSource, slice: EntitledSlice): Promise<AppTableSourceRecord> {
  const pointer = pointerOf(source);
  const readable = await documentReadable(db, slice, pointer);
  const [configurer] = await db
    .select({ name: s.users.name })
    .from(s.participants)
    .innerJoin(s.users, eq(s.users.id, s.participants.userId))
    .where(eq(s.participants.id, source.configuredByParticipantId))
    .limit(1);
  return {
    id: source.id,
    appTableId: source.appTableId,
    document: {
      kind: pointer.sandboxDocumentId !== undefined ? 'sandbox' : 'library',
      id: (pointer.sandboxDocumentId ?? pointer.containerId)!,
      title: readable?.title ?? null,
      currentVersion: readable?.version ?? null,
    },
    sheet: source.sheet,
    headerRow: source.headerRow as string[],
    mapping: source.mapping as SourceMappingEntry[],
    configuredByName: configurer?.name ?? 'Unknown',
    configuredAt: source.configuredAt.toISOString(),
    reflectsVersion: source.lastImportVersion,
    lastImport:
      source.lastImportAt !== null && source.lastImportOutcome !== null && source.lastImportSucceeded !== null
        ? {
            at: source.lastImportAt.toISOString(),
            succeeded: source.lastImportSucceeded,
            outcome: source.lastImportOutcome,
          }
        : null,
    detachedAt: source.detachedAt?.toISOString() ?? null,
    mayReconfigure: readable !== null && source.detachedAt === null,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** (requester, app) → the app and slice, ONLY for someone who may build it.
 * Everyone else gets the same 404 as an app that does not exist: a source's
 * configuration is the working copy's standing, not the published app's. */
async function reachAsBuilder(
  db: Db,
  user: UserRow,
  appId: string,
): Promise<{ app: LoadedApp; slice: EntitledSlice } | null> {
  const app = await loadApp(db, appId);
  if (!app) return null;
  const slice = await resolveSlice(db, user, app.row.projectId);
  if (!slice) return null;
  if (!canBuildApp(slice, user.mayBuildApps, buildFacts(app, slice))) return null;
  return { app, slice };
}

async function reachTableAsBuilder(db: Db, user: UserRow, appTableId: string) {
  if (!isUuid(appTableId)) return null;
  const [table] = await db.select().from(s.appTables).where(eq(s.appTables.id, appTableId)).limit(1);
  if (!table) return null;
  const reached = await reachAsBuilder(db, user, table.appId);
  return reached ? { ...reached, table } : null;
}

async function sourceOf(db: Db, appTableId: string): Promise<StoredSource | null> {
  const [source] = await db
    .select()
    .from(s.appTableSources)
    .where(eq(s.appTableSources.appTableId, appTableId))
    .limit(1);
  return source ?? null;
}

export function appTableSourceRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  /** The spreadsheets this builder could point a table at: exactly the ones
   * they can open — their own organisation's uploaded workbooks in sandboxes
   * they are in, and library records they can read whose current revision is
   * a workbook. */
  app.get('/apps/:appId/source-documents', async (c) => {
    const reached = await reachAsBuilder(deps.db, c.get('user'), c.req.param('appId'));
    if (!reached) return notFound(c);
    const { slice } = reached;
    const items: SourceDocumentOption[] = [];
    const docs = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(
        and(
          eq(s.sandboxDocuments.projectId, slice.projectId),
          eq(s.sandboxDocuments.organisationId, slice.organisationId),
          eq(s.sandboxDocuments.origin, 'uploaded'),
          eq(s.sandboxDocuments.format, 'xlsx'),
          isNull(s.sandboxDocuments.deletedAt),
        ),
      )
      .orderBy(asc(s.sandboxDocuments.title));
    const open = new Map<string, boolean>();
    for (const doc of docs) {
      if (!open.has(doc.sandboxId)) open.set(doc.sandboxId, await sandboxOpen(deps.db, slice, doc.sandboxId));
      if (!open.get(doc.sandboxId)) continue;
      const readable = await documentReadable(deps.db, slice, { sandboxDocumentId: doc.id });
      if (readable) items.push({ kind: 'sandbox', id: doc.id, title: readable.title, version: readable.version });
    }
    const records = await deps.db
      .select({ id: s.containers.id })
      .from(s.containers)
      .innerJoin(s.versions, and(eq(s.versions.containerId, s.containers.id), eq(s.versions.isCurrent, true)))
      .innerJoin(s.renditions, and(eq(s.renditions.versionId, s.versions.id), eq(s.renditions.kind, 'native')))
      .where(
        and(
          eq(s.containers.projectId, slice.projectId),
          eq(s.containers.scope, 'library'),
          eq(s.containers.inLibrary, true),
          eq(s.containers.state, 'live'),
          eq(s.renditions.format, 'xlsx'),
          deliverableVisibleSql(slice),
        ),
      )
      .orderBy(asc(s.containers.documentReference));
    for (const record of records) {
      const readable = await documentReadable(deps.db, slice, { containerId: record.id });
      if (readable) items.push({ kind: 'library', id: record.id, title: readable.title, version: readable.version });
    }
    return c.json({ items } satisfies ListSourceDocumentsResponse);
  });

  /** The table-shaped regions in one spreadsheet's CURRENT file. */
  app.get('/apps/:appId/source-documents/regions', async (c) => {
    const reached = await reachAsBuilder(deps.db, c.get('user'), c.req.param('appId'));
    if (!reached) return notFound(c);
    const pointer = sourceDocumentRef.safeParse({
      sandboxDocumentId: c.req.query('sandboxDocumentId'),
      containerId: c.req.query('containerId'),
    });
    if (!pointer.success) return invalid(c);
    if ((await documentReadable(deps.db, reached.slice, pointer.data)) === null) return notFound(c);
    const file = await currentFile(deps.db, pointer.data);
    if (!file.ok) return invalid(c, file.reason);
    const sheets = readXlsxCells(file.bytes);
    if (sheets === null) return invalid(c, `${file.version} is not a workbook Infora can read.`);
    return c.json({ regions: findRegions(sheets) } satisfies ListSourceRegionsResponse);
  });

  app.get('/app-tables/:appTableId/source', async (c) => {
    const reached = await reachTableAsBuilder(deps.db, c.get('user'), c.req.param('appTableId'));
    if (!reached) return notFound(c);
    const source = await sourceOf(deps.db, reached.table.id);
    return c.json({
      source: source === null ? null : await recordOf(deps.db, source, reached.slice),
    } satisfies AppTableSourceResponse);
  });

  app.post('/app-tables/:appTableId/source', async (c) => {
    const reached = await reachTableAsBuilder(deps.db, c.get('user'), c.req.param('appTableId'));
    if (!reached) return notFound(c);
    // an insight table is written by a run, never fed from a file; a retired
    // table takes nothing new
    if (reached.table.retiredAt !== null || reached.table.kind === 'insight') return notFound(c);
    const parsed = attachTableSourceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const existing = await sourceOf(deps.db, reached.table.id);
    // decision 4: a builder who can no longer open the document stops being
    // able to RE-configure it — enforced in the act, which checks the
    // document named in this body, and a body naming the same document they
    // can no longer read is refused there with the same 404
    const attached = await attachSourceAct(deps.db, { slice: reached.slice, table: reached.table, body: parsed.data });
    if (!attached.ok) return attached.status === 404 ? notFound(c) : invalid(c, attached.detail);
    const source = await sourceOf(deps.db, reached.table.id);
    return c.json(
      { source: await recordOf(deps.db, source!, reached.slice) } satisfies AppTableSourceResponse,
      existing === null ? 201 : 200,
    );
  });

  /** Refresh from the file now — the manual path beside the automatic one.
   * It re-derives from the uploader's own version of their own file, so it
   * does not need the builder to be able to open the document (decision 4). */
  app.post('/app-tables/:appTableId/source/refresh', async (c) => {
    const reached = await reachTableAsBuilder(deps.db, c.get('user'), c.req.param('appTableId'));
    if (!reached) return notFound(c);
    const source = await sourceOf(deps.db, reached.table.id);
    if (source === null || source.detachedAt !== null) return notFound(c);
    await importSourceAct(deps.db, source.id);
    const fresh = await sourceOf(deps.db, reached.table.id);
    return c.json({ source: await recordOf(deps.db, fresh!, reached.slice) } satisfies AppTableSourceResponse);
  });

  app.post('/app-tables/:appTableId/source/detachment', async (c) => {
    const reached = await reachTableAsBuilder(deps.db, c.get('user'), c.req.param('appTableId'));
    if (!reached) return notFound(c);
    const source = await sourceOf(deps.db, reached.table.id);
    if (source === null || source.detachedAt !== null) return notFound(c);
    await detachSourceAct(deps.db, source.id, reached.slice.participantId);
    const fresh = await sourceOf(deps.db, reached.table.id);
    return c.json({ source: await recordOf(deps.db, fresh!, reached.slice) } satisfies AppTableSourceResponse);
  });

  return app;
}
