// T-461 — BULK ACTS ON A SELECTION, and the register's export.
//
// *In plain terms: tick several rows on the library and do one thing to all of
// them — send them to another organisation, issue them outside the project,
// say one new document replaces them all, classify them, or take them to
// Excel. One dialog, one answer, and either the whole batch happens or none
// of it does, with the rows that stopped it named.*
//
// Why these are routes and not a loop in the screen: a loop over twenty
// single-row calls that dies on the eleventh leaves ten transmittals issued
// and nothing in the record saying the act was meant to be twenty. Here every
// row is checked first, a single refusal refuses the lot (409 with
// `failures`), and the writes land in one transaction. And why each route
// reuses the single route's own helpers (transmittal.ts, external-issue.ts,
// ontology.ts) rather than restating them: there must never be a second
// definition of what a transmittal, an external issue or a superseding edge is.
//
// The wall is where it always is. Every row is read back through the
// deliverable-visibility pre-filter the library uses; a row the requester may
// not see refuses the batch as "not in this project's library" — the same
// absence a single-row route gives, never a leak of what the row is.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  bulkClassifyBody,
  bulkIssueExternallyBody,
  bulkSupersedeBody,
  bulkTransmitBody,
  isCodeField,
  planExportBody,
} from '@infora/contracts';
import type {
  ApiError,
  BulkClassifyResponse,
  BulkFailure,
  BulkIssueExternallyResponse,
  BulkRefusal,
  BulkSupersedeResponse,
  BulkTransmitResponse,
  NamingSchemeField,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { deliverableVisibleSql as deliverableVisible } from '@infora/knowledge';
import { mayIssueExternally, recordExternalIssue } from './external-issue';
import { loadSchemeOrDefault, templateFields } from './naming';
import { mayConfirmEdge, mayProposeEdge, producesIt } from './ontology';
import { projectScope } from './requester';
import type { AppEnv } from './requester';
import { activeMembership, applyStandingRules, liveShare } from './transmittal';
import type { ContainerRow } from './transmittal';
import { buildXlsx } from './xlsx';
import { recordStateChange } from './state-changes';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail?: string) => c.json({ error: 'invalid', ...(detail && { detail }) } satisfies ApiError, 400);
const refused = (c: Context, failures: BulkFailure[]) =>
  c.json({ error: 'conflict', detail: 'batch_refused', failures } satisfies BulkRefusal, 409);

type Selected = ContainerRow & { versionId: string | null };

export function bulkActRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  /** the selected rows the requester may see, in the library, with their
   * current version; an id that comes back missing is a row to refuse on */
  async function selected(slice: EntitledSlice, ids: string[]): Promise<Map<string, Selected>> {
    const rows = await deps.db
      .select({ container: s.containers, versionId: s.versions.id })
      .from(s.containers)
      .leftJoin(s.versions, and(eq(s.versions.containerId, s.containers.id), eq(s.versions.isCurrent, true)))
      .where(
        and(
          inArray(s.containers.id, [...new Set(ids)]),
          eq(s.containers.projectId, slice.projectId),
          eq(s.containers.scope, 'library'),
          deliverableVisible(slice),
        ),
      );
    return new Map(rows.map((r) => [r.container.id, { ...r.container, versionId: r.versionId }]));
  }
  const missing = (ids: string[], found: Map<string, Selected>): BulkFailure[] =>
    [...new Set(ids)]
      .filter((id) => !found.has(id))
      .map((containerId) => ({ containerId, documentReference: null, problem: "not in this project's library" }));
  const fail = (row: Selected, problem: string): BulkFailure => ({
    containerId: row.id,
    documentReference: row.documentReference,
    problem,
  });

  // ── Transmit (ADR-0035): the owner's act, the same recipients for every row ──
  app.post('/projects/:projectId/bulk/transmittals', project, async (c) => {
    const slice = c.get('slice');
    if (slice.membershipRole !== 'owner') return notFound(c);
    const body = bulkTransmitBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const recipients = [...new Set(body.data.organisationIds)];
    for (const organisationId of recipients) {
      if (organisationId === slice.organisationId) return invalid(c, 'recipient_ungated');
      if (!(await activeMembership(deps.db, organisationId, slice.projectId))) return notFound(c);
    }
    const found = await selected(slice, body.data.containerIds);
    const failures = missing(body.data.containerIds, found);
    for (const row of found.values()) {
      if (row.state !== 'live') failures.push(fail(row, 'not live'));
      else if (row.versionId === null) failures.push(fail(row, 'no current version'));
      else if (recipients.includes(row.producingOrganisationId)) failures.push(fail(row, 'produced by a recipient'));
    }
    if (failures.length > 0) return refused(c, failures);
    const transmittalIds = await deps.db.transaction(async (raw) => {
      const tx = raw as unknown as Db; // the repo's precedent (withProjectScope): one Db type for pool and transaction
      const ids: string[] = [];
      for (const row of found.values()) {
        for (const organisationId of recipients) {
          if (!(await liveShare(tx, row.id, organisationId))) {
            await tx.insert(s.deliverableShares).values({
              containerId: row.id,
              organisationId,
              grantedByParticipantId: slice.participantId,
            });
          }
        }
        const [t] = await tx
          .insert(s.transmittals)
          .values({
            kind: 'non_review',
            containerId: row.id,
            versionId: row.versionId!,
            senderParticipantId: slice.participantId,
            recipientOrganisationIds: recipients,
            purposeCode: body.data.purposeCode ?? null,
          })
          .returning({ id: s.transmittals.id });
        ids.push(t!.id);
        await applyStandingRules(tx, row, recipients);
      }
      return ids;
    });
    return c.json({ issued: transmittalIds.length, transmittalIds } satisfies BulkTransmitResponse, 201);
  });

  // ── Issue outside the project (ADR-0055): one issue, or one request, per row ──
  app.post('/projects/:projectId/bulk/external-issues', project, async (c) => {
    const slice = c.get('slice');
    const body = bulkIssueExternallyBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const [settings] = await deps.db
      .select({ permission: s.projects.externalIssuePermission })
      .from(s.projects)
      .where(eq(s.projects.id, slice.projectId))
      .limit(1);
    if (!settings) return notFound(c);
    const may = mayIssueExternally(slice, settings.permission);
    const found = await selected(slice, body.data.containerIds);
    const failures = missing(body.data.containerIds, found);
    for (const row of found.values()) {
      if (row.state !== 'live') failures.push(fail(row, 'not live'));
      else if (row.versionId === null) failures.push(fail(row, 'no current version'));
    }
    if (failures.length > 0) return refused(c, failures);
    const { containerIds: _ids, ...issue } = body.data;
    void _ids;
    const issueIds = await deps.db.transaction(async (raw) => {
      const tx = raw as unknown as Db; // the repo's precedent (withProjectScope): one Db type for pool and transaction
      const ids: string[] = [];
      for (const row of found.values()) ids.push(await recordExternalIssue(tx, slice, row.id, row.versionId!, issue, may));
      return ids;
    });
    return c.json({ state: may ? 'issued' : 'requested', issueIds } satisfies BulkIssueExternallyResponse, 201);
  });

  // ── Supersede (ADR-0045 as amended): one replacement, many superseded ───────
  app.post('/projects/:projectId/bulk/supersessions', project, async (c) => {
    const slice = c.get('slice');
    const body = bulkSupersedeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const found = await selected(slice, [...body.data.containerIds, body.data.replacementContainerId]);
    const replacement = found.get(body.data.replacementContainerId);
    if (!replacement) return notFound(c);
    if (!mayProposeEdge(replacement, slice)) return notFound(c);
    const failures = missing(body.data.containerIds, found);
    const targets = body.data.containerIds.filter((id) => found.has(id)).map((id) => found.get(id)!);
    for (const row of targets) {
      if (row.id === replacement.id) failures.push(fail(row, 'is the replacement'));
      else if (row.state !== 'live') failures.push(fail(row, 'not live'));
    }
    if (failures.length > 0) return refused(c, failures);
    // the owner proposes and confirms in one act (T-386); the producer proposes
    const confirms = targets.every((t) => mayConfirmEdge(t, replacement, slice));
    const relationshipIds = await deps.db.transaction(async (raw) => {
      const tx = raw as unknown as Db; // the repo's precedent (withProjectScope): one Db type for pool and transaction
      const ids: string[] = [];
      for (const row of targets) {
        const [existing] = await tx
          .select()
          .from(s.documentRelationships)
          .where(
            and(
              eq(s.documentRelationships.fromContainerId, replacement.id),
              eq(s.documentRelationships.toContainerId, row.id),
              eq(s.documentRelationships.type, 'supersedes'),
              isNull(s.documentRelationships.retiredAt),
            ),
          )
          .limit(1);
        let edgeId = existing?.id;
        if (!edgeId) {
          const [edge] = await tx
            .insert(s.documentRelationships)
            .values({
              projectId: slice.projectId,
              fromContainerId: replacement.id,
              toContainerId: row.id,
              type: 'supersedes',
              createdByParticipantId: slice.participantId,
            })
            .returning({ id: s.documentRelationships.id });
          edgeId = edge!.id;
        }
        if (confirms && !existing?.confirmedAt) {
          await tx
            .update(s.documentRelationships)
            .set({ confirmedByParticipantId: slice.participantId, confirmedAt: sql`now()` })
            .where(eq(s.documentRelationships.id, edgeId));
          // only `live` is overwritten — the single route's rule (T-386)
          if (row.inLibrary && row.state === 'live') {
            await tx.update(s.containers).set({ state: 'superseded' }).where(eq(s.containers.id, row.id));
            await recordStateChange(tx, { containerId: row.id, projectId: slice.projectId, from: 'live', to: 'superseded', reason: `superseded by ${replacement.documentReference ?? 'another document'}`, participantId: slice.participantId });
          }
        }
        ids.push(edgeId);
      }
      return ids;
    });
    return c.json({ state: confirms ? 'confirmed' : 'proposed', relationshipIds } satisfies BulkSupersedeResponse, 201);
  });

  // ── Classify (ADR-0045): one facet's term, append or replace, said out loud ──
  app.post('/projects/:projectId/bulk/classifications', project, async (c) => {
    const slice = c.get('slice');
    const body = bulkClassifyBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const [term] = await deps.db
      .select({ facetId: s.classificationTerms.facetId, projectId: s.classificationFacets.projectId })
      .from(s.classificationTerms)
      .innerJoin(s.classificationFacets, eq(s.classificationTerms.facetId, s.classificationFacets.id))
      .where(
        and(
          eq(s.classificationTerms.id, body.data.termId),
          eq(s.classificationTerms.facetId, body.data.facetId),
          isNull(s.classificationTerms.retiredAt),
        ),
      )
      .limit(1);
    if (!term || term.projectId !== slice.projectId) return invalid(c);
    const found = await selected(slice, body.data.containerIds);
    const failures = missing(body.data.containerIds, found);
    for (const row of found.values()) {
      // a producing-organisation act, row by row — the owner classifies only its own
      if (!producesIt(row, slice)) failures.push(fail(row, 'produced by another organisation'));
    }
    if (failures.length > 0) return refused(c, failures);
    const result = await deps.db.transaction(async (raw) => {
      const tx = raw as unknown as Db; // the repo's precedent (withProjectScope): one Db type for pool and transaction
      let set = 0;
      let kept = 0;
      for (const row of found.values()) {
        const written = await tx
          .insert(s.containerClassifications)
          .values({
            containerId: row.id,
            facetId: body.data.facetId,
            termId: body.data.termId,
            setByParticipantId: slice.participantId,
          })
          .onConflictDoUpdate({
            target: [s.containerClassifications.containerId, s.containerClassifications.facetId],
            set: {
              termId: body.data.termId,
              setByParticipantId: slice.participantId,
              proposedByRunId: null,
              updatedAt: sql`now()`,
            },
            // `append` leaves a facet somebody already set exactly as it was
            ...(body.data.mode === 'append' && { setWhere: sql`${s.containerClassifications.termId} is null` }),
          })
          .returning({ id: s.containerClassifications.id });
        if (written.length > 0) set += 1;
        else kept += 1;
      }
      return { set, kept };
    });
    return c.json(result satisfies BulkClassifyResponse);
  });

  // ── Export: the selection as the plan template's own workbook ───────────────
  app.post('/projects/:projectId/plan/export', project, async (c) => {
    const slice = c.get('slice');
    const body = planExportBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const scheme = await loadSchemeOrDefault(deps.db, slice.projectId);
    const fields = templateFields(scheme);
    const rows = await deps.db
      .select({
        container: s.containers,
        title: s.workItems.title,
        revision: s.versions.versionReference,
        issuedAt: s.versions.createdAt,
        producer: s.organisations.name,
      })
      .from(s.containers)
      .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
      .leftJoin(s.versions, and(eq(s.versions.containerId, s.containers.id), eq(s.versions.isCurrent, true)))
      .innerJoin(s.organisations, eq(s.organisations.id, s.containers.producingOrganisationId))
      .where(
        and(
          inArray(s.containers.id, [...new Set(body.data.containerIds)]),
          eq(s.containers.projectId, slice.projectId),
          eq(s.containers.scope, 'library'),
          deliverableVisible(slice),
        ),
      )
      .orderBy(asc(s.containers.documentReference));
    const sheet = rows.map((r) => {
      const codes = decomposeReference(scheme, r.container.documentReference);
      const metadata = (r.container.metadata ?? {}) as Record<string, unknown>;
      return fields.map((f) => {
        if (f.key === 'title') return r.title ?? '';
        if (isCodeField(f)) return codes[f.key] ?? '';
        const v = metadata[f.key];
        return v === undefined || v === null ? '' : String(v);
      });
    });
    const record = rows.map((r) => [
      r.container.documentReference ?? '',
      r.title ?? '',
      r.revision ?? '',
      r.container.state,
      r.producer,
      r.issuedAt ? r.issuedAt.toISOString().slice(0, 10) : '',
    ]);
    const bytes = buildXlsx([
      {
        name: 'Deliverables',
        rows: [fields.map((f) => f.label), ...sheet],
        validations: fields.flatMap((f, column) =>
          f.allowedValues && f.allowedValues.length > 0 ? [{ column, values: f.allowedValues }] : [],
        ),
      },
      { name: 'Record', rows: [['Reference', 'Title', 'Revision', 'State', 'Producer', 'Issued'], ...record] },
    ]);
    c.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('content-disposition', `attachment; filename="deliverables-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    return c.body(new Uint8Array(bytes));
  });

  return app;
}

/** The code fields' values, read back out of a composed reference — the inverse
 * of `composeReference` for a reference the scheme composed. A reference the
 * scheme did not compose (fewer parts, or a hand-set one) yields what it can,
 * position by position, and blanks the rest. */
export function decomposeReference(
  scheme: { separator: string; fields: NamingSchemeField[] },
  reference: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!reference) return out;
  const parts = reference.split(scheme.separator);
  const codeFields = scheme.fields.filter(isCodeField);
  if (parts.length !== codeFields.length) return out;
  codeFields.forEach((f, i) => {
    if (!f.isSerial && f.type !== 'serial') out[f.key] = parts[i]!;
  });
  return out;
}
