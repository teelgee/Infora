// T-444 — **an export is a file, and its stamp is provenance, not authorship**
// (ADR-0056 §8).
//
// *In plain terms: a person downloads an app's data as a spreadsheet, or one
// insight as a Word file. It contains only what that person may see. It carries
// a short note of what data it came from and when — and nothing else. Nothing
// on it says an agent wrote it, because the app produced and a person issued;
// the file is theirs to edit and put through the normal review cycles.*
//
// 🔒 **THE ROWS COME FROM THE SAME READ THE ROWS SCREEN MAKES.** This file
// calls `reachTable` and `listRows` in `app-rows.ts`, which call `canReadAppRow`
// in `@infora/governance`. There is no query here, no filter here, and no
// second copy of who-may-see-this-row — which is what makes "an export by a
// contractor contains only its organisation's rows" a consequence rather than
// a promise.
//
// 🔒 **NO PRODUCER COLUMN, NO AGENT-DRAFTED MARKING.** ADR-0056 §8 and the
// ADR-0021 addendum's companion rule: the stamp records **what data generated
// the file and when — never the producer.** `app_exports` has no `produced_by`
// column by construction (drawer 9), and the stamp written into the file below
// carries the app, the tables and the moment, in that order, and stops. Who
// exported is recorded on the `app_exports` ROW, which is an audit record; the
// FILE says nothing about who made it, because a person who edits a spreadsheet
// and sends it to their client should not be handing over a claim about
// authorship they did not make.
//
// **What lands where.** ADR-0056 §13b: *"export lands wherever `file_ref`
// points on the day"* — which is `putBlob` on this substrate and S3 once
// deployed (ADR-0047 §3). The bytes go back in the same response, so a person
// gets their file in one act, and the stored blob is what the record points at.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { exportAppBody, isCurrentAppRow, rowStateLabel } from '@infora/contracts';
import type {
  ApiError,
  AppColumn,
  AppExportRecord,
  AppRowRecord,
  ListAppExportsResponse,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { reachApp } from './apps';
import { listRows, reachTable } from './app-rows';
import type { TableContext } from './app-rows';
import { putBlob, mimeTypes, textToDocx } from './renditions';
import { buildXlsx } from './xlsx';
import type { XlsxSheet } from './xlsx';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);

/** Excel caps a sheet name at 31 characters and forbids a handful of them.
 * T-488 — the name is the table's own; a number in brackets is added only when
 * two tables would otherwise share a name (compared the way Excel does, without
 * regard to case), so the sheet a person opens is called what the table is. */
function sheetName(name: string, taken: Set<string>): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = cleaned;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

function cell(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * **The provenance stamp — data and time, and nothing else.**
 *
 * Read this against ADR-0056 §8 before changing it. What may appear: what the
 * file was produced from (the app, the tables), and when the data was read.
 * What may NOT: who exported it, who entered a row, which agent ran, or any
 * marking that the content was drafted by one. A test asserts the exporter's
 * name and organisation appear nowhere in it.
 */
function provenanceRows(appName: string, tableNames: string[], dataAsOf: Date): (string | null)[][] {
  return [
    ['Produced from', appName],
    ['Tables', tableNames.join(', ')],
    ['Data as of', dataAsOf.toISOString()],
  ];
}

/** One table's sheet: the organisation that entered each row, the declared
 * columns, and — where the table has an acceptance step, or some row is no
 * longer current — the row's State and, for an acceptance table, the reason
 * for a rejection (T-488).
 *
 * **Deliberately no person's name.** A row's `entered_by` is registered
 * personal data with a deletion path through its organisation (personal-data
 * register, drawer 9's row); putting it into a downloadable file would make a
 * copy outside that path, which is a decision nobody has taken. The
 * organisation stamp stays, because it is what the wall keys on and what makes
 * the project owner's export readable at all. */
function sheetFor(
  name: string,
  taken: Set<string>,
  columns: AppColumn[],
  rows: AppRowRecord[],
  hasAcceptance: boolean,
): XlsxSheet {
  // T-488 — a State column says what became of each row, in the words the screen
  // uses ("Accepted", "Rejected", "Replaced", "Retired"): wherever the table has
  // an acceptance step, and wherever some row is no longer the current one (a
  // spreadsheet-fed table has no acceptance step but does have replaced rows).
  // The rejection reason is a column too: a rejected row without its reason is
  // the phone call the record exists to prevent. Both are what the screen shows
  // this same person, from the same rows — nothing wider.
  const withState = hasAcceptance || rows.some((row) => !isCurrentAppRow(row));
  const header = ['Organisation', ...columns.map((column) => column.label)];
  if (withState) header.push('State');
  if (hasAcceptance) header.push('Reason for rejection');
  return {
    name: sheetName(name, taken),
    rows: [
      header,
      ...rows.map((row) => {
        const line: (string | null)[] = [
          row.organisationName,
          ...columns.map((column) => cell(row.values[column.key])),
        ];
        if (withState) line.push(rowStateLabel(row));
        if (hasAcceptance) line.push(row.rejectionReason);
        return line;
      }),
    ],
  };
}

export function appExportRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  /**
   * Export. One act: the file is built from what this person may read, stored
   * where `file_ref` points, recorded in `app_exports`, and returned.
   *
   * There is no separate "download" route and no export id in a URL, on
   * purpose: an export is a snapshot of one person's read at one moment, and a
   * link to somebody else's snapshot would be a second door into rows the
   * predicate had already decided about.
   */
  app.post('/apps/:appId/exports', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    const parsed = exportAppBody.safeParse((await c.req.json().catch(() => null)) ?? {});
    if (!parsed.success) return invalid(c);
    const dataAsOf = new Date();

    if (parsed.data.format === 'docx') {
      // one insight, as Word. The row is reached through the ordinary row
      // resolution, so a row this person cannot read is a 404 exactly as it is
      // everywhere else.
      const [row] = await deps.db
        .select()
        .from(s.appRows)
        .where(eq(s.appRows.id, parsed.data.appRowId))
        .limit(1);
      if (!row) return notFound(c);
      const context = await reachTable(deps.db, user, row.appTableId);
      if (!context || context.app.row.id !== loaded.row.id) return notFound(c);
      const visible = (await listRows(deps.db, context)).find((r) => r.id === row.id);
      if (!visible) return notFound(c);
      const columns = context.table.columns as AppColumn[];
      const body = [
        loaded.row.name,
        context.table.name,
        '',
        ...columns.map((column) => `${column.label}: ${cell(visible.values[column.key]) ?? ''}`),
        '',
        // the stamp: what it came from, and when. Nothing about who.
        `Produced from ${loaded.row.name} — ${context.table.name}.`,
        `Data as of ${dataAsOf.toISOString()}.`,
      ].join('\n');
      const bytes = textToDocx(body);
      await recordExport(deps.db, {
        appId: loaded.row.id,
        participantId: slice.participantId,
        fileRef: putBlob(bytes, 'docx'),
        dataAsOf,
        tablesCovered: [context.table.id],
        rowsCovered: 1,
      });
      return c.body(new Uint8Array(bytes), 200, {
        'content-type': mimeTypes.docx,
        'content-disposition': `attachment; filename="${filename(loaded.row.name)}.docx"`,
      });
    }

    // the spreadsheet: every declared table this person can reach, or the ones
    // they named
    const declared = await deps.db
      .select({ id: s.appTables.id })
      .from(s.appTables)
      .where(eq(s.appTables.appId, loaded.row.id))
      .orderBy(s.appTables.name);
    const named = parsed.data.appTableIds;
    const wanted =
      named.length === 0
        ? declared.map((t) => t.id)
        : declared.filter((t) => named.includes(t.id)).map((t) => t.id);

    const sheets: XlsxSheet[] = [];
    // the closing sheet's name is spoken for, so a table of that name is numbered
    const takenSheetNames = new Set(['provenance']);
    const tablesCovered: string[] = [];
    const tableNames: string[] = [];
    let rowsCovered = 0;
    for (const appTableId of wanted) {
      const context: TableContext | null = await reachTable(deps.db, user, appTableId);
      if (!context) continue;
      const rows = await listRows(deps.db, context);
      const columns = context.table.columns as AppColumn[];
      sheets.push(sheetFor(context.table.name, takenSheetNames, columns, rows, context.table.hasAcceptance));
      tablesCovered.push(appTableId);
      tableNames.push(context.table.name);
      rowsCovered += rows.length;
    }
    // an app with no readable table still exports a file, and the file says so
    // by being a stamp with nothing under it — which is honest, where an error
    // would leave the person guessing whether they were refused or there is
    // nothing there
    sheets.push({ name: 'Provenance', rows: provenanceRows(loaded.row.name, tableNames, dataAsOf) });
    const bytes = buildXlsx(sheets);
    await recordExport(deps.db, {
      appId: loaded.row.id,
      participantId: slice.participantId,
      fileRef: putBlob(bytes, 'xlsx'),
      dataAsOf,
      tablesCovered,
      rowsCovered,
    });
    return c.body(new Uint8Array(bytes), 200, {
      'content-type': mimeTypes.xlsx,
      'content-disposition': `attachment; filename="${filename(loaded.row.name)}.xlsx"`,
    });
  });

  /**
   * The exports that have been taken.
   *
   * **Who sees which, on the row predicate's own shape**: your own
   * organisation's exports, and the project owner's organisation sees them all.
   * A rival firm learning that another firm exported twelve rows last Tuesday
   * learns something about the project it was never given — the same reasoning
   * that keeps a table's shares from a third organisation.
   */
  app.get('/apps/:appId/exports', async (c) => {
    const reached = await reachApp(deps.db, c.get('user'), c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    const rows = await deps.db
      .select({
        row: s.appExports,
        name: s.users.name,
        organisationId: s.users.organisationId,
        organisationName: s.organisations.name,
      })
      .from(s.appExports)
      .innerJoin(s.participants, eq(s.appExports.exportedByParticipantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .innerJoin(s.organisations, eq(s.users.organisationId, s.organisations.id))
      .where(eq(s.appExports.appId, loaded.row.id))
      .orderBy(desc(s.appExports.exportedAt));
    const isProjectOwner = slice.organisationId === loaded.projectOwnerOrganisationId;
    const items: AppExportRecord[] = rows
      .filter((row) => isProjectOwner || row.organisationId === slice.organisationId)
      .map(({ row, name, organisationName }) => ({
        id: row.id,
        appId: row.appId,
        exportedByName: name,
        exportedByOrganisationName: organisationName,
        exportedAt: row.exportedAt.toISOString(),
        dataAsOf: row.dataAsOf.toISOString(),
        tablesCovered: row.tablesCovered,
        rowsCovered: row.rowsCovered,
      }));
    return c.json({ items } satisfies ListAppExportsResponse);
  });

  return app;
}

/** The record — append-only, exactly as drawer 9 drew it: an export happened,
 * over this much data, as of this moment, by this person. */
async function recordExport(
  db: Db,
  input: {
    appId: string;
    participantId: string;
    fileRef: string;
    dataAsOf: Date;
    tablesCovered: string[];
    rowsCovered: number;
  },
): Promise<void> {
  await db.insert(s.appExports).values({
    appId: input.appId,
    exportedByParticipantId: input.participantId,
    fileRef: input.fileRef,
    dataAsOf: input.dataAsOf,
    tablesCovered: input.tablesCovered,
    rowsCovered: input.rowsCovered,
  });
}

/** A file name a person can find again, out of the app's own name. */
function filename(appName: string): string {
  const cleaned = appName.replace(/["\\/\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned === '' ? 'app-export' : cleaned.slice(0, 80);
}

export { provenanceRows, sheetFor, sheetName };
