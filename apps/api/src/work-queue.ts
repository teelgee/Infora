// T-467 — THE HOME AS A WORK QUEUE: one aggregating read per project.
//
// *In plain terms: the project home says what is waiting on you, each item one
// click from the screen where it is done; then the documents that moved most
// recently and the views you saved. The workspace home asks every project the
// same question and lists the answers together.*
//
// Every arm below is the query the screen it points to already runs, cut to
// the requester: the owner's super user sees proposals to confirm because the
// review status page would show them the Confirm button; a lead reviewer sees
// an appointment to accept because the undertaking card would ask; an
// organisation sees a transmittal to acknowledge because the library's panel
// would list it. Nothing here widens reach — a person who could not do the
// thing by hand is not told it is waiting.
import { Hono } from 'hono';
import { and, desc, eq, inArray, isNotNull, isNull, ne, notExists, sql } from 'drizzle-orm';
import type { GetWorkQueueResponse, RecentDocument, WorkQueueItem } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { canEditPlan } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { deliverableVisibleSql as deliverableVisible } from '@infora/knowledge';
import { mayIssueExternally } from './external-issue';
import { projectScope } from './requester';
import type { AppEnv } from './requester';

export function workQueueRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  app.get('/projects/:projectId/work-queue', project, async (c) => {
    const slice = c.get('slice');
    const [items, recent, views] = await Promise.all([queue(deps.db, slice), recentDocuments(deps.db, slice), savedViews(deps.db, slice)]);
    return c.json({ items, recent, views } satisfies GetWorkQueueResponse);
  });

  return app;
}

async function queue(db: Db, slice: EntitledSlice): Promise<WorkQueueItem[]> {
  const isOwner = slice.membershipRole === 'owner';
  const ownerSuper = isOwner && canEditPlan(slice);
  const items: WorkQueueItem[] = [];

  // the owner's super user confirms proposed reviewers (ADR-0033) — on the status page
  if (ownerSuper) {
    const proposed = await db
      .select({ containerId: s.containers.id, ref: s.containers.documentReference, name: s.users.name, isLead: s.deliverableReviewers.isLead, at: s.deliverableReviewers.grantedAt })
      .from(s.deliverableReviewers)
      .innerJoin(s.containers, eq(s.containers.id, s.deliverableReviewers.containerId))
      .innerJoin(s.participants, eq(s.participants.id, s.deliverableReviewers.participantId))
      .innerJoin(s.users, eq(s.users.id, s.participants.userId))
      .where(and(eq(s.containers.projectId, slice.projectId), isNull(s.deliverableReviewers.confirmedAt), isNull(s.deliverableReviewers.revokedAt), isNull(s.deliverableReviewers.declinedAt)))
      .orderBy(desc(s.deliverableReviewers.grantedAt));
    for (const p of proposed) {
      items.push({ kind: 'confirm_reviewer', label: `Confirm ${p.name} as ${p.isLead ? 'lead reviewer' : 'reviewer'} of ${p.ref ?? 'a deliverable'}`, href: `review/${p.containerId}`, at: p.at.toISOString() });
    }
  }

  // my own lead appointments awaiting my acceptance (T-372) — on the status page
  const mine = await db
    .select({ containerId: s.containers.id, ref: s.containers.documentReference, at: s.deliverableReviewers.grantedAt, confirmedAt: s.deliverableReviewers.confirmedAt })
    .from(s.deliverableReviewers)
    .innerJoin(s.containers, eq(s.containers.id, s.deliverableReviewers.containerId))
    .where(
      and(
        eq(s.containers.projectId, slice.projectId),
        eq(s.deliverableReviewers.participantId, slice.participantId),
        eq(s.deliverableReviewers.isLead, true),
        isNull(s.deliverableReviewers.acceptedAt),
        isNull(s.deliverableReviewers.declinedAt),
        isNull(s.deliverableReviewers.revokedAt),
      ),
    );
  for (const m of mine) {
    // outside the owner organisation the owner confirms first; until then there is nothing for the appointee to do
    if (!isOwner && m.confirmedAt === null) continue;
    items.push({ kind: 'accept_appointment', label: `Accept the lead review of ${m.ref ?? 'a deliverable'}`, href: `review/${m.containerId}`, at: m.at.toISOString() });
  }

  // transmittals my organisation has not acknowledged (ADR-0035) — on the library
  const pending = await db
    .select({ containerId: s.containers.id, ref: s.containers.documentReference, at: s.versions.createdAt })
    .from(s.containers)
    .innerJoin(s.versions, and(eq(s.versions.containerId, s.containers.id), eq(s.versions.isCurrent, true)))
    .innerJoin(s.deliverableShares, and(eq(s.deliverableShares.containerId, s.containers.id), eq(s.deliverableShares.organisationId, slice.organisationId), isNull(s.deliverableShares.revokedAt)))
    .where(
      and(
        eq(s.containers.projectId, slice.projectId),
        eq(s.containers.scope, 'library'),
        eq(s.containers.state, 'live'),
        ne(s.containers.producingOrganisationId, slice.organisationId),
        notExists(
          db
            .select({ x: sql`1` })
            .from(s.deliverableAcknowledgements)
            .where(and(eq(s.deliverableAcknowledgements.containerId, s.containers.id), eq(s.deliverableAcknowledgements.versionId, s.versions.id), eq(s.deliverableAcknowledgements.organisationId, slice.organisationId))),
        ),
      ),
    );
  for (const p of pending) items.push({ kind: 'acknowledge_transmittal', label: `Acknowledge ${p.ref ?? 'a transmittal'} for your organisation`, href: 'documents', at: p.at.toISOString() });

  // requests to issue outside the project, for whoever may approve (ADR-0055) — on the library
  const [proj] = await db.select({ permission: s.projects.externalIssuePermission }).from(s.projects).where(eq(s.projects.id, slice.projectId)).limit(1);
  if (proj && mayIssueExternally(slice, proj.permission)) {
    const asked = await db
      .select({ ref: s.containers.documentReference, name: s.externalRecipients.name, at: s.externalRecipients.createdAt })
      .from(s.externalRecipients)
      .innerJoin(s.containers, eq(s.containers.id, s.externalRecipients.containerId))
      .where(and(eq(s.containers.projectId, slice.projectId), eq(s.externalRecipients.state, 'requested')));
    for (const a of asked) items.push({ kind: 'approve_external_issue', label: `Decide the request to issue ${a.ref ?? 'a document'} to ${a.name}`, href: 'documents', at: a.at.toISOString() });
  }

  // proposed withdrawals awaiting the owner (ADR-0013 §2) — on the library
  if (ownerSuper) {
    const proposals = await db
      .select({ ref: s.containers.documentReference })
      .from(s.containers)
      .where(and(eq(s.containers.projectId, slice.projectId), eq(s.containers.inLibrary, true), eq(s.containers.state, 'live'), isNotNull(s.containers.withdrawnReason)));
    for (const p of proposals) items.push({ kind: 'decide_withdrawal', label: `Decide the proposed withdrawal of ${p.ref ?? 'a document'}`, href: `documents?q=${encodeURIComponent(p.ref ?? '')}`, at: null });
  }

  // comments without a response on rounds issued to deliverables I author — on the cycle
  const authored = await db
    .select({ containerId: s.deliverableAuthors.containerId })
    .from(s.deliverableAuthors)
    .innerJoin(s.containers, eq(s.containers.id, s.deliverableAuthors.containerId))
    .where(and(eq(s.containers.projectId, slice.projectId), eq(s.deliverableAuthors.participantId, slice.participantId), isNull(s.deliverableAuthors.revokedAt)));
  if (authored.length > 0) {
    const open = await db
      .select({ containerId: s.reviewCycles.containerId, ref: s.containers.documentReference, count: sql<number>`count(*)::int`, at: sql<Date>`max(${s.reviewComments.createdAt})` })
      .from(s.reviewComments)
      .innerJoin(s.rounds, eq(s.rounds.id, s.reviewComments.roundId))
      .innerJoin(s.reviewCycles, eq(s.reviewCycles.id, s.rounds.cycleId))
      .innerJoin(s.containers, eq(s.containers.id, s.reviewCycles.containerId))
      .where(
        and(
          inArray(s.reviewCycles.containerId, authored.map((a) => a.containerId)),
          eq(s.rounds.state, 'issued'),
          eq(s.reviewCycles.state, 'active'),
          notExists(db.select({ x: sql`1` }).from(s.responses).where(eq(s.responses.commentId, s.reviewComments.id))),
        ),
      )
      .groupBy(s.reviewCycles.containerId, s.containers.documentReference);
    for (const o of open) items.push({ kind: 'respond_to_comments', label: `Respond to ${o.count} comment${o.count === 1 ? '' : 's'} on ${o.ref ?? 'your deliverable'}`, href: `review/${o.containerId}/cycle`, count: o.count, at: o.at ? new Date(o.at).toISOString() : null });
  }

  // open findings on my organisation's working documents — in the editor
  const findings = await db
    .select({ documentId: s.sandboxDocuments.id, title: s.sandboxDocuments.title, count: sql<number>`count(*)::int`, at: sql<Date>`max(${s.findings.createdAt})` })
    .from(s.findings)
    .innerJoin(s.sandboxDocuments, eq(s.sandboxDocuments.id, s.findings.sandboxDocumentId))
    .innerJoin(s.sandboxes, eq(s.sandboxes.id, s.sandboxDocuments.sandboxId))
    .where(and(eq(s.sandboxes.projectId, slice.projectId), eq(s.sandboxes.owningOrganisationId, slice.organisationId), eq(s.findings.status, 'open'), isNull(s.sandboxDocuments.deletedAt)))
    .groupBy(s.sandboxDocuments.id, s.sandboxDocuments.title);
  for (const f of findings) items.push({ kind: 'close_findings', label: `Close ${f.count} open finding${f.count === 1 ? '' : 's'} on “${f.title}”`, href: `editor/${f.documentId}`, count: f.count, at: f.at ? new Date(f.at).toISOString() : null });

  return items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

async function recentDocuments(db: Db, slice: EntitledSlice): Promise<RecentDocument[]> {
  const library = await db
    .select({ containerId: s.containers.id, ref: s.containers.documentReference, title: sql<string | null>`coalesce(${s.workItems.title}, ${s.containers.title})`, at: s.versions.createdAt })
    .from(s.versions)
    .innerJoin(s.containers, eq(s.containers.id, s.versions.containerId))
    .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
    .where(and(eq(s.containers.projectId, slice.projectId), eq(s.containers.scope, 'library'), eq(s.versions.isCurrent, true), deliverableVisible(slice)))
    .orderBy(desc(s.versions.createdAt))
    .limit(6);
  const drafts = await db
    .select({ id: s.sandboxDocuments.id, title: s.sandboxDocuments.title, at: s.sandboxDocuments.updatedAt })
    .from(s.sandboxDocuments)
    .innerJoin(s.sandboxes, eq(s.sandboxes.id, s.sandboxDocuments.sandboxId))
    .where(and(eq(s.sandboxes.projectId, slice.projectId), eq(s.sandboxes.owningOrganisationId, slice.organisationId), isNull(s.sandboxDocuments.deletedAt)))
    .orderBy(desc(s.sandboxDocuments.updatedAt))
    .limit(4);
  const out: RecentDocument[] = [
    ...library.map((r): RecentDocument => ({ kind: 'library', label: r.title ?? r.ref ?? 'Document', reference: r.ref, href: `documents/${r.containerId}`, at: r.at.toISOString() })),
    ...drafts.map((d): RecentDocument => ({ kind: 'draft', label: d.title, reference: null, href: `editor/${d.id}`, at: d.at.toISOString() })),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
}

async function savedViews(db: Db, slice: EntitledSlice): Promise<GetWorkQueueResponse['views']> {
  const rows = await db
    .select()
    .from(s.savedViews)
    .where(
      and(
        eq(s.savedViews.projectId, slice.projectId),
        eq(s.savedViews.organisationId, slice.organisationId),
        sql`(${s.savedViews.participantId} = ${slice.participantId} or ${s.savedViews.shared} = true)`,
      ),
    )
    .orderBy(desc(s.savedViews.createdAt))
    .limit(8);
  return rows.map((v) => ({
    id: v.id,
    register: v.register as GetWorkQueueResponse['views'][number]['register'],
    name: v.name,
    filter: (v.filter ?? {}) as Record<string, unknown>,
    shared: v.shared,
    mine: v.participantId === slice.participantId,
  }));
}
