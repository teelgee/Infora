// T-120/T-123/T-124/T-126 — the review cycle over HTTP (ADR-0002/0005–0014/
// 0032, contracts §4). Promotion is the near-empty hand-off ("no wizard"):
// snapshot → immutable Version in the linked plan container; the first
// promotion launches the project cycle (round 1 opens, lock to the
// reviewers), a later one is the transmittal back from the respond phase.
// The cycle read applies ADR-0014 phasing server-side: the open round's
// comments are omitted for the authoring side; issued rounds are permanent.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  createReviewCommentBody,
  createReviewResponseBody,
  closeRejectedBody,
  issueRoundBody,
  patchReviewCommentBody,
  releaseCheckoutBody,
  setDeliverableCodeBody,
} from '@infora/contracts';
import type {
  AcceptanceCode,
  ApiError,
  GetCycleResponse,
  ListAcceptanceCodesResponse,
  PromotionResult,
  ReviewComment,
  ReviewCycle,
  ReviewResponseRecord,
  Round,
  TransmittalRecord,
} from '@infora/contracts';
// T-302 — a version is indexed at the moment it comes into existence: one
// targeted ingest, never a sweep of the corpus. Ingest excludes nothing —
// exclusion is retrieval's job (ADR-0022, T-033) — so every new version is
// indexed whether or not it currently grounds. Each call sits AFTER its
// transaction commits: an outbound embedding call has no business holding a
// database transaction open.
import { ingestVersion } from '@infora/data';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import type { EntitledSlice } from '@infora/governance';
import { generateRenditions } from './renditions';
import { refuseElevated } from './elevated';
import { loadSchemeOrDefault } from './naming';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const conflict = (c: Context, detail?: string) =>
  c.json({ error: 'conflict', ...(detail && { detail }) } satisfies ApiError, 409);
const forbidden = (c: Context, detail?: string) =>
  c.json({ error: 'forbidden', ...(detail && { detail }) } satisfies ApiError, 403);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

// ISO 19650 revision numbering (ADR-0041): P = preliminary/work-in-progress
// (issued for review, or promoted), C = contractual (accepted/published). Each is
// its own two-digit series on the container, independent of the sandbox working
// series (v0.x). The next revision counts the same-prefix references already
// issued on this container.
const nextRevision = (existingRefs: readonly string[], prefix: 'P' | 'C'): string =>
  `${prefix}${String(existingRefs.filter((r) => r.startsWith(prefix)).length + 1).padStart(2, '0')}`;

type ContainerRow = typeof s.containers.$inferSelect;

/** producer | owner | live share — who may see the deliverable and its DRR.
 * A sandbox-scope (freeze-series) container is org-private machinery: the
 * producing organisation only, never the owner, never a share (ADR-0032). */
async function canSeeContainer(db: Db, slice: EntitledSlice, container: ContainerRow) {
  if (container.scope === 'sandbox') {
    return container.producingOrganisationId === slice.organisationId;
  }
  if (container.producingOrganisationId === slice.organisationId) return true;
  const [project] = await db
    .select({ ownerOrganisationId: s.projects.ownerOrganisationId })
    .from(s.projects)
    .where(eq(s.projects.id, container.projectId))
    .limit(1);
  if (project?.ownerOrganisationId === slice.organisationId) return true;
  const [share] = await db
    .select({ id: s.deliverableShares.id })
    .from(s.deliverableShares)
    .where(
      and(
        eq(s.deliverableShares.containerId, container.id),
        eq(s.deliverableShares.organisationId, slice.organisationId),
        isNull(s.deliverableShares.revokedAt),
      ),
    )
    .limit(1);
  return share !== undefined;
}

export async function isLiveConfirmedReviewer(db: Db, containerId: string, participantId: string) {
  const [row] = await db
    .select({ id: s.deliverableReviewers.id, isLead: s.deliverableReviewers.isLead })
    .from(s.deliverableReviewers)
    .where(
      and(
        eq(s.deliverableReviewers.containerId, containerId),
        eq(s.deliverableReviewers.participantId, participantId),
        isNull(s.deliverableReviewers.revokedAt),
        sql`${s.deliverableReviewers.confirmedAt} IS NOT NULL`,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function isLiveAuthor(db: Db, containerId: string, participantId: string) {
  const [row] = await db
    .select({ id: s.deliverableAuthors.id, isLead: s.deliverableAuthors.isLead })
    .from(s.deliverableAuthors)
    .where(
      and(
        eq(s.deliverableAuthors.containerId, containerId),
        eq(s.deliverableAuthors.participantId, participantId),
        isNull(s.deliverableAuthors.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

function toAcceptanceCode(row: typeof s.acceptanceCodes.$inferSelect): AcceptanceCode {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    level: row.level,
    isAccepting: row.isAccepting,
    sortOrder: row.sortOrder,
    retiredAt: row.retiredAt?.toISOString() ?? null,
  };
}

/** The full cycle read with ADR-0014 phasing for this requester. */
export async function readCycle(
  db: Db,
  container: ContainerRow,
  slice: EntitledSlice,
): Promise<ReviewCycle | null> {
  const [cycle] = await db
    .select()
    .from(s.reviewCycles)
    .where(eq(s.reviewCycles.containerId, container.id))
    .orderBy(sql`${s.reviewCycles.launchedAt} desc`)
    .limit(1);
  if (!cycle) return null;

  const roundRows = await db
    .select({ round: s.rounds, versionReference: s.versions.versionReference })
    .from(s.rounds)
    .innerJoin(s.versions, eq(s.rounds.versionId, s.versions.id))
    .where(eq(s.rounds.cycleId, cycle.id))
    .orderBy(asc(s.rounds.number));
  const roundIds = roundRows.map((r) => r.round.id);

  // the authoring side never sees the open round's comments (ADR-0014) —
  // unless the requester is themselves a confirmed live reviewer
  const requesterIsReviewer =
    (await isLiveConfirmedReviewer(db, container.id, slice.participantId)) !== null;
  const authoringSide =
    container.producingOrganisationId === slice.organisationId && !requesterIsReviewer;

  const commentRows = roundIds.length
    ? await db
        .select({ comment: s.reviewComments, authorName: s.users.name })
        .from(s.reviewComments)
        .innerJoin(s.participants, eq(s.reviewComments.authorParticipantId, s.participants.id))
        .innerJoin(s.users, eq(s.participants.userId, s.users.id))
        .where(inArray(s.reviewComments.roundId, roundIds))
        .orderBy(asc(s.reviewComments.createdAt))
    : [];
  const responseRows = commentRows.length
    ? await db
        .select({ response: s.responses, authorName: s.users.name })
        .from(s.responses)
        .innerJoin(s.participants, eq(s.responses.authorParticipantId, s.participants.id))
        .innerJoin(s.users, eq(s.participants.userId, s.users.id))
        .where(
          inArray(
            s.responses.commentId,
            commentRows.map((r) => r.comment.id),
          ),
        )
    : [];
  const transmittalRows = roundIds.length
    ? await db
        .select({ transmittal: s.transmittals, senderName: s.users.name })
        .from(s.transmittals)
        .innerJoin(s.participants, eq(s.transmittals.senderParticipantId, s.participants.id))
        .innerJoin(s.users, eq(s.participants.userId, s.users.id))
        .where(inArray(s.transmittals.roundId, roundIds))
        .orderBy(asc(s.transmittals.issuedAt))
    : [];
  const codeRows = await db
    .select()
    .from(s.acceptanceCodes)
    .where(eq(s.acceptanceCodes.projectId, container.projectId));
  const codeById = new Map(codeRows.map((r) => [r.id, r]));

  const responseByComment = new Map<string, ReviewResponseRecord>();
  for (const r of responseRows) {
    responseByComment.set(r.response.commentId, {
      id: r.response.id,
      commentId: r.response.commentId,
      author: { participantId: r.response.authorParticipantId, name: r.authorName },
      body: r.response.body,
      nextVersionId: r.response.nextVersionId,
      nextVersionAnchor: (r.response.nextVersionAnchor as ReviewResponseRecord['nextVersionAnchor']) ?? null,
      noChangeReason: r.response.noChangeReason,
      createdAt: r.response.createdAt.toISOString(),
    });
  }

  const rounds: Round[] = roundRows.map(({ round, versionReference }) => {
    const hideComments = authoringSide && round.state === 'open';
    const comments: ReviewComment[] = hideComments
      ? []
      : commentRows
          .filter((r) => r.comment.roundId === round.id)
          .map(({ comment, authorName }) => {
            const code = comment.acceptanceCodeId ? codeById.get(comment.acceptanceCodeId) : null;
            return {
              id: comment.id,
              roundId: comment.roundId,
              versionId: comment.versionId,
              author: { participantId: comment.authorParticipantId, name: authorName },
              body: comment.body,
              acceptanceCode: code ? { id: code.id, code: code.code } : null,
              anchor: (comment.anchor as ReviewComment['anchor']) ?? null,
              createdAt: comment.createdAt.toISOString(),
              response: responseByComment.get(comment.id) ?? null,
            };
          });
    const transmittals: TransmittalRecord[] = transmittalRows
      // review transmittals only — a non_review transmittal (ADR-0035 §1) has a
      // null round_id and never belongs to a cycle, so this filter excludes it
      // and round_id/direction are non-null on what remains
      .filter((r) => r.transmittal.roundId === round.id)
      .map(({ transmittal, senderName }) => ({
        id: transmittal.id,
        roundId: transmittal.roundId!,
        direction: transmittal.direction!,
        sender: { participantId: transmittal.senderParticipantId, name: senderName },
        recipients: transmittal.recipients,
        purposeCode: transmittal.purposeCode,
        issuedAt: transmittal.issuedAt.toISOString(),
        dueAt: transmittal.dueAt?.toISOString() ?? null,
      }));
    const deliverableCode = round.deliverableCodeId ? codeById.get(round.deliverableCodeId) : null;
    return {
      id: round.id,
      number: round.number,
      versionId: round.versionId,
      versionReference,
      state: round.state,
      reviewPeriodTarget: round.reviewPeriodTarget?.toISOString() ?? null,
      deliverableCode: deliverableCode ? toAcceptanceCode(deliverableCode) : null,
      comments,
      transmittals,
    };
  });

  return {
    id: cycle.id,
    containerId: cycle.containerId,
    state: cycle.state,
    editLockHolder: cycle.editLockHolder,
    launchedAt: cycle.launchedAt.toISOString(),
    closedAt: cycle.closedAt?.toISOString() ?? null,
    closedReason: cycle.closedReason ?? null,
    rounds,
  };
}

/** Frozen comment/response state for a transmittal snapshot (ADR-0009). */
export async function snapshotState(db: Db, roundId: string) {
  const comments = await db
    .select()
    .from(s.reviewComments)
    .where(eq(s.reviewComments.roundId, roundId))
    .orderBy(asc(s.reviewComments.createdAt));
  const responses = comments.length
    ? await db
        .select()
        .from(s.responses)
        .where(
          inArray(
            s.responses.commentId,
            comments.map((r) => r.id),
          ),
        )
    : [];
  return { comments, responses };
}

export function cycleRoutes(deps: { db: Db; router: Router }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  app.get('/projects/:projectId/acceptance-codes', project, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select()
      .from(s.acceptanceCodes)
      .where(eq(s.acceptanceCodes.projectId, slice.projectId))
      .orderBy(asc(s.acceptanceCodes.sortOrder));
    return c.json({ items: rows.map(toAcceptanceCode) } satisfies ListAcceptanceCodesResponse);
  });

  app.get('/containers/:containerId/cycle', async (c) => {
    const containerId = c.req.param('containerId');
    if (!isUuid(containerId)) return notFound(c);
    const [container] = await deps.db
      .select()
      .from(s.containers)
      .where(eq(s.containers.id, containerId))
      .limit(1);
    if (!container) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), container.projectId);
    if (!slice || !(await canSeeContainer(deps.db, slice, container))) return notFound(c);
    const cycle = await readCycle(deps.db, container, slice);
    return c.json(cycle satisfies GetCycleResponse);
  });

  // T-125 — Freeze ("check out"): snapshot the head into the document's
  // org-private freeze series (ADR-0032). Promotion's twin: when the freeze
  // container carries a confirmed lead reviewer, the freeze also opens the
  // internal round (first freeze without one is a plain snapshot). While a
  // sandbox-scope round is open the head locks; issue releases it.
  app.post('/sandbox-documents/:id/freeze', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return notFound(c);
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, id))
      .limit(1);
    if (!doc) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), doc.projectId);
    if (!slice || doc.organisationId !== slice.organisationId) return notFound(c);

    let [freezeContainer] = await deps.db
      .select()
      .from(s.containers)
      .where(eq(s.containers.sandboxDocumentId, doc.id))
      .limit(1);
    if (!freezeContainer) {
      [freezeContainer] = await deps.db
        .insert(s.containers)
        .values({
          projectId: doc.projectId,
          scope: 'sandbox',
          producingOrganisationId: doc.organisationId,
          sandboxDocumentId: doc.id,
          inLibrary: false,
        })
        .returning();
    }

    const reviewers = await deps.db
      .select({ participantId: s.deliverableReviewers.participantId, isLead: s.deliverableReviewers.isLead })
      .from(s.deliverableReviewers)
      .where(
        and(
          eq(s.deliverableReviewers.containerId, freezeContainer!.id),
          isNull(s.deliverableReviewers.revokedAt),
          sql`${s.deliverableReviewers.confirmedAt} IS NOT NULL`,
        ),
      );
    const hasLead = reviewers.some((r) => r.isLead);

    const [activeCycle] = await deps.db
      .select()
      .from(s.reviewCycles)
      .where(and(eq(s.reviewCycles.containerId, freezeContainer!.id), eq(s.reviewCycles.state, 'active')))
      .limit(1);
    const priorRounds = activeCycle
      ? await deps.db.select().from(s.rounds).where(eq(s.rounds.cycleId, activeCycle.id)).orderBy(asc(s.rounds.number))
      : [];
    const latestRound = priorRounds.at(-1);
    if (activeCycle && latestRound?.state === 'open') return conflict(c, 'round_open');
    if (activeCycle && latestRound?.state === 'issued') {
      const [unanswered] = await deps.db
        .select({ id: s.reviewComments.id })
        .from(s.reviewComments)
        .leftJoin(s.responses, eq(s.responses.commentId, s.reviewComments.id))
        .where(and(eq(s.reviewComments.roundId, latestRound.id), isNull(s.responses.id)))
        .limit(1);
      if (unanswered) return conflict(c, 'unanswered_comments');
    }
    // a plain check-out already holds the head; a redundant plain re-freeze would
    // only stack snapshots — release it first (T-180). A freeze that opens an
    // internal round (hasLead) is still allowed: it upgrades the standalone
    // check-out into a formal round on the same locked head.
    if (doc.headLocked && !activeCycle && !hasLead) return conflict(c, 'already_checked_out');

    // the ISO 19650 scheme (ADR-0041): whilst in the sandbox a document runs the
    // working series v0.x; it earns a P revision only when it is issued into a
    // formal review cycle (or promoted). So a plain check-out freezes the current
    // working revision under its v0.x number; a freeze that opens an internal round
    // issues the next P.
    const existingRefs = (
      await deps.db
        .select({ ref: s.versions.versionReference })
        .from(s.versions)
        .where(eq(s.versions.containerId, freezeContainer!.id))
    ).map((r) => r.ref);
    let versionReference: string;
    if (hasLead) {
      versionReference = nextRevision(existingRefs, 'P');
    } else {
      const ambient = await deps.db
        .select({ id: s.sandboxDocumentVersions.id })
        .from(s.sandboxDocumentVersions)
        .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, doc.id));
      versionReference = `v0.${Math.max(1, ambient.length)}`;
    }

    const result = await deps.db.transaction(async (tx) => {
      await tx
        .update(s.versions)
        .set({ isCurrent: false })
        .where(and(eq(s.versions.containerId, freezeContainer!.id), eq(s.versions.isCurrent, true)));
      const [version] = await tx
        .insert(s.versions)
        .values({
          containerId: freezeContainer!.id,
          versionReference,
          content: doc.content,
          isCurrent: true,
        })
        .returning();
      if (hasLead) {
        let cycleId: string;
        let roundNumber: number;
        if (activeCycle) {
          cycleId = activeCycle.id;
          roundNumber = latestRound!.number + 1;
          await tx.update(s.rounds).set({ state: 'responded' }).where(eq(s.rounds.id, latestRound!.id));
          await tx
            .update(s.reviewCycles)
            .set({ editLockHolder: 'reviewing' })
            .where(eq(s.reviewCycles.id, activeCycle.id));
        } else {
          const [cycle] = await tx
            .insert(s.reviewCycles)
            .values({ containerId: freezeContainer!.id })
            .returning();
          cycleId = cycle!.id;
          roundNumber = 1;
        }
        const [round] = await tx
          .insert(s.rounds)
          .values({ cycleId, number: roundNumber, versionId: version!.id })
          .returning();
        const [transmittal] = await tx
          .insert(s.transmittals)
          .values({
            roundId: round!.id,
            direction: 'return',
            senderParticipantId: slice.participantId,
            recipients: reviewers.map((r) => r.participantId),
          })
          .returning();
        await tx.insert(s.reviewSnapshots).values({
          transmittalId: transmittal!.id,
          content: activeCycle && latestRound ? await snapshotState(tx as unknown as Db, latestRound.id) : { comments: [], responses: [] },
        });
      }
      // the check-out: every freeze locks the head, whether or not it opened an
      // internal round — the standalone freeze and the review-round freeze are one
      // mechanism now (ADR-0032 addendum, T-180). Audited both ways.
      await tx.update(s.sandboxDocuments).set({ headLocked: true }).where(eq(s.sandboxDocuments.id, doc.id));
      await tx.insert(s.sandboxCheckoutEvents).values({
        sandboxDocumentId: doc.id,
        action: 'checked_out',
        byParticipantId: slice.participantId,
      });
      return { versionId: version!.id, versionReference, containerId: freezeContainer!.id };
    });
    await generateRenditions(deps.db, { id: result.versionId, content: doc.content }, doc);
    await ingestVersion(deps.db, deps.router, result.versionId);
    return c.json(result, 201);
  });

  // T-180 — Release ("check in"): the audited unlock of a standalone check-out
  // (ADR-0032's "audited early release"). Only valid on a plain check-out — while
  // an internal round is open, the round's issue / close is the release (one
  // head-lock mechanism, two triggers). The participant who checked it out, a live
  // lead reviewer of the freeze series, or an elevated super-user may release.
  app.post('/sandbox-documents/:id/release', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return notFound(c);
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, id))
      .limit(1);
    if (!doc) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), doc.projectId);
    if (!slice || doc.organisationId !== slice.organisationId) return notFound(c);
    if (!doc.headLocked) return conflict(c, 'not_locked');

    const [freezeContainer] = await deps.db
      .select()
      .from(s.containers)
      .where(eq(s.containers.sandboxDocumentId, doc.id))
      .limit(1);
    let lead: Awaited<ReturnType<typeof isLiveConfirmedReviewer>> = null;
    if (freezeContainer) {
      // an open internal round owns the lock — it releases through the review flow
      const [activeCycle] = await deps.db
        .select({ id: s.reviewCycles.id })
        .from(s.reviewCycles)
        .where(and(eq(s.reviewCycles.containerId, freezeContainer.id), eq(s.reviewCycles.state, 'active')))
        .limit(1);
      if (activeCycle) {
        const [openRound] = await deps.db
          .select({ id: s.rounds.id })
          .from(s.rounds)
          .where(and(eq(s.rounds.cycleId, activeCycle.id), eq(s.rounds.state, 'open')))
          .limit(1);
        if (openRound) return conflict(c, 'round_open');
      }
      lead = await isLiveConfirmedReviewer(deps.db, freezeContainer.id, slice.participantId);
    }

    const parsed = releaseCheckoutBody.safeParse(await c.req.json().catch(() => ({})));
    const reason = parsed.success ? parsed.data.reason ?? null : null;

    const [lastCheckout] = await deps.db
      .select({ by: s.sandboxCheckoutEvents.byParticipantId })
      .from(s.sandboxCheckoutEvents)
      .where(
        and(
          eq(s.sandboxCheckoutEvents.sandboxDocumentId, doc.id),
          eq(s.sandboxCheckoutEvents.action, 'checked_out'),
        ),
      )
      .orderBy(sql`${s.sandboxCheckoutEvents.createdAt} desc`)
      .limit(1);
    const mayRelease =
      slice.elevated || (lead?.isLead ?? false) || lastCheckout?.by === slice.participantId;
    if (!mayRelease) return forbidden(c, 'release_not_permitted');

    await deps.db.transaction(async (tx) => {
      await tx.update(s.sandboxDocuments).set({ headLocked: false }).where(eq(s.sandboxDocuments.id, doc.id));
      await tx.insert(s.sandboxCheckoutEvents).values({
        sandboxDocumentId: doc.id,
        action: 'released',
        byParticipantId: slice.participantId,
        reason,
      });
    });
    return c.json({ ok: true });
  });

  // T-120 — Promote: the lead author's near-empty hand-off (ADR-0008/0017).
  app.post('/sandbox-documents/:id/promotion', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return notFound(c);
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, id))
      .limit(1);
    if (!doc) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), doc.projectId);
    // the document lives in its organisation's private sandbox
    if (!slice || doc.organisationId !== slice.organisationId) return notFound(c);
    if (!doc.containerId) {
      return c.json(
        { error: 'invalid', detail: 'unplanned_document' } satisfies ApiError,
        400,
      );
    }
    const [container] = await deps.db
      .select()
      .from(s.containers)
      .where(eq(s.containers.id, doc.containerId))
      .limit(1);
    if (!container || container.scope !== 'library') return notFound(c);

    // only the lead author promotes (ADR-0017)
    const author = await isLiveAuthor(deps.db, container.id, slice.participantId);
    if (!author?.isLead) return forbidden(c, 'lead_author_only');

    // a cycle cannot run without its lead reviewer (ADR-0005/0008)
    const reviewers = await deps.db
      .select({ id: s.deliverableReviewers.id, isLead: s.deliverableReviewers.isLead, participantId: s.deliverableReviewers.participantId })
      .from(s.deliverableReviewers)
      .where(
        and(
          eq(s.deliverableReviewers.containerId, container.id),
          isNull(s.deliverableReviewers.revokedAt),
          sql`${s.deliverableReviewers.confirmedAt} IS NOT NULL`,
        ),
      );
    if (!reviewers.some((r) => r.isLead)) return conflict(c, 'no_lead_reviewer');

    // schema-required appointment roles must be filled before promotion (T-198).
    // The lead reviewer is always mandatory (above); the owner's schema can also
    // make author / document owner / reviewer required. Opt-in — the default
    // marks none required, so this adds no gate unless the owner sets one.
    const scheme = await loadSchemeOrDefault(deps.db, doc.projectId);
    const requiredRoles = new Set(scheme.fields.filter((f) => f.role && f.required).map((f) => f.role));
    if (requiredRoles.has('author')) {
      const [anyAuthor] = await deps.db
        .select({ id: s.deliverableAuthors.id })
        .from(s.deliverableAuthors)
        .where(and(eq(s.deliverableAuthors.containerId, container.id), isNull(s.deliverableAuthors.revokedAt)))
        .limit(1);
      if (!anyAuthor) return conflict(c, 'no_author');
    }
    if (requiredRoles.has('document_owner') && !container.documentOwnerParticipantId) {
      return conflict(c, 'no_document_owner');
    }
    if (requiredRoles.has('reviewer') && reviewers.length === 0) {
      return conflict(c, 'no_reviewer');
    }

    const [existingCycle] = await deps.db
      .select()
      .from(s.reviewCycles)
      .where(and(eq(s.reviewCycles.containerId, container.id), eq(s.reviewCycles.state, 'active')))
      .limit(1);

    const priorRounds = existingCycle
      ? await deps.db
          .select()
          .from(s.rounds)
          .where(eq(s.rounds.cycleId, existingCycle.id))
          .orderBy(asc(s.rounds.number))
      : [];
    const latestRound = priorRounds.at(-1);
    if (existingCycle) {
      // transmittal back happens from the respond phase only (ADR-0014)
      if (!latestRound || latestRound.state !== 'issued') {
        return conflict(c, 'round_not_in_respond_phase');
      }
      // every comment answered before vN+1 (ADR-0004's mandatory response)
      const [unanswered] = await deps.db
        .select({ id: s.reviewComments.id })
        .from(s.reviewComments)
        .leftJoin(s.responses, eq(s.responses.commentId, s.reviewComments.id))
        .where(and(eq(s.reviewComments.roundId, latestRound.id), isNull(s.responses.id)))
        .limit(1);
      if (unanswered) return conflict(c, 'unanswered_comments');
    }

    // ADR-0032's two legal sources: the live head, or the QA-accepted frozen
    // version — never a head drifting past an active internal cycle
    let sourceContent = doc.content;
    const [freezeContainer] = await deps.db
      .select()
      .from(s.containers)
      .where(eq(s.containers.sandboxDocumentId, doc.id))
      .limit(1);
    if (freezeContainer) {
      const [latestFreezeCycle] = await deps.db
        .select()
        .from(s.reviewCycles)
        .where(eq(s.reviewCycles.containerId, freezeContainer.id))
        .orderBy(sql`${s.reviewCycles.launchedAt} desc`)
        .limit(1);
      if (latestFreezeCycle?.state === 'active') return conflict(c, 'internal_cycle_active');
      if (latestFreezeCycle?.state === 'accepted') {
        const [acceptedRound] = await deps.db
          .select({ content: s.versions.content })
          .from(s.rounds)
          .innerJoin(s.versions, eq(s.rounds.versionId, s.versions.id))
          .where(eq(s.rounds.cycleId, latestFreezeCycle.id))
          .orderBy(sql`${s.rounds.number} desc`)
          .limit(1);
        if (acceptedRound) sourceContent = acceptedRound.content;
      }
    }

    // promotion issues a P revision (issued for review, or promoted without
    // review) — the working v0.x series stays in the sandbox (ADR-0041)
    const existingRefs = (
      await deps.db
        .select({ ref: s.versions.versionReference })
        .from(s.versions)
        .where(eq(s.versions.containerId, container.id))
    ).map((r) => r.ref);
    const versionReference = nextRevision(existingRefs, 'P');

    const result = await deps.db.transaction(async (tx) => {
      // currency moves to the new version (the 0013 carve-out)
      await tx
        .update(s.versions)
        .set({ isCurrent: false })
        .where(and(eq(s.versions.containerId, container.id), eq(s.versions.isCurrent, true)));
      const [version] = await tx
        .insert(s.versions)
        .values({
          containerId: container.id,
          versionReference,
          content: sourceContent, // head snapshot, or the QA-accepted frozen version
          isCurrent: true,
        })
        .returning();

      let cycleId: string;
      let roundNumber: number;
      if (existingCycle) {
        cycleId = existingCycle.id;
        roundNumber = latestRound!.number + 1;
        await tx
          .update(s.rounds)
          .set({ state: 'responded' })
          .where(eq(s.rounds.id, latestRound!.id));
        await tx
          .update(s.reviewCycles)
          .set({ editLockHolder: 'reviewing' })
          .where(eq(s.reviewCycles.id, existingCycle.id));
      } else {
        const [cycle] = await tx
          .insert(s.reviewCycles)
          .values({ containerId: container.id })
          .returning();
        cycleId = cycle!.id;
        roundNumber = 1;
      }
      const [round] = await tx
        .insert(s.rounds)
        .values({ cycleId, number: roundNumber, versionId: version!.id })
        .returning();
      // the promotion IS the transmittal to review (ADR-0010/0014)
      const [transmittal] = await tx
        .insert(s.transmittals)
        .values({
          roundId: round!.id,
          direction: 'return',
          senderParticipantId: slice.participantId,
          recipients: reviewers.map((r) => r.participantId),
        })
        .returning();
      await tx.insert(s.reviewSnapshots).values({
        transmittalId: transmittal!.id,
        content: existingCycle ? await snapshotState(tx as unknown as Db, latestRound!.id) : { comments: [], responses: [] },
      });
      // the work item's status is event-driven (ADR-0032 addendum)
      await tx
        .update(s.workItems)
        .set({ status: 'in_review' })
        .where(eq(s.workItems.containerId, container.id));
      return {
        versionId: version!.id,
        versionReference,
        cycleId,
        roundId: round!.id,
        roundNumber,
      } satisfies PromotionResult;
    });
    // the record's renditions, generated beside the version (T-121, ADR-0034)
    await generateRenditions(deps.db, { id: result.versionId, content: sourceContent }, doc);
    await ingestVersion(deps.db, deps.router, result.versionId);

    return c.json(result, 201);
  });

  // ── The round loop (T-123/T-124/T-126) ───────────────────────────────────

  /** Load a round with its container, resolve the requester, check sight. */
  async function roundScope(c: Context, roundId: string) {
    if (!isUuid(roundId)) return null;
    const [row] = await deps.db
      .select({ round: s.rounds, cycle: s.reviewCycles, container: s.containers })
      .from(s.rounds)
      .innerJoin(s.reviewCycles, eq(s.rounds.cycleId, s.reviewCycles.id))
      .innerJoin(s.containers, eq(s.reviewCycles.containerId, s.containers.id))
      .where(eq(s.rounds.id, roundId))
      .limit(1);
    if (!row) return null;
    const slice = await resolveSlice(deps.db, c.get('user'), row.container.projectId);
    if (!slice || !(await canSeeContainer(deps.db, slice, row.container))) return null;
    return { ...row, slice };
  }

  // Reviewers comment while the round is open (ADR-0007/0014); comments are
  // live and cross-organisation within the group.
  app.post('/rounds/:roundId/comments', async (c) => {
    const scope = await roundScope(c, c.req.param('roundId'));
    if (!scope) return notFound(c);
    const { round, container, slice } = scope;
    const reviewer = await isLiveConfirmedReviewer(deps.db, container.id, slice.participantId);
    if (!reviewer) return forbidden(c, 'reviewers_only');
    if (round.state !== 'open') return conflict(c, 'round_not_open');
    const body = createReviewCommentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);
    if (body.data.acceptanceCodeId && !(await codeUsable(body.data.acceptanceCodeId, container.projectId, 'comment'))) {
      return c.json({ error: 'invalid', detail: 'unknown_code' } satisfies ApiError, 400);
    }
    const [comment] = await deps.db
      .insert(s.reviewComments)
      .values({
        roundId: round.id,
        versionId: round.versionId,
        authorParticipantId: slice.participantId,
        body: body.data.body,
        acceptanceCodeId: body.data.acceptanceCodeId ?? null,
        anchor: body.data.anchor ?? null,
      })
      .returning();
    return c.json(await commentRead(deps.db, comment!.id), 201);
  });

  // Moderation while open: the author their own, the lead reviewer any
  // (ADR-0007); the DB itself freezes the round at issue.
  app.patch('/review-comments/:commentId', async (c) => {
    const commentId = c.req.param('commentId');
    if (!isUuid(commentId)) return notFound(c);
    const [comment] = await deps.db
      .select()
      .from(s.reviewComments)
      .where(eq(s.reviewComments.id, commentId))
      .limit(1);
    if (!comment) return notFound(c);
    const scope = await roundScope(c, comment.roundId);
    if (!scope) return notFound(c);
    const { round, container, slice } = scope;
    if (round.state !== 'open') return conflict(c, 'round_not_open');
    const reviewer = await isLiveConfirmedReviewer(deps.db, container.id, slice.participantId);
    const mayModerate =
      comment.authorParticipantId === slice.participantId || (reviewer?.isLead ?? false);
    if (!reviewer || !mayModerate) return forbidden(c, 'author_or_lead_reviewer');
    const body = patchReviewCommentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);
    await deps.db
      .update(s.reviewComments)
      .set({
        ...(body.data.body !== undefined && { body: body.data.body }),
        ...(body.data.acceptanceCodeId !== undefined && { acceptanceCodeId: body.data.acceptanceCodeId }),
        ...(body.data.anchor !== undefined && { anchor: body.data.anchor }),
      })
      .where(eq(s.reviewComments.id, comment.id));
    return c.json(await commentRead(deps.db, comment.id));
  });

  // The lead reviewer's authoritative per-round verdict (ADR-0003).
  app.post('/rounds/:roundId/deliverable-code', async (c) => {
    const scope = await roundScope(c, c.req.param('roundId'));
    if (!scope) return notFound(c);
    const { round, container, slice } = scope;
    const reviewer = await isLiveConfirmedReviewer(deps.db, container.id, slice.participantId);
    if (!reviewer?.isLead) return forbidden(c, 'lead_reviewer_only');
    if (round.state !== 'open') return conflict(c, 'round_not_open');
    const body = setDeliverableCodeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);
    if (!(await codeUsable(body.data.acceptanceCodeId, container.projectId, 'deliverable'))) {
      return c.json({ error: 'invalid', detail: 'unknown_code' } satisfies ApiError, 400);
    }
    await deps.db
      .update(s.rounds)
      .set({ deliverableCodeId: body.data.acceptanceCodeId })
      .where(eq(s.rounds.id, round.id));
    const cycle = await readCycle(deps.db, container, slice);
    return c.json(cycle!.rounds.find((r) => r.id === round.id)!);
  });

  // The lead reviewer closes and issues (ADR-0005/0009/0010/0014): the
  // transmittal records the audit facts, the snapshot freezes, the round is
  // revealed and the lock flips — or an accepting code closes the cycle:
  // the work item accepts and the version auto-admits to grounding (T-126).
  app.post('/rounds/:roundId/issue', async (c) => {
    const scope = await roundScope(c, c.req.param('roundId'));
    if (!scope) return notFound(c);
    const { round, cycle, container, slice } = scope;
    const reviewer = await isLiveConfirmedReviewer(deps.db, container.id, slice.participantId);
    if (!reviewer?.isLead) return forbidden(c, 'lead_reviewer_only');
    if (round.state !== 'open') return conflict(c, 'round_not_open');
    const body = issueRoundBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);

    const [code] = round.deliverableCodeId
      ? await deps.db
          .select()
          .from(s.acceptanceCodes)
          .where(eq(s.acceptanceCodes.id, round.deliverableCodeId))
          .limit(1)
      : [];
    const accepting = code?.isAccepting ?? false;

    const authors = await deps.db
      .select({ participantId: s.deliverableAuthors.participantId })
      .from(s.deliverableAuthors)
      .where(and(eq(s.deliverableAuthors.containerId, container.id), isNull(s.deliverableAuthors.revokedAt)));

    // the contractual C-revision issued on a client acceptance (set inside the tx)
    let contractual: { id: string; content: string } | null = null;
    const transmittalId = await deps.db.transaction(async (tx) => {
      const [transmittal] = await tx
        .insert(s.transmittals)
        .values({
          roundId: round.id,
          direction: 'issue',
          senderParticipantId: slice.participantId,
          recipients: authors.map((a) => a.participantId),
          purposeCode: body.data.purposeCode ?? null,
          dueAt: body.data.dueAt ? new Date(body.data.dueAt) : null,
        })
        .returning();
      await tx
        .insert(s.reviewSnapshots)
        .values({ transmittalId: transmittal!.id, content: await snapshotState(tx as unknown as Db, round.id) });
      await tx.update(s.rounds).set({ state: 'issued' }).where(eq(s.rounds.id, round.id));
      if (container.scope === 'sandbox' && container.sandboxDocumentId) {
        // issue hands the pen back: the check-out lock releases (ADR-0032), audited
        // on the same trail as a standalone release (T-180)
        await tx
          .update(s.sandboxDocuments)
          .set({ headLocked: false })
          .where(eq(s.sandboxDocuments.id, container.sandboxDocumentId));
        await tx.insert(s.sandboxCheckoutEvents).values({
          sandboxDocumentId: container.sandboxDocumentId,
          action: 'released',
          byParticipantId: slice.participantId,
        });
      }
      if (accepting) {
        await tx
          .update(s.reviewCycles)
          .set({
            state: 'accepted',
            closedByParticipantId: slice.participantId,
            closedAt: sql`now()`,
          })
          .where(eq(s.reviewCycles.id, cycle.id));
        await tx
          .update(s.workItems)
          .set({ status: 'accepted' })
          .where(eq(s.workItems.containerId, container.id));
        // acceptance admits a LIBRARY deliverable to the grounded corpus
        // (ADR-0003/0011/0013); a sandbox-scope (internal QA) acceptance is
        // producer-private evidence and never grounds (ADR-0032)
        if (container.scope === 'library') {
          await tx
            .update(s.containers)
            .set({ inLibrary: true })
            .where(eq(s.containers.id, container.id));
          // ISO 19650 (ADR-0041): client acceptance issues the CONTRACTUAL
          // revision — a new immutable C-version of the accepted content, made
          // current so the library/plan/retrieval all read the published revision.
          // (The reviewed P-version keeps its P reference; version_reference is
          // immutable, T-008/0013, so C is a fresh issue, not a relabel.)
          const [accepted] = await tx
            .select({ content: s.versions.content })
            .from(s.versions)
            .where(eq(s.versions.id, round.versionId))
            .limit(1);
          const refs = (
            await tx
              .select({ ref: s.versions.versionReference })
              .from(s.versions)
              .where(eq(s.versions.containerId, container.id))
          ).map((r) => r.ref);
          await tx
            .update(s.versions)
            .set({ isCurrent: false })
            .where(and(eq(s.versions.containerId, container.id), eq(s.versions.isCurrent, true)));
          const [cVersion] = await tx
            .insert(s.versions)
            .values({
              containerId: container.id,
              versionReference: nextRevision(refs, 'C'),
              content: accepted!.content,
              isCurrent: true,
            })
            .returning();
          contractual = { id: cVersion!.id, content: accepted!.content };
        }
      } else {
        await tx
          .update(s.reviewCycles)
          .set({ editLockHolder: 'authoring' })
          .where(eq(s.reviewCycles.id, cycle.id));
        await tx
          .update(s.workItems)
          .set({ status: 'responding' })
          .where(eq(s.workItems.containerId, container.id));
      }
      return transmittal!.id;
    });
    if (accepting) {
      // the contractual revision's renditions, generated beside it like a
      // promotion's (T-121, ADR-0034) — the published record the client owns
      if (contractual) {
        const issued = contractual as { id: string; content: string };
        const [boundDoc] = await deps.db
          .select()
          .from(s.sandboxDocuments)
          .where(eq(s.sandboxDocuments.containerId, container.id))
          .limit(1);
        if (boundDoc) {
          await generateRenditions(deps.db, { id: issued.id, content: issued.content }, boundDoc);
        }
        // chunk + embed the contractual revision acceptance just issued — the
        // one version this act brings into existence (T-302). A sandbox-scope
        // (internal QA) acceptance issues none and never grounds (ADR-0032),
        // so there is nothing to index on that path.
        await ingestVersion(deps.db, deps.router, issued.id);
      }
    }
    const fresh = await readCycle(deps.db, container, slice);
    return c.json({ transmittalId, cycle: fresh! });
  });

  // The authoring side's mandatory reply (ADR-0004), during the respond phase.
  app.post('/review-comments/:commentId/response', async (c) => {
    const commentId = c.req.param('commentId');
    if (!isUuid(commentId)) return notFound(c);
    const [comment] = await deps.db
      .select()
      .from(s.reviewComments)
      .where(eq(s.reviewComments.id, commentId))
      .limit(1);
    if (!comment) return notFound(c);
    const scope = await roundScope(c, comment.roundId);
    if (!scope) return notFound(c);
    const { round, container, slice } = scope;
    const author = await isLiveAuthor(deps.db, container.id, slice.participantId);
    if (!author) return forbidden(c, 'authors_only');
    if (round.state !== 'issued') return conflict(c, 'round_not_in_respond_phase');
    const body = createReviewResponseBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);
    try {
      const [response] = await deps.db
        .insert(s.responses)
        .values({
          commentId: comment.id,
          authorParticipantId: slice.participantId,
          body: body.data.body,
          nextVersionId: body.data.nextVersionId ?? null,
          nextVersionAnchor: body.data.nextVersionAnchor ?? null,
          noChangeReason: body.data.noChangeReason ?? null,
        })
        .returning();
      const cycleRead = await readCycle(deps.db, container, slice);
      const fresh = cycleRead!.rounds
        .flatMap((r) => r.comments)
        .find((cm) => cm.id === comment.id)!;
      return c.json(fresh.response ?? { id: response!.id }, 201);
    } catch (error) {
      if (error instanceof Error && /responses_comment_unique|duplicate key/.test(String(error.cause ?? error.message))) {
        return conflict(c, 'already_responded');
      }
      throw error;
    }
  });

  // The explicit audited stop (ADR-0032): lead author or project owner.
  app.post('/cycles/:cycleId/close-rejected', async (c) => {
    const cycleId = c.req.param('cycleId');
    if (!isUuid(cycleId)) return notFound(c);
    const [cycle] = await deps.db
      .select()
      .from(s.reviewCycles)
      .where(eq(s.reviewCycles.id, cycleId))
      .limit(1);
    if (!cycle || cycle.state !== 'active') return notFound(c);
    const [container] = await deps.db
      .select()
      .from(s.containers)
      .where(eq(s.containers.id, cycle.containerId))
      .limit(1);
    const slice = await resolveSlice(deps.db, c.get('user'), container!.projectId);
    if (!slice || !(await canSeeContainer(deps.db, slice, container!))) return notFound(c);
    // close-as-rejected is a destructive lifecycle action held by the elevated
    // (super-user) tier, not a routine project-role power (T-174/T-133). ADR-0032's
    // "lead author or owner may close" is satisfied by granting them elevation.
    // The refusal is recorded (T-301) — the attempt to permanently stop a
    // deliverable is exactly the thing an incident review asks about.
    if (!slice.elevated) {
      return refuseElevated(c, deps.db, 'elevated_required', {
        projectId: container!.projectId,
        containerId: container!.id,
        attemptedByParticipantId: slice.participantId,
        action: 'close_rejected',
      });
    }
    // a mandatory, audited reason for the permanent stop (T-194)
    const body = closeRejectedBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid', detail: 'reason_required' } satisfies ApiError, 400);
    await deps.db.transaction(async (tx) => {
      await tx
        .update(s.reviewCycles)
        .set({
          state: 'closed_rejected',
          closedByParticipantId: slice.participantId,
          closedAt: sql`now()`,
          closedReason: body.data.reason,
        })
        .where(eq(s.reviewCycles.id, cycle.id));
      // the deliverable stands as a record and never grounds (ADR-0013/0032)
      await tx.update(s.containers).set({ state: 'rejected' }).where(eq(s.containers.id, container!.id));
      await tx
        .update(s.workItems)
        .set({ status: 'rejected' })
        .where(eq(s.workItems.containerId, container!.id));
      if (container!.scope === 'sandbox' && container!.sandboxDocumentId) {
        await tx
          .update(s.sandboxDocuments)
          .set({ headLocked: false })
          .where(eq(s.sandboxDocuments.id, container!.sandboxDocumentId));
        await tx.insert(s.sandboxCheckoutEvents).values({
          sandboxDocumentId: container!.sandboxDocumentId,
          action: 'released',
          byParticipantId: slice.participantId,
        });
      }
    });
    return c.json(await readCycle(deps.db, container!, slice));
  });

  async function codeUsable(codeId: string, projectId: string, level: 'comment' | 'deliverable') {
    const [code] = await deps.db
      .select()
      .from(s.acceptanceCodes)
      .where(and(eq(s.acceptanceCodes.id, codeId), eq(s.acceptanceCodes.projectId, projectId), isNull(s.acceptanceCodes.retiredAt)))
      .limit(1);
    return code !== undefined && (code.level === 'both' || code.level === level);
  }

  return app;
}

async function commentRead(db: Db, commentId: string): Promise<ReviewComment> {
  const [row] = await db
    .select({ comment: s.reviewComments, authorName: s.users.name })
    .from(s.reviewComments)
    .innerJoin(s.participants, eq(s.reviewComments.authorParticipantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.reviewComments.id, commentId))
    .limit(1);
  const comment = row!.comment;
  const code = comment.acceptanceCodeId
    ? (await db.select().from(s.acceptanceCodes).where(eq(s.acceptanceCodes.id, comment.acceptanceCodeId)).limit(1))[0]
    : undefined;
  const [response] = await db
    .select()
    .from(s.responses)
    .where(eq(s.responses.commentId, comment.id))
    .limit(1);
  return {
    id: comment.id,
    roundId: comment.roundId,
    versionId: comment.versionId,
    author: { participantId: comment.authorParticipantId, name: row!.authorName },
    body: comment.body,
    acceptanceCode: code ? { id: code.id, code: code.code } : null,
    anchor: (comment.anchor as ReviewComment['anchor']) ?? null,
    createdAt: comment.createdAt.toISOString(),
    response: response
      ? {
          id: response.id,
          commentId: response.commentId,
          author: { participantId: response.authorParticipantId, name: '' },
          body: response.body,
          nextVersionId: response.nextVersionId,
          nextVersionAnchor: (response.nextVersionAnchor as ReviewComment['anchor']) ?? null,
          noChangeReason: response.noChangeReason,
          createdAt: response.createdAt.toISOString(),
        }
      : null,
  };
}
