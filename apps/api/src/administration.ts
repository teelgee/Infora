// T-117 — access administration + the roster (ADR-0033, contracts §4).
// The two levels exercised as endpoints: the owner opens an organisation's
// seat (Membership, propose-then-confirm per ADR-0019); each organisation's
// org admin staffs it (Participant intervals). The roster is project-visible
// to every Participant — the wall hides work, never presence.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { addMembershipBody, enrolParticipantBody, purgeRequestBody } from '@infora/contracts';
import type {
  ApiError,
  ListOrgUsersResponse,
  ListRosterResponse,
  MembershipRecord,
  RosterEntry,
  ListPurgesResponse,
  PurgeResponse,
} from '@infora/contracts';
import { CONFLICT_REFUSAL, conflictBlocks } from '@infora/governance';
import type { ConflictExclusion } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope } from './requester';
import { purgeSandboxDocument } from './purge';
import type { AppEnv, UserRow } from './requester';

/**
 * T-246 — load the facts the T-245 predicate judges, and judge them: does a
 * live exclusion declared by this organisation bar this user from this project?
 * Returns the blocking exclusion (so the refusal can be audited to it) or null.
 *
 * Two queries, both indexed, and the first returns nothing for the
 * overwhelming majority of organisations — which have no exclusions at all.
 */
async function conflictBlockingGrant(
  db: Db,
  target: { userId: string; organisationId: string; projectId: string },
): Promise<ConflictExclusion | null> {
  const exclusions = await db
    .select({
      id: s.conflictExclusions.id,
      declaringOrganisationId: s.conflictExclusions.declaringOrganisationId,
      grain: s.conflictExclusions.grain,
      subjectUserId: s.conflictExclusions.subjectUserId,
      projectAId: s.conflictExclusions.projectAId,
      projectBId: s.conflictExclusions.projectBId,
      withdrawnAt: s.conflictExclusions.withdrawnAt,
    })
    .from(s.conflictExclusions)
    .where(
      and(
        eq(s.conflictExclusions.declaringOrganisationId, target.organisationId),
        isNull(s.conflictExclusions.withdrawnAt),
      ),
    );
  if (exclusions.length === 0) return null; // the common case, one indexed hit

  const held = await db
    .select({ projectId: s.participants.projectId })
    .from(s.participants)
    .where(and(eq(s.participants.userId, target.userId), isNull(s.participants.removedAt)));

  return conflictBlocks({
    user: { id: target.userId, organisationId: target.organisationId },
    targetProjectId: target.projectId,
    otherLiveProjectIds: held.map((row) => row.projectId),
    exclusions,
  });
}

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/**
 * The org-admin gate for staffing a project (ADR-0033): the requester is
 * their organisation's admin AND that organisation holds an ACTIVE seat on
 * the project. Deliberately not Participant-based — an admin staffs the seat
 * whether or not they work the project themselves. Deny is the usual 404.
 */
async function adminSeat(db: Db, user: UserRow, projectId: string) {
  if (user.orgRole !== 'admin' || !isUuid(projectId)) return null;
  const [membership] = await db
    .select()
    .from(s.memberships)
    .where(
      and(
        eq(s.memberships.organisationId, user.organisationId),
        eq(s.memberships.projectId, projectId),
        eq(s.memberships.state, 'active'),
      ),
    )
    .limit(1);
  return membership ?? null;
}

export { adminSeat };

async function rosterEntry(db: Db, participantId: string): Promise<RosterEntry> {
  const [row] = await db
    .select({
      participantId: s.participants.id,
      userId: s.users.id,
      name: s.users.name,
      organisationId: s.organisations.id,
      organisationName: s.organisations.name,
      membershipRole: s.memberships.role,
      removedAt: s.participants.removedAt,
    })
    .from(s.participants)
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .innerJoin(s.organisations, eq(s.users.organisationId, s.organisations.id))
    .innerJoin(
      s.memberships,
      and(
        eq(s.memberships.organisationId, s.users.organisationId),
        eq(s.memberships.projectId, s.participants.projectId),
      ),
    )
    .where(eq(s.participants.id, participantId))
    .limit(1);
  return { ...row!, removedAt: row!.removedAt?.toISOString() ?? null };
}

function toMembership(
  row: typeof s.memberships.$inferSelect,
  organisationName: string,
): MembershipRecord {
  return {
    id: row.id,
    organisationId: row.organisationId,
    organisationName,
    projectId: row.projectId,
    role: row.role,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
  };
}

export function administrationRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  // The project roster — WIDENED from the T-112 org-scoped picker (ADR-0033):
  // every Participant sees every Participant's name, organisation and project
  // role. Removed entries stay listed for attribution; pickers filter live.
  app.get('/projects/:projectId/participants', project, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select({
        participantId: s.participants.id,
        userId: s.users.id,
        name: s.users.name,
        organisationId: s.organisations.id,
        organisationName: s.organisations.name,
        membershipRole: s.memberships.role,
        removedAt: s.participants.removedAt,
      })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .innerJoin(s.organisations, eq(s.users.organisationId, s.organisations.id))
      .innerJoin(
        s.memberships,
        and(
          eq(s.memberships.organisationId, s.users.organisationId),
          eq(s.memberships.projectId, s.participants.projectId),
        ),
      )
      .where(eq(s.participants.projectId, slice.projectId))
      .orderBy(asc(s.users.name));
    const items = rows.map((r) => ({ ...r, removedAt: r.removedAt?.toISOString() ?? null }));
    return c.json({ items } satisfies ListRosterResponse);
  });

  // The enrol picker: the requester's OWN organisation's users; org admin only.
  app.get('/organisation/users', async (c) => {
    const user = c.get('user');
    if (user.orgRole !== 'admin') return notFound(c);
    const rows = await deps.db
      .select({
        userId: s.users.id,
        name: s.users.name,
        email: s.users.email,
        orgRole: s.users.orgRole,
      })
      .from(s.users)
      .where(eq(s.users.organisationId, user.organisationId))
      .orderBy(asc(s.users.name));
    return c.json({ items: rows } satisfies ListOrgUsersResponse);
  });

  // Org admin enrols their own organisation's user (ADR-0015 level two).
  app.post('/projects/:projectId/participants', async (c) => {
    const user = c.get('user');
    const projectId = c.req.param('projectId');
    const seat = await adminSeat(deps.db, user, projectId);
    if (!seat) return notFound(c);
    const body = enrolParticipantBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);
    // the target must be the admin's own organisation's user — the ceiling binds
    const [target] = await deps.db
      .select()
      .from(s.users)
      .where(and(eq(s.users.id, body.data.userId), eq(s.users.organisationId, user.organisationId)))
      .limit(1);
    if (!target) return notFound(c);
    const [live] = await deps.db
      .select({ id: s.participants.id })
      .from(s.participants)
      .where(
        and(
          eq(s.participants.userId, target.id),
          eq(s.participants.projectId, projectId),
          isNull(s.participants.removedAt),
        ),
      )
      .limit(1);
    if (live) return c.json({ error: 'conflict' } satisfies ApiError, 409);

    // T-246 (ADR-0046) — the conflict register refuses the grant. `forbidden`,
    // not `not_found`: the requester is this organisation's own admin and can
    // already see both the project and the user, so existence is not what is
    // being protected (errors.ts — forbidden is only ever used inside an
    // entitled scope). The message names that a wall applies and NOTHING it
    // protects — not the other scheme, not the engagement, not the party (§9).
    const blocking = await conflictBlockingGrant(deps.db, {
      userId: target.id,
      organisationId: user.organisationId,
      projectId,
    });
    if (blocking) {
      await deps.db.insert(s.conflictRefusals).values({
        exclusionId: blocking.id,
        projectId,
        attemptedByUserId: user.id,
        subjectUserId: target.id,
      });
      return c.json({ error: 'forbidden', detail: CONFLICT_REFUSAL } satisfies ApiError, 403);
    }

    // the enrolling admin's own live participant row, when they have one —
    // seeded/first users carry null (contracts §4)
    const [adminParticipant] = await deps.db
      .select({ id: s.participants.id })
      .from(s.participants)
      .where(
        and(
          eq(s.participants.userId, user.id),
          eq(s.participants.projectId, projectId),
          isNull(s.participants.removedAt),
        ),
      )
      .limit(1);
    const [created] = await deps.db
      .insert(s.participants)
      .values({
        userId: target.id,
        projectId,
        addedByParticipantId: adminParticipant?.id ?? null,
      })
      .returning();
    return c.json(await rosterEntry(deps.db, created!.id), 201);
  });

  // Org admin removes their own organisation's participant: the interval
  // closes (the row survives — attribution stands) and live appointment
  // grants auto-revoke from that moment (ADR-0033).
  app.delete('/projects/:projectId/participants/:participantId', async (c) => {
    const user = c.get('user');
    const projectId = c.req.param('projectId');
    const participantId = c.req.param('participantId');
    const seat = await adminSeat(deps.db, user, projectId);
    if (!seat || !isUuid(participantId)) return notFound(c);
    const [row] = await deps.db
      .select({ id: s.participants.id, userId: s.participants.userId })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(
        and(
          eq(s.participants.id, participantId),
          eq(s.participants.projectId, projectId),
          eq(s.users.organisationId, user.organisationId),
          isNull(s.participants.removedAt),
        ),
      )
      .limit(1);
    if (!row) return notFound(c);
    await deps.db
      .update(s.participants)
      .set({ removedAt: sql`now()` })
      .where(eq(s.participants.id, row.id));
    await deps.db
      .update(s.deliverableAuthors)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(s.deliverableAuthors.participantId, row.id), isNull(s.deliverableAuthors.revokedAt)));
    await deps.db
      .update(s.deliverableReviewers)
      .set({ revokedAt: sql`now()` })
      .where(
        and(eq(s.deliverableReviewers.participantId, row.id), isNull(s.deliverableReviewers.revokedAt)),
      );
    return c.json(await rosterEntry(deps.db, row.id));
  });

  // The owner grants a seat (state active); a member proposes one (state
  // proposed — confers nothing until confirmed, ADR-0019).
  app.post('/projects/:projectId/memberships', project, async (c) => {
    const slice = c.get('slice');
    const body = addMembershipBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);
    const [organisation] = await deps.db
      .select()
      .from(s.organisations)
      .where(eq(s.organisations.id, body.data.organisationId))
      .limit(1);
    if (!organisation) return notFound(c);
    const [existing] = await deps.db
      .select({ id: s.memberships.id })
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.organisationId, organisation.id),
          eq(s.memberships.projectId, slice.projectId),
        ),
      )
      .limit(1);
    if (existing) return c.json({ error: 'conflict' } satisfies ApiError, 409);
    const [created] = await deps.db
      .insert(s.memberships)
      .values({
        organisationId: organisation.id,
        projectId: slice.projectId,
        role: 'member',
        state: slice.membershipRole === 'owner' ? 'active' : 'proposed',
        addedByParticipantId: slice.participantId,
      })
      .returning();
    return c.json(toMembership(created!, organisation.name), 201);
  });

  // The owner confirms a proposed seat (ADR-0019 as data).
  app.post('/memberships/:membershipId/confirmation', async (c) => {
    const user = c.get('user');
    const membershipId = c.req.param('membershipId');
    if (!isUuid(membershipId)) return notFound(c);
    const [row] = await deps.db
      .select()
      .from(s.memberships)
      .where(eq(s.memberships.id, membershipId))
      .limit(1);
    if (!row) return notFound(c);
    // only the project owner's organisation confirms
    const [ownerMembership] = await deps.db
      .select({ id: s.memberships.id })
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.projectId, row.projectId),
          eq(s.memberships.organisationId, user.organisationId),
          eq(s.memberships.role, 'owner'),
        ),
      )
      .limit(1);
    if (!ownerMembership) return notFound(c);
    const [updated] = await deps.db
      .update(s.memberships)
      .set({ state: 'active' })
      .where(eq(s.memberships.id, row.id))
      .returning();
    const [organisation] = await deps.db
      .select()
      .from(s.organisations)
      .where(eq(s.organisations.id, row.organisationId))
      .limit(1);
    return c.json(toMembership(updated!, organisation!.name));
  });

  // T-340 — Purge (ADR-0050 §5–§6): the second deletion act. Org-admin only,
  // behind a typed confirmation, recorded with a name against it.
  //
  // **On the administration surface rather than beside Delete**, deliberately.
  // Delete is self-service and lives with the document; purge is an
  // organisation-level act with a different tier, a different blast radius and
  // no undo, and putting the two buttons side by side is how the wrong one
  // gets pressed. The tier is the same `adminSeat` every other act on this
  // surface uses: an admin of an organisation holding an active seat.
  //
  // The typed confirmation is enforced HERE, not only in the browser. A
  // client-side-only confirmation is a speed bump for a person and nothing at
  // all for a script, and this is the one act with no undo.
  app.post('/projects/:projectId/purges', async (c) => {
    const user = c.get('user');
    const projectId = c.req.param('projectId');
    const seat = await adminSeat(deps.db, user, projectId);
    if (!seat) return notFound(c);
    const body = purgeRequestBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);

    const [document] = await deps.db
      .select({ title: s.sandboxDocuments.title })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, body.data.sandboxDocumentId))
      .limit(1);
    if (!document) return notFound(c);
    // the confirmation is the document's own title, typed: a phrase the person
    // has to read the row to know, rather than a word they can reflex past
    if (body.data.confirmation.trim() !== document.title.trim()) {
      return c.json(
        {
          error: 'invalid',
          detail: 'confirmation_mismatch',
          hint: `type the document's title exactly: ${document.title}`,
        } satisfies ApiError,
        400,
      );
    }

    const result = await purgeSandboxDocument(deps.db, {
      documentId: body.data.sandboxDocumentId,
      projectId,
      organisationId: user.organisationId,
      userId: user.id,
    });
    // "not yours" and "not there" look the same from outside (principle 4)
    if (result === null) return notFound(c);
    return c.json({ purgeId: result.eventId, reached: result.reach } satisfies PurgeResponse);
  });

  // The record of what has been purged — its own organisation's only. A control
  // nobody can see operating is a control nobody can audit (the same reasoning
  // as `elevated_refusals`, T-301), and here it is sharper: the subject is gone,
  // so this row is the only evidence the act ever happened.
  app.get('/projects/:projectId/purges', async (c) => {
    const user = c.get('user');
    const seat = await adminSeat(deps.db, user, c.req.param('projectId'));
    if (!seat) return notFound(c);
    const rows = await deps.db
      .select({
        id: s.purgeEvents.id,
        subjectKind: s.purgeEvents.subjectKind,
        subjectTitle: s.purgeEvents.subjectTitle,
        reached: s.purgeEvents.reached,
        purgedAt: s.purgeEvents.purgedAt,
        purgedByName: s.users.name,
      })
      .from(s.purgeEvents)
      .innerJoin(s.users, eq(s.users.id, s.purgeEvents.purgedByUserId))
      .where(
        and(
          eq(s.purgeEvents.projectId, c.req.param('projectId')),
          eq(s.purgeEvents.organisationId, user.organisationId),
        ),
      )
      .orderBy(desc(s.purgeEvents.purgedAt));
    return c.json({
      items: rows.map((row) => ({
        ...row,
        reached: row.reached as PurgeResponse['reached'],
        purgedAt: row.purgedAt.toISOString(),
      })),
    } satisfies ListPurgesResponse);
  });

  return app;
}
