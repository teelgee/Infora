// T-152 — the naming scheme + code-builder API (ADR-0008 homed, Beat 1). The
// owner defines the project-wide scheme; a producer self-generates compliant
// references with a serial auto-incremented within its own allocation (cross-org
// distinctness rides the originator field); a producer proposes scheme additions
// and the owner folds them in. Plan-row create/patch already live in plan.ts.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  defaultDeliverableSchema,
  generateReferenceBody,
  isCodeField,
  isColumnableField,
  proposeNamingAdditionBody,
  resolveNamingProposalBody,
  setReviewPeriodBody,
  upsertNamingSchemeBody,
} from '@infora/contracts';
import type {
  ApiError,
  GenerateReferenceResponse,
  GetNamingSchemeResponse,
  GetReviewPeriodResponse,
  ListNamingProposalsResponse,
  NamingProposal,
  NamingSchemeField,
} from '@infora/contracts';
import { canEditScheme, canProposeScheme } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope, resolveSlice } from './requester';
import { DEFAULT_REVIEW_PERIOD_DAYS } from './review-period';
import type { AppEnv } from './requester';
import { buildXlsx } from './xlsx';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

// Compose a reference from the scheme + supplied field values, filling the
// serial field zero-padded to its width. Returns the series key too (the
// composed prefix of every non-serial field), which keys the serial allocation.
export function composeReference(
  scheme: { separator: string; fields: NamingSchemeField[] },
  values: Record<string, string>,
  serial: number,
): { reference: string; seriesKey: string } {
  const parts: string[] = [];
  const prefix: string[] = [];
  // only the code fields compose the reference (T-188); metadata / role fields are
  // carried on the deliverable but never in the code
  for (const f of scheme.fields.filter(isCodeField)) {
    if (f.isSerial) {
      parts.push(String(serial).padStart(f.width ?? 3, '0'));
      continue;
    }
    const v = values[f.key];
    if (v === undefined || v === '') throw new Error(`missing value for field ${f.key}`);
    if (f.allowedValues && f.allowedValues.length > 0 && !f.allowedValues.includes(v)) {
      throw new Error(`value ${v} not allowed for field ${f.key}`);
    }
    parts.push(v);
    prefix.push(v);
  }
  return { reference: parts.join(scheme.separator), seriesKey: prefix.join(scheme.separator) };
}

// the saved project scheme, or the Infora default when none has been saved yet
// (T-188) — so a new project has a working, editable scheme from day one
export async function loadSchemeOrDefault(
  db: Db,
  projectId: string,
): Promise<{ separator: string; fields: NamingSchemeField[] }> {
  const [row] = await db
    .select()
    .from(s.projectNamingSchemes)
    .where(eq(s.projectNamingSchemes.projectId, projectId))
    .limit(1);
  return row
    ? { separator: row.separator, fields: row.fields as NamingSchemeField[] }
    : defaultDeliverableSchema();
}

// T-358 — the columns a plan spreadsheet carries, in template order: Title, then
// the scheme's non-serial code fields, then its plain metadata fields. Deliberate
// exclusions, both S3 rulings: no reference/serial column (numbering is never
// drafted in Excel — references are generated at import), and no role columns
// (appointments are propose/confirm acts, never a spreadsheet side-effect).
export function templateFields(scheme: { fields: NamingSchemeField[] }): NamingSchemeField[] {
  // isColumnableField is the shared exclusion (contracts): serial either way it
  // is flagged, role slots, and a scheme's own 'title' key (which folds into
  // the synthetic Title column rather than duplicating it).
  const eligible = scheme.fields.filter(isColumnableField);
  return [
    { key: 'title', label: 'Title' },
    ...eligible.filter(isCodeField),
    ...eligible.filter((f) => !isCodeField(f)),
  ];
}

export function namingRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  // T-358 — the fillable plan template: one header row of schema attribute
  // fields, a Codes legend sheet, dropdowns where the allowed set fits Excel's
  // inline-list cap. Any participant may download it — it restates the scheme,
  // which the scheme read already shows every participant.
  app.get('/projects/:projectId/naming-scheme/template', project, async (c) => {
    const slice = c.get('slice');
    const scheme = await loadSchemeOrDefault(deps.db, slice.projectId);
    const fields = templateFields(scheme);
    const legend: (string | null)[][] = [['Field', 'Code', 'Description']];
    for (const f of fields) {
      for (const v of f.allowedValues ?? []) legend.push([f.label, v, f.allowedValueLabels?.[v] ?? null]);
    }
    const bytes = buildXlsx([
      {
        name: 'Deliverables',
        rows: [fields.map((f) => f.label)],
        validations: fields.flatMap((f, column) =>
          f.allowedValues && f.allowedValues.length > 0 ? [{ column, values: f.allowedValues }] : [],
        ),
      },
      { name: 'Codes', rows: legend },
    ]);
    c.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('content-disposition', 'attachment; filename="deliverables-plan-template.xlsx"');
    return c.body(new Uint8Array(bytes));
  });

  app.get('/projects/:projectId/naming-scheme', project, async (c) => {
    const slice = c.get('slice');
    // preload the Infora default when the owner has not saved one yet (T-188)
    const scheme = await loadSchemeOrDefault(deps.db, slice.projectId);
    const body: GetNamingSchemeResponse = { projectId: slice.projectId, ...scheme };
    return c.json(body);
  });

  // the owner super-user defines/updates the project-wide scheme (T-176)
  app.put('/projects/:projectId/naming-scheme', project, async (c) => {
    const slice = c.get('slice');
    if (!canEditScheme(slice)) return notFound(c);
    const parsed = upsertNamingSchemeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    await deps.db
      .insert(s.projectNamingSchemes)
      .values({ projectId: slice.projectId, separator: parsed.data.separator, fields: parsed.data.fields })
      .onConflictDoUpdate({
        target: s.projectNamingSchemes.projectId,
        set: { separator: parsed.data.separator, fields: parsed.data.fields, updatedAt: sql`now()` },
      });
    return c.json({ ok: true });
  });

  // T-371 (ADR-0005 addendum) — the review period's project-level default.
  // Its own pair of endpoints beside the scheme rather than a field inside it:
  // the scheme's fields are the header row of the fillable deliverables
  // template (T-337/T-359), and a review period modelled as one would arrive as
  // a column nobody should be filling in. Every participant reads it — the
  // number is what the status bar's target and overdue state are computed from,
  // so hiding it would make the date on screen unexplainable.
  app.get('/projects/:projectId/review-period', project, async (c) => {
    const slice = c.get('slice');
    const [row] = await deps.db
      .select({ defaultDays: s.projects.reviewPeriodDefaultDays })
      .from(s.projects)
      .where(eq(s.projects.id, slice.projectId))
      .limit(1);
    return c.json({
      projectId: slice.projectId,
      defaultDays: row?.defaultDays ?? DEFAULT_REVIEW_PERIOD_DAYS,
    } satisfies GetReviewPeriodResponse);
  });

  // The owner super-user sets it — project configuration, the same tier that
  // owns the scheme (canEditScheme). Safe in the producing side's hands at
  // promotion for the same reason it is safe here: a guide carries no access or
  // state consequence, unlike the review group sitting in the same window.
  app.patch('/projects/:projectId/review-period', project, async (c) => {
    const slice = c.get('slice');
    if (!canEditScheme(slice)) return notFound(c);
    const parsed = setReviewPeriodBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    await deps.db
      .update(s.projects)
      .set({ reviewPeriodDefaultDays: parsed.data.defaultDays })
      .where(eq(s.projects.id, slice.projectId));
    return c.json({
      projectId: slice.projectId,
      defaultDays: parsed.data.defaultDays,
    } satisfies GetReviewPeriodResponse);
  });

  // a producer self-generates a compliant reference; the serial is allocated
  // atomically per (project, producing org, series) via an upsert-increment
  app.post('/projects/:projectId/naming-scheme/references', project, async (c) => {
    const slice = c.get('slice');
    const parsed = generateReferenceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const scheme = await loadSchemeOrDefault(deps.db, slice.projectId);
    const fields = scheme.fields;
    let seriesKey: string;
    try {
      seriesKey = composeReference({ separator: scheme.separator, fields }, parsed.data.values, 0).seriesKey;
    } catch {
      return invalid(c);
    }
    // atomic allocation: first insert seeds next_serial=2 (allocating 1); a
    // conflict increments and returns the new value, so the allocated serial is
    // always (returned - 1)
    const [allocated] = await deps.db
      .insert(s.namingSerials)
      .values({ projectId: slice.projectId, organisationId: slice.organisationId, seriesKey, nextSerial: 2 })
      .onConflictDoUpdate({
        target: [s.namingSerials.projectId, s.namingSerials.organisationId, s.namingSerials.seriesKey],
        set: { nextSerial: sql`${s.namingSerials.nextSerial} + 1` },
      })
      .returning({ next: s.namingSerials.nextSerial });
    const serial = allocated!.next - 1;
    let reference: string;
    try {
      reference = composeReference({ separator: scheme.separator, fields }, parsed.data.values, serial).reference;
    } catch {
      return invalid(c);
    }
    return c.json({ reference, serial } satisfies GenerateReferenceResponse);
  });

  app.get('/projects/:projectId/naming-scheme/proposals', project, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select()
      .from(s.namingSchemeProposals)
      .where(eq(s.namingSchemeProposals.projectId, slice.projectId))
      .orderBy(desc(s.namingSchemeProposals.createdAt));
    const items: NamingProposal[] = rows.map((r) => ({
      id: r.id,
      proposingOrganisationId: r.proposingOrganisationId,
      body: r.body,
      status: r.status,
    }));
    return c.json({ items } satisfies ListNamingProposalsResponse);
  });

  app.post('/projects/:projectId/naming-scheme/proposals', project, async (c) => {
    const slice = c.get('slice');
    // a guest super-user proposes scheme additions (the owner edits directly, T-176)
    if (!canProposeScheme(slice)) return notFound(c);
    const parsed = proposeNamingAdditionBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const [row] = await deps.db
      .insert(s.namingSchemeProposals)
      .values({
        projectId: slice.projectId,
        proposingOrganisationId: slice.organisationId,
        proposedByParticipantId: slice.participantId,
        body: parsed.data.body,
      })
      .returning();
    return c.json({ id: row!.id });
  });

  // the owner folds a proposal in (accept) or declines it
  app.post('/naming-proposals/:proposalId/resolution', async (c) => {
    const id = c.req.param('proposalId');
    if (!isUuid(id)) return notFound(c);
    const [proposal] = await deps.db
      .select()
      .from(s.namingSchemeProposals)
      .where(eq(s.namingSchemeProposals.id, id))
      .limit(1);
    if (!proposal) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), proposal.projectId);
    if (!slice || slice.membershipRole !== 'owner') return notFound(c);
    const parsed = resolveNamingProposalBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    await deps.db
      .update(s.namingSchemeProposals)
      .set({
        status: parsed.data.status,
        resolvedByParticipantId: slice.participantId,
        resolvedAt: sql`now()`,
      })
      .where(eq(s.namingSchemeProposals.id, id));
    return c.json({ ok: true });
  });

  return app;
}
