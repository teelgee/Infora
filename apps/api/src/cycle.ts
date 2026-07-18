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
  issueRoundBody,
  patchReviewCommentBody,
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
import { ingestVersions } from '@infora/data';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import type { EntitledSlice } from '@infora/governance';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const conflict = (c: Context, detail?: string) =>
  c.json({ error: 'conflict', ...(detail && { detail }) } satisfies ApiError, 409);
const forbidden = (c: Context, detail?: string) =>
  c.json({ error: 'forbidden', ...(detail && { detail }) } satisfies ApiError, 403);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

type ContainerRow = typeof s.containers.$inferSelect;

/** producer | owner | live share — who may see the deliverable and its DRR. */
async function canSeeContainer(db: Db, slice: EntitledSlice, container: ContainerRow) {
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
      .filter((r) => r.transmittal.roundId === round.id)
      .map(({ transmittal, senderName }) => ({
        id: transmittal.id,
        roundId: transmittal.roundId,
        direction: transmittal.direction,
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

    const versionCount = await deps.db
      .select({ id: s.versions.id })
      .from(s.versions)
      .where(eq(s.versions.containerId, container.id));
    const versionReference = `v${versionCount.length + 1}`;

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
          content: doc.content, // the head snapshot (ADR-0032's first source)
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
        // acceptance is what admits the deliverable to the grounded corpus
        // (ADR-0003/0011/0013)
        await tx
          .update(s.containers)
          .set({ inLibrary: true })
          .where(eq(s.containers.id, container.id));
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
      // chunk + embed whatever newly grounds — an idempotent sweep (T-012)
      await ingestVersions(deps.db, deps.router);
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
    const author = await isLiveAuthor(deps.db, container!.id, slice.participantId);
    const mayClose = (author?.isLead ?? false) || slice.membershipRole === 'owner';
    if (!mayClose) return forbidden(c, 'lead_author_or_owner');
    await deps.db.transaction(async (tx) => {
      await tx
        .update(s.reviewCycles)
        .set({ state: 'closed_rejected', closedByParticipantId: slice.participantId, closedAt: sql`now()` })
        .where(eq(s.reviewCycles.id, cycle.id));
      // the deliverable stands as a record and never grounds (ADR-0013/0032)
      await tx.update(s.containers).set({ state: 'rejected' }).where(eq(s.containers.id, container!.id));
      await tx
        .update(s.workItems)
        .set({ status: 'rejected' })
        .where(eq(s.workItems.containerId, container!.id));
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
