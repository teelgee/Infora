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
  proposeNamingAdditionBody,
  resolveNamingProposalBody,
  upsertNamingSchemeBody,
} from '@infora/contracts';
import type {
  ApiError,
  GenerateReferenceResponse,
  GetNamingSchemeResponse,
  ListNamingProposalsResponse,
  NamingProposal,
  NamingSchemeField,
} from '@infora/contracts';
import { canEditScheme, canProposeScheme } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';

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

export function namingRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

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
