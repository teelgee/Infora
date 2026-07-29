// T-246 — the conflict register's surfaces (ADR-0046). Two audiences, and the
// whole design turns on keeping them apart:
//
//   the DECLARING ORGANISATION's own admin  → the register itself, in full
//   the PROJECT OWNER                       → the attestation ONLY
//
// The owner never sees an exclusion row, a count, a date from the register or a
// subject (§8). The register reveals which of a firm's people are walled from
// what, which is close to revealing its engagements — so it sits on the
// ADR-0018 private floor, outside even the owner's reach, and what the owner
// gets instead is evidence that a control exists.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { declareExclusionBody, setAttestationRequirementBody } from '@infora/contracts';
import type {
  ApiError,
  ConflictAttestationRecord,
  ConflictExclusionRecord,
  DeclareExclusionResponse,
  Id,
  ListConflictAttestationsResponse,
  ListConflictExclusionsResponse,
  RetrospectiveConflict,
} from '@infora/contracts';
import { canonicalPair } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context, detail: string) =>
  c.json({ error: 'invalid', detail } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/**
 * Live exclusions declared by an organisation, with the display facts the
 * register view needs. Scoped by construction — the organisation id is the
 * caller's own, never supplied.
 */
export async function loadOrgExclusions(db: Db, organisationId: Id, includeWithdrawn = false) {
  const subject = alias(s.users, 'subject');
  const declarer = alias(s.users, 'declarer');
  const projectA = alias(s.projects, 'project_a');
  const projectB = alias(s.projects, 'project_b');
  return db
    .select({
      id: s.conflictExclusions.id,
      grain: s.conflictExclusions.grain,
      subjectUserId: s.conflictExclusions.subjectUserId,
      subjectName: subject.name,
      projectAId: s.conflictExclusions.projectAId,
      projectAName: projectA.name,
      projectBId: s.conflictExclusions.projectBId,
      projectBName: projectB.name,
      reason: s.conflictExclusions.reason,
      declaredByName: declarer.name,
      declaredAt: s.conflictExclusions.declaredAt,
      withdrawnAt: s.conflictExclusions.withdrawnAt,
    })
    .from(s.conflictExclusions)
    .leftJoin(subject, eq(s.conflictExclusions.subjectUserId, subject.id))
    .innerJoin(declarer, eq(s.conflictExclusions.declaredByUserId, declarer.id))
    .innerJoin(projectA, eq(s.conflictExclusions.projectAId, projectA.id))
    .innerJoin(projectB, eq(s.conflictExclusions.projectBId, projectB.id))
    .where(
      and(
        eq(s.conflictExclusions.declaringOrganisationId, organisationId),
        includeWithdrawn ? undefined : isNull(s.conflictExclusions.withdrawnAt),
      ),
    )
    .orderBy(desc(s.conflictExclusions.declaredAt));
}

type ExclusionRow = Awaited<ReturnType<typeof loadOrgExclusions>>[number];

function toRecord(row: ExclusionRow): ConflictExclusionRecord {
  return {
    ...row,
    declaredAt: row.declaredAt.toISOString(),
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
  };
}

/**
 * Live grants an exclusion covers: users of the declaring organisation holding
 * a LIVE Participant on both sides of the pair. Reported on declaration (§4)
 * and never acted on automatically.
 */
export async function retrospectiveConflicts(
  db: Db,
  organisationId: Id,
  exclusion: { grain: 'organisation' | 'individual'; subjectUserId: Id | null; projectAId: Id; projectBId: Id },
): Promise<RetrospectiveConflict[]> {
  const onA = alias(s.participants, 'on_a');
  const onB = alias(s.participants, 'on_b');
  const projectA = alias(s.projects, 'ret_project_a');
  const projectB = alias(s.projects, 'ret_project_b');
  const rows = await db
    .select({
      userId: s.users.id,
      userName: s.users.name,
      projectAId: projectA.id,
      projectAName: projectA.name,
      projectBId: projectB.id,
      projectBName: projectB.name,
    })
    .from(s.users)
    .innerJoin(
      onA,
      and(eq(onA.userId, s.users.id), eq(onA.projectId, exclusion.projectAId), isNull(onA.removedAt)),
    )
    .innerJoin(
      onB,
      and(eq(onB.userId, s.users.id), eq(onB.projectId, exclusion.projectBId), isNull(onB.removedAt)),
    )
    .innerJoin(projectA, eq(projectA.id, exclusion.projectAId))
    .innerJoin(projectB, eq(projectB.id, exclusion.projectBId))
    .where(
      and(
        eq(s.users.organisationId, organisationId),
        // an individual-grain exclusion covers only its named person
        exclusion.grain === 'individual' && exclusion.subjectUserId !== null
          ? eq(s.users.id, exclusion.subjectUserId)
          : undefined,
      ),
    )
    .orderBy(asc(s.users.name));
  return rows;
}

export function conflictRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  // ── The declaring organisation's own register (org admin only) ────────────

  app.get('/organisation/conflict-exclusions', async (c) => {
    const user = c.get('user');
    if (user.orgRole !== 'admin') return notFound(c); // principle 4
    const withdrawn = c.req.query('includeWithdrawn') === 'true';
    const rows = await loadOrgExclusions(deps.db, user.organisationId, withdrawn);
    return c.json({ items: rows.map(toRecord) } satisfies ListConflictExclusionsResponse);
  });

  app.post('/organisation/conflict-exclusions', async (c) => {
    const user = c.get('user');
    if (user.orgRole !== 'admin') return notFound(c);
    const body = declareExclusionBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c, 'projectAId, projectBId and grain required');
    const { grain, reason } = body.data;

    if (body.data.projectAId === body.data.projectBId) {
      return invalid(c, 'an exclusion names two different projects');
    }
    // the two grains are not interchangeable (the DB CHECK agrees)
    if (grain === 'individual' && body.data.subjectUserId === undefined) {
      return invalid(c, 'individual grain names a person');
    }
    if (grain === 'organisation' && body.data.subjectUserId !== undefined) {
      return invalid(c, 'organisation grain binds every participant and names no person');
    }

    // a firm declares walls over its OWN people and the projects it is on —
    // it cannot assert a relation between two projects it has no seat on
    for (const projectId of [body.data.projectAId, body.data.projectBId]) {
      const [seat] = await deps.db
        .select({ id: s.memberships.id })
        .from(s.memberships)
        .where(
          and(
            eq(s.memberships.organisationId, user.organisationId),
            eq(s.memberships.projectId, projectId),
          ),
        )
        .limit(1);
      if (!seat) return notFound(c);
    }
    if (body.data.subjectUserId !== undefined) {
      const [subject] = await deps.db
        .select({ id: s.users.id })
        .from(s.users)
        .where(
          and(
            eq(s.users.id, body.data.subjectUserId),
            eq(s.users.organisationId, user.organisationId),
          ),
        )
        .limit(1);
      if (!subject) return notFound(c); // another firm's person "does not exist"
    }

    // stored canonically so X↔Y and Y↔X collapse to one row (§9)
    const pair = canonicalPair(body.data.projectAId, body.data.projectBId);
    const values = {
      declaringOrganisationId: user.organisationId,
      declaredByUserId: user.id,
      grain,
      subjectUserId: body.data.subjectUserId ?? null,
      ...pair,
      reason: reason ?? null,
    };

    const [created] = await deps.db
      .insert(s.conflictExclusions)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (!created) return c.json({ error: 'conflict', detail: 'already declared' } satisfies ApiError, 409);

    // §4 — report what this now covers; revoke nothing
    const conflicts = await retrospectiveConflicts(deps.db, user.organisationId, {
      grain,
      subjectUserId: values.subjectUserId,
      ...pair,
    });
    const [record] = (await loadOrgExclusions(deps.db, user.organisationId, true)).filter(
      (row) => row.id === created.id,
    );
    return c.json(
      { exclusion: toRecord(record!), retrospectiveConflicts: conflicts } satisfies DeclareExclusionResponse,
      201,
    );
  });

  app.post('/conflict-exclusions/:exclusionId/withdrawal', async (c) => {
    const user = c.get('user');
    const exclusionId = c.req.param('exclusionId');
    if (user.orgRole !== 'admin' || !isUuid(exclusionId)) return notFound(c);
    const [row] = await deps.db
      .select()
      .from(s.conflictExclusions)
      .where(
        and(
          eq(s.conflictExclusions.id, exclusionId),
          // another organisation's exclusion "does not exist" — the register is
          // on the private floor, so even its existence is not disclosed
          eq(s.conflictExclusions.declaringOrganisationId, user.organisationId),
          isNull(s.conflictExclusions.withdrawnAt),
        ),
      )
      .limit(1);
    if (!row) return notFound(c);
    await deps.db
      .update(s.conflictExclusions)
      .set({ withdrawnAt: sql`now()`, withdrawnByUserId: user.id })
      .where(eq(s.conflictExclusions.id, row.id));
    const [updated] = (await loadOrgExclusions(deps.db, user.organisationId, true)).filter(
      (r) => r.id === row.id,
    );
    return c.json(toRecord(updated!));
  });

  // ── The owner's attestation view (no register data, ever) ─────────────────

  app.get('/projects/:projectId/conflict-attestations', project, async (c) => {
    const slice = c.get('slice');
    if (slice.membershipRole !== 'owner') return notFound(c);
    const [projectRow] = await deps.db
      .select({ required: s.projects.conflictAttestationRequired })
      .from(s.projects)
      .where(eq(s.projects.id, slice.projectId))
      .limit(1);

    const attestation = alias(s.conflictAttestations, 'live_attestation');
    const attester = alias(s.users, 'attester');
    const rows = await deps.db
      .select({
        organisationId: s.organisations.id,
        organisationName: s.organisations.name,
        attestedByName: attester.name,
        attestedAt: attestation.attestedAt,
      })
      .from(s.memberships)
      .innerJoin(s.organisations, eq(s.memberships.organisationId, s.organisations.id))
      .leftJoin(
        attestation,
        and(
          eq(attestation.projectId, slice.projectId),
          eq(attestation.organisationId, s.organisations.id),
          isNull(attestation.supersededAt),
        ),
      )
      .leftJoin(attester, eq(attestation.attestedByUserId, attester.id))
      .where(
        and(
          eq(s.memberships.projectId, slice.projectId),
          // the owner attests to nobody; the requirement is on its members
          ne(s.memberships.organisationId, slice.organisationId),
        ),
      )
      .orderBy(asc(s.organisations.name));

    // NOTE: this payload deliberately carries no exclusion data — not a row,
    // not a count, not a subject, not a date from the register (§8). The only
    // dates here are the attestation's own.
    const items: ConflictAttestationRecord[] = rows.map((row) => ({
      organisationId: row.organisationId,
      organisationName: row.organisationName,
      attested: row.attestedAt !== null,
      attestedByName: row.attestedByName,
      attestedAt: row.attestedAt?.toISOString() ?? null,
    }));
    return c.json({ required: projectRow?.required ?? false, items } satisfies ListConflictAttestationsResponse);
  });

  app.patch('/projects/:projectId/conflict-attestation', project, async (c) => {
    const slice = c.get('slice');
    if (slice.membershipRole !== 'owner') return notFound(c);
    const body = setAttestationRequirementBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return invalid(c, 'required must be a boolean');
    await deps.db
      .update(s.projects)
      .set({ conflictAttestationRequired: body.data.required })
      .where(eq(s.projects.id, slice.projectId));
    return c.json({ required: body.data.required });
  });

  // A member organisation's admin attests. Re-attesting supersedes the prior
  // record rather than overwriting it, so the history survives.
  app.post('/projects/:projectId/conflict-attestation', async (c) => {
    const user = c.get('user');
    const projectId = c.req.param('projectId');
    if (user.orgRole !== 'admin' || !isUuid(projectId)) return notFound(c);
    const [seat] = await deps.db
      .select({ id: s.memberships.id })
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.organisationId, user.organisationId),
          eq(s.memberships.projectId, projectId),
          eq(s.memberships.state, 'active'),
        ),
      )
      .limit(1);
    if (!seat) return notFound(c);

    await deps.db
      .update(s.conflictAttestations)
      .set({ supersededAt: sql`now()` })
      .where(
        and(
          eq(s.conflictAttestations.projectId, projectId),
          eq(s.conflictAttestations.organisationId, user.organisationId),
          isNull(s.conflictAttestations.supersededAt),
        ),
      );
    const [created] = await deps.db
      .insert(s.conflictAttestations)
      .values({ projectId, organisationId: user.organisationId, attestedByUserId: user.id })
      .returning();
    return c.json({ attestedAt: created!.attestedAt.toISOString() }, 201);
  });

  return app;
}
