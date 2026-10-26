// T-441 — app table rows, and the acceptance flow (ADR-0056 §2, §2a).
//
// *In plain terms: people type rows into an app's tables; every row remembers
// which organisation and which person entered it; and where the app's builder
// said the table holds contractual data, a row goes draft → submitted →
// accepted or rejected, with a correction arriving as a new row.*
//
// 🔒 **ACCEPTANCE IS THE MOMENT A ROW CHANGES HANDS.** Until then it is the
// submitting organisation's own material; on acceptance it becomes the project
// owner's record and is never edited or deleted in place — enforced by a
// trigger in migration 0067, not by the checks below, because a route can be
// bypassed by the next route somebody writes and this one cannot be.
//
// 🔒 **A DRAFT IS READ BY ITS ENTERING ORGANISATION ALONE** (the 2026-09-06
// addendum, ruling 3). Not by the project owner, not by an organisation the
// table has been shared with. The owner's dashboard says "no return yet" for
// that month, which is the honest state; a client watching a contractor type is
// not. The rule is in `canReadAppRow` and is applied to every row on every read.
//
// 🔒 **A REJECTION CARRIES A REASON.** The route requires one and so does the
// database (`app_rows_rejection_reason_iff_rejected`). A rejection with no
// reason becomes a phone call, which is the record failing.
//
// **What `mayEdit` and its four siblings are for.** They are the server's
// answer to "what may THIS person do to THIS row", returned on the row itself.
// A surface that worked them out would be a second copy of the access rule, and
// the first disagreement between the copies is a button offered to somebody the
// API then refuses.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { decideAppRowBody, editAppRowBody, enterAppRowBody } from '@infora/contracts';
import type {
  ApiError,
  AppColumn,
  AppRowRecord,
  AppRowResponse,
  AppRowState,
  AppTableRecord,
  ListAppRowsResponse,
} from '@infora/contracts';
import { canReadAppRow, withinAppScope } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { loadApp, tableRecords, liveShareOrganisationIds } from './apps';
import type { LoadedApp } from './apps';
import { resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';
import { canOpenApp } from '@infora/governance';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail?: string) =>
  c.json({ error: 'invalid', ...(detail !== undefined && { detail }) } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/**
 * The values a row may carry, checked against the table's own declared columns.
 *
 * Deliberately strict about UNDECLARED keys: an app's screen is generated code
 * (T-442), and a row quietly carrying fields nobody declared is how a table
 * stops being the thing its definition says it is. The check is shape only —
 * it is not, and must never become, an access decision.
 *
 * Exported for T-451: an IMPORTED row meets exactly this check, because an
 * imported row is an ordinary row with an ordinary life (ADR-0059 decision 3).
 */
export function checkValues(columns: AppColumn[], values: Record<string, unknown>): string | null {
  const declared = new Map(columns.map((column) => [column.key, column]));
  for (const key of Object.keys(values)) {
    if (!declared.has(key)) return `the column “${key}” is not declared on this table`;
  }
  for (const column of columns) {
    const value = values[column.key];
    if (value === undefined || value === null || value === '') {
      if (column.required) return `“${column.label}” is required`;
      continue;
    }
    if (column.type === 'number' && typeof value !== 'number') {
      return `“${column.label}” has to be a number`;
    }
    if (column.type === 'boolean' && typeof value !== 'boolean') {
      return `“${column.label}” has to be yes or no`;
    }
    if (
      column.type === 'choice' &&
      Array.isArray(column.choices) &&
      !column.choices.includes(String(value))
    ) {
      return `“${column.label}” has to be one of ${column.choices.join(', ')}`;
    }
  }
  return null;
}

type StoredRow = typeof s.appRows.$inferSelect;

/** Everything needed to judge and render one table's rows, loaded once. */
export type TableContext = {
  table: typeof s.appTables.$inferSelect;
  app: LoadedApp;
  slice: EntitledSlice;
  withinScope: boolean;
  sharedWithOrganisationIds: string[];
  /** organisations holding a live membership on the project — the §7 fact
   * (review, 2026-09-07): a departed firm's unaccepted rows go dark */
  liveMemberOrganisationIds: string[];
};

/** Exported for T-444: an export reads through the SAME resolution the rows
 * screen does. A second way to reach a table would be a second place the read
 * predicate could be got wrong — which is the one thing ADR-0056's research
 * says every app-builder incident had in common. */
export async function reachTable(
  db: Db,
  user: UserRow,
  appTableId: string,
): Promise<TableContext | null> {
  if (!isUuid(appTableId)) return null;
  const [table] = await db
    .select()
    .from(s.appTables)
    .where(eq(s.appTables.id, appTableId))
    .limit(1);
  if (!table) return null;
  const app = await loadApp(db, table.appId);
  if (!app) return null;
  const slice = await resolveSlice(db, user, app.row.projectId);
  if (!slice) return null;
  const withinScope = withinAppScope(slice, app.grants);
  const facts = {
    ownerOrganisationId: app.ownerOrganisationId,
    ownerIsLive: app.ownerIsLive,
    closed: app.row.closedAt !== null,
    published: app.row.publishedDefinition !== null,
    withinScope,
  };
  if (!canOpenApp(slice, user.mayBuildApps, facts)) return null;
  const memberships = await db
    .select({ organisationId: s.memberships.organisationId })
    .from(s.memberships)
    .where(eq(s.memberships.projectId, app.row.projectId));
  return {
    table,
    app,
    slice,
    withinScope,
    sharedWithOrganisationIds: await liveShareOrganisationIds(db, appTableId),
    liveMemberOrganisationIds: memberships.map((m) => m.organisationId),
  };
}

async function reachRow(
  db: Db,
  user: UserRow,
  appRowId: string,
): Promise<{ row: StoredRow; context: TableContext } | null> {
  if (!isUuid(appRowId)) return null;
  const [row] = await db.select().from(s.appRows).where(eq(s.appRows.id, appRowId)).limit(1);
  if (!row) return null;
  const context = await reachTable(db, user, row.appTableId);
  if (!context) return null;
  if (!visible(row, context)) return null;
  return { row, context };
}

function visible(row: StoredRow, context: TableContext): boolean {
  return canReadAppRow(context.slice, {
    projectOwnerOrganisationId: context.app.projectOwnerOrganisationId,
    enteringOrganisationId: row.organisationId,
    state: row.state,
    sharedWithOrganisationIds: context.sharedWithOrganisationIds,
    enteringOrganisationLive: context.liveMemberOrganisationIds.includes(row.organisationId),
    withinScope: context.withinScope,
  });
}

/** Names for the stamps, resolved in one pass rather than per row. */
async function namesFor(db: Db, rows: StoredRow[]) {
  const organisationIds = [...new Set(rows.map((r) => r.organisationId))];
  const participantIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.enteredByParticipantId, r.decidedByParticipantId].filter((id): id is string => id !== null),
      ),
    ),
  ];
  const organisations =
    organisationIds.length === 0
      ? []
      : await db
          .select({ id: s.organisations.id, name: s.organisations.name })
          .from(s.organisations)
          .where(inArray(s.organisations.id, organisationIds));
  const people =
    participantIds.length === 0
      ? []
      : await db
          .select({ id: s.participants.id, name: s.users.name })
          .from(s.participants)
          .innerJoin(s.users, eq(s.participants.userId, s.users.id))
          .where(inArray(s.participants.id, participantIds));
  return {
    organisation: new Map(organisations.map((o) => [o.id, o.name])),
    person: new Map(people.map((p) => [p.id, p.name])),
  };
}

/** The states a row may still be edited from. A `submitted` row is FROZEN
 * until the decision lands (owner-ruled 2026-09-07, ADR-0056's second
 * addendum ruling 1 — reversing T-441's stated deviation 2): what was put in
 * front of the client is what the client decides on, and a correction is the
 * door after the decision. */
const EDITABLE: Array<AppRowState | null> = [null, 'draft'];

function dtoOf(
  row: StoredRow,
  context: TableContext,
  names: { organisation: Map<string, string>; person: Map<string, string> },
  supersededBy: Map<string, string>,
): AppRowRecord {
  const mine = context.slice.organisationId === row.organisationId;
  const isProjectOwner = context.slice.organisationId === context.app.projectOwnerOrganisationId;
  const live = row.retiredAt === null && context.app.row.closedAt === null;
  const superseded = supersededBy.get(row.id) ?? null;
  return {
    id: row.id,
    appTableId: row.appTableId,
    values: row.values as Record<string, unknown>,
    organisationId: row.organisationId,
    organisationName: names.organisation.get(row.organisationId) ?? 'Unknown',
    enteredByName: names.person.get(row.enteredByParticipantId) ?? 'Unknown',
    enteredAt: row.enteredAt.toISOString(),
    state: row.state,
    decidedByName:
      row.decidedByParticipantId === null ? null : (names.person.get(row.decidedByParticipantId) ?? null),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    supersedesRowId: row.supersedesRowId,
    supersededByRowId: superseded,
    previousVersionId: row.previousVersionId,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    // the entering organisation edits its own row while it is a draft; from
    // submission the row is frozen until the decision (owner-ruled 2026-09-07)
    // and the prior version of any edit is kept as a row of its own
    mayEdit: mine && live && EDITABLE.includes(row.state),
    maySubmit: mine && live && row.state === 'draft',
    // the acceptance act is the project owner's, on a submitted row only
    mayDecide: isProjectOwner && live && row.state === 'submitted',
    // a correction is a new row; it is offered once a decision has landed
    mayCorrect: mine && live && (row.state === 'accepted' || row.state === 'rejected') && superseded === null,
    // an accepted row is the owner's record and is never retired (ADR-0050 §6:
    // whose material it is decides, and acceptance is where that changes); a
    // submitted one is frozen with the same 2026-09-07 ruling as mayEdit
    mayRetire: mine && live && row.state !== 'accepted' && row.state !== 'submitted',
  };
}

/**
 * Which row replaced which, as THIS requester may know it — `replaced row id →
 * correcting row id`.
 *
 * 🔒 **T-487 (wall fix, found by the 2026-10-25 recheck): the successor is set
 * only from correcting rows this requester may READ.** It used to be computed
 * over every row of the table, so the project owner was handed the id of a
 * contractor's DRAFT correction — a row the first addendum's ruling 3 says it
 * may not read — and so learned that a correction had been started. A draft is
 * its entering organisation's alone, and the fact that one exists is part of it.
 * The owner now sees the original as it stood until the correction is
 * submitted, exactly as it sees "no return yet" for a month nobody has
 * submitted.
 *
 * The entering organisation reads its own drafts, so it still sees its own
 * correction — which is what keeps `mayCorrect` refusing a SECOND correction of
 * the same row by the same organisation.
 */
function successorsFor(all: StoredRow[], context: TableContext): Map<string, string> {
  const supersededBy = new Map<string, string>();
  for (const row of all) {
    if (row.supersedesRowId !== null && visible(row, context)) supersededBy.set(row.supersedesRowId, row.id);
  }
  return supersededBy;
}

/** Rows this requester may read, newest first, with the archived prior
 * versions left out — a prior version is history of the row above it, not a
 * second row somebody entered. */
export async function listRows(db: Db, context: TableContext): Promise<AppRowRecord[]> {
  const all = await db
    .select()
    .from(s.appRows)
    .where(eq(s.appRows.appTableId, context.table.id))
    .orderBy(asc(s.appRows.enteredAt));
  const archived = new Set(
    all.flatMap((row) => (row.previousVersionId === null ? [] : [row.previousVersionId])),
  );
  const supersededBy = successorsFor(all, context);
  const readable = all.filter((row) => !archived.has(row.id) && visible(row, context));
  const names = await namesFor(db, readable);
  return readable.map((row) => dtoOf(row, context, names, supersededBy));
}

async function oneRow(db: Db, rowId: string, context: TableContext): Promise<AppRowResponse> {
  const [row] = await db.select().from(s.appRows).where(eq(s.appRows.id, rowId)).limit(1);
  const all = await db.select().from(s.appRows).where(eq(s.appRows.appTableId, context.table.id));
  const supersededBy = successorsFor(all, context);
  const names = await namesFor(db, [row!]);
  return { row: dtoOf(row!, context, names, supersededBy) };
}

export function appRowRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  app.get('/app-tables/:appTableId/rows', async (c) => {
    const context = await reachTable(deps.db, c.get('user'), c.req.param('appTableId'));
    if (!context) return notFound(c);
    const [table] = (
      await tableRecords(
        deps.db,
        context.table.appId,
        context.slice,
        context.app.projectOwnerOrganisationId,
      )
    ).filter((t) => t.id === context.table.id);
    return c.json({
      table: table as AppTableRecord,
      items: await listRows(deps.db, context),
    } satisfies ListAppRowsResponse);
  });

  // Enter a row. On a table with an acceptance step it starts as a DRAFT,
  // which its own organisation alone can read; `submit: true` is the form's
  // Submit button, which is one act rather than two round trips.
  app.post('/app-tables/:appTableId/rows', async (c) => {
    const context = await reachTable(deps.db, c.get('user'), c.req.param('appTableId'));
    if (!context) return notFound(c);
    if (context.app.row.closedAt !== null || context.table.retiredAt !== null) {
      return invalid(c, 'this app is closed');
    }
    const parsed = enterAppRowBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const problem = checkValues(context.table.columns as AppColumn[], parsed.data.values);
    if (problem !== null) return invalid(c, problem);
    const state = context.table.hasAcceptance
      ? parsed.data.submit
        ? 'submitted'
        : 'draft'
      : null;
    const [created] = await deps.db
      .insert(s.appRows)
      .values({
        appTableId: context.table.id,
        values: parsed.data.values,
        // the stamp is taken from the resolved slice and NEVER from the body:
        // a caller that could name the organisation on a row could put its
        // figures behind somebody else's wall
        organisationId: context.slice.organisationId,
        enteredByParticipantId: context.slice.participantId,
        state,
      })
      .returning();
    return c.json(await oneRow(deps.db, created!.id, context), 201);
  });

  // Edit before a decision. The prior version is kept as a row of its own, so
  // an insight computed last March still explains itself (ADR-0056 §2).
  app.patch('/app-rows/:appRowId', async (c) => {
    const reached = await reachRow(deps.db, c.get('user'), c.req.param('appRowId'));
    if (!reached) return notFound(c);
    const { row, context } = reached;
    const names = await namesFor(deps.db, [row]);
    if (!dtoOf(row, context, names, new Map()).mayEdit) return notFound(c);
    const parsed = editAppRowBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const problem = checkValues(context.table.columns as AppColumn[], parsed.data.values);
    if (problem !== null) return invalid(c, problem);
    const [archived] = await deps.db
      .insert(s.appRows)
      .values({
        appTableId: row.appTableId,
        values: row.values,
        organisationId: row.organisationId,
        enteredByParticipantId: row.enteredByParticipantId,
        enteredAt: row.enteredAt,
        state: row.state,
        previousVersionId: row.previousVersionId,
      })
      .returning();
    await deps.db
      .update(s.appRows)
      .set({ values: parsed.data.values, previousVersionId: archived!.id })
      .where(eq(s.appRows.id, row.id));
    return c.json(await oneRow(deps.db, row.id, context));
  });

  app.post('/app-rows/:appRowId/submission', async (c) => {
    const reached = await reachRow(deps.db, c.get('user'), c.req.param('appRowId'));
    if (!reached) return notFound(c);
    const { row, context } = reached;
    const names = await namesFor(deps.db, [row]);
    if (!dtoOf(row, context, names, new Map()).maySubmit) return notFound(c);
    await deps.db.update(s.appRows).set({ state: 'submitted' }).where(eq(s.appRows.id, row.id));
    return c.json(await oneRow(deps.db, row.id, context));
  });

  /**
   * Accept or reject — the project owner's act, on a submitted row.
   *
   * **Acceptance is when the row becomes the owner's record**: after it, the
   * database itself refuses an edit, a retire or a delete. **A rejection
   * carries a required reason**, checked here and checked again by the
   * `app_rows_rejection_reason_iff_rejected` constraint, and read by the
   * submitting organisation on the row.
   */
  app.post('/app-rows/:appRowId/decision', async (c) => {
    const reached = await reachRow(deps.db, c.get('user'), c.req.param('appRowId'));
    if (!reached) return notFound(c);
    const { row, context } = reached;
    const names = await namesFor(deps.db, [row]);
    if (!dtoOf(row, context, names, new Map()).mayDecide) return notFound(c);
    const raw = (await c.req.json().catch(() => null)) as { decision?: unknown } | null;
    const parsed = decideAppRowBody.safeParse(raw);
    if (!parsed.success) {
      // (review 2026-09-07) the worded detail belongs to the one failure it
      // describes — a rejection missing its reason — not to every bad body
      return raw?.decision === 'reject' ? invalid(c, 'a rejection has to say why') : invalid(c);
    }
    await deps.db
      .update(s.appRows)
      .set({
        state: parsed.data.decision === 'accept' ? 'accepted' : 'rejected',
        decidedByParticipantId: context.slice.participantId,
        decidedAt: sql`now()`,
        rejectionReason: parsed.data.decision === 'reject' ? parsed.data.reason : null,
      })
      .where(eq(s.appRows.id, row.id));
    return c.json(await oneRow(deps.db, row.id, context));
  });

  /**
   * A correction is a NEW row (ADR-0056 §2a), never an edit.
   *
   * ⚠ **An ACCEPTED row flips to `superseded`; a REJECTED one does not**, and
   * that asymmetry is deliberate rather than an oversight. `rejection_reason`
   * is non-null **iff** the state is `rejected` (drawer 9's own CHECK, from
   * ruling 4), so flipping a rejected row would force its reason to be erased —
   * the record failing in exactly the way the ruling exists to prevent. The
   * supersession is read off the correcting row instead, which is how the
   * approved mockup draws it: *"Rejected · replaced"* (the word is "replaced"
   * since T-487; `isCurrentAppRow` in contracts is what makes such a row stop
   * counting once its correction exists).
   */
  app.post('/app-rows/:appRowId/correction', async (c) => {
    const reached = await reachRow(deps.db, c.get('user'), c.req.param('appRowId'));
    if (!reached) return notFound(c);
    const { row, context } = reached;
    // only corrections THIS requester may read count (see `successorsFor`); the
    // entering organisation reads its own drafts, so a second correction by it
    // is still refused
    const others = await deps.db.select().from(s.appRows).where(eq(s.appRows.appTableId, row.appTableId));
    const supersededBy = successorsFor(others, context);
    const names = await namesFor(deps.db, [row]);
    if (!dtoOf(row, context, names, supersededBy).mayCorrect) return notFound(c);
    const parsed = enterAppRowBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const problem = checkValues(context.table.columns as AppColumn[], parsed.data.values);
    if (problem !== null) return invalid(c, problem);
    const [created] = await deps.db
      .insert(s.appRows)
      .values({
        appTableId: row.appTableId,
        values: parsed.data.values,
        organisationId: context.slice.organisationId,
        enteredByParticipantId: context.slice.participantId,
        state: parsed.data.submit ? 'submitted' : 'draft',
        supersedesRowId: row.id,
      })
      .returning();
    if (row.state === 'accepted') {
      await deps.db.update(s.appRows).set({ state: 'superseded' }).where(eq(s.appRows.id, row.id));
    }
    return c.json(await oneRow(deps.db, created!.id, context), 201);
  });

  // The organisation's own deletion of an unaccepted row (ADR-0050 §6) is a
  // RETIRE, so a past insight's `rows_covered` still resolves; erasure at exit
  // removes. An accepted row is the owner's record and is refused here and by
  // the trigger.
  app.post('/app-rows/:appRowId/retirement', async (c) => {
    const reached = await reachRow(deps.db, c.get('user'), c.req.param('appRowId'));
    if (!reached) return notFound(c);
    const { row, context } = reached;
    const names = await namesFor(deps.db, [row]);
    if (!dtoOf(row, context, names, new Map()).mayRetire) return notFound(c);
    await deps.db
      .update(s.appRows)
      .set({ retiredAt: sql`now()`, retiredByParticipantId: context.slice.participantId })
      .where(and(eq(s.appRows.id, row.id), isNull(s.appRows.retiredAt)));
    return c.json(await oneRow(deps.db, row.id, context));
  });

  return app;
}
