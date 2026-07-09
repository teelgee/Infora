// Drawer 1 — parties & access (data-model.md; ADR-0015–0018).
// Every other table is scoped by these.
import { jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const membershipRole = pgEnum('membership_role', ['owner', 'member']);

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
  },
  (t) => [
    uniqueIndex('memberships_org_project_unique').on(t.organisationId, t.projectId),
    // exactly one Membership per project has role = owner (T-004)
    uniqueIndex('memberships_one_owner_per_project')
      .on(t.projectId)
      .where(sql`${t.role} = 'owner'`),
  ],
);

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
  },
  (t) => [uniqueIndex('participants_user_project_unique').on(t.userId, t.projectId)],
);
