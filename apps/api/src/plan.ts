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
  patchContainerBody,
  shareDeliverableBody,
} from '@infora/contracts';
import type {
  ApiError,
  AppointmentGrant,
  DeliverableShare,
  GetPlanResponse,
  PlanRow,
  ReviewerGrant,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const conflict = (c: Context) => c.json({ error: 'conflict' } satisfies ApiError, 409);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
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
    return c.json({ items: await toPlanRows(deps.db, rows) } satisfies GetPlanResponse);
  });

  // A producing-organisation act (ADR-0033): the planned container + its
  // work item, status 'planned' — the "not yet produced" MIDP row (ADR-0008).
  app.post('/projects/:projectId/plan', project, async (c) => {
    const slice = c.get('slice');
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

  // The producing side writes its own author set (ADR-0017).
  app.post('/containers/:containerId/authors', async (c) => {
    const scopedCtx = await scoped(c, c.req.param('containerId'));
    if (!scopedCtx) return notFound(c);
    const { container, slice } = scopedCtx;
    if (container.producingOrganisationId !== slice.organisationId) return notFound(c);
    const body = grantAppointmentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
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
  // owner-made grant is auto-confirmed (ADR-0033).
  app.post('/containers/:containerId/reviewers', async (c) => {
    const scopedCtx = await scoped(c, c.req.param('containerId'));
    if (!scopedCtx) return notFound(c);
    const { container, slice } = scopedCtx;
    const isOwner = slice.membershipRole === 'owner';
    const isProducer = container.producingOrganisationId === slice.organisationId;
    if (!isOwner && !isProducer) return notFound(c);
    if (container.scope === 'sandbox' && !isProducer) return notFound(c);
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
    const scopedCtx = await scoped(c, grant.containerId);
    if (!scopedCtx) return notFound(c);
    const { container, slice } = scopedCtx;
    const isOwner = slice.membershipRole === 'owner';
    const proposerRetractingProposal =
      !grant.confirmedAt && container.producingOrganisationId === slice.organisationId;
    if (!isOwner && !proposerRetractingProposal) return notFound(c);
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
