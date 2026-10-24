// T-120/T-123/T-124/T-126 — the review cycle over HTTP (ADR-0002/0005–0014/
// 0032, contracts §4). Promotion is the near-empty hand-off ("no wizard"):
// snapshot → immutable Version in the linked plan container; the first
// promotion launches the project cycle (round 1 opens, lock to the
// reviewers), a later one is the transmittal back from the respond phase.
// The cycle read applies ADR-0014 phasing server-side: the open round's
// comments are omitted for the authoring side; issued rounds are permanent.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

/** (review 2026-10-18) thrown inside the freeze transaction when an engine
 * lock landed between the pre-check and the write - rolls the freeze back. */
class OpenInEditor extends Error {}
import { z } from 'zod';
import {
  createReviewCommentBody,
  createReviewResponseBody,
  closeRejectedBody,
  gapMarkers,
  issueRoundBody,
  patchReviewCommentBody,
  promoteDocumentBody,
  releaseCheckoutBody,
  setDeliverableCodeBody,
} from '@infora/contracts';
import type {
  AcceptanceCode,
  ApiError,
  GetCycleResponse,
  PromotionPreflight,
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
import { countOpenItems, hasOpenItems } from './open-items';
import type { OpenItems } from './open-items';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import type { EntitledSlice } from '@infora/governance';
import { importOnVersionLanding } from './app-table-source';
import { authorshipAppendix, generateRenditions } from './renditions';
import { releaseLapsedEngineLock } from './engine-lock';
import { refuseElevated } from './elevated';
import { addWorkingDays, DEFAULT_REVIEW_PERIOD_DAYS } from './review-period';
import { loadSchemeOrDefault } from './naming';
import { resolveSlice } from './requester';
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

/** T-371 (ADR-0005 addendum) — the project's review-period default, in working
 * days, turned into this round's stored target date. The project row holds the
 * default and never the dates, so changing it cannot rewrite a round already
 * under way.
 *
 * T-373 adds `overrideDays`: the lead author may set the period for ONE
 * submission from the promotion window. It rides the computed target and is
 * never written back to the project — the next submission is the project's
 * default again unless it is overridden too. */
async function reviewPeriodTargetFor(
  db: Db,
  projectId: string,
  overrideDays?: number,
): Promise<Date> {
  if (overrideDays !== undefined) return addWorkingDays(new Date(), overrideDays);
  const [row] = await db
    .select({ defaultDays: s.projects.reviewPeriodDefaultDays })
    .from(s.projects)
    .where(eq(s.projects.id, projectId))
    .limit(1);
  return addWorkingDays(new Date(), row?.defaultDays ?? DEFAULT_REVIEW_PERIOD_DAYS);
}

/** producer | owner | live share — who may see the deliverable and its DRR.
 * A sandbox-scope (freeze-series) container is org-private machinery: the
 * producing organisation only, never the owner, never a share (ADR-0032). */
export async function canSeeContainer(db: Db, slice: EntitledSlice, container: ContainerRow) {
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

/** T-372 — a DECLINED appointment is not a live grant to act on. The row stays
 * (nothing here is ever deleted, ADR-0033) and the surface still shows the
 * refusal, because that is why the deliverable is visibly waiting; but the
 * person who said no cannot comment, acknowledge or set a verdict on the
 * strength of an appointment they refused. */
export async function isLiveConfirmedReviewer(db: Db, containerId: string, participantId: string) {
  const [row] = await db
    .select({
      id: s.deliverableReviewers.id,
      isLead: s.deliverableReviewers.isLead,
      acceptedAt: s.deliverableReviewers.acceptedAt,
    })
    .from(s.deliverableReviewers)
    .where(
      and(
        eq(s.deliverableReviewers.containerId, containerId),
        eq(s.deliverableReviewers.participantId, participantId),
        isNull(s.deliverableReviewers.revokedAt),
        isNull(s.deliverableReviewers.declinedAt),
        sql`${s.deliverableReviewers.confirmedAt} IS NOT NULL`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The deliverable's live, confirmed, un-declined LEAD reviewer, with their own
 * answer to the appointment — the fact ADR-0051's addendum gates the receipt
 * on (T-372/T-374). Null when no lead stands at all. */
export async function liveLeadReviewer(db: Db, containerId: string) {
  const [row] = await db
    .select({
      id: s.deliverableReviewers.id,
      participantId: s.deliverableReviewers.participantId,
      acceptedAt: s.deliverableReviewers.acceptedAt,
    })
    .from(s.deliverableReviewers)
    .where(
      and(
        eq(s.deliverableReviewers.containerId, containerId),
        eq(s.deliverableReviewers.isLead, true),
        isNull(s.deliverableReviewers.revokedAt),
        isNull(s.deliverableReviewers.declinedAt),
        sql`${s.deliverableReviewers.confirmedAt} IS NOT NULL`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The authoring side of a container's cycle. At sandbox scope (the org-private
 * internal QA series) the authors are the LIBRARY row's authors — the freeze
 * container carries no appointments of its own, and it is the same people on
 * the same side of the wall producing the same deliverable. Without this an
 * internal "revise" verdict was a dead end (T-355): nobody could answer the
 * comments, so the head could never be re-frozen and never promoted. */
export async function authoringContainerId(db: Db, container: ContainerRow): Promise<string> {
  if (container.scope !== 'sandbox' || !container.sandboxDocumentId) return container.id;
  const [doc] = await db
    .select({ containerId: s.sandboxDocuments.containerId })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, container.sandboxDocumentId))
    .limit(1);
  return doc?.containerId ?? container.id;
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
    // a participant can hold a lead row AND a plain row (nothing dedupes the
    // pair) — prefer the lead, or limit(1) answers "is lead?" nondeterministically
    .orderBy(desc(s.deliverableAuthors.isLead))
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
    isContractual: row.isContractual,
    grounds: row.grounds,
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
  // ADR-0052 — per-reviewer completion signals, phased like the comments
  const completionRows = roundIds.length
    ? await db
        .select({ completion: s.reviewCompletions, name: s.users.name })
        .from(s.reviewCompletions)
        .innerJoin(s.participants, eq(s.reviewCompletions.participantId, s.participants.id))
        .innerJoin(s.users, eq(s.participants.userId, s.users.id))
        .where(inArray(s.reviewCompletions.roundId, roundIds))
        .orderBy(asc(s.reviewCompletions.completedAt))
    : [];
  const codeRows = await db
    .select()
    .from(s.acceptanceCodes)
    .where(eq(s.acceptanceCodes.projectId, container.projectId));
  const codeById = new Map(codeRows.map((r) => [r.id, r]));

  // the ADR-0051 acknowledger's name, where a submission has been acknowledged
  const ackParticipantIds = [
    ...new Set(
      roundRows
        .map((r) => r.round.acknowledgedByParticipantId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const ackNameRows = ackParticipantIds.length
    ? await db
        .select({ participantId: s.participants.id, name: s.users.name })
        .from(s.participants)
        .innerJoin(s.users, eq(s.participants.userId, s.users.id))
        .where(inArray(s.participants.id, ackParticipantIds))
    : [];
  const ackNameById = new Map(ackNameRows.map((r) => [r.participantId, r.name]));

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
    // one wall, two payloads: the open round's comments AND its completion
    // signals are reviewer-side state, withheld from the authoring side
    // until the lead issues (ADR-0014; ADR-0052 §4)
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
      acknowledgedBy: round.acknowledgedByParticipantId
        ? {
            participantId: round.acknowledgedByParticipantId,
            name: ackNameById.get(round.acknowledgedByParticipantId) ?? '',
          }
        : null,
      acknowledgedAt: round.acknowledgedAt?.toISOString() ?? null,
      // T-375 — say that the withholding happened, rather than leaving an empty
      // list to be misread as an empty round
      commentsWithheld: hideComments && round.state === 'open',
      // T-379 — same discipline for the completion signals: an empty withheld
      // list must not be readable as "nobody has finished" (ADR-0052 §4)
      completionsWithheld: hideComments && round.state === 'open',
      reviewerCompletions: hideComments
        ? []
        : completionRows
            .filter((r) => r.completion.roundId === round.id)
            .map(({ completion, name }) => ({
              participantId: completion.participantId,
              name,
              completedAt: completion.completedAt.toISOString(),
            })),
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

/** A refusal the promotion would answer with, in the shape the route maps to a
 * status. Named as data rather than returned as a Response so the PREFLIGHT can
 * state the same refusal without firing the act. */
type PromotionRefusal =
  | { status: 400; detail: string }
  | { status: 403; detail: string }
  // `openItems` rides an `open_items` refusal so the window can name what is open
  // even when the gap is in the frozen version and not in the head (T-475)
  | { status: 409; detail: string; openItems?: OpenItems };

/** Everything the promotion is about to do, decided before anything is written. */
type PromotionPlan = {
  reviewers: Array<{ id: string; isLead: boolean; participantId: string; confirmedAt: Date | null }>;
  existingCycle: typeof s.reviewCycles.$inferSelect | undefined;
  latestRound: typeof s.rounds.$inferSelect | undefined;
  /** ADR-0032's two legal sources (T-355 states which rather than implying it) */
  source: 'head' | 'qa_accepted_frozen';
  sourceContent: string;
  /** the frozen revision being taken, and who accepted it — null on a head
   * promotion, where there is no QA pass to name */
  sourceVersionReference: string | null;
  qaAcceptedBy: { participantId: string; name: string } | null;
  qaAcceptedAt: string | null;
  /** the P revision this promotion would issue, and the round it would open */
  versionReference: string;
  roundNumber: number;
  /** T-332 — what was open when the decision was taken. Carried on the plan
   * rather than recounted at the write, because the override's audit record has
   * to state the numbers the person was actually shown. */
  openItems: OpenItems;
};

/**
 * T-373 — the promotion's whole decision, in one place, because the promotion
 * WINDOW has to state what the click will do before it happens: which version
 * promotes and who accepted it, what revision it becomes, and any refusal it
 * would answer with. A preflight computed separately from the act is a preflight
 * that will eventually lie, so both read this.
 *
 * Decides only. Writes nothing.
 */
async function resolvePromotion(
  db: Db,
  doc: typeof s.sandboxDocuments.$inferSelect,
  container: ContainerRow,
  slice: EntitledSlice,
  /** T-332 — the elevated lead author's explicit force (ADR-0049 §8). Absent on
   * the preflight, which asks what the click WOULD do without one. */
  override = false,
): Promise<{ ok: true; plan: PromotionPlan } | { ok: false; refusal: PromotionRefusal }> {
  const refuse = (status: 400 | 403 | 409, detail: string) =>
    ({ ok: false as const, refusal: { status, detail } as PromotionRefusal });

  // only the lead author promotes (ADR-0017)
  const author = await isLiveAuthor(db, container.id, slice.participantId);
  if (!author?.isLead) return refuse(403, 'lead_author_only');

  // a cycle cannot run without its lead reviewer (ADR-0005/0008)
  const reviewers = await db
    .select({ id: s.deliverableReviewers.id, isLead: s.deliverableReviewers.isLead, participantId: s.deliverableReviewers.participantId, confirmedAt: s.deliverableReviewers.confirmedAt })
    .from(s.deliverableReviewers)
    .where(
      and(
        eq(s.deliverableReviewers.containerId, container.id),
        isNull(s.deliverableReviewers.revokedAt),
        // T-372 — a declined appointment leaves the deliverable awaiting a
        // lead reviewer, which is exactly the state this guard names
        isNull(s.deliverableReviewers.declinedAt),
      ),
    );
  // A NAMED lead is what promotion needs — proposed is enough (T-377). ADR-0033's
  // promotion-window addendum says "replacing the lead stalls that round": the
  // submission EXISTS and waits, so a merely-proposed lead cannot refuse the
  // promotion — the confirmed-and-accepted gates live on the acknowledgement
  // (ADR-0051 addendum), which is what actually opens the round. What promotion
  // still refuses is a deliverable with no un-declined lead named at all.
  if (!reviewers.some((r) => r.isLead)) return refuse(409, 'no_lead_reviewer');

  // schema-required appointment roles must be filled before promotion (T-198).
  // The lead reviewer is always mandatory (above); the owner's schema can also
  // make author / document owner / reviewer required. Opt-in — the default
  // marks none required, so this adds no gate unless the owner sets one.
  const scheme = await loadSchemeOrDefault(db, doc.projectId);
  const requiredRoles = new Set(scheme.fields.filter((f) => f.role && f.required).map((f) => f.role));
  if (requiredRoles.has('author')) {
    const [anyAuthor] = await db
      .select({ id: s.deliverableAuthors.id })
      .from(s.deliverableAuthors)
      .where(and(eq(s.deliverableAuthors.containerId, container.id), isNull(s.deliverableAuthors.revokedAt)))
      .limit(1);
    if (!anyAuthor) return refuse(409, 'no_author');
  }
  if (requiredRoles.has('document_owner') && !container.documentOwnerParticipantId) {
    return refuse(409, 'no_document_owner');
  }
  // the schema's "reviewer required" means a CONFIRMED one — access exists —
  // while the lead gate above tolerates a proposal (T-377)
  if (requiredRoles.has('reviewer') && !reviewers.some((r) => r.confirmedAt !== null)) {
    return refuse(409, 'no_reviewer');
  }

  const [existingCycle] = await db
    .select()
    .from(s.reviewCycles)
    .where(and(eq(s.reviewCycles.containerId, container.id), eq(s.reviewCycles.state, 'active')))
    .limit(1);

  const priorRounds = existingCycle
    ? await db
        .select()
        .from(s.rounds)
        .where(eq(s.rounds.cycleId, existingCycle.id))
        .orderBy(asc(s.rounds.number))
    : [];
  const latestRound = priorRounds.at(-1);
  if (existingCycle) {
    // transmittal back happens from the respond phase only (ADR-0014)
    if (!latestRound || latestRound.state !== 'issued') {
      return refuse(409, 'round_not_in_respond_phase');
    }
    // every comment answered before vN+1 (ADR-0004's mandatory response)
    const [unanswered] = await db
      .select({ id: s.reviewComments.id })
      .from(s.reviewComments)
      .leftJoin(s.responses, eq(s.responses.commentId, s.reviewComments.id))
      .where(and(eq(s.reviewComments.roundId, latestRound.id), isNull(s.responses.id)))
      .limit(1);
    if (unanswered) return refuse(409, 'unanswered_comments');
  }

  // T-332 (ADR-0049 §7) — nothing reaches the controlled library with loose
  // ends. Owner-ruled AGAINST the recommendation to warn, and the two lists are
  // treated identically so the surface never has to explain why one stops you
  // and the other does not.
  //
  // It sits here, INSIDE the shared decision function, so the promotion window
  // states the block before the click and the click enforces it — a preflight
  // computed separately from the act is a preflight that will eventually lie.
  //
  // §8's override is checked, never assumed: an elevated lead author who did
  // not ask to force it is stopped exactly as an ordinary one is. A tier that
  // silently waived the block would make §7 read "blocked unless you happen to
  // be senior", which is not what was ruled. Whether they MAY force it is the
  // route's business (it records the refusal), so this only reports the block.
  let openItems = await countOpenItems(db, doc.id);
  if (hasOpenItems(openItems) && !override) return refuse(409, 'open_items');

  // ADR-0032's two legal sources: the live head, or the QA-accepted frozen
  // version — never a head drifting past an active internal cycle
  let sourceContent = doc.content;
  let source: 'head' | 'qa_accepted_frozen' = 'head';
  let sourceVersionReference: string | null = null;
  let qaAcceptedBy: { participantId: string; name: string } | null = null;
  let qaAcceptedAt: string | null = null;
  // an accepted QA cycle whose frozen version has already been issued
  let qaAcceptanceSpent = false;
  const [freezeContainer] = await db
    .select()
    .from(s.containers)
    .where(eq(s.containers.sandboxDocumentId, doc.id))
    .limit(1);
  if (freezeContainer) {
    const [latestFreezeCycle] = await db
      .select()
      .from(s.reviewCycles)
      .where(eq(s.reviewCycles.containerId, freezeContainer.id))
      // id breaks a launchedAt tie: two cycles in the same tick must still
      // order deterministically, or "the latest QA pass" is a coin toss
      .orderBy(sql`${s.reviewCycles.launchedAt} desc, ${s.reviewCycles.id} desc`)
      .limit(1);
    if (latestFreezeCycle?.state === 'active') return refuse(409, 'internal_cycle_active');
    if (latestFreezeCycle?.state === 'accepted') {
      const [acceptedRound] = await db
        .select({ content: s.versions.content, versionReference: s.versions.versionReference })
        .from(s.rounds)
        .innerJoin(s.versions, eq(s.rounds.versionId, s.versions.id))
        .where(eq(s.rounds.cycleId, latestFreezeCycle.id))
        .orderBy(sql`${s.rounds.number} desc`)
        .limit(1);
      // ONE promotion per QA acceptance (T-355): a version already issued on
      // this container after the QA cycle closed consumed that acceptance.
      // Without this the next revision would silently re-issue the same
      // frozen content — identical to the last, while the responses claim
      // changes. A new revision needs a fresh freeze and a fresh QA pass.
      const [lastIssued] = await db
        .select({ createdAt: s.versions.createdAt })
        .from(s.versions)
        .where(eq(s.versions.containerId, container.id))
        .orderBy(desc(s.versions.createdAt))
        .limit(1);
      qaAcceptanceSpent =
        lastIssued !== undefined &&
        latestFreezeCycle.closedAt !== null &&
        lastIssued.createdAt >= latestFreezeCycle.closedAt;
      if (acceptedRound && !qaAcceptanceSpent) {
        sourceContent = acceptedRound.content;
        source = 'qa_accepted_frozen';
        // T-373 — the window says which version it is taking AND who accepted
        // it, because the whole point of the gate is that the client receives
        // the version that was checked
        sourceVersionReference = acceptedRound.versionReference;
        qaAcceptedAt = latestFreezeCycle.closedAt?.toISOString() ?? null;
        if (latestFreezeCycle.closedByParticipantId) {
          const [acceptor] = await db
            .select({ participantId: s.participants.id, name: s.users.name })
            .from(s.participants)
            .innerJoin(s.users, eq(s.participants.userId, s.users.id))
            .where(eq(s.participants.id, latestFreezeCycle.closedByParticipantId))
            .limit(1);
          qaAcceptedBy = acceptor ?? null;
        }
      }
    }
  }
  // T-475 — the gate counts the gaps in what will actually be PROMOTED. The head
  // was counted above; a QA-accepted frozen version is a snapshot that can still
  // carry a gap the head has since lost, and issuing it would send the gap out.
  if (source === 'qa_accepted_frozen') {
    const frozen = gapMarkers(sourceContent);
    if (frozen.length > openItems.openGaps) {
      openItems = { ...openItems, openGaps: frozen.length, gaps: frozen };
      if (!override) {
        return { ok: false as const, refusal: { status: 409, detail: 'open_items', openItems } };
      }
    }
  }
  // the QA gate (ADR-0032 addendum 2026-08-09, T-355): with the sandbox's
  // "promotion requires QA acceptance" on — the default for project
  // sandboxes — the live-head source is disabled. What promotes is the
  // QA-accepted frozen version, never the head as it has drifted since QA.
  if (source === 'head') {
    const [sandbox] = await db
      .select({ promotionRequiresQa: s.sandboxes.promotionRequiresQa })
      .from(s.sandboxes)
      .where(eq(s.sandboxes.id, doc.sandboxId))
      .limit(1);
    // fails CLOSED: a governance gate must refuse on an impossible state
    // (no sandbox row) rather than admit — hence !== false, not truthiness
    if (sandbox?.promotionRequiresQa !== false) {
      // named apart so the surface can say which it is: never assured, or
      // assured for a revision already issued
      return refuse(409, qaAcceptanceSpent ? 'qa_acceptance_stale' : 'qa_acceptance_required');
    }
  }

  // promotion issues a P revision (issued for review, or promoted without
  // review) — the working v0.x series stays in the sandbox (ADR-0041)
  const existingRefs = (
    await db
      .select({ ref: s.versions.versionReference })
      .from(s.versions)
      .where(eq(s.versions.containerId, container.id))
  ).map((r) => r.ref);

  return {
    ok: true,
    plan: {
      reviewers,
      existingCycle,
      latestRound,
      source,
      sourceContent,
      sourceVersionReference,
      qaAcceptedBy,
      qaAcceptedAt,
      versionReference: nextRevision(existingRefs, 'P'),
      roundNumber: existingCycle ? latestRound!.number + 1 : 1,
      openItems,
    },
  };
}

export function cycleRoutes(deps: { db: Db; router: Router }) {
  const app = new Hono<AppEnv>();

  // T-390 — the acceptance-code read moved to acceptance-codes.ts, beside the
  // write path it now has and the blast-radius count that makes that path safe.

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
    // T-453 — an editing engine holds the head (the WOPI lock rides this same
    // check-out): a freeze would snapshot a file someone is mid-way through
    // changing, and an internal round would then own a lock the engine still
    // believes is its own. Refused until the editor closes it — unless the
    // engine's lock has lapsed, which releases it here first.
    if (doc.wopiLock !== null) {
      await releaseLapsedEngineLock(deps.db, doc.id);
      const [current] = await deps.db
        .select({ headLocked: s.sandboxDocuments.headLocked, wopiLock: s.sandboxDocuments.wopiLock })
        .from(s.sandboxDocuments)
        .where(eq(s.sandboxDocuments.id, doc.id));
      if (current!.wopiLock !== null) return conflict(c, 'open_in_editor');
      doc.headLocked = current!.headLocked;
      doc.wopiLock = null;
    }

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
          // a refused appointment is not a lead to open a round against (T-372)
          isNull(s.deliverableReviewers.declinedAt),
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

    // T-371 — read outside the transaction: the project default is settings, not
    // part of the atomic unit, and an extra query inside a transaction buys
    // nothing but a longer lock
    const reviewPeriodTarget = await reviewPeriodTargetFor(deps.db, doc.projectId);

    let result: { versionId: string; versionReference: string; containerId: string };
    try {
      result = await deps.db.transaction(async (tx) => {
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
          .values({
            cycleId,
            number: roundNumber,
            versionId: version!.id,
            // T-371 — the internal QA round is the same workflow at the
            // org-private scope (ADR-0032), so it gets the same guide: the
            // status bar renders one target and one overdue state for both
            reviewPeriodTarget,
          })
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
      // conditional on no engine lock having landed since the pre-check
      // (review 2026-10-18): the freeze's read and this write were two
      // transactions, and an engine LOCK between them left both sides holding
      // the head — now the engine's claim wins and the freeze says so in words
      const frozeHead = await tx
        .update(s.sandboxDocuments)
        .set({ headLocked: true })
        .where(and(eq(s.sandboxDocuments.id, doc.id), isNull(s.sandboxDocuments.wopiLock)))
        .returning({ id: s.sandboxDocuments.id });
      if (frozeHead.length === 0) throw new OpenInEditor();
      await tx.insert(s.sandboxCheckoutEvents).values({
        sandboxDocumentId: doc.id,
        action: 'checked_out',
        byParticipantId: slice.participantId,
      });
      return { versionId: version!.id, versionReference, containerId: freezeContainer!.id };
      });
    } catch (error) {
      if (error instanceof OpenInEditor) return conflict(c, 'open_in_editor');
      throw error;
    }
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
      // T-453 — one lock: releasing an engine's check-out ends its WOPI lock
      // too (the engine's next save is then refused as not locked), and the
      // trail says which engine lock the person ended
      await tx
        .update(s.sandboxDocuments)
        .set({ headLocked: false, wopiLock: null, wopiLockExpiresAt: null })
        .where(eq(s.sandboxDocuments.id, doc.id));
      await tx.insert(s.sandboxCheckoutEvents).values({
        sandboxDocumentId: doc.id,
        action: 'released',
        byParticipantId: slice.participantId,
        reason,
        wopiLock: doc.wopiLock,
      });
    });
    return c.json({ ok: true });
  });

  /** Resolve the document + its planned container for a promotion act or read. */
  async function promotionScope(c: Context, id: string) {
    if (!isUuid(id)) return null;
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, id))
      .limit(1);
    if (!doc) return null;
    const slice = await resolveSlice(deps.db, c.get('user'), doc.projectId);
    // the document lives in its organisation's private sandbox
    if (!slice || doc.organisationId !== slice.organisationId) return null;
    if (!doc.containerId) return { doc, slice, container: null as ContainerRow | null };
    const [container] = await deps.db
      .select()
      .from(s.containers)
      .where(eq(s.containers.id, doc.containerId))
      .limit(1);
    if (!container || container.scope !== 'library') return null;
    return { doc, slice, container };
  }

  // T-373 — what the promotion window states before the click (ADR-0008
  // addendum, 2026-08-22). Read-only, and computed by the SAME function the act
  // runs: a preflight resolved separately from the act is a preflight that will
  // eventually lie about what the click does.
  app.get('/sandbox-documents/:id/promotion-preflight', async (c) => {
    const scope = await promotionScope(c, c.req.param('id'));
    if (!scope) return notFound(c);
    const { doc, slice, container } = scope;
    if (!container) {
      return c.json({ error: 'invalid', detail: 'unplanned_document' } satisfies ApiError, 400);
    }
    const [project] = await deps.db
      .select({ defaultDays: s.projects.reviewPeriodDefaultDays })
      .from(s.projects)
      .where(eq(s.projects.id, container.projectId))
      .limit(1);
    const reviewPeriodDefaultDays = project?.defaultDays ?? DEFAULT_REVIEW_PERIOD_DAYS;
    const resolved = await resolvePromotion(deps.db, doc, container, slice);
    if (!resolved.ok) {
      // the blocker is DATA here, not a status: the window renders it beside the
      // disabled Promote button, and a 409 would leave it with nothing to draw
      const existingRefs = (
        await deps.db
          .select({ ref: s.versions.versionReference })
          .from(s.versions)
          .where(eq(s.versions.containerId, container.id))
      ).map((r) => r.ref);
      return c.json({
        containerId: container.id,
        source: 'head',
        sourceVersionReference: null,
        qaAcceptedBy: null,
        qaAcceptedAt: null,
        versionReference: nextRevision(existingRefs, 'P'),
        roundNumber: 0,
        reviewPeriodDefaultDays,
        blocker: resolved.refusal.detail,
        // T-332 — counted even on the refusal path, because `open_items` is the
        // one blocker the window has to be able to QUANTIFY: "you cannot
        // promote" is unactionable, "four open threads" is a place to go. On a
        // refusal for any other reason it is still the honest count.
        openItems: ("openItems" in resolved.refusal ? resolved.refusal.openItems : undefined) ?? (await countOpenItems(deps.db, doc.id)),
        canOverrideOpenItems: slice.elevated,
      } satisfies PromotionPreflight);
    }
    const { plan } = resolved;
    return c.json({
      containerId: container.id,
      source: plan.source,
      sourceVersionReference: plan.sourceVersionReference,
      qaAcceptedBy: plan.qaAcceptedBy,
      qaAcceptedAt: plan.qaAcceptedAt,
      versionReference: plan.versionReference,
      roundNumber: plan.roundNumber,
      reviewPeriodDefaultDays,
      blocker: null,
      openItems: plan.openItems,
      canOverrideOpenItems: slice.elevated,
    } satisfies PromotionPreflight);
  });

  // T-120 — Promote: the lead author's near-empty hand-off (ADR-0008/0017),
  // now opened by T-373's reconfirming window rather than fired bare.
  app.post('/sandbox-documents/:id/promotion', async (c) => {
    const scope = await promotionScope(c, c.req.param('id'));
    if (!scope) return notFound(c);
    const { doc, slice, container } = scope;
    if (!container) {
      return c.json(
        { error: 'invalid', detail: 'unplanned_document' } satisfies ApiError,
        400,
      );
    }

    // T-371/T-373 — the submission's target date. The project default (ADR-0005
    // addendum), or the lead author's override for THIS submission alone, which
    // is the promotion window's one editable schedule field. The override rides
    // the computed target and is never stored on the project: it changes one
    // round, not the next one.
    //
    // T-332 moved this read ABOVE the decision, because the decision now takes
    // an argument off it: whether the caller asked to force the open-items gate.
    const body = promoteDocumentBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);

    // T-332 (ADR-0049 §8) — the override is `Participant.elevated` ONLY, and a
    // refusal is recorded rather than merely returned (T-301's rule: a control
    // nobody can see operating is a control nobody can audit). Checked BEFORE
    // the decision runs, so an unelevated caller asking to force is told the act
    // is above their tier rather than handed a plain `open_items` they would
    // read as "there is nothing you can do".
    const forcing = body.data.overrideOpenItems === true;
    if (forcing && !slice.elevated) {
      return refuseElevated(c, deps.db, 'elevated_required', {
        projectId: container.projectId,
        containerId: container.id,
        attemptedByParticipantId: slice.participantId,
        action: 'promote_over_open_items',
      });
    }

    // T-373 — one decision function, shared with the preflight the promotion
    // window reads, so what the window promises and what the click does cannot
    // drift apart
    const resolved = await resolvePromotion(deps.db, doc, container, slice, forcing);
    if (!resolved.ok) {
      const { status, detail } = resolved.refusal;
      return c.json({ error: status === 403 ? 'forbidden' : status === 400 ? 'invalid' : 'conflict', detail } satisfies ApiError, status);
    }
    const {
      reviewers,
      existingCycle,
      latestRound,
      source,
      sourceContent,
      versionReference,
      openItems,
    } = resolved.plan;
    // T-382 — the window states WHICH version promotes; if a fresh QA acceptance
    // (or a spent one) changed the answer between the preflight and this click,
    // refuse rather than silently promote content the user was never shown.
    // Optional: a bare POST (no window, tests, scripts) skips the check.
    if (
      body.data.expectedSourceVersionReference !== undefined &&
      body.data.expectedSourceVersionReference !== resolved.plan.sourceVersionReference
    ) {
      return c.json({ error: 'conflict', detail: 'promotion_state_changed' } satisfies ApiError, 409);
    }
    const reviewPeriodTarget = await reviewPeriodTargetFor(
      deps.db,
      container.projectId,
      body.data.reviewPeriodDays,
    );

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
        // ADR-0004's link target now exists: the change each response declared
        // lives in the version this promotion creates, so stamp it (no-change
        // responses stay unlinked by definition)
        await tx
          .update(s.responses)
          .set({ nextVersionId: version!.id })
          .where(
            and(
              inArray(
                s.responses.commentId,
                tx
                  .select({ id: s.reviewComments.id })
                  .from(s.reviewComments)
                  .where(eq(s.reviewComments.roundId, latestRound!.id)),
              ),
              isNull(s.responses.noChangeReason),
            ),
          );
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
      // ADR-0051: a project-scope round is created 'submitted' — it opens for
      // review only on the acknowledgement, which since T-374 is the lead
      // reviewer's act (or the owner's super user when the lead is away)
      const [round] = await tx
        .insert(s.rounds)
        .values({
          cycleId,
          number: roundNumber,
          versionId: version!.id,
          state: 'submitted',
          // T-371 (ADR-0005 addendum) — the target is computed HERE, at round
          // creation from the promotion moment, and stored. rounds.review_period_target
          // shipped with migration 0010 and nothing ever set it; this is the
          // line that ends that. It guides and flags overdue; it never closes
          // a round, which stays the lead reviewer's act.
          reviewPeriodTarget,
        })
        .returning();
      // the promotion IS the transmittal to review (ADR-0010/0014). Recipients
      // are the CONFIRMED group: a proposed reviewer has no access yet (T-377),
      // and a transmittal naming them would record a delivery that never ran.
      const [transmittal] = await tx
        .insert(s.transmittals)
        .values({
          roundId: round!.id,
          direction: 'return',
          senderParticipantId: slice.participantId,
          recipients: reviewers.filter((r) => r.confirmedAt !== null).map((r) => r.participantId),
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
      // T-332 (ADR-0049 §8) — every use of the override is audited, and the
      // record says who did it and WHAT WAS OPEN AT THE TIME. Written inside
      // the same transaction as the version it let through: an audit that can
      // fail separately from the act it audits is an audit with a gap in it.
      // The counts come off the decision rather than being recounted here,
      // because the numbers the record states must be the numbers the person
      // was shown.
      if (forcing && hasOpenItems(openItems)) {
        await tx.insert(s.promotionOverrides).values({
          containerId: container.id,
          versionId: version!.id,
          overriddenByParticipantId: slice.participantId,
          openThreads: openItems.threads,
          openFindings: openItems.findings.open,
          openGaps: openItems.openGaps,
        });
      }
      return {
        versionId: version!.id,
        versionReference,
        cycleId,
        roundId: round!.id,
        roundNumber,
        source,
      } satisfies PromotionResult;
    });
    // the record's renditions, generated beside the version (T-121, ADR-0034)
    // T-475 — the authorship appendix, where the project has asked for one
    await generateRenditions(
      deps.db,
      { id: result.versionId, content: sourceContent },
      doc,
      await authorshipAppendix(deps.db, {
        projectId: doc.projectId,
        sandboxDocumentId: doc.id,
        content: sourceContent,
      }),
    );
    await ingestVersion(deps.db, deps.router, result.versionId);
    // T-451 — a new revision of a library record has landed, so an app table
    // pointed at the record re-derives (ADR-0059 decision 1), as the producing
    // organisation's person who issued it. Only HERE: acceptance's contractual
    // (C) revision carries the same file as the P it accepts, and importing it
    // again would supersede rows the client had just accepted with identical
    // submitted copies.
    await importOnVersionLanding(deps.db, { containerId: container.id });

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

  // ADR-0051 — acknowledging a submission opens the round for review, recorded
  // who/when on the round (the transmittal is append-only, ADR-0009/0010, and
  // the round is the thing the act transitions). Sandbox-scope rounds are
  // created 'open' and never pass through here.
  //
  // WHO MAY FIRE IT, narrowed 2026-08-22 (T-374, the ADR-0051 addendum of that
  // date, which SUPERSEDES the 2026-08-06 one): the LEAD REVIEWER alone, or the
  // owner organisation's SUPER USER when the lead is away. §3 anticipated
  // exactly this — "if a pilot firm wants a single accountable receiver, the
  // controller-mode narrowing ADR-0035 defines is the natural extension and is
  // deliberately not built until asked for" — and the owner has asked. It is
  // role-derived (whoever holds the live lead grant) rather than ADR-0035's
  // separately-named controller, and buys the same single accountable receiver.
  //
  // THIS SUPERSEDES T-351, WHICH WAS NOT A BUG. T-351 widened the act on
  // 2026-08-06 for a real reason: gating on the OWNER ORGANISATION alone would
  // park every round behind a firm with no stake in its pace, on a project whose
  // lead reviewer is not owner-side. That argument is answered rather than
  // discarded — this does not gate on the owner organisation, it gates on the
  // lead reviewer, who MAY sit outside it and who fires the receipt in the
  // ordinary case. What goes is a non-lead reviewer signing for a submission
  // they do not run, and an owner participant who is not elevated.
  //
  // §3's own reasoning is half-reversed and it is worth saying so: receipt was
  // placed BELOW the elevated tier as routine coordination, and the routine act
  // is now the lead reviewer's while the FALLBACK is elevated. No elevated
  // refusal is recorded for a rejected attempt — that register (T-301) holds
  // destructive lifecycle acts, and a receipt is not one.
  //
  // And the act is gated on an ACCEPTED appointment (T-372): until a lead has
  // accepted, nobody may acknowledge, the super user included, because the
  // override covers the RECEIPT and never the UNDERTAKING. A super user facing
  // an absent lead who never accepted re-appoints; they do not acknowledge in
  // that person's name.
  app.post('/rounds/:roundId/acknowledge', async (c) => {
    const scope = await roundScope(c, c.req.param('roundId'));
    if (!scope) return notFound(c);
    const { round, container, slice } = scope;
    if (round.state !== 'submitted') return conflict(c, 'round_not_submitted');
    const [project] = await deps.db
      .select({ ownerOrganisationId: s.projects.ownerOrganisationId })
      .from(s.projects)
      .where(eq(s.projects.id, container.projectId))
      .limit(1);
    const lead = await liveLeadReviewer(deps.db, container.id);
    const isLead = lead?.participantId === slice.participantId;
    // the fallback tier: the owner organisation's super user, for when the lead
    // is away. Elevated, not merely owner-side — that is the whole narrowing.
    const isOwnerSuperUser =
      project?.ownerOrganisationId === slice.organisationId && slice.elevated;
    if (!isLead && !isOwnerSuperUser) {
      return forbidden(c, 'lead_reviewer_or_owner_super_user_only');
    }
    // the undertaking comes first, for everyone — checked AFTER the who-gate so
    // a bystander is told the act is not theirs rather than being handed the
    // state of an appointment they have no part in
    if (!lead) return conflict(c, 'no_lead_reviewer');
    if (!lead.acceptedAt) return conflict(c, 'lead_reviewer_has_not_accepted');
    await deps.db
      .update(s.rounds)
      .set({
        state: 'open',
        acknowledgedByParticipantId: slice.participantId,
        acknowledgedAt: sql`now()`,
      })
      .where(eq(s.rounds.id, round.id));
    return c.json(await readCycle(deps.db, container, slice));
  });

  // ADR-0052 — the reviewer's own completion signal: mark on an open round,
  // withdraw while it stays open (a changed mind, not an audit event). The
  // set freezes at issue for free — both acts are legal only on 'open'.
  app.post('/rounds/:roundId/review-completion', async (c) => {
    const scope = await roundScope(c, c.req.param('roundId'));
    if (!scope) return notFound(c);
    const { round, container, slice } = scope;
    const reviewer = await isLiveConfirmedReviewer(deps.db, container.id, slice.participantId);
    if (!reviewer) return forbidden(c, 'reviewers_only');
    if (round.state !== 'open') return conflict(c, 'round_not_open');
    try {
      await deps.db
        .insert(s.reviewCompletions)
        .values({ roundId: round.id, participantId: slice.participantId });
    } catch (error) {
      if (error instanceof Error && /review_completions_round_participant_unique|duplicate key/.test(String(error.cause ?? error.message))) {
        return conflict(c, 'already_complete');
      }
      throw error;
    }
    return c.json(await readCycle(deps.db, container, slice), 201);
  });

  app.delete('/rounds/:roundId/review-completion', async (c) => {
    const scope = await roundScope(c, c.req.param('roundId'));
    if (!scope) return notFound(c);
    const { round, container, slice } = scope;
    const reviewer = await isLiveConfirmedReviewer(deps.db, container.id, slice.participantId);
    if (!reviewer) return forbidden(c, 'reviewers_only');
    if (round.state !== 'open') return conflict(c, 'round_not_open');
    await deps.db
      .delete(s.reviewCompletions)
      .where(
        and(
          eq(s.reviewCompletions.roundId, round.id),
          eq(s.reviewCompletions.participantId, slice.participantId),
        ),
      );
    return c.json(await readCycle(deps.db, container, slice));
  });

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
    // T-392 (ADR-0003 as amended, ADR-0041) — an accepting code ENDS the cycle;
    // only a CONTRACTUAL one issues the `C` revision. That is the 2021 National
    // Annex's own `S4`/`S5` split: a deliverable can be accepted for its stated
    // purpose without becoming the contractual issue. T-383 stored the flag and
    // said plainly that nothing consumed it; this is what consumes it.
    const contractual = code?.isContractual ?? false;

    const authors = await deps.db
      .select({ participantId: s.deliverableAuthors.participantId })
      .from(s.deliverableAuthors)
      .where(and(eq(s.deliverableAuthors.containerId, container.id), isNull(s.deliverableAuthors.revokedAt)));

    // the contractual C-revision issued on a client acceptance (set inside the
    // tx). Null when the code accepts without being contractual (T-392) — and
    // null is then the honest answer rather than a missing step.
    let contractualVersion: { id: string; content: string } | null = null;
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
        // on the same trail as a standalone release (T-180). Any engine lock is
        // severed with it (review 2026-10-18) — unlocking the head while an
        // engine string stood would violate 0070's CHECK and answer a 500
        await tx
          .update(s.sandboxDocuments)
          .set({ headLocked: false, wopiLock: null, wopiLockExpiresAt: null })
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
        }
        if (container.scope === 'library' && contractual) {
          // ISO 19650 (ADR-0041): client acceptance under a CONTRACTUAL code
          // issues the contractual revision — a new immutable C-version of the
          // accepted content, made current so the library/plan/retrieval all read
          // the published revision. (The reviewed P-version keeps its P
          // reference; version_reference is immutable, T-008/0013, so C is a
          // fresh issue, not a relabel.)
          //
          // T-392 — under an accepting but NON-contractual code nothing is
          // issued at all: admission already happened above (`in_library`), and
          // whether it grounds is the code's own `grounds` flag read live by
          // retrieval (T-387). The accepted content keeps its reviewed P
          // revision, which is the honest record — issuing a C would assert a
          // contractual status the project's own scheme says this code does not
          // confer, and `version_reference` is immutable, so it could not be
          // taken back.
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
          contractualVersion = { id: cVersion!.id, content: accepted!.content };
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
      // promotion's (T-121, ADR-0034) — the published record the client owns.
      // T-392: absent under a non-contractual code, and nothing is missing —
      // the reviewed P revision already carries its renditions and its chunks
      // from the promotion that issued it.
      if (contractualVersion) {
        const issued = contractualVersion as { id: string; content: string };
        const [boundDoc] = await deps.db
          .select()
          .from(s.sandboxDocuments)
          .where(eq(s.sandboxDocuments.containerId, container.id))
          .limit(1);
        if (boundDoc) {
          await generateRenditions(
            deps.db,
            { id: issued.id, content: issued.content },
            boundDoc,
            await authorshipAppendix(deps.db, {
              projectId: boundDoc.projectId,
              sandboxDocumentId: boundDoc.id,
              content: issued.content,
            }),
          );
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
    // at sandbox scope the deliverable's own authors answer internal QA (T-355)
    const author = await isLiveAuthor(
      deps.db,
      await authoringContainerId(deps.db, container),
      slice.participantId,
    );
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
        // the same severing as issue's (review 2026-10-18): the CHECK forbids
        // an unlocked head holding an engine string
        await tx
          .update(s.sandboxDocuments)
          .set({ headLocked: false, wopiLock: null, wopiLockExpiresAt: null })
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
