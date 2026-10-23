// T-431 — EXTERNAL ISSUE (ADR-0055 §1–§6): a finished deliverable reaches
// somebody who will never have an Infora login.
//
// The whole design rests on one property. **The link is the access.** There is
// no Organisation, no Participant, no Membership and therefore no grant to
// resolve — which is why not one clause of the wall changes, and why the
// recipient's read is the only sessionless read of project material in this API.
// It resolves an opaque token to ONE NAMED VERSION and serves that and nothing
// else: no project, no library, no roster, no other version, and no id by which
// another read could be attempted.
//
// A later version does not retract an issued link (ADR-0013, and ISO 19650's
// position that an issued document is a snapshot of what was sent on the day).
// The link expires; that is the only thing that ends it.
//
// Stated here because the record must not read as stronger than it is
// (ADR-0055 §5): **anyone holding the link is the recipient.** "Issued to Mrs
// Patel" means sent to an address someone typed. That is exactly as strong as
// the emailed attachment this replaces and no stronger, and the surface says so
// on the screen where the sending happens.
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  answerExternalRequestBody,
  EXTERNAL_LINK_DEFAULT_DAYS,
  issueExternallyBody,
  setExternalIssueSettingsBody,
} from '@infora/contracts';
import type {
  IssueExternallyBody,
  ApiError,
  ExternalDocumentResponse,
  ExternalIssue,
  ExternalIssuePermission,
  GetExternalIssueSettingsResponse,
  ListExternalIssuesResponse,
} from '@infora/contracts';
import { deliverableVisibleSql as deliverableVisible } from '@infora/knowledge';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { getBlob, mimeTypes } from './renditions';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: { json: (v: unknown, s: number) => Response }) =>
  c.json({ error: 'not_found' } satisfies ApiError, 404);
const conflict = (c: { json: (v: unknown, s: number) => Response }, detail: string) =>
  c.json({ error: 'conflict', detail } satisfies ApiError, 409);
const invalid = (c: { json: (v: unknown, s: number) => Response }) =>
  c.json({ error: 'invalid' } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/**
 * ADR-0055 §7's line, read as a predicate. The strictest level is the default
 * (migration 0065), so a project that has chosen nothing has not accidentally
 * chosen "anyone". `membershipRole === 'owner'` IS "the project-owning
 * organisation" — that is what the Membership row means (ADR-0016).
 */
export function mayIssueExternally(
  slice: Pick<EntitledSlice, 'membershipRole' | 'elevated'>,
  permission: ExternalIssuePermission,
): boolean {
  switch (permission) {
    case 'any_member':
      return true;
    case 'any_super_user':
      return slice.elevated;
    case 'owner_super_user':
      return slice.elevated && slice.membershipRole === 'owner';
  }
}

/** 32 bytes of CSPRNG: the token is the access, so it is not a guessable id. */
function mintToken(): string {
  return randomBytes(32).toString('base64url');
}


// T-461 — the act itself, apart from the route: one container, one recipient,
// recorded as an issue or as the request for one, exactly as the single route
// has always done it. The bulk module calls this once per selected row inside
// one transaction, so twenty issues are one dialog and one record of who sent
// what to whom — and never a twenty-first shape of the write.
export async function recordExternalIssue(
  db: Db,
  slice: EntitledSlice,
  containerId: string,
  versionId: string,
  body: IssueExternallyBody,
  may: boolean,
): Promise<string> {
  if (!may) {
    const [asked] = await db
      .insert(s.externalRecipients)
      .values({
        containerId: containerId,
        versionId: versionId,
        name: body.recipientName,
        email: body.recipientEmail,
        reason: body.reason,
        message: body.message,
        state: 'requested',
        // (review, 2026-09-02) the asked-for duration is stored so approval
        // honours it — the form promises nobody retypes what was asked
        requestedExpiresDays: body.expiresInDays ?? null,
        requestedByParticipantId: slice.participantId,
      })
      .returning();
    return asked!.id;
  }

  const days = body.expiresInDays ?? EXTERNAL_LINK_DEFAULT_DAYS;
  const [transmittal] = await db
    .insert(s.transmittals)
    .values({
      kind: 'external',
      containerId: containerId,
      versionId: versionId,
      senderParticipantId: slice.participantId,
      // the discriminator's promise, held by the CHECK as well as here: no
      // round, no direction, no organisation recipients
      purposeCode: null,
    })
    .returning();
  const [row] = await db
    .insert(s.externalRecipients)
    .values({
      containerId: containerId,
      versionId: versionId,
      transmittalId: transmittal!.id,
      name: body.recipientName,
      email: body.recipientEmail,
      reason: body.reason,
      message: body.message,
      state: 'issued',
      linkToken: mintToken(),
      expiresAt: sql`now() + make_interval(days => ${days})`,
      requestedByParticipantId: slice.participantId,
      issuedByParticipantId: slice.participantId,
      decidedAt: sql`now()`,
    })
    .returning();
  return row!.id;
}

export function externalIssueRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  async function projectSettings(projectId: string) {
    const [row] = await deps.db
      .select({
        name: s.projects.name,
        permission: s.projects.externalIssuePermission,
        standardMessage: s.projects.externalStandardMessage,
      })
      .from(s.projects)
      .where(eq(s.projects.id, projectId))
      .limit(1);
    return row ?? null;
  }

  /**
   * The deliverable, resolved through the SAME visibility pre-filter the
   * library list and grounding use (ADR-0016 + ADR-0035 §5). You cannot issue
   * outward a document you could not open inward — and because it is the shared
   * predicate rather than a second rule written here, the two cannot drift.
   */
  async function visibleDeliverable(slice: EntitledSlice, containerId: string) {
    if (!isUuid(containerId)) return null;
    const [row] = await deps.db
      .select({ container: s.containers })
      .from(s.containers)
      .where(
        and(
          eq(s.containers.id, containerId),
          eq(s.containers.projectId, slice.projectId),
          eq(s.containers.scope, 'library'),
          eq(s.containers.inLibrary, true),
          eq(s.containers.state, 'live'),
          deliverableVisible(slice),
        ),
      )
      .limit(1);
    return row?.container ?? null;
  }

  async function currentVersion(containerId: string) {
    const [row] = await deps.db
      .select({ id: s.versions.id, versionReference: s.versions.versionReference })
      .from(s.versions)
      .where(and(eq(s.versions.containerId, containerId), eq(s.versions.isCurrent, true)))
      .limit(1);
    return row ?? null;
  }

  // ── The settings, and what this requester may do with them ───────────────
  // Assembled, never filtered (T-269): `mayIssue` is computed server-side so a
  // person below the line is offered the request action rather than a disabled
  // button, and a person above it never sees a queue that is empty by
  // construction. Every participant may READ the configuration — the number
  // decides what their own screen offers them, so hiding it would make the
  // screen unexplainable, which is T-371's argument one setting along.
  app.get('/projects/:projectId/external-issue-settings', project, async (c) => {
    const slice = c.get('slice');
    const settings = await projectSettings(slice.projectId);
    if (!settings) return notFound(c);
    const may = mayIssueExternally(slice, settings.permission);
    return c.json({
      projectId: slice.projectId,
      permission: settings.permission,
      standardMessage: settings.standardMessage,
      mayIssue: may,
      mayApprove: may,
      // ADR-0033: whole-project configuration is the owner organisation's super
      // user, exactly as the review-period default and conflict attestation are
      mayConfigure: slice.membershipRole === 'owner' && slice.elevated,
    } satisfies GetExternalIssueSettingsResponse);
  });

  app.patch('/projects/:projectId/external-issue-settings', project, async (c) => {
    const slice = c.get('slice');
    if (!(slice.membershipRole === 'owner' && slice.elevated)) return notFound(c);
    const body = setExternalIssueSettingsBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const patch: { externalStandardMessage?: string | null; externalIssuePermission?: ExternalIssuePermission } = {};
    if (body.data.standardMessage !== undefined) {
      // an empty string is nobody's standing note — it is clearing it
      patch.externalStandardMessage =
        body.data.standardMessage === null || body.data.standardMessage === ''
          ? null
          : body.data.standardMessage;
    }
    if (body.data.permission !== undefined) patch.externalIssuePermission = body.data.permission;
    if (Object.keys(patch).length > 0) {
      await deps.db.update(s.projects).set(patch).where(eq(s.projects.id, slice.projectId));
    }
    const settings = await projectSettings(slice.projectId);
    if (!settings) return notFound(c);
    const may = mayIssueExternally(slice, settings.permission);
    return c.json({
      projectId: slice.projectId,
      permission: settings.permission,
      standardMessage: settings.standardMessage,
      mayIssue: may,
      mayApprove: may,
      mayConfigure: true,
    } satisfies GetExternalIssueSettingsResponse);
  });

  // ── The door, on the deliverable, in the library (ADR-0055 §2) ────────────
  //
  // T-432 — ONE ENDPOINT, TWO ACTS, and which one you get is decided by the
  // project's setting rather than by asking for it. Somebody above the line
  // issues; somebody below it REQUESTS, and the request carries every fact the
  // issue needs so that approving it invents nothing. That is T-389's shape for
  // withdraw-or-propose, applied here for the same reason: two endpoints would
  // be two answers to what an external issue is, and a caller could then pick.
  app.post('/containers/:containerId/external-issues', async (c) => {
    const containerId = c.req.param('containerId');
    if (!isUuid(containerId)) return notFound(c);
    const [home] = await deps.db
      .select({ projectId: s.containers.projectId })
      .from(s.containers)
      .where(eq(s.containers.id, containerId))
      .limit(1);
    if (!home) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), home.projectId);
    if (!slice) return notFound(c);
    const container = await visibleDeliverable(slice, containerId);
    if (!container) return notFound(c);
    const settings = await projectSettings(slice.projectId);
    if (!settings) return notFound(c);
    const may = mayIssueExternally(slice, settings.permission);
    const body = issueExternallyBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    // an external issue serves a PROMOTED deliverable — it needs a version, and
    // the one it names is the current one AT THE MOMENT OF ISSUE (or of asking).
    // Stored on the row, so tomorrow's revision changes nothing about what was
    // sent today, and an approver issues the revision that was actually asked
    // for rather than whatever has since become current.
    const version = await currentVersion(container.id);
    if (!version) return conflict(c, 'no_current_version');

    const recorded = await recordExternalIssue(deps.db, slice, container.id, version.id, body.data, may);
    return c.json(await issueRead(deps.db, recorded, true), 201);
  });

  // ── The deliverable's external issues, cut per viewer (ADR-0055 §8) ───────
  // The producing organisation reads that issues happened without the recipient
  // list — ADR-0035's addendum carried over unchanged rather than re-argued.
  app.get('/containers/:containerId/external-issues', async (c) => {
    const containerId = c.req.param('containerId');
    if (!isUuid(containerId)) return notFound(c);
    const [home] = await deps.db
      .select({ projectId: s.containers.projectId })
      .from(s.containers)
      .where(eq(s.containers.id, containerId))
      .limit(1);
    if (!home) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), home.projectId);
    if (!slice) return notFound(c);
    const container = await visibleDeliverable(slice, containerId);
    if (!container) return notFound(c);
    const rows = await listIssues(deps.db, { containerId: container.id });
    return c.json({
      items: rows.filter((r) => visibleTo(r, slice)).map((r) => toExternalIssue(r, mayReadRecipient(r, slice))),
    } satisfies ListExternalIssuesResponse);
  });

  // ── The request queue (T-432) ─────────────────────────────────────────────
  // A queue on the surface, never a notification: ADR-0055's Consequences say
  // the pilot notification set gains nothing, so a pending request is something
  // you find where the door is rather than something that chases you.
  //
  // Who reads it: anybody who may APPROVE (they must see the facts to decide),
  // plus the same three parties who read an issue — the project owner, the
  // asking organisation, and the producing organisation, which learns that its
  // document is being asked for without learning who is asking for it.
  app.get('/projects/:projectId/external-issues', project, async (c) => {
    const slice = c.get('slice');
    const settings = await projectSettings(slice.projectId);
    if (!settings) return notFound(c);
    const approver = mayIssueExternally(slice, settings.permission);
    const rows = await listIssues(deps.db, { projectId: slice.projectId });
    // 🔒 (review, 2026-09-02) — the approver widening applies ONLY to rows
    // still awaiting a decision. As first built, `approver` short-circuited
    // both cuts for EVERY row, so at the two permissive levels a rival firm's
    // people received every issue's recipient, message and live link token —
    // and the token is the access, so that was document content across the
    // wall. An approver needs the facts of a REQUEST to decide it; a
    // `requested` row has no token to leak, and a decided row's audience goes
    // back to being exactly the three parties §8 names.
    const widened = (r: IssueRow) => approver && r.recipient.state === 'requested';
    return c.json({
      items: rows
        .filter((r) => visibleTo(r, slice) || widened(r))
        .map((r) => toExternalIssue(r, mayReadRecipient(r, slice) || widened(r))),
    } satisfies ListExternalIssuesResponse);
  });

  // Approve or decline somebody else's request. The approver is anybody ABOVE
  // the line — on the strictest level that is the client, which is the whole
  // point of that level existing (ADR-0055 §7). The ADR explicitly supersedes
  // the session's own recommendation that the SENDING firm's super user answer.
  app.post('/external-issues/:id/answer', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return notFound(c);
    const [existing] = await deps.db
      .select({ recipient: s.externalRecipients, projectId: s.containers.projectId })
      .from(s.externalRecipients)
      .innerJoin(s.containers, eq(s.externalRecipients.containerId, s.containers.id))
      .where(eq(s.externalRecipients.id, id))
      .limit(1);
    if (!existing) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), existing.projectId);
    if (!slice) return notFound(c);
    const settings = await projectSettings(slice.projectId);
    if (!settings) return notFound(c);
    if (!mayIssueExternally(slice, settings.permission)) return notFound(c);
    // answered once — the database says so too (the decision-only trigger), and
    // this is the readable refusal in front of it
    if (existing.recipient.state !== 'requested') return conflict(c, 'already_answered');
    const body = answerExternalRequestBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);

    if (!body.data.approve) {
      // a decline is answered, not merely refused: the person who asked reads
      // the reason, exactly as the producing side reads a withdrawal's
      const reason = body.data.declineReason?.trim();
      if (!reason) return invalid(c);
      await deps.db
        .update(s.externalRecipients)
        .set({
          state: 'declined',
          declinedByParticipantId: slice.participantId,
          declineReason: reason,
          decidedAt: sql`now()`,
        })
        .where(eq(s.externalRecipients.id, id));
      return c.json(await issueRead(deps.db, id, true));
    }

    // the deliverable must still BE one: a request approved after its document
    // was withdrawn would put a withdrawn record in front of the public
    const container = await visibleDeliverable(slice, existing.recipient.containerId);
    if (!container) return conflict(c, 'deliverable_not_live');
    // (review, 2026-09-02) the requester's stored ask is honoured before the
    // default; an approver's explicit choice still wins, because the approver
    // is the one answerable for the link's life
    const days =
      body.data.expiresInDays ??
      existing.recipient.requestedExpiresDays ??
      EXTERNAL_LINK_DEFAULT_DAYS;
    const [transmittal] = await deps.db
      .insert(s.transmittals)
      .values({
        kind: 'external',
        containerId: existing.recipient.containerId,
        // the version that was ASKED FOR, which the trigger has frozen since
        // the request was written — approving issues what was approved
        versionId: existing.recipient.versionId,
        senderParticipantId: slice.participantId,
        purposeCode: null,
      })
      .returning();
    await deps.db
      .update(s.externalRecipients)
      .set({
        state: 'issued',
        transmittalId: transmittal!.id,
        linkToken: mintToken(),
        expiresAt: sql`now() + make_interval(days => ${days})`,
        issuedByParticipantId: slice.participantId,
        decidedAt: sql`now()`,
      })
      .where(eq(s.externalRecipients.id, id));
    return c.json(await issueRead(deps.db, id, true));
  });

  // ── The recipient's own read: a token, one version, nothing else ──────────
  //
  // An UNKNOWN token and an EXPIRED one answer identically (principle 4), and
  // that is a deliberate cost: distinguishing them would confirm to a guesser
  // that a token existed. The recipient's page says what a reader needs — the
  // link may have expired — without the server saying which.
  app.get('/external-documents/:token', async (c) => {
    const row = await liveRecipient(deps.db, c.req.param('token'));
    if (!row) return notFound(c);
    const [doc] = await deps.db
      .select({
        documentReference: s.containers.documentReference,
        versionReference: s.versions.versionReference,
        content: s.versions.content,
        title: s.workItems.title,
        projectName: s.projects.name,
        standardMessage: s.projects.externalStandardMessage,
        senderOrganisationName: s.organisations.name,
        issuedAt: s.externalRecipients.decidedAt,
      })
      .from(s.externalRecipients)
      .innerJoin(s.versions, eq(s.externalRecipients.versionId, s.versions.id))
      .innerJoin(s.containers, eq(s.externalRecipients.containerId, s.containers.id))
      .innerJoin(s.projects, eq(s.containers.projectId, s.projects.id))
      .innerJoin(s.participants, eq(s.externalRecipients.issuedByParticipantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .innerJoin(s.organisations, eq(s.users.organisationId, s.organisations.id))
      .leftJoin(s.workItems, eq(s.workItems.containerId, s.containers.id))
      .where(eq(s.externalRecipients.id, row.id))
      .limit(1);
    if (!doc) return notFound(c);

    // T-436 — THE FIRST OPEN, RECORDED ONCE (owner ruling 2026-09-02,
    // completing ADR-0055 §5).
    //
    // 🔒 **IT HAPPENS HERE, AND ONLY HERE, FOR A REASON.** Every refusal above
    // has already returned: an expired token and an invented one both leave
    // through `notFound` before this line exists, so recording an open adds no
    // work, no query and no branch to the path a guesser can reach. The
    // identical-response rule (§4) is therefore untouched by construction
    // rather than by care, and `external-issue.test.ts` proves the two refusals
    // stay byte-identical AFTER a real open has been written.
    //
    // The `IS NULL` in the WHERE is what makes it the FIRST open rather than
    // the latest one — the receipt is that the document was read, not how often
    // — and 0066's trigger refuses a second write anyway, so this is the fast
    // path and not the guarantee.
    if (row.openedAt === null) {
      await deps.db
        .update(s.externalRecipients)
        .set({ openedAt: sql`now()` })
        .where(and(eq(s.externalRecipients.id, row.id), isNull(s.externalRecipients.openedAt)));
    }

    const renditions = await deps.db
      .select({ id: s.renditions.id, kind: s.renditions.kind, format: s.renditions.format })
      .from(s.renditions)
      .where(eq(s.renditions.versionId, row.versionId));
    return c.json({
      documentReference: doc.documentReference ?? '',
      versionReference: doc.versionReference,
      title: doc.title ?? null,
      content: doc.content,
      recipientName: row.name,
      message: row.message,
      // read live, not frozen: what the sender wrote is part of the issue act
      // and is stored on the row, but the project's standing note is a footer
      // the owner may correct — and correcting it should correct every live
      // link, which is what "carried on every external email" means (§6)
      standardMessage: doc.standardMessage,
      reason: row.reason,
      senderOrganisationName: doc.senderOrganisationName,
      projectName: doc.projectName,
      issuedAt: doc.issuedAt!.toISOString(),
      expiresAt: row.expiresAt!.toISOString(),
      renditions: renditions.map((r) => ({ id: r.id, kind: r.kind, format: r.format })),
    } satisfies ExternalDocumentResponse);
  });

  // The rendered file, through the same token. The rendition is checked to
  // belong to the token's OWN version — the id in the path can therefore never
  // widen what the link reaches, which is principle 2 applied to a capability
  // URL rather than to a session.
  app.get('/external-documents/:token/renditions/:renditionId/file', async (c) => {
    const row = await liveRecipient(deps.db, c.req.param('token'));
    if (!row) return notFound(c);
    const renditionId = c.req.param('renditionId');
    if (!isUuid(renditionId)) return notFound(c);
    const [rendition] = await deps.db
      .select()
      .from(s.renditions)
      .where(and(eq(s.renditions.id, renditionId), eq(s.renditions.versionId, row.versionId)))
      .limit(1);
    if (!rendition) return notFound(c);
    const bytes = getBlob(rendition.contentRef);
    if (!bytes) return notFound(c);
    const [container] = await deps.db
      .select({ documentReference: s.containers.documentReference })
      .from(s.containers)
      .where(eq(s.containers.id, row.containerId))
      .limit(1);
    return c.body(new Uint8Array(bytes), 200, {
      'content-type': mimeTypes[rendition.format],
      'content-disposition': `attachment; filename="${container?.documentReference ?? 'document'}.${rendition.format}"`,
    });
  });

  return app;
}

type IssueRow = {
  recipient: typeof s.externalRecipients.$inferSelect;
  documentReference: string | null;
  versionReference: string;
  projectId: string;
  producingOrganisationId: string;
  requestedByName: string;
  requestedByOrganisationId: string;
  issuedByName: string | null;
  declinedByName: string | null;
  projectOwnerOrganisationId: string;
};

async function listIssues(
  db: Db,
  where: { id?: string; containerId?: string; projectId?: string },
): Promise<IssueRow[]> {
  const requester = { participants: s.participants, users: s.users };
  const rows = await db
    .select({
      recipient: s.externalRecipients,
      documentReference: s.containers.documentReference,
      versionReference: s.versions.versionReference,
      projectId: s.containers.projectId,
      producingOrganisationId: s.containers.producingOrganisationId,
      requestedByName: requester.users.name,
      requestedByOrganisationId: requester.users.organisationId,
      projectOwnerOrganisationId: s.projects.ownerOrganisationId,
    })
    .from(s.externalRecipients)
    .innerJoin(s.containers, eq(s.externalRecipients.containerId, s.containers.id))
    .innerJoin(s.projects, eq(s.containers.projectId, s.projects.id))
    .innerJoin(s.versions, eq(s.externalRecipients.versionId, s.versions.id))
    .innerJoin(requester.participants, eq(s.externalRecipients.requestedByParticipantId, requester.participants.id))
    .innerJoin(requester.users, eq(requester.participants.userId, requester.users.id))
    .where(
      where.id
        ? eq(s.externalRecipients.id, where.id)
        : where.containerId
          ? eq(s.externalRecipients.containerId, where.containerId)
          : eq(s.containers.projectId, where.projectId!),
    )
    .orderBy(desc(s.externalRecipients.createdAt));
  // the two decision names, looked up in one pass rather than two more joins
  const ids = [
    ...new Set(
      rows.flatMap((r) =>
        [r.recipient.issuedByParticipantId, r.recipient.declinedByParticipantId].filter(
          (v): v is string => v !== null,
        ),
      ),
    ),
  ];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const people = await db
      .select({ participantId: s.participants.id, name: s.users.name })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(inArray(s.participants.id, ids));
    for (const p of people) names.set(p.participantId, p.name);
  }
  return rows.map((r) => ({
    ...r,
    issuedByName: r.recipient.issuedByParticipantId
      ? (names.get(r.recipient.issuedByParticipantId) ?? '')
      : null,
    declinedByName: r.recipient.declinedByParticipantId
      ? (names.get(r.recipient.declinedByParticipantId) ?? '')
      : null,
  }));
}

/**
 * Who sees an external issue at all. The existing transmittal read's posture,
 * applied to a kind with no receiving organisation: the project owner (whose
 * record it is), the ORGANISATION THAT SENT IT (whose act it is), and the
 * producing organisation (which learns that its document left the project,
 * ADR-0055 §8). A fourth firm on the project reads nothing — it could not read
 * another firm's non-review distribution list either.
 */
function visibleTo(row: IssueRow, slice: EntitledSlice): boolean {
  return (
    slice.organisationId === row.projectOwnerOrganisationId ||
    slice.organisationId === row.requestedByOrganisationId ||
    slice.organisationId === row.producingOrganisationId
  );
}

/** The producing organisation learns that it happened, never to whom (§8). */
function mayReadRecipient(row: IssueRow, slice: EntitledSlice): boolean {
  return (
    slice.organisationId === row.projectOwnerOrganisationId ||
    slice.organisationId === row.requestedByOrganisationId
  );
}

function toExternalIssue(row: IssueRow, withRecipient: boolean): ExternalIssue {
  const r = row.recipient;
  return {
    id: r.id,
    containerId: r.containerId,
    documentReference: row.documentReference ?? '',
    versionId: r.versionId,
    versionReference: row.versionReference,
    // withheld means withheld: the fields are emptied here, in row
    // construction, never by a client choosing not to render them
    recipientName: withRecipient ? r.name : '',
    recipientEmail: withRecipient ? r.email : '',
    reason: withRecipient ? r.reason : '',
    message: withRecipient ? r.message : '',
    state: r.state,
    linkToken: withRecipient ? r.linkToken : null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    requestedBy: { participantId: r.requestedByParticipantId, name: row.requestedByName },
    issuedBy:
      r.issuedByParticipantId !== null
        ? { participantId: r.issuedByParticipantId, name: row.issuedByName ?? '' }
        : null,
    declinedBy:
      r.declinedByParticipantId !== null
        ? { participantId: r.declinedByParticipantId, name: row.declinedByName ?? '' }
        : null,
    declineReason: withRecipient ? r.declineReason : null,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    // T-436 — NOT behind `withRecipient`. The receipt says the document was
    // read; it does not say who read it, because nobody knows (ADR-0055 §5).
    // Gating it would withhold a fact of the issue record from the producing
    // organisation whose document left the project — a narrower read than §8
    // asks for, dressed up as caution.
    openedAt: r.openedAt?.toISOString() ?? null,
  };
}

async function issueRead(db: Db, id: string, withRecipient: boolean): Promise<ExternalIssue> {
  const [row] = await listIssues(db, { id });
  return toExternalIssue(row!, withRecipient);
}

/**
 * The token → row resolution, and the only place expiry is decided. An expired
 * link is not a deletion: the row survives so the log still answers who was
 * issued what (the register's own wording) — it simply stops serving.
 */
async function liveRecipient(db: Db, token: string) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 200) return null;
  const [row] = await db
    .select()
    .from(s.externalRecipients)
    .where(
      and(
        eq(s.externalRecipients.linkToken, token),
        eq(s.externalRecipients.state, 'issued'),
        sql`${s.externalRecipients.expiresAt} > now()`,
      ),
    )
    .limit(1);
  return row ?? null;
}
