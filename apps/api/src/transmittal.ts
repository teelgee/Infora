// T-137 — the write half of ADR-0035: the non-review transmittal (owner
// issues a promoted library deliverable to organisations, §1–§2), the
// organisation-level acknowledgement gate (mode-aware, §4), intra-organisation
// narrowing (org admin / controller, §3), and the standing routing rule (§3,
// MVP). The retrieval pre-filter and canReadDeliverable enforce these facts;
// this module writes them. Access resolution runs before any write; deny is
// the usual 404, and no parameter widens a requester's scope.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  createGrantRuleBody,
  grantParticipantBody,
  issueTransmittalBody,
  setAckModeBody,
} from '@infora/contracts';
import type {
  Acknowledgement,
  AcknowledgementModeSetting,
  ApiError,
  GrantRule,
  ListGrantRulesResponse,
  NonReviewTransmittal,
  ParticipantGrant,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { EntitledSlice } from '@infora/governance';
import { resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const conflict = (c: Context, detail?: string) =>
  c.json({ error: 'conflict', ...(detail && { detail }) } satisfies ApiError, 409);
const forbidden = (c: Context, detail?: string) =>
  c.json({ error: 'forbidden', ...(detail && { detail }) } satisfies ApiError, 403);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

type ContainerRow = typeof s.containers.$inferSelect;
type MembershipRow = typeof s.memberships.$inferSelect;

export function transmittalRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  // a library-scope container (a deliverable, ADR-0032) — sandbox-scope
  // freeze-series containers are never transmitted across the wall
  async function loadLibraryContainer(containerId: string): Promise<ContainerRow | null> {
    if (!isUuid(containerId)) return null;
    const [row] = await deps.db
      .select()
      .from(s.containers)
      .where(and(eq(s.containers.id, containerId), eq(s.containers.scope, 'library')))
      .limit(1);
    return row ?? null;
  }

  async function currentVersion(containerId: string) {
    const [row] = await deps.db
      .select({ id: s.versions.id })
      .from(s.versions)
      .where(and(eq(s.versions.containerId, containerId), eq(s.versions.isCurrent, true)))
      .limit(1);
    return row ?? null;
  }

  async function liveShare(containerId: string, organisationId: string) {
    const [row] = await deps.db
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

  async function activeMembership(organisationId: string, projectId: string) {
    const [row] = await deps.db
      .select()
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.organisationId, organisationId),
          eq(s.memberships.projectId, projectId),
          eq(s.memberships.state, 'active'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // the receiving organisation's own business (§3): its org admin, or its
  // nominated controller in controller mode — never the project owner
  function canNarrow(user: UserRow, slice: EntitledSlice, membership: MembershipRow): boolean {
    if (user.orgRole === 'admin') return true;
    return (
      membership.ackMode === 'controller' &&
      membership.ackControllerParticipantId === slice.participantId
    );
  }

  // §3: on issue, each receiving org's live rules whose code pattern matches the
  // deliverable reference grant their Participants automatically (idempotent)
  async function applyStandingRules(container: ContainerRow, recipientOrgs: string[]): Promise<void> {
    if (!container.documentReference) return;
    for (const organisationId of recipientOrgs) {
      const rules = await deps.db
        .select()
        .from(s.deliverableGrantRules)
        .where(
          and(
            eq(s.deliverableGrantRules.projectId, container.projectId),
            eq(s.deliverableGrantRules.organisationId, organisationId),
            isNull(s.deliverableGrantRules.revokedAt),
            sql`${container.documentReference} like ${s.deliverableGrantRules.codePattern}`,
          ),
        );
      for (const rule of rules) {
        const existing = await liveParticipantGrant(container.id, rule.participantId);
        if (!existing) {
          await deps.db.insert(s.deliverableParticipantGrants).values({
            containerId: container.id,
            organisationId,
            participantId: rule.participantId,
            grantedByParticipantId: rule.createdByParticipantId,
          });
        }
      }
    }
  }

  async function liveParticipantGrant(containerId: string, participantId: string) {
    const [row] = await deps.db
      .select({ id: s.deliverableParticipantGrants.id })
      .from(s.deliverableParticipantGrants)
      .where(
        and(
          eq(s.deliverableParticipantGrants.containerId, containerId),
          eq(s.deliverableParticipantGrants.participantId, participantId),
          isNull(s.deliverableParticipantGrants.revokedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // ── 1. The owner issues a non-review transmittal (§1–§2) ─────────────────
  app.post('/containers/:containerId/transmittals', async (c) => {
    const container = await loadLibraryContainer(c.req.param('containerId'));
    if (!container) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), container.projectId);
    if (!slice || slice.membershipRole !== 'owner') return notFound(c);
    const body = issueTransmittalBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    const version = await currentVersion(container.id);
    // a non-review transmittal issues a PROMOTED deliverable — it needs a version
    if (!version) return conflict(c, 'no_current_version');

    const recipients = [...new Set(body.data.organisationIds)];
    // every recipient must hold an active seat; the owner and the producer see
    // it ungated and are never valid non-review recipients (§2)
    for (const organisationId of recipients) {
      if (
        organisationId === container.producingOrganisationId ||
        organisationId === slice.organisationId
      ) {
        return conflict(c, 'recipient_ungated');
      }
      if (!(await activeMembership(organisationId, container.projectId))) return notFound(c);
    }

    // set each receiving org's ceiling (the share) if not already open (§2)
    for (const organisationId of recipients) {
      if (!(await liveShare(container.id, organisationId))) {
        await deps.db.insert(s.deliverableShares).values({
          containerId: container.id,
          organisationId,
          grantedByParticipantId: slice.participantId,
        });
      }
    }
    const [transmittal] = await deps.db
      .insert(s.transmittals)
      .values({
        kind: 'non_review',
        containerId: container.id,
        versionId: version.id,
        senderParticipantId: slice.participantId,
        recipientOrganisationIds: recipients,
        purposeCode: body.data.purposeCode ?? null,
      })
      .returning();
    await applyStandingRules(container, recipients);
    return c.json(toTransmittal(transmittal!), 201);
  });

  // ── 2. The organisation-level acknowledgement (§4), mode-aware ───────────
  app.post('/containers/:containerId/acknowledgement', async (c) => {
    const container = await loadLibraryContainer(c.req.param('containerId'));
    if (!container) return notFound(c);
    const user = c.get('user');
    const slice = await resolveSlice(deps.db, user, container.projectId);
    if (!slice) return notFound(c);
    // there must be something to acknowledge — a live share to the requester's org
    if (!(await liveShare(container.id, slice.organisationId))) return notFound(c);
    const membership = await activeMembership(slice.organisationId, container.projectId);
    if (!membership) return notFound(c);
    // controller mode: only the nominated controller may fire it, with the org
    // admin as the fallback so an org with no controller yet is never locked out
    if (membership.ackMode === 'controller') {
      const isController = membership.ackControllerParticipantId === slice.participantId;
      if (!isController && user.orgRole !== 'admin') return forbidden(c, 'controller_only');
    }
    const version = await currentVersion(container.id);
    if (!version) return conflict(c, 'no_current_version');
    const [existing] = await deps.db
      .select({ id: s.deliverableAcknowledgements.id })
      .from(s.deliverableAcknowledgements)
      .where(
        and(
          eq(s.deliverableAcknowledgements.versionId, version.id),
          eq(s.deliverableAcknowledgements.organisationId, slice.organisationId),
        ),
      )
      .limit(1);
    // one acknowledgement per (version, organisation) — the gate is already open
    if (existing) return conflict(c, 'already_acknowledged');
    const [ack] = await deps.db
      .insert(s.deliverableAcknowledgements)
      .values({
        containerId: container.id,
        versionId: version.id,
        organisationId: slice.organisationId,
        acknowledgedByParticipantId: slice.participantId,
      })
      .returning();
    return c.json(await ackRead(deps.db, ack!.id), 201);
  });

  // ── 3. Intra-organisation narrowing (§3) ─────────────────────────────────
  app.post('/containers/:containerId/participant-grants', async (c) => {
    const container = await loadLibraryContainer(c.req.param('containerId'));
    if (!container) return notFound(c);
    const user = c.get('user');
    const slice = await resolveSlice(deps.db, user, container.projectId);
    if (!slice) return notFound(c);
    const membership = await activeMembership(slice.organisationId, container.projectId);
    if (!membership || !canNarrow(user, slice, membership)) return notFound(c);
    // the narrowing sits UNDER the organisation ceiling — a live share (§3)
    if (!(await liveShare(container.id, slice.organisationId))) return notFound(c);
    const body = grantParticipantBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    // the target must be a live Participant of the requester's own organisation
    const [target] = await deps.db
      .select({ id: s.participants.id })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(
        and(
          eq(s.participants.id, body.data.participantId),
          eq(s.participants.projectId, container.projectId),
          eq(s.users.organisationId, slice.organisationId),
          isNull(s.participants.removedAt),
        ),
      )
      .limit(1);
    if (!target) return notFound(c);
    if (await liveParticipantGrant(container.id, target.id)) return conflict(c);
    const [grant] = await deps.db
      .insert(s.deliverableParticipantGrants)
      .values({
        containerId: container.id,
        organisationId: slice.organisationId,
        participantId: target.id,
        grantedByParticipantId: slice.participantId,
      })
      .returning();
    return c.json(await grantRead(deps.db, grant!.id), 201);
  });

  app.post('/participant-grants/:grantId/revocation', async (c) => {
    const grantId = c.req.param('grantId');
    if (!isUuid(grantId)) return notFound(c);
    const [grant] = await deps.db
      .select()
      .from(s.deliverableParticipantGrants)
      .where(eq(s.deliverableParticipantGrants.id, grantId))
      .limit(1);
    if (!grant || grant.revokedAt) return notFound(c);
    const container = await loadLibraryContainer(grant.containerId);
    if (!container) return notFound(c);
    const user = c.get('user');
    const slice = await resolveSlice(deps.db, user, container.projectId);
    if (!slice || slice.organisationId !== grant.organisationId) return notFound(c);
    const membership = await activeMembership(slice.organisationId, container.projectId);
    if (!membership || !canNarrow(user, slice, membership)) return notFound(c);
    await deps.db
      .update(s.deliverableParticipantGrants)
      .set({ revokedAt: sql`now()` })
      .where(eq(s.deliverableParticipantGrants.id, grant.id));
    return c.json(await grantRead(deps.db, grant.id));
  });

  // ── 4. The standing routing rule (§3, MVP) ───────────────────────────────
  app.get('/projects/:projectId/grant-rules', async (c) => {
    const projectId = c.req.param('projectId');
    const slice = await resolveSlice(deps.db, c.get('user'), projectId);
    if (!slice) return notFound(c);
    // an organisation's own rules only — its narrowing is its own business
    const rows = await deps.db
      .select({ rule: s.deliverableGrantRules, name: s.users.name })
      .from(s.deliverableGrantRules)
      .innerJoin(s.participants, eq(s.deliverableGrantRules.participantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(
        and(
          eq(s.deliverableGrantRules.projectId, projectId),
          eq(s.deliverableGrantRules.organisationId, slice.organisationId),
          isNull(s.deliverableGrantRules.revokedAt),
        ),
      )
      .orderBy(asc(s.deliverableGrantRules.codePattern));
    const items = rows.map(({ rule, name }) => toGrantRule(rule, name));
    return c.json({ items } satisfies ListGrantRulesResponse);
  });

  app.post('/projects/:projectId/grant-rules', async (c) => {
    const projectId = c.req.param('projectId');
    const user = c.get('user');
    const slice = await resolveSlice(deps.db, user, projectId);
    if (!slice) return notFound(c);
    const membership = await activeMembership(slice.organisationId, projectId);
    if (!membership || !canNarrow(user, slice, membership)) return notFound(c);
    const body = createGrantRuleBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    // the ruled participant must be a live Participant of the requester's org
    const [target] = await deps.db
      .select({ id: s.participants.id })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(
        and(
          eq(s.participants.id, body.data.participantId),
          eq(s.participants.projectId, projectId),
          eq(s.users.organisationId, slice.organisationId),
          isNull(s.participants.removedAt),
        ),
      )
      .limit(1);
    if (!target) return notFound(c);
    const [rule] = await deps.db
      .insert(s.deliverableGrantRules)
      .values({
        projectId,
        organisationId: slice.organisationId,
        codePattern: body.data.codePattern,
        participantId: target.id,
        createdByParticipantId: slice.participantId,
      })
      .returning();
    return c.json(await grantRuleRead(deps.db, rule!.id), 201);
  });

  app.post('/grant-rules/:ruleId/revocation', async (c) => {
    const ruleId = c.req.param('ruleId');
    if (!isUuid(ruleId)) return notFound(c);
    const [rule] = await deps.db
      .select()
      .from(s.deliverableGrantRules)
      .where(eq(s.deliverableGrantRules.id, ruleId))
      .limit(1);
    if (!rule || rule.revokedAt) return notFound(c);
    const user = c.get('user');
    const slice = await resolveSlice(deps.db, user, rule.projectId);
    if (!slice || slice.organisationId !== rule.organisationId) return notFound(c);
    const membership = await activeMembership(slice.organisationId, rule.projectId);
    if (!membership || !canNarrow(user, slice, membership)) return notFound(c);
    await deps.db
      .update(s.deliverableGrantRules)
      .set({ revokedAt: sql`now()` })
      .where(eq(s.deliverableGrantRules.id, rule.id));
    return c.json(await grantRuleRead(deps.db, rule.id));
  });

  // ── 5. The acknowledgement-mode setting (§4) ─────────────────────────────
  app.patch('/projects/:projectId/acknowledgement-mode', async (c) => {
    const projectId = c.req.param('projectId');
    const user = c.get('user');
    const slice = await resolveSlice(deps.db, user, projectId);
    if (!slice) return notFound(c);
    // the org admin sets its own organisation's mode (never the project owner's)
    const membership = await activeMembership(slice.organisationId, projectId);
    if (!membership || user.orgRole !== 'admin') return notFound(c);
    const body = setAckModeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c);
    let controllerParticipantId: string | null = null;
    if (body.data.mode === 'controller' && body.data.controllerParticipantId) {
      // the controller must be a live Participant of this organisation
      const [target] = await deps.db
        .select({ id: s.participants.id })
        .from(s.participants)
        .innerJoin(s.users, eq(s.participants.userId, s.users.id))
        .where(
          and(
            eq(s.participants.id, body.data.controllerParticipantId),
            eq(s.participants.projectId, projectId),
            eq(s.users.organisationId, slice.organisationId),
            isNull(s.participants.removedAt),
          ),
        )
        .limit(1);
      if (!target) return notFound(c);
      controllerParticipantId = target.id;
    }
    const [updated] = await deps.db
      .update(s.memberships)
      .set({ ackMode: body.data.mode, ackControllerParticipantId: controllerParticipantId })
      .where(eq(s.memberships.id, membership.id))
      .returning();
    return c.json({
      organisationId: updated!.organisationId,
      projectId: updated!.projectId,
      mode: updated!.ackMode,
      controllerParticipantId: updated!.ackControllerParticipantId,
    } satisfies AcknowledgementModeSetting);
  });

  return app;
}

function toTransmittal(row: typeof s.transmittals.$inferSelect): NonReviewTransmittal {
  return {
    id: row.id,
    containerId: row.containerId!,
    versionId: row.versionId!,
    recipientOrganisationIds: row.recipientOrganisationIds,
    purposeCode: row.purposeCode ?? null,
    issuedAt: row.issuedAt.toISOString(),
  };
}

async function ackRead(db: Db, ackId: string): Promise<Acknowledgement> {
  const [row] = await db
    .select({ ack: s.deliverableAcknowledgements, name: s.users.name })
    .from(s.deliverableAcknowledgements)
    .innerJoin(s.participants, eq(s.deliverableAcknowledgements.acknowledgedByParticipantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.deliverableAcknowledgements.id, ackId))
    .limit(1);
  return {
    id: row!.ack.id,
    containerId: row!.ack.containerId,
    versionId: row!.ack.versionId,
    organisationId: row!.ack.organisationId,
    acknowledgedBy: { participantId: row!.ack.acknowledgedByParticipantId, name: row!.name },
    acknowledgedAt: row!.ack.acknowledgedAt.toISOString(),
  };
}

async function grantRead(db: Db, grantId: string): Promise<ParticipantGrant> {
  const [row] = await db
    .select({ grant: s.deliverableParticipantGrants, name: s.users.name })
    .from(s.deliverableParticipantGrants)
    .innerJoin(s.participants, eq(s.deliverableParticipantGrants.participantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.deliverableParticipantGrants.id, grantId))
    .limit(1);
  return {
    id: row!.grant.id,
    containerId: row!.grant.containerId,
    organisationId: row!.grant.organisationId,
    participantId: row!.grant.participantId,
    name: row!.name,
    grantedAt: row!.grant.grantedAt.toISOString(),
    revokedAt: row!.grant.revokedAt?.toISOString() ?? null,
  };
}

function toGrantRule(row: typeof s.deliverableGrantRules.$inferSelect, name: string): GrantRule {
  return {
    id: row.id,
    projectId: row.projectId,
    organisationId: row.organisationId,
    codePattern: row.codePattern,
    participantId: row.participantId,
    name,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

async function grantRuleRead(db: Db, ruleId: string): Promise<GrantRule> {
  const [row] = await db
    .select({ rule: s.deliverableGrantRules, name: s.users.name })
    .from(s.deliverableGrantRules)
    .innerJoin(s.participants, eq(s.deliverableGrantRules.participantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(eq(s.deliverableGrantRules.id, ruleId))
    .limit(1);
  return toGrantRule(row!.rule, row!.name);
}
