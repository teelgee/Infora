// Drawer 1 — parties & access (data-model.md; ADR-0015–0018, ADR-0033).
// Every other table is scoped by these.
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const membershipRole = pgEnum('membership_role', ['owner', 'member']);
// ADR-0019's member-proposes-owner-confirms, carried as data (ADR-0033, T-113)
export const membershipState = pgEnum('membership_state', ['proposed', 'active']);
// an org admin manages the organisation's own users and enrols/removes them
// on projects the org is a member of — never a project-level power (ADR-0033)
export const orgRole = pgEnum('org_role', ['admin', 'member']);
// who may fire the organisation-level acknowledgement of a non-review
// transmittal (ADR-0035 §4). controller: only the nominated document
// controller may acknowledge, then defines the intra-org narrowing (the ISO
// 19650 receipt-then-distribute pattern). open: any entitled Participant may,
// the first firing clearing the org gate. Default controller (owner-ruled
// 2026-07-20); the org admin is the fallback acknowledger so a controller-mode
// organisation with no controller yet nominated is never locked out.
export const acknowledgementMode = pgEnum('acknowledgement_mode', ['controller', 'open']);

export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    orgRole: orgRole('org_role').notNull().default('member'),
    // the Entra ID / M365 subject; maps a Copilot SSO login to this user (ADR-0031)
    externalIdentity: text('external_identity'),
    // personal settings (T-092, 2026-07-09) — the user's own display choices,
    // e.g. { theme: 'dark' }; never an access or context fact
    preferences: jsonb('preferences').notNull().default({}),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

// Skeleton-auth scaffolding (plan.md's recorded build-time decision, T-021):
// its own table, not a column on users, so it drops cleanly when the
// infra/security session replaces it with production identity (Entra-first).
export const userCredentials = pgTable('user_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  passwordHash: text('password_hash').notNull(),
});

// T-251 — how a session ended. `revoked_at` says a session is over; this says
// WHY, and why is the audit fact a deleted row would carry none of.
export const sessionEndReason = pgEnum('session_end_reason', [
  'signed_out',
  'expired_idle',
  'revoked',
]);

/**
 * T-251 — a live login as a ROW, not only as a signed cookie (finding F4).
 *
 * The reason is one sentence: a signed cookie cannot be revoked. It is valid
 * because it verifies, so removing a user, or signing out on a lost laptop,
 * changes nothing until the signature expires — and the skeleton's cookie
 * carried no expiry at all.
 *
 * `id` is the token the cookie carries: a random value, NOT the user id, so
 * the cookie stops being a bearer assertion of identity and becomes a pointer
 * to a record the server controls.
 *
 * TWO CLOCKS, and they are not the same control. `expires_at` is the absolute
 * lifetime, fixed at creation and never extended by activity — it bounds how
 * long a stolen cookie is useful at all. `last_seen_at` drives the idle
 * timeout, which ends a session someone walked away from. Both thresholds are
 * deployment configuration, because the right numbers are a security-session
 * decision and not a build-time one.
 *
 * Currency by state, like every other interval in this drawer: signing out
 * sets `revoked_at`, it does not delete the row. A session that ended is
 * evidence of a login that happened.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // the opaque token; see above
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: sessionEndReason('revoked_reason'),
  },
  (t) => [
    // the revocation read: "end every live session of this user", which is what
    // an org admin removing someone actually needs
    index('sessions_user_live_idx').on(t.userId).where(sql`${t.revokedAt} IS NULL`),
  ],
);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerOrganisationId: uuid('owner_organisation_id')
    .notNull()
    .references(() => organisations.id),
  // T-246 (ADR-0046 §8) — the owner's assurance lever. The owner cannot see a
  // supplier's conflict register (it would reveal the supplier's engagements),
  // so what it gets instead is the power to REQUIRE each member organisation to
  // attest that it operates a conflict policy. Trust plus audit, deliberately,
  // not enforcement: a client cannot inspect a supplier's internal wall, and a
  // control pretending otherwise would be theatre.
  conflictAttestationRequired: boolean('conflict_attestation_required').notNull().default(false),
});

// A Participant is an interval, never a deleted row: removal closes
// removed_at, so attribution in past rounds survives departures (ADR-0033).
export const participants = pgTable(
  'participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    // the enrolling org admin; null for seeded/first users (ADR-0033)
    addedByParticipantId: uuid('added_by_participant_id').references((): AnyPgColumn => participants.id),
    // the elevated (super-user) capability (T-174, T-133 realised): holds the
    // destructive lifecycle actions — close-as-rejected, and owner supersede/
    // withdraw when those land — so they never sit on the general surface for
    // ordinary users. A per-participant governance capability, orthogonal to the
    // owner/member collapse (ADR-0016) and to the org admin's enrolment power
    // (ADR-0033). Granted deliberately; the lead author who may decline-and-close
    // (ADR-0032) is granted it.
    elevated: boolean('elevated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    // one LIVE row per (user, project); closed intervals remain as history,
    // so re-enrolment after removal is a new interval (ADR-0033, T-117)
    uniqueIndex('participants_user_project_live_unique')
      .on(t.userId, t.projectId)
      .where(sql`${t.removedAt} IS NULL`),
  ],
);

// T-245 — the conflict register (ADR-0046): the ethical wall's first
// POSITIVE-EXCLUSION form. Every other access table grants; this one alone
// denies — holding access to one project bars access to another.
//
// Declared by the consultancy's OWN org admin, never by a project owner (§8):
// an owner-declared exclusion would require the owner to already know the
// supplier's other engagements, which the supplier would usually be in breach
// for disclosing. Org-private on the ADR-0018 private floor — the register
// reveals which of a firm's people are walled from what, which is close to
// revealing its engagements.
//
// Symmetric by construction (§9): the relation is unordered, so the pair is
// stored canonically (project_a_id < project_b_id, CHECK-enforced) and the live
// unique index collapses X↔Y and Y↔X to one row.
export const conflictGrain = pgEnum('conflict_grain', ['organisation', 'individual']);

export const conflictExclusions = pgTable(
  'conflict_exclusions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // the firm whose wall this is — exclusions only ever bind its own people
    declaringOrganisationId: uuid('declaring_organisation_id')
      .notNull()
      .references(() => organisations.id),
    declaredByUserId: uuid('declared_by_user_id')
      .notNull()
      .references(() => users.id),
    // §7: individual is the default — a large consultancy legitimately acts on
    // both sides behind an internal wall with different teams, and forbidding
    // that moves the scheme off the platform rather than dissolving it. The
    // organisation form binds every Participant of the firm.
    grain: conflictGrain('grain').notNull().default('individual'),
    // the named person at individual grain; null at organisation grain
    subjectUserId: uuid('subject_user_id').references(() => users.id),
    projectAId: uuid('project_a_id')
      .notNull()
      .references(() => projects.id),
    projectBId: uuid('project_b_id')
      .notNull()
      .references(() => projects.id),
    reason: text('reason'), // org-private free text
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
    // currency by state, on the Participant pattern: withdrawal closes the
    // interval and the row survives, so past refusals stay attributable
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnByUserId: uuid('withdrawn_by_user_id').references(() => users.id),
  },
  (t) => [
    // The two grains have genuinely different natural keys, so they get an
    // index each rather than one index over a nullable column. Modelling them
    // together would need NULLS NOT DISTINCT (the Postgres default treats two
    // null subjects as distinct, so duplicate organisation-grain rows would
    // slip through) — and splitting states the keys more precisely anyway.
    uniqueIndex('conflict_exclusions_individual_live_unique')
      .on(t.declaringOrganisationId, t.subjectUserId, t.projectAId, t.projectBId)
      .where(sql`${t.withdrawnAt} IS NULL AND ${t.grain} = 'individual'`),
    uniqueIndex('conflict_exclusions_organisation_live_unique')
      .on(t.declaringOrganisationId, t.projectAId, t.projectBId)
      .where(sql`${t.withdrawnAt} IS NULL AND ${t.grain} = 'organisation'`),
    index('conflict_exclusions_org_live_idx')
      .on(t.declaringOrganisationId)
      .where(sql`${t.withdrawnAt} IS NULL`),
  ],
);

// T-246 — the attestation (ADR-0046 §8): how a project owner gains assurance
// WITHOUT gaining the register. The owner sees THAT an organisation attested and
// when; never what the attestation protects. An interval, like everything else
// here: re-attesting supersedes rather than overwrites, so the history of who
// stood behind the wall and when survives.
export const conflictAttestations = pgTable(
  'conflict_attestations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    attestedByUserId: uuid('attested_by_user_id')
      .notNull()
      .references(() => users.id),
    attestedAt: timestamp('attested_at', { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('conflict_attestations_live_unique')
      .on(t.projectId, t.organisationId)
      .where(sql`${t.supersededAt} IS NULL`),
  ],
);

// T-246 — the refusal audit (ADR-0046 §6: "every grant it refused"). Org-private
// like the register itself: a refusal names the exclusion that caused it, so
// reading it is reading the register indirectly.
export const conflictRefusals = pgTable('conflict_refusals', {
  id: uuid('id').primaryKey().defaultRandom(),
  exclusionId: uuid('exclusion_id')
    .notNull()
    .references(() => conflictExclusions.id),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  /** the admin who attempted the grant */
  attemptedByUserId: uuid('attempted_by_user_id')
    .notNull()
    .references(() => users.id),
  /** the person the grant was for */
  subjectUserId: uuid('subject_user_id')
    .notNull()
    .references(() => users.id),
  refusedAt: timestamp('refused_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    role: membershipRole('role').notNull(),
    // proposed confers nothing; only the owner's confirmation activates the
    // seat (ADR-0019 as data, ADR-0033)
    state: membershipState('state').notNull().default('active'),
    // how this organisation acknowledges non-review transmittals (ADR-0035 §4).
    // Naturally per (organisation, project) — the Membership row's grain.
    ackMode: acknowledgementMode('ack_mode').notNull().default('controller'),
    // the nominated document controller in controller mode (null = none yet;
    // the org admin is then the fallback acknowledger, never a lock-out)
    ackControllerParticipantId: uuid('ack_controller_participant_id').references(
      (): AnyPgColumn => participants.id,
    ),
    addedByParticipantId: uuid('added_by_participant_id').references(() => participants.id),
    // the org-standard plan column set (T-360, S3): schema field keys shown as
    // extra plan-table columns for every member of this organisation on this
    // project — locked, no personal overrides; null = the default set. Per
    // (organisation, project) exactly like ack_mode.
    planColumns: jsonb('plan_columns').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('memberships_org_project_unique').on(t.organisationId, t.projectId),
    // exactly one Membership per project has role = owner (T-004)
    uniqueIndex('memberships_one_owner_per_project')
      .on(t.projectId)
      .where(sql`${t.role} = 'owner'`),
  ],
);
