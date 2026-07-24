// Drawer 1 — parties & access (data-model.md; ADR-0015–0018, ADR-0033).
// Every other table is scoped by these.
import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerOrganisationId: uuid('owner_organisation_id')
    .notNull()
    .references(() => organisations.id),
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
