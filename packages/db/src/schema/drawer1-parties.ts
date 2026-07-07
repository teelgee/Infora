// Drawer 1 — parties & access (data-model.md; ADR-0015–0018).
// Every other table is scoped by these.
import { pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

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
