// T-473 — CURRENCY ON REFERENCE MATERIAL (ADR-0011's addendum of 2026-10-24,
// ruling 4; drawn in data-model.md, Drawer 2, before this was written).
//
// *In plain terms: a standard the project relies on can be "confirmed current"
// by the owner's super user — a person saying "I have checked this is still the
// one to rely on". The record keeps their name, the date, and the date the
// check falls due again, which is that date plus a number of months that
// depends on the kind of document (a year for a standard, six months for
// legislation). The owner's super user can change those numbers for the
// project. A document nobody has confirmed keeps being read; what changes is
// that every citation of it says so.*
//
// 🔒 **CONFIRMED CURRENT IS A PERSON'S ACT.** The columns name the confirmer, so
// the only callers are a person's act: this door, and a person's confirmation in
// the intake (ADR-0011's addendum — "the first confirmation"), which reaches
// `confirmCurrent` through `admitReference`. The operator's CLI records nobody
// and so confirms nothing: a CLI-loaded document starts unconfirmed, with the
// mark, which is the honest state.
//
// 🔒 **REFERENCE CONTAINERS ONLY.** A deliverable's currency is its acceptance;
// these columns stay null on it. A CHECK cannot reach across tables to say so,
// so the route does: a container with a work item, or one outside the library,
// is a 404 here — and `confirmCurrent` refuses it too, so no other caller can
// write the columns onto a deliverable.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { patchRecheckDefaultsBody } from '@infora/contracts';
import type {
  ApiError,
  ConfirmCurrentResponse,
  GetContainerCurrencyResponse,
  GetRecheckDefaultsResponse,
} from '@infora/contracts';
import { schema as s, FALLBACK_RECHECK_MONTHS } from '@infora/db';
import type { Db } from '@infora/db';
import { canEditPlan } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { deliverableVisibleSql as deliverableVisible, readCurrencies } from '@infora/knowledge';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const forbidden = (c: Context) =>
  c.json({ error: 'forbidden', detail: 'owner_super_user_required' } satisfies ApiError, 403);

/** the owner's super user — the work queue's own `ownerSuper` */
const ownerSuper = (slice: EntitledSlice) => slice.membershipRole === 'owner' && canEditPlan(slice);

/** A transaction handle or the database — the confirmation runs inside the admission's transaction. */
type Queryable = Db;

/**
 * Months the next confirmation of this container runs for: the interval of its
 * document type if the project has one, else the project's fallback, else the
 * built-in twelve (a project made before any default existed).
 */
export async function intervalMonthsFor(db: Queryable, projectId: string, containerId: string): Promise<number> {
  const rows = await db
    .select({ termId: s.recheckDefaults.termId, months: s.recheckDefaults.intervalMonths })
    .from(s.recheckDefaults)
    .where(eq(s.recheckDefaults.projectId, projectId));
  const classified = await db
    .select({ termId: s.containerClassifications.termId })
    .from(s.containerClassifications)
    .innerJoin(s.classificationFacets, eq(s.classificationFacets.id, s.containerClassifications.facetId))
    .where(and(eq(s.containerClassifications.containerId, containerId), eq(s.classificationFacets.key, 'document_type')))
    .limit(1);
  const termId = classified[0]?.termId ?? null;
  const own = termId === null ? undefined : rows.find((r) => r.termId === termId);
  return own?.months ?? rows.find((r) => r.termId === null)?.months ?? FALLBACK_RECHECK_MONTHS;
}

/**
 * Record that a person has confirmed this reference document is current: who,
 * when (the database's now), and when it falls due (now plus the interval).
 * Overwrites the previous confirmation — the record keeps the latest. Refuses a
 * container that is not reference material (it has a work item) so the columns
 * can never land on a deliverable. Returns false in that case, writing nothing.
 */
export async function confirmCurrent(db: Queryable, containerId: string, participantId: string): Promise<boolean> {
  const [container] = await db
    .select({ projectId: s.containers.projectId, workItemId: s.workItems.id })
    .from(s.containers)
    .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .where(eq(s.containers.id, containerId))
    .limit(1);
  if (container === undefined || container.workItemId !== null) return false;
  const months = await intervalMonthsFor(db, container.projectId, containerId);
  await db
    .update(s.containers)
    .set({
      confirmedCurrentByParticipantId: participantId,
      confirmedCurrentAt: sql`now()`,
      recheckDueAt: sql`now() + make_interval(months => ${months})`,
    })
    .where(eq(s.containers.id, containerId));
  return true;
}

export function referenceCurrencyRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);
  const container = resourceScope(deps, 'containerId', resourceHomes.container);

  /** a library reference container the reader may see, or null */
  const readable = async (slice: EntitledSlice, containerId: string) => {
    const [row] = await deps.db
      .select({ id: s.containers.id, projectId: s.containers.projectId, workItemId: s.workItems.id })
      .from(s.containers)
      .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
      .where(
        and(
          eq(s.containers.id, containerId),
          eq(s.containers.projectId, slice.projectId),
          eq(s.containers.scope, 'library'),
          eq(s.containers.inLibrary, true),
          deliverableVisible(slice),
        ),
      )
      .limit(1);
    return row !== undefined && row.workItemId === null ? row : null;
  };

  const answer = async (containerId: string, projectId: string): Promise<GetContainerCurrencyResponse | null> => {
    const currency = (await readCurrencies(deps.db, [containerId])).get(containerId);
    if (currency === null || currency === undefined) return null;
    return { currency, intervalMonths: await intervalMonthsFor(deps.db, projectId, containerId) };
  };

  // the document page's Currency card
  app.get('/containers/:containerId/currency', container, async (c) => {
    const slice = c.get('slice');
    const row = await readable(slice, c.req.param('containerId'));
    if (row === null) return notFound(c);
    const body = await answer(row.id, row.projectId);
    return body === null ? notFound(c) : c.json(body satisfies GetContainerCurrencyResponse);
  });

  // "Confirm current" — the owner's super user
  app.post('/containers/:containerId/confirm-current', container, async (c) => {
    const slice = c.get('slice');
    // outside the owner organisation the container may not even be theirs to know of
    if (slice.membershipRole !== 'owner') return notFound(c);
    const row = await readable(slice, c.req.param('containerId'));
    if (row === null) return notFound(c);
    if (!ownerSuper(slice)) return forbidden(c);
    if (!(await confirmCurrent(deps.db, row.id, slice.participantId))) return notFound(c);
    const body = await answer(row.id, row.projectId);
    return body === null ? notFound(c) : c.json(body satisfies ConfirmCurrentResponse);
  });

  // ── the intervals ─────────────────────────────────────────────────────────
  const defaultsOf = async (projectId: string): Promise<GetRecheckDefaultsResponse> => {
    const rows = await deps.db
      .select({
        termId: s.recheckDefaults.termId,
        label: s.classificationTerms.label,
        months: s.recheckDefaults.intervalMonths,
        sort: s.classificationTerms.sortOrder,
      })
      .from(s.recheckDefaults)
      .leftJoin(s.classificationTerms, eq(s.classificationTerms.id, s.recheckDefaults.termId))
      .where(eq(s.recheckDefaults.projectId, projectId));
    rows.sort((a, b) => (a.termId === null ? 1 : 0) - (b.termId === null ? 1 : 0) || (a.sort ?? 0) - (b.sort ?? 0));
    return {
      defaults: rows.map((r) => ({
        termId: r.termId,
        label: r.termId === null ? 'Any other document' : (r.label ?? ''),
        intervalMonths: r.months,
      })),
    };
  };

  app.get('/projects/:projectId/recheck-defaults', project, async (c) => {
    return c.json(await defaultsOf(c.get('slice').projectId) satisfies GetRecheckDefaultsResponse);
  });

  app.patch('/projects/:projectId/recheck-defaults', project, async (c) => {
    const slice = c.get('slice');
    if (!ownerSuper(slice)) return forbidden(c);
    const parsed = patchRecheckDefaultsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);
    const existing = await defaultsOf(slice.projectId);
    const known = new Set(existing.defaults.map((d) => d.termId));
    // only the rows the project has; a new type's interval is not invented by a patch
    if (parsed.data.defaults.some((d) => !known.has(d.termId))) {
      return c.json({ error: 'invalid', detail: 'unknown_document_type' } satisfies ApiError, 400);
    }
    await deps.db.transaction(async (tx) => {
      for (const d of parsed.data.defaults) {
        await tx
          .update(s.recheckDefaults)
          .set({ intervalMonths: d.intervalMonths })
          .where(
            and(
              eq(s.recheckDefaults.projectId, slice.projectId),
              d.termId === null ? sql`${s.recheckDefaults.termId} is null` : eq(s.recheckDefaults.termId, d.termId),
            ),
          );
      }
    });
    return c.json(await defaultsOf(slice.projectId) satisfies GetRecheckDefaultsResponse);
  });

  return app;
}
