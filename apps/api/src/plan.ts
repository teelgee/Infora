// T-118/T-119 — the deliverable plan (ADR-0008/0017/0033, contracts §4).
// Per-organisation plans on one substrate: a member reads and writes its own
// organisation's rows (the TIDP); the owner reads every organisation's (the
// MIDP consolidation) and confirms reviewers. A plan row IS a library-scope
// container; creating one also creates its document_production work item —
// status 'planned', event-driven from here on (ADR-0032 addendum).
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  createPlanRowBody,
  grantAppointmentBody,
  isCodeField,
  isColumnableField,
  patchContainerBody,
  setDocumentOwnerBody,
  setPlanTitleBody,
  shareDeliverableBody,
  updatePlanColumnsBody,
  withdrawContainerBody,
} from '@infora/contracts';
import type {
  ApiError,
  AppointmentGrant,
  DeliverableShare,
  GetPlanResponse,
  PlanImportError,
  PlanImportFailure,
  PlanImportResult,
  PlanRow,
  ReviewerGrant,
  UpdatePlanColumnsResponse,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { canEditPlan } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { isLiveAuthor, isLiveConfirmedReviewer } from './cycle';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';
import { refuseElevated } from './elevated';
import { composeReference, loadSchemeOrDefault, templateFields } from './naming';
import { parseXlsx } from './xlsx';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const conflict = (c: Context) => c.json({ error: 'conflict' } satisfies ApiError, 409);
const invalid = (c: Context, detail?: string) =>
  c.json({ error: 'invalid', ...(detail && { detail }) } satisfies ApiError, 400);
const forbidden = (c: Context, detail: string) =>
  c.json({ error: 'forbidden', detail } satisfies ApiError, 403);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

// Postgres 23505 anywhere in the error chain — drizzle wraps the driver error
function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e instanceof Error; e = e.cause as Error) {
    if ((e as { code?: string }).code === '23505') return true;
    if (e.message.includes('duplicate key value')) return true;
    if (!(e.cause instanceof Error)) break;
  }
  return false;
}

type ContainerRow = typeof s.containers.$inferSelect;

/** A plan-visible container for the requester: own-org rows for a member,
 * every row for the owner (contracts §4 — access-decided, no parameter). */
function planVisible(slice: EntitledSlice, container: ContainerRow): boolean {
  // a sandbox-scope (freeze-series) container is org-private machinery:
  // producer only, never the owner (ADR-0032) — its grants are the internal
  // cycle's own-org sides (T-125)
  if (container.scope === 'sandbox') {
    return container.producingOrganisationId === slice.organisationId;
  }
  return slice.membershipRole === 'owner' || container.producingOrganisationId === slice.organisationId;
}

async function loadContainer(db: Db, containerId: string): Promise<ContainerRow | null> {
  if (!isUuid(containerId)) return null;
  const [row] = await db.select().from(s.containers).where(eq(s.containers.id, containerId)).limit(1);
  return row ?? null;
}

/** T-362 (ADR-0033 addendum, 2026-08-09): row-scoped edit rights are the
 * producing organisation's super users PLUS that row's live lead author —
 * title, metadata, the authoring team, reviewer proposals. Excluded and still
 * elevated/super acts: withdraw, lead-author reassignment, the reference, the
 * document owner. An ordinary producing-org member holds nothing. */
async function canEditRowMetadata(
  db: Db,
  slice: EntitledSlice,
  container: ContainerRow,
): Promise<boolean> {
  if (container.producingOrganisationId !== slice.organisationId) return false;
  if (canEditPlan(slice)) return true;
  return (await isLiveAuthor(db, container.id, slice.participantId))?.isLead === true;
}

/** Assemble PlanRows for a set of containers (batched — no N+1). */
async function toPlanRows(db: Db, containers: ContainerRow[]): Promise<PlanRow[]> {
  if (containers.length === 0) return [];
  const ids = containers.map((c) => c.id);

  const orgs = await db
    .select({ id: s.organisations.id, name: s.organisations.name })
    .from(s.organisations);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  const workItems = await db
    .select()
    .from(s.workItems)
    .where(inArray(s.workItems.containerId, ids));
  const workItemByContainer = new Map(workItems.map((w) => [w.containerId!, w]));

  const versions = await db
    .select()
    .from(s.versions)
    .where(and(inArray(s.versions.containerId, ids), eq(s.versions.isCurrent, true)));
  const versionByContainer = new Map(versions.map((v) => [v.containerId, v]));

  // the latest round verdict per container — derived, never stored twice
  const verdicts = await db
    .select({
      containerId: s.reviewCycles.containerId,
      code: s.acceptanceCodes.code,
      description: s.acceptanceCodes.description,
      number: s.rounds.number,
    })
    .from(s.rounds)
    .innerJoin(s.reviewCycles, eq(s.rounds.cycleId, s.reviewCycles.id))
    .innerJoin(s.acceptanceCodes, eq(s.rounds.deliverableCodeId, s.acceptanceCodes.id))
    .where(inArray(s.reviewCycles.containerId, ids))
    .orderBy(desc(s.rounds.number));
  const verdictByContainer = new Map<string, { code: string; description: string }>();
  for (const v of verdicts) {
    if (!verdictByContainer.has(v.containerId)) {
      verdictByContainer.set(v.containerId, { code: v.code, description: v.description });
    }
  }

  // document-owner names (T-189) — a single participant per container, if set
  const ownerIds = containers
    .map((c) => c.documentOwnerParticipantId)
    .filter((x): x is string => x !== null);
  const ownerRows = ownerIds.length
    ? await db
        .select({ participantId: s.participants.id, name: s.users.name })
        .from(s.participants)
        .innerJoin(s.users, eq(s.participants.userId, s.users.id))
        .where(inArray(s.participants.id, ownerIds))
    : [];
  const ownerName = new Map(ownerRows.map((r) => [r.participantId, r.name]));

  const authorRows = await db
    .select({ grant: s.deliverableAuthors, name: s.users.name })
    .from(s.deliverableAuthors)
    .innerJoin(s.participants, eq(s.deliverableAuthors.participantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(inArray(s.deliverableAuthors.containerId, ids))
    .orderBy(asc(s.deliverableAuthors.grantedAt));
  const shareRows = await db
    .select({ share: s.deliverableShares, organisationName: s.organisations.name })
    .from(s.deliverableShares)
    .innerJoin(s.organisations, eq(s.deliverableShares.organisationId, s.organisations.id))
    .where(and(inArray(s.deliverableShares.containerId, ids), isNull(s.deliverableShares.revokedAt)));

  const reviewerRows = await db
    .select({ grant: s.deliverableReviewers, name: s.users.name })
    .from(s.deliverableReviewers)
    .innerJoin(s.participants, eq(s.deliverableReviewers.participantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(inArray(s.deliverableReviewers.containerId, ids))
    .orderBy(asc(s.deliverableReviewers.grantedAt));

  const toAuthor = (r: (typeof authorRows)[number]): AppointmentGrant => ({
    id: r.grant.id,
    containerId: r.grant.containerId,
    participantId: r.grant.participantId,
    name: r.name,
    isLead: r.grant.isLead,
    grantedAt: r.grant.grantedAt.toISOString(),
    revokedAt: r.grant.revokedAt?.toISOString() ?? null,
  });
  const toReviewer = (r: (typeof reviewerRows)[number]): ReviewerGrant => ({
    ...toAuthor(r as (typeof authorRows)[number]),
    confirmedAt:
      (r.grant as typeof s.deliverableReviewers.$inferSelect).confirmedAt?.toISOString() ?? null,
  });

  return containers.map((container) => {
    const workItem = workItemByContainer.get(container.id);
    const version = versionByContainer.get(container.id);
    return {
      containerId: container.id,
      documentReference: container.documentReference!, // library scope always carries one (ADR-0032)
      producingOrganisationId: container.producingOrganisationId,
      producingOrganisationName: orgName.get(container.producingOrganisationId) ?? '',
      metadata: (container.metadata ?? {}) as Record<string, unknown>,
      state: container.state,
      workItem: workItem
        ? { id: workItem.id, title: workItem.title, status: workItem.status }
        : null,
      currentVersion: version
        ? {
            versionId: version.id,
            versionReference: version.versionReference,
            createdAt: version.createdAt.toISOString(),
          }
        : null,
      deliverableCode: verdictByContainer.get(container.id) ?? null,
      documentOwner: container.documentOwnerParticipantId
        ? {
            participantId: container.documentOwnerParticipantId,
            name: ownerName.get(container.documentOwnerParticipantId) ?? '',
          }
        : null,
      withdrawnReason: container.withdrawnReason ?? null,
      authors: authorRows.filter((r) => r.grant.containerId === container.id).map(toAuthor),
      reviewers: reviewerRows.filter((r) => r.grant.containerId === container.id).map(toReviewer),
      sharedWith: shareRows
        .filter((r) => r.share.containerId === container.id)
        .map((r) => ({ organisationId: r.share.organisationId, organisationName: r.organisationName })),
    };
  });
}

export function planRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  app.get('/projects/:projectId/plan', project, async (c) => {
    const slice = c.get('slice');
    const where = [
      eq(s.containers.projectId, slice.projectId),
      eq(s.containers.scope, 'library' as const),
    ];
    if (slice.membershipRole !== 'owner') {
      where.push(eq(s.containers.producingOrganisationId, slice.organisationId));
    }
    const rows = await deps.db
      .select()
      .from(s.containers)
      .where(and(...where))
      .orderBy(asc(s.containers.documentReference));
    // the requester's organisation's column standard rides the plan read —
    // org-standard and locked (T-360), so it is the membership's, never the user's
    const [membership] = await deps.db
      .select({ planColumns: s.memberships.planColumns })
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.projectId, slice.projectId),
          eq(s.memberships.organisationId, slice.organisationId),
        ),
      )
      .limit(1);
    return c.json({
      items: await toPlanRows(deps.db, rows),
      planColumns: membership?.planColumns ?? null,
    } satisfies GetPlanResponse);
  });

  // T-360 (S3) — the org-standard plan columns: set by the organisation's super
  // user for that organisation on this project; every key must be a real,
  // non-role schema field. Null restores the default set.
  app.put('/projects/:projectId/plan/columns', project, async (c) => {
    const slice = c.get('slice');
    if (!canEditPlan(slice)) return forbidden(c, 'super_user_required');
    const body = updatePlanColumnsBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    // an empty selection means the default set — one representation, null
    const columns = body.data.columns && body.data.columns.length > 0 ? body.data.columns : null;
    if (columns) {
      const scheme = await loadSchemeOrDefault(deps.db, slice.projectId);
      const legal = new Set(scheme.fields.filter(isColumnableField).map((f) => f.key));
      if (columns.some((key) => !legal.has(key))) return invalid(c, 'unknown_column');
    }
    await deps.db
      .update(s.memberships)
      .set({ planColumns: columns })
      .where(
        and(
          eq(s.memberships.projectId, slice.projectId),
          eq(s.memberships.organisationId, slice.organisationId),
        ),
      );
    return c.json({ columns } satisfies UpdatePlanColumnsResponse);
  });

  // A producing-organisation act (ADR-0033): the planned container + its
  // work item, status 'planned' — the "not yet produced" MIDP row (ADR-0008).
  app.post('/projects/:projectId/plan', project, async (c) => {
    const slice = c.get('slice');
    // editing the TIDP is a super-user capability (T-176): a guest super-user
    // edits its own org's plan, the owner super-user any of its own rows
    if (!canEditPlan(slice)) return forbidden(c, 'super_user_required');
    const body = createPlanRowBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    try {
      const [container] = await deps.db
        .insert(s.containers)
        .values({
          projectId: slice.projectId,
          producingOrganisationId: slice.organisationId,
          documentReference: body.data.documentReference,
          metadata: body.data.metadata ?? {},
        })
        .returning();
      await deps.db.insert(s.workItems).values({
        projectId: slice.projectId,
        type: 'document_production',
        title: body.data.title,
        status: 'planned',
        containerId: container!.id,
      });
      const [row] = await toPlanRows(deps.db, [container!]);
      return c.json(row!, 201);
    } catch (error) {
      if (isUniqueViolation(error)) return conflict(c);
      throw error;
    }
  });

  // T-359 (S3) — batch-create from the T-358 template: create-only (adds rows,
  // never amends or deletes), references generated in file order by the naming
  // scheme, a reference-like column ignored, role columns dropped with a stated
  // notice (appointments are propose/confirm acts, ADR-0033), and a whole-file
  // verdict — one bad row refuses the lot, each failure naming its Excel row.
  // The file is transient: parsed here, persisted nowhere, no run record
  // (personal-data.md — its author/reviewer columns carry named people).
  app.post('/projects/:projectId/plan/import', project, async (c) => {
    const slice = c.get('slice');
    if (!canEditPlan(slice)) return forbidden(c, 'super_user_required');
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    if (!(file instanceof File)) return invalid(c, 'file_required');
    if (file.size > 5 * 1024 * 1024) return invalid(c, 'file_too_large');
    const grid = parseXlsx(Buffer.from(await file.arrayBuffer()));
    if (!grid || grid.length === 0) return invalid(c, 'unreadable_file');

    const scheme = await loadSchemeOrDefault(deps.db, slice.projectId);
    const fields = templateFields(scheme);
    const roleFields = scheme.fields.filter((f) => f.role);
    const norm = (v: string) => v.replace(/\u00a0/g, ' ').trim().toLowerCase();
    const byHeader = new Map<string, (typeof fields)[number]>();
    for (const f of fields) {
      // first field wins: the synthetic Title heads the list, so a metadata
      // field merely labelled "Title" cannot hijack the title mapping
      if (!byHeader.has(norm(f.label))) byHeader.set(norm(f.label), f);
      if (!byHeader.has(norm(f.key))) byHeader.set(norm(f.key), f);
    }

    const header = grid[0]!;
    const columns: ({ kind: 'field'; field: (typeof fields)[number] } | { kind: 'ignored' })[] = [];
    const ignoredColumns: string[] = [];
    const mappedKeys = new Set<string>();
    for (const cell of header) {
      const name = norm(cell);
      const field = name ? byHeader.get(name) : undefined;
      if (field) {
        // two columns mapping to one field is ambiguous, not a last-wins race
        if (mappedKeys.has(field.key)) return invalid(c, 'duplicate_columns');
        mappedKeys.add(field.key);
        columns.push({ kind: 'field', field });
      } else {
        columns.push({ kind: 'ignored' });
        if (name) {
          const role = roleFields.find((f) => norm(f.label) === name || norm(f.key) === name);
          ignoredColumns.push(
            role ? `${cell.trim()} (appointments are made on the plan, never imported)` : cell.trim(),
          );
        }
      }
    }
    if (!mappedKeys.has('title')) return invalid(c, 'title_column_required');

    // validate every data row before creating anything — the batch is one act
    const codeFields = scheme.fields.filter((f) => isCodeField(f) && !f.isSerial && f.type !== 'serial');
    const failures: PlanImportFailure[] = [];
    const parsedRows: { excelRow: number; title: string; values: Record<string, string>; metadata: Record<string, string> }[] = [];
    grid.slice(1).forEach((cells, i) => {
      const excelRow = i + 2; // 1-based, after the header — the row Excel shows
      if (cells.every((v) => v === '' || v === undefined)) return; // blank rows are not rows
      let title = '';
      const values: Record<string, string> = {};
      const metadata: Record<string, string> = {};
      columns.forEach((col, columnIndex) => {
        if (col.kind !== 'field') return;
        const value = (cells[columnIndex] ?? '').trim();
        if (col.field.key === 'title') title = value;
        else if (value !== '') {
          values[col.field.key] = value;
          if (!isCodeField(col.field)) metadata[col.field.key] = value;
          // discipline is a code field but also surfaced at-a-glance (T-178) —
          // the single-create path copies it into metadata, so the import must too
          if (col.field.key === 'discipline') metadata['discipline'] = value;
        }
      });
      if (title === '') failures.push({ row: excelRow, problem: 'Title is empty' });
      for (const f of codeFields) {
        const v = values[f.key];
        if (v === undefined) failures.push({ row: excelRow, problem: `${f.label} is empty` });
        else if (f.allowedValues && f.allowedValues.length > 0 && !f.allowedValues.includes(v)) {
          failures.push({ row: excelRow, problem: `${f.label}: "${v}" is not one of the scheme's codes` });
        }
      }
      for (const f of fields) {
        if (isCodeField(f) || f.key === 'title') continue;
        const v = metadata[f.key];
        if (f.required && v === undefined) {
          failures.push({ row: excelRow, problem: `${f.label} is required` });
        }
        // the scheme's enums bind metadata exactly as they bind code values —
        // the template advertises the dropdown, so the import enforces it
        if (v !== undefined && f.allowedValues && f.allowedValues.length > 0 && !f.allowedValues.includes(v)) {
          failures.push({ row: excelRow, problem: `${f.label}: "${v}" is not one of the scheme's codes` });
        }
      }
      parsedRows.push({ excelRow, title, values, metadata });
    });
    if (failures.length > 0) {
      return c.json({ error: 'invalid', detail: 'rows', failures } satisfies PlanImportError, 400);
    }
    if (parsedRows.length === 0) return invalid(c, 'no_rows');

    // create in file order — file order IS numbering order (S3). Serials are
    // allocated per series up front, each series' row touched once in sorted
    // order (two concurrent imports touching the same series pair cannot
    // deadlock on opposite orderings), then assigned to rows in file order.
    const seriesCount = new Map<string, number>();
    const rowSeries = parsedRows.map((row) => {
      const { seriesKey } = composeReference(scheme, row.values, 0);
      seriesCount.set(seriesKey, (seriesCount.get(seriesKey) ?? 0) + 1);
      return seriesKey;
    });
    let created: ContainerRow[];
    try {
      created = await deps.db.transaction(async (tx) => {
        const nextInSeries = new Map<string, number>();
        for (const seriesKey of [...seriesCount.keys()].sort()) {
          const count = seriesCount.get(seriesKey)!;
          const [allocated] = await tx
            .insert(s.namingSerials)
            .values({
              projectId: slice.projectId,
              organisationId: slice.organisationId,
              seriesKey,
              nextSerial: 1 + count,
            })
            .onConflictDoUpdate({
              target: [s.namingSerials.projectId, s.namingSerials.organisationId, s.namingSerials.seriesKey],
              set: { nextSerial: sql`${s.namingSerials.nextSerial} + ${count}` },
            })
            .returning({ next: s.namingSerials.nextSerial });
          nextInSeries.set(seriesKey, allocated!.next - count);
        }
        const containers: ContainerRow[] = [];
        for (const [i, row] of parsedRows.entries()) {
          const seriesKey = rowSeries[i]!;
          const serial = nextInSeries.get(seriesKey)!;
          nextInSeries.set(seriesKey, serial + 1);
          const { reference } = composeReference(scheme, row.values, serial);
          const [container] = await tx
            .insert(s.containers)
            .values({
              projectId: slice.projectId,
              producingOrganisationId: slice.organisationId,
              documentReference: reference,
              metadata: row.metadata,
            })
            .returning();
          await tx.insert(s.workItems).values({
            projectId: slice.projectId,
            type: 'document_production',
            title: row.title,
            status: 'planned',
            containerId: container!.id,
          });
          containers.push(container!);
        }
        return containers;
      });
    } catch (error) {
      // a hand-created row can already hold a reference this import composes
      // (references are free strings on the single-create path) — a conflict,
      // not an unreadable file; serials roll back with the transaction
      if (isUniqueViolation(error)) {
        return c.json({ error: 'conflict', detail: 'reference_exists' } satisfies ApiError, 409);
      }
      throw error;
    }

    const items = await toPlanRows(deps.db, created);
    return c.json({ created: created.length, items, ignoredColumns } satisfies PlanImportResult, 201);
  });

  return app;
}

// Container-level routes take no :projectId param, so they resolve their own
// scope: load the container, resolve the requester's slice on its project,
// then apply the plan rules. Deny is the usual silent 404.
export function containerRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  async function scoped(
    c: Context,
    containerId: string,
  ): Promise<{ container: ContainerRow; slice: EntitledSlice } | null> {
    const container = await loadContainer(deps.db, containerId);
    if (!container) return null;
    const slice = await resolveSlice(deps.db, c.get('user'), container.projectId);
    if (!slice || !planVisible(slice, container)) return null;
    return { container, slice };
  }

  app.patch('/containers/:containerId', async (c) => {
    const scopedCtx = await scoped(c, c.req.param('containerId'));
    if (!scopedCtx) return notFound(c);
    const { container, slice } = scopedCtx;
    // metadata is a producing-organisation act — even the owner edits only its own rows
    if (container.producingOrganisationId !== slice.organisationId) return notFound(c);
    // a super-user capability (T-176), delegated to the row's live lead author (T-362)
    if (!(await canEditRowMetadata(deps.db, slice, container))) {
      return forbidden(c, 'row_edit_not_permitted');
    }
    const body = patchContainerBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const [updated] = await deps.db
      .update(s.containers)
      .set({ metadata: body.data.metadata })
      .where(eq(s.containers.id, container.id))
      .returning();
    const [row] = await toPlanRows(deps.db, [updated!]);
    return c.json(row!);
  });

  // The document owner — a single named person, informational and amendable at
  // any time (T-189); null clears it. A producing-org super-user act.
  app.patch('/containers/:containerId/document-owner', async (c) => {
    const scopedCtx = await scoped(c, c.req.param('containerId'));
    if (!scopedCtx) return notFound(c);
    const { container, slice } = scopedCtx;
    if (container.producingOrganisationId !== slice.organisationId) return notFound(c);
    if (!canEditPlan(slice)) return forbidden(c, 'super_user_required');
    const body = setDocumentOwnerBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    if (body.data.participantId) {
      const target = await liveParticipant(deps.db, body.data.participantId, container.projectId);
      if (!target) return notFound(c);
    }
    const [updated] = await deps.db
      .update(s.containers)
      .set({ documentOwnerParticipantId: body.data.participantId })
      .where(eq(s.containers.id, container.id))
      .returning();
    const [row] = await toPlanRows(deps.db, [updated!]);
    return c.json(row!);
  });

  // The planned deliverable's title (a work-item field), amendable by a
  // producing-org super-user at any time (T-201).
  app.patch('/containers/:containerId/title', async (c) => {
    const scopedCtx = await scoped(c, c.req.param('containerId'));
    if (!scopedCtx) return notFound(c);
    const { container, slice } = scopedCtx;
    if (container.producingOrganisationId !== slice.organisationId) return notFound(c);
    // super-user, or the row's live lead author (T-362) — title is row metadata;
    // the coded reference is not (a naming-scheme act, no endpoint edits it)
    if (!(await canEditRowMetadata(deps.db, slice, container))) {
      return forbidden(c, 'row_edit_not_permitted');
    }
    const body = setPlanTitleBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    await deps.db
      .update(s.workItems)
      .set({ title: body.data.title })
      .where(eq(s.workItems.containerId, container.id));
    const [row] = await toPlanRows(deps.db, [container]);
    return c.json(row!);
  });

  // Remove a planned deliverable from the plan (T-189): the container stays as a
  // record (state → withdrawn) with a free-text reason. Reversible — a
  // restoration puts it back live (recovery is never a helpdesk ticket).
  app.post('/containers/:containerId/withdrawal', async (c) => {
    const scopedCtx = await scoped(c, c.req.param('containerId'));
    if (!scopedCtx) return notFound(c);
    const { container, slice } = scopedCtx;
    if (container.producingOrganisationId !== slice.organisationId) return notFound(c);
    // the refusal is recorded (T-301). A cross-organisation attempt answered
    // 404 above is deliberately NOT recorded: it is denial-reads-as-nonexistence
    // (contracts principle 4), and the requester was never shown the container.
    if (!canEditPlan(slice)) {
      return refuseElevated(c, deps.db, 'super_user_required', {
        projectId: container.projectId,
        containerId: container.id,
        attemptedByParticipantId: slice.participantId,
        action: 'container_withdraw',
      });
    }
    const body = withdrawContainerBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const [updated] = await deps.db
      .update(s.containers)
      .set({ state: 'withdrawn', withdrawnReason: body.data.reason })
      .where(eq(s.containers.id, container.id))
      .returning();
    await deps.db
      .update(s.workItems)
      .set({ status: 'withdrawn' })
      .where(eq(s.workItems.containerId, container.id));
    const [row] = await toPlanRows(deps.db, [updated!]);
    return c.json(row!);
  });

  app.post('/containers/:containerId/restoration', async (c) => {
    const scopedCtx = await scoped(c, c.req.param('containerId'));
    if (!scopedCtx) return notFound(c);
    const { container, slice } = scopedCtx;
    if (container.producingOrganisationId !== slice.organisationId) return notFound(c);
    // recovery rather than destruction, and recorded anyway (T-301): the record
    // answers "who attempted an act this tier holds and was refused", and one
    // direction of the same gate going unrecorded leaves it incomplete while
    // looking complete.
    if (!canEditPlan(slice)) {
      return refuseElevated(c, deps.db, 'super_user_required', {
        projectId: container.projectId,
        containerId: container.id,
        attemptedByParticipantId: slice.participantId,
        action: 'container_restore',
      });
    }
    const [updated] = await deps.db
      .update(s.containers)
      .set({ state: 'live', withdrawnReason: null })
      .where(eq(s.containers.id, container.id))
      .returning();
    await deps.db
      .update(s.workItems)
      .set({ status: 'planned' })
      .where(eq(s.workItems.containerId, container.id));
    const [row] = await toPlanRows(deps.db, [updated!]);
    return c.json(row!);
  });

  // The producing side writes its own author set (ADR-0017).
  app.post('/containers/:containerId/authors', async (c) => {
    const scopedCtx = await scoped(c, c.req.param('containerId'));
    if (!scopedCtx) return notFound(c);
    const { container, slice } = scopedCtx;
    if (container.producingOrganisationId !== slice.organisationId) return notFound(c);
    // the author set is row metadata: super-user or the row's live lead author
    // (T-362) — an ordinary member holds nothing ("another member cannot", S5)
    if (!(await canEditRowMetadata(deps.db, slice, container))) {
      return forbidden(c, 'row_edit_not_permitted');
    }
    const body = grantAppointmentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    // lead authorship is assigned by the super user only — the delegation
    // cannot pass itself on (ADR-0033 addendum)
    if (body.data.isLead && !canEditPlan(slice)) return forbidden(c, 'super_user_required');
    const target = await liveParticipant(deps.db, body.data.participantId, container.projectId);
    if (!target) return notFound(c);
    if (body.data.isLead) {
      const lead = await liveLead(deps.db, 'authors', container.id);
      if (lead) return conflict(c);
    }
    const [grant] = await deps.db
      .insert(s.deliverableAuthors)
      .values({
        containerId: container.id,
        participantId: target.id,
        isLead: body.data.isLead ?? false,
        grantedByParticipantId: slice.participantId,
      })
      .returning();
    return c.json(await grantRead(deps.db, 'authors', grant!.id), 201);
  });

  // Reviewers: the producing organisation PROPOSES (confirms nothing); an
  // owner-made grant is auto-confirmed (ADR-0033). The ADR-0033 addendum
  // (owner-ruled 2026-08-06, T-352) adds the live confirmed LEAD reviewer:
  // they run the group, so they may propose too — non-confirming unless they
  // are owner-side, because confirmation is where the wall bites (ADR-0015).
  app.post('/containers/:containerId/reviewers', async (c) => {
    // not scoped(): planVisible admits only owner/producer, and the addendum's
    // third party — the confirmed lead reviewer — may sit outside both; the
    // lead's own confirmed grant is their sight (ADR-0015 share-first ran at
    // their confirmation)
    const container = await loadContainer(deps.db, c.req.param('containerId'));
    if (!container) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), container.projectId);
    if (!slice) return notFound(c);
    const isOwner = slice.membershipRole === 'owner';
    const isProducer = container.producingOrganisationId === slice.organisationId;
    const leadReviewer = (await isLiveConfirmedReviewer(deps.db, container.id, slice.participantId))
      ?.isLead ?? false;
    if (!isOwner && !isProducer && !leadReviewer) return notFound(c);
    if (container.scope === 'sandbox' && !isProducer) return notFound(c);
    // on the producing side a PLAN row's proposal is row metadata: super-user
    // or the row's live lead author (T-362) — never an ordinary member. The
    // owner and the confirmed lead reviewer keep their own standing (ADR-0033
    // + T-352). A sandbox-scope (freeze) container is exempt: internal-cycle
    // initiation is open to anyone in the team (ADR-0032), org-private, no wall.
    if (
      container.scope !== 'sandbox' &&
      !isOwner &&
      !leadReviewer &&
      !(await canEditRowMetadata(deps.db, slice, container))
    ) {
      return forbidden(c, 'row_edit_not_permitted');
    }
    const body = grantAppointmentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const target = await liveParticipant(deps.db, body.data.participantId, container.projectId);
    if (!target) return notFound(c);
    if (body.data.isLead) {
      const lead = await liveLead(deps.db, 'reviewers', container.id);
      if (lead) return conflict(c);
    }
    // owner grants auto-confirm; so do sandbox-scope (internal cycle) grants —
    // the org appoints its own reviewers, no wall is crossed (ADR-0032)
    const autoConfirm = isOwner || container.scope === 'sandbox';
    const [grant] = await deps.db
      .insert(s.deliverableReviewers)
      .values({
        containerId: container.id,
        participantId: target.id,
        isLead: body.data.isLead ?? false,
        grantedByParticipantId: slice.participantId,
        confirmedByParticipantId: autoConfirm ? slice.participantId : null,
        confirmedAt: autoConfirm ? sql`now()` : null,
      })
      .returning();
    return c.json(await grantRead(deps.db, 'reviewers', grant!.id), 201);
  });

  // Interval closes (ADR-0033): the producing side its authors; the owner —
  // or the proposer while still unconfirmed — a reviewer row.
  app.post('/authors/:grantId/revocation', async (c) => {
    const grantId = c.req.param('grantId');
    if (!isUuid(grantId)) return notFound(c);
    const [grant] = await deps.db
      .select()
      .from(s.deliverableAuthors)
      .where(eq(s.deliverableAuthors.id, grantId))
      .limit(1);
    if (!grant || grant.revokedAt) return notFound(c);
    const scopedCtx = await scoped(c, grant.containerId);
    if (!scopedCtx) return notFound(c);
    if (scopedCtx.container.producingOrganisationId !== scopedCtx.slice.organisationId) {
      return notFound(c);
    }
    // super-user or the row's live lead author (T-362) — but revoking the LEAD
    // author row is reassignment, which stays the super user's act
    if (!(await canEditRowMetadata(deps.db, scopedCtx.slice, scopedCtx.container))) {
      return forbidden(c, 'row_edit_not_permitted');
    }
    if (grant.isLead && !canEditPlan(scopedCtx.slice)) return forbidden(c, 'super_user_required');
    await deps.db
      .update(s.deliverableAuthors)
      .set({ revokedAt: sql`now()` })
      .where(eq(s.deliverableAuthors.id, grant.id));
    return c.json(await grantRead(deps.db, 'authors', grant.id));
  });

  app.post('/reviewers/:grantId/revocation', async (c) => {
    const grantId = c.req.param('grantId');
    if (!isUuid(grantId)) return notFound(c);
    const [grant] = await deps.db
      .select()
      .from(s.deliverableReviewers)
      .where(eq(s.deliverableReviewers.id, grantId))
      .limit(1);
    if (!grant || grant.revokedAt) return notFound(c);
    // not scoped() — see the reviewer-grant handler above (the lead may sit
    // outside planVisible's owner/producer pair)
    const container = await loadContainer(deps.db, grant.containerId);
    if (!container) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), container.projectId);
    if (!slice) return notFound(c);
    const isOwner = slice.membershipRole === 'owner';
    const proposerRetractingProposal =
      !grant.confirmedAt && container.producingOrganisationId === slice.organisationId;
    // ADR-0033 addendum (T-352): the live confirmed lead reviewer may revoke —
    // revocation narrows access and is always wall-safe
    const leadReviewer = (await isLiveConfirmedReviewer(deps.db, container.id, slice.participantId))
      ?.isLead ?? false;
    if (!isOwner && !proposerRetractingProposal && !leadReviewer) return notFound(c);
    await deps.db
      .update(s.deliverableReviewers)
      .set({ revokedAt: sql`now()` })
      .where(eq(s.deliverableReviewers.id, grant.id));
    return c.json(await grantRead(deps.db, 'reviewers', grant.id));
  });

  // T-119 — the owner confirms a proposed reviewer, and ADR-0015 bites here:
  // a reviewer whose organisation cannot see the deliverable (not producer,
  // not owner, no live share) forces share-first — 409 share_required.
  app.post('/reviewers/:grantId/confirmation', async (c) => {
    const grantId = c.req.param('grantId');
    if (!isUuid(grantId)) return notFound(c);
    const [grant] = await deps.db
      .select()
      .from(s.deliverableReviewers)
      .where(eq(s.deliverableReviewers.id, grantId))
      .limit(1);
    if (!grant || grant.revokedAt || grant.confirmedAt) return notFound(c);
    const scopedCtx = await scoped(c, grant.containerId);
    if (!scopedCtx || scopedCtx.slice.membershipRole !== 'owner') return notFound(c);
    const { container } = scopedCtx;
    const [reviewerUser] = await deps.db
      .select({ organisationId: s.users.organisationId })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.participants.id, grant.participantId))
      .limit(1);
    const reviewerOrg = reviewerUser!.organisationId;
    const [project] = await deps.db
      .select({ ownerOrganisationId: s.projects.ownerOrganisationId })
      .from(s.projects)
      .where(eq(s.projects.id, container.projectId))
      .limit(1);
    const canSee =
      reviewerOrg === container.producingOrganisationId ||
      reviewerOrg === project!.ownerOrganisationId ||
      (await liveShare(deps.db, container.id, reviewerOrg)) !== null;
    if (!canSee) {
      return c.json({ error: 'conflict', detail: 'share_required' } satisfies ApiError, 409);
    }
    await deps.db
      .update(s.deliverableReviewers)
      .set({ confirmedByParticipantId: scopedCtx.slice.participantId, confirmedAt: sql`now()` })
      .where(eq(s.deliverableReviewers.id, grant.id));
    return c.json(await grantRead(deps.db, 'reviewers', grant.id));
  });

  // The owner's share is the only thing that opens a deliverable across the
  // wall (ADR-0016); shared organisations must hold an active seat.
  app.post('/containers/:containerId/shares', async (c) => {
    const scopedCtx = await scoped(c, c.req.param('containerId'));
    if (!scopedCtx || scopedCtx.slice.membershipRole !== 'owner') return notFound(c);
    const body = shareDeliverableBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const [membership] = await deps.db
      .select({ id: s.memberships.id })
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.organisationId, body.data.organisationId),
          eq(s.memberships.projectId, scopedCtx.container.projectId),
          eq(s.memberships.state, 'active'),
        ),
      )
      .limit(1);
    if (!membership) return notFound(c);
    if (await liveShare(deps.db, scopedCtx.container.id, body.data.organisationId)) {
      return conflict(c);
    }
    const [share] = await deps.db
      .insert(s.deliverableShares)
      .values({
        containerId: scopedCtx.container.id,
        organisationId: body.data.organisationId,
        grantedByParticipantId: scopedCtx.slice.participantId,
      })
      .returning();
    return c.json(await shareRead(deps.db, share!.id), 201);
  });

  app.post('/shares/:shareId/revocation', async (c) => {
    const shareId = c.req.param('shareId');
    if (!isUuid(shareId)) return notFound(c);
    const [share] = await deps.db
      .select()
      .from(s.deliverableShares)
      .where(eq(s.deliverableShares.id, shareId))
      .limit(1);
    if (!share || share.revokedAt) return notFound(c);
    const scopedCtx = await scoped(c, share.containerId);
    if (!scopedCtx || scopedCtx.slice.membershipRole !== 'owner') return notFound(c);
    await deps.db
      .update(s.deliverableShares)
      .set({ revokedAt: sql`now()` })
      .where(eq(s.deliverableShares.id, share.id));
    return c.json(await shareRead(deps.db, share.id));
  });

  return app;
}

async function liveShare(db: Db, containerId: string, organisationId: string) {
  const [row] = await db
    .select({ id: s.deliverableShares.id })
    .from(s.deliverableShares)
    .where(
      and(
        eq(s.deliverableShares.containerId, containerId),
        eq(s.deliverableShares.organisationId, organisationId),
        isNull(s.deliverableShares.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function shareRead(db: Db, shareId: string): Promise<DeliverableShare> {
  const [row] = await db
    .select({ share: s.deliverableShares, organisationName: s.organisations.name })
    .from(s.deliverableShares)
    .innerJoin(s.organisations, eq(s.deliverableShares.organisationId, s.organisations.id))
    .where(eq(s.deliverableShares.id, shareId))
    .limit(1);
  return {
    id: row!.share.id,
    containerId: row!.share.containerId,
    organisationId: row!.share.organisationId,
    organisationName: row!.organisationName,
    grantedAt: row!.share.grantedAt.toISOString(),
    revokedAt: row!.share.revokedAt?.toISOString() ?? null,
  };
}

async function liveParticipant(db: Db, participantId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(s.participants)
    .where(
      and(
        eq(s.participants.id, participantId),
        eq(s.participants.projectId, projectId),
        isNull(s.participants.removedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function liveLead(db: Db, side: 'authors' | 'reviewers', containerId: string) {
  const table = side === 'authors' ? s.deliverableAuthors : s.deliverableReviewers;
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.containerId, containerId), eq(table.isLead, true), isNull(table.revokedAt)))
    .limit(1);
  return row ?? null;
}

async function grantRead(
  db: Db,
  side: 'authors' | 'reviewers',
  grantId: string,
): Promise<AppointmentGrant | ReviewerGrant> {
  const table = side === 'authors' ? s.deliverableAuthors : s.deliverableReviewers;
  const [row] = await db
    .select({ grant: table, name: s.users.name })
    .from(table)
    .innerJoin(s.participants, eq(table.participantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(table.id, grantId))
    .limit(1);
  const base: AppointmentGrant = {
    id: row!.grant.id,
    containerId: row!.grant.containerId,
    participantId: row!.grant.participantId,
    name: row!.name,
    isLead: row!.grant.isLead,
    grantedAt: row!.grant.grantedAt.toISOString(),
    revokedAt: row!.grant.revokedAt?.toISOString() ?? null,
  };
  if (side === 'reviewers') {
    const r = row!.grant as typeof s.deliverableReviewers.$inferSelect;
    return { ...base, confirmedAt: r.confirmedAt?.toISOString() ?? null } satisfies ReviewerGrant;
  }
  return base;
}
