// Drawer 9 — apps (ADR-0056, T-439), drawn in data-model.md on 2026-09-06 and
// built from that drawing.
//
// WHY A DRAWER OF ITS OWN. An app table's row is neither a document nor a work
// item: it is the THIRD KIND OF PROJECT THING, with a read predicate no
// existing table carries — *entering organisation, or the project owner, or an
// open share, all within the app's participant scope, and nothing else*, with a
// `draft` row read by its entering organisation ALONE. Filing rows beside
// sandbox documents would invite the sandbox predicate; filing them beside
// `runs` would say an app is a workflow. A run IS reused — an app run is an
// ADR-0028 Run — but the app's own things are their own subject area.
//
// EVERY STAMP IS A PARTICIPANT, AND THE PROJECT IS DERIVED THROUGH IT — Drawer
// 8's rule, for Drawer 8's reason. A Participant interval that closes on removal
// stops resolving, so a departed person's rows go dark in the same act that ends
// the access, and ADR-0056 §7's accepted/unaccepted split then reads off `state`
// alone. A second stored answer to "which project" is a second thing to keep in
// step.
//
// WHAT THE SCHEMA CANNOT SAY, AND THE MIGRATION THEREFORE DOES (0067). Six
// `CHECK`s and six triggers are hand-written into the generated file, because
// drizzle emits none of them: the published quartet and the closed pair null
// together; a scope grant names exactly one grantee; a decided row carries its
// decider and its time and nothing else does; a rejection carries a reason and
// nothing else does; `state` is null exactly when the table has no acceptance
// step (cross-table, so a trigger); an accepted row is never updated; the four
// grant/audit tables are append-only intervals; an app run's two actor stamps
// cannot disagree with Drawer 3's; and a playbook carries no rows of any kind.
// Read 0067 for the reasoning on each — it is where the argument lives.
//
// THE THREE CONNECTION TABLES ARE NOT HERE. ADR-0057 is built after deployment,
// because a stored credential needs the secrets store the pilot deployment
// supplies (ADR-0047 §7) and a connection built against a stand-in on one
// machine is the leak that record exists to prevent. They are drawn in
// data-model.md and are deliberately absent from this file.
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { organisations, participants, projects } from './drawer1-parties.js';
import { runs } from './drawer3-execution.js';

/**
 * The ADR-0036 ladder's two rungs, COPIED from `sandbox_grantee_type` rather
 * than shared with it (the drawing's own word). A different subject with the
 * same shape: sharing the type would couple two vocabularies that have no
 * reason to move together, and the ladder is emergent from the grant set in
 * both cases rather than a stored level either could disagree about.
 */
export const appGranteeType = pgEnum('app_grantee_type', ['organisation', 'participant']);

/**
 * What a declared table is FOR, which decides who writes it and what may travel
 * in a playbook (ADR-0056 §3, §10).
 *
 *   • `data` — what people type in.
 *   • `insight` — where a run writes its static insight, stamped with the
 *     organisation of the person the run acted as.
 *   • `reference` — the firm's own lookup rows (emission factors, review
 *     categories). Its DEFINITION travels in a playbook; its rows never do.
 *     The owner's veto-pass clarification (2026-09-06) removed the one
 *     exception the earlier drawing carried: *no rows travel in a template,
 *     full stop*, so a deployed instance starts every table empty and the
 *     deploying firm loads its own lookups into the fresh instance.
 */
export const appTableKind = pgEnum('app_table_kind', ['data', 'insight', 'reference']);

/**
 * The submission flow, and it is NULLABLE on the row rather than absent: a
 * table whose builder chose no acceptance step has rows with `state` null, and
 * those rows never change hands (§2a). The `CHECK` that ties the two together
 * is cross-table and therefore a trigger.
 *
 * `superseded` is what a correction does to the row it replaces — a correction
 * is a new row, never an edit, because an accepted row is the project owner's
 * record and is never edited or deleted in place.
 */
export const appRowState = pgEnum('app_row_state', [
  'draft',
  'submitted',
  'accepted',
  'rejected',
  'superseded',
]);

/** How a run started. `scheduled` is stored from the first ticket and honoured
 * when a clock exists (ADR-0056 §13d) — the schedule itself lives on the
 * published definition, so nothing here has to be migrated when the clock
 * arrives. */
export const appRunTrigger = pgEnum('app_run_trigger', ['manual', 'scheduled']);

/**
 * One app instance, living in exactly one project (ADR-0056 §1).
 *
 * TWO COPIES OF THE DEFINITION, AND THE SPLIT IS THE RULING (the 2026-09-06
 * addendum, ruling 2). `definition` is the builder's WORKING copy; the people
 * in the app's scope open `published_definition`, and a scheduled run acts only
 * against that. "Check and open" is the act of publishing, recorded with who and
 * when. Without the split, a builder's every save would change a form a
 * contractor is filling in at that moment — Retool's draft-versus-live release
 * model, adopted after T-437 read it.
 *
 * The table declarations live in `app_tables`, NOT in this JSON, so the read
 * path never parses a definition to decide access.
 */
export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    description: text('description'),
    /**
     * WHOSE ENTITLEMENTS A SCHEDULED RUN USES (§5), which is why it is not
     * null: an app with standing powers of its own is a shared service account
     * by another name. When the owner loses the project or the right to build,
     * the app is reassigned or closed — and until then it is DEFUNCT: visibly
     * not working, with no notification (owner-ruled 2026-09-06; ADR-0049 is
     * untouched). Defunct is DERIVED from this participant's interval, never
     * stored, because a stored flag is a cache of an access fact.
     */
    ownerParticipantId: uuid('owner_participant_id')
      .notNull()
      .references(() => participants.id),
    createdByParticipantId: uuid('created_by_participant_id')
      .notNull()
      .references(() => participants.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * What it was deployed from, and there is NO LIVE LINK (§10): updating the
     * playbook never changes a deployed instance, because a firm must not be
     * able to change what runs inside a client's project without anyone there
     * seeing it. The version is stored beside the id for exactly that reason.
     */
    playbookId: uuid('playbook_id').references((): AnyPgColumn => playbooks.id),
    playbookVersion: integer('playbook_version'),
    /** the builder's working copy — validated against `AppDefinition` in
     * @infora/contracts, never trusted as access data */
    definition: jsonb('definition').notNull().default({}),
    /** the working copy's counter and attribution: every edit bumps it and says
     * who and when. It is NOT what `app_runs.definitions_version` refers to —
     * a run acts against the published copy. */
    definitionVersion: integer('definition_version').notNull().default(1),
    definitionUpdatedByParticipantId: uuid('definition_updated_by_participant_id')
      .notNull()
      .references(() => participants.id),
    definitionUpdatedAt: timestamp('definition_updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** the copy the app's people open and a scheduled run acts against. Null
     * until first published, and an app with nothing published is open to its
     * builders alone. All four move together — `CHECK`ed. */
    publishedDefinition: jsonb('published_definition'),
    publishedVersion: integer('published_version'),
    publishedByParticipantId: uuid('published_by_participant_id').references(() => participants.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** currency by state: a closed app keeps its tables readable under the
     * rules above (§7) — closing is not deletion */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedByParticipantId: uuid('closed_by_participant_id').references(() => participants.id),
  },
  (t) => [index('apps_project_idx').on(t.projectId)],
);

/**
 * The app's participant scope on the ADR-0036 ladder (§1) — copied from
 * `sandbox_scope_grants`, not shared with it.
 *
 * The ladder (multi-org ⊃ single-org ⊃ team ⊃ named-user) is emergent from the
 * grant set rather than a stored level: a person is in the app's scope if their
 * organisation holds a live organisation-grant, or they hold a live
 * participant-grant. Widening adds a grant; revoking closes one, and the effect
 * is immediate on the next read.
 */
export const appScopeGrants = pgTable(
  'app_scope_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    granteeType: appGranteeType('grantee_type').notNull(),
    organisationId: uuid('organisation_id').references(() => organisations.id),
    participantId: uuid('participant_id').references(() => participants.id),
    grantedByParticipantId: uuid('granted_by_participant_id')
      .notNull()
      .references(() => participants.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByParticipantId: uuid('revoked_by_participant_id').references(() => participants.id),
  },
  (t) => [
    index('app_scope_grants_app_idx').on(t.appId),
    uniqueIndex('app_scope_grants_live_org_unique')
      .on(t.appId, t.organisationId)
      .where(sql`${t.revokedAt} IS NULL AND ${t.organisationId} IS NOT NULL`),
    uniqueIndex('app_scope_grants_live_participant_unique')
      .on(t.appId, t.participantId)
      .where(sql`${t.revokedAt} IS NULL AND ${t.participantId} IS NOT NULL`),
  ],
);

/**
 * A table the app declares (§2). Its shape is stored HERE rather than inside
 * `apps.definition` for one reason: the read path must never parse JSON to
 * decide access.
 */
export const appTables = pgTable(
  'app_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** name, type, required per column — validated against `AppColumn[]` in
     * @infora/contracts, which is the only place the column vocabulary lives */
    columns: jsonb('columns').notNull().default([]),
    kind: appTableKind('kind').notNull().default('data'),
    /**
     * THE BUILDER'S PER-TABLE CHOICE (§2a), walked through rather than found in
     * a settings page (§2b): *does this table hold contractual data?* A returns
     * table whose accepted figure triggers a payment or discharges a planning
     * condition has an acceptance step; a firm's private land register need not.
     * When false, `app_rows.state` stays null and the row never changes hands.
     */
    hasAcceptance: boolean('has_acceptance').notNull().default(false),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [index('app_tables_app_idx').on(t.appId)],
);

/**
 * The third kind of project record (§2) — and the stamp on it IS the wall.
 *
 * `organisation_id` is not decoration and not audit: it is the access
 * predicate. A row is read by its entering organisation, by the project owner
 * organisation, and by an organisation the owner has shared the table with —
 * all inside the app's participant scope, and by nobody else. No setting an
 * app's builder can make widens that, because the builder's choices narrow a
 * viewer's own reach and never extend it (§4).
 *
 * A DRAFT IS READ BY ITS ENTERING ORGANISATION ALONE (the 2026-09-06 addendum,
 * ruling 3): the owner reads a row from `submitted` onward. A draft is an
 * unfinished number with the same standing as unfinished work in a sandbox
 * before promotion, and the owner's dashboard showing "no return yet" for that
 * month is the honest state.
 */
export const appRows = pgTable(
  'app_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appTableId: uuid('app_table_id')
      .notNull()
      .references(() => appTables.id, { onDelete: 'cascade' }),
    /** validated against the table's own `columns` before insert */
    values: jsonb('values').notNull().default({}),
    /** the stamp the read predicate keys on */
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    enteredByParticipantId: uuid('entered_by_participant_id')
      .notNull()
      .references(() => participants.id),
    enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
    /** null exactly when the table has no acceptance step — enforced by
     * trigger, because the fact lives one table away */
    state: appRowState('state'),
    decidedByParticipantId: uuid('decided_by_participant_id').references(() => participants.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /**
     * REQUIRED EXACTLY WHEN THE STATE IS `rejected` (the 2026-09-06 addendum,
     * ruling 4, reversing the drawing's "no reason on a rejection"). The review
     * record's precedent: every comment gets a response. A rejection with no
     * reason becomes a phone call, which is the record failing.
     */
    rejectionReason: text('rejection_reason'),
    /** a correction is a NEW row; the old one flips to `superseded` */
    supersedesRowId: uuid('supersedes_row_id').references((): AnyPgColumn => appRows.id),
    /** an edit before acceptance keeps the prior version as a row of its own */
    previousVersionId: uuid('previous_version_id').references((): AnyPgColumn => appRows.id),
    /** the organisation's own deletion of an unaccepted row (ADR-0050 §6) is a
     * RETIRE, so a past insight's `rows_covered` still resolves; erasure at
     * exit removes */
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    retiredByParticipantId: uuid('retired_by_participant_id').references(() => participants.id),
  },
  (t) => [
    // the predicate's own shape — every read is (this table, my organisation)
    index('app_rows_table_org_idx').on(t.appTableId, t.organisationId),
    index('app_rows_table_state_idx').on(t.appTableId, t.state),
  ],
);

/**
 * The project owner's share of one table with one named organisation (§6) —
 * the shape of the owner's library share (ADR-0016, ADR-0035) applied rather
 * than invented: deliberate, audited, revocable.
 *
 * A shared table still never reaches a third organisation, and revoking
 * narrows the next run to the sharing organisation's own rows while insights
 * already produced stay as they were. The requirement that the granter be an
 * owner-organisation participant is enforced in the gateway and RECORDED here
 * — the store keeps the audit trail, the predicate keeps the rule.
 */
export const appTableShares = pgTable(
  'app_table_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appTableId: uuid('app_table_id')
      .notNull()
      .references(() => appTables.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    grantedByParticipantId: uuid('granted_by_participant_id')
      .notNull()
      .references(() => participants.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByParticipantId: uuid('revoked_by_participant_id').references(() => participants.id),
  },
  (t) => [
    index('app_table_shares_table_idx').on(t.appTableId),
    uniqueIndex('app_table_shares_live_unique')
      .on(t.appTableId, t.organisationId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

/**
 * One app execution. The execution ITSELF is a Drawer 3 `runs` row — this is
 * the app-side half, so app reads never have to join into Drawer 3.
 *
 * TWO ACTOR STAMPS, ONE TRUTH, ENFORCED. The `runs` row's own
 * `requester_participant_id` is authoritative; `as_participant_id` must equal
 * it, and a trigger says so. The column exists for the read path, not as a
 * second opinion — and a second opinion that could disagree with the audit
 * record is exactly what an app run must not have, since a scheduled run acts
 * as the app's OWNER and every row it writes is attributed to that person.
 *
 * `definitions_version` records the PUBLISHED version the run acted against —
 * never the builder's working copy (the 2026-09-06 addendum, ruling 2).
 */
export const appRuns = pgTable(
  'app_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id),
    trigger: appRunTrigger('trigger').notNull(),
    /** who the run acted as: the clicker, or the app's owner for a schedule */
    asParticipantId: uuid('as_participant_id')
      .notNull()
      .references(() => participants.id),
    definitionsVersion: integer('definitions_version').notNull(),
    rowsCovered: integer('rows_covered').notNull().default(0),
    tablesCovered: uuid('tables_covered').array().notNull().default(sql`'{}'::uuid[]`),
    /** the static insight, stamped with `as_participant_id`'s organisation */
    insightRowId: uuid('insight_row_id').references(() => appRows.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    outcome: text('outcome'),
  },
  (t) => [
    index('app_runs_app_idx').on(t.appId, t.startedAt),
    uniqueIndex('app_runs_run_unique').on(t.runId),
  ],
);

/**
 * The file a person issued (§8) — and the stamp is PROVENANCE, NOT AUTHORSHIP.
 *
 * There is deliberately no `produced_by` column and no "agent drafted" marking:
 * the app produces, a person issues, and a stamp naming the app's agent as
 * author would drift into exactly the label the owner declined. What the row
 * records is what data generated the file and when.
 */
export const appExports = pgTable(
  'app_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id),
    exportedByParticipantId: uuid('exported_by_participant_id')
      .notNull()
      .references(() => participants.id),
    exportedAt: timestamp('exported_at', { withTimezone: true }).notNull().defaultNow(),
    fileRef: text('file_ref').notNull(),
    dataAsOf: timestamp('data_as_of', { withTimezone: true }).notNull(),
    tablesCovered: uuid('tables_covered').array().notNull().default(sql`'{}'::uuid[]`),
    rowsCovered: integer('rows_covered').notNull().default(0),
  },
  (t) => [index('app_exports_app_idx').on(t.appId, t.exportedAt)],
);

/**
 * The "dumb" template of an app, org-private, in the firm's own workspace (§10).
 *
 * NO `project_id` BY CONSTRUCTION — Drawer 7's discipline: org context is
 * portable, so a project column would be a smaller thing wearing the same name.
 *
 * A PLAYBOOK CARRIES STRUCTURE AND NEVER ROWS, of any origin (the owner's
 * veto-pass clarification, 2026-09-06: *"by reference tables i meant the
 * database structure for an app — not the content from within it"*). "Structure"
 * explicitly includes a reference table's DEFINITION — its name, its columns,
 * its kind — and a deployed instance starts every table empty. The trigger in
 * 0067 makes that mechanical rather than a convention: a `rows` key anywhere in
 * either JSON column is refused.
 */
export const playbooks = pgTable(
  'playbooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    name: text('name').notNull(),
    /** a save is a NEW version row; prior versions are retained because
     * instances name them (`apps.playbook_version`) */
    version: integer('version').notNull().default(1),
    definition: jsonb('definition').notNull().default({}),
    tableDeclarations: jsonb('table_declarations').notNull().default([]),
    savedByParticipantId: uuid('saved_by_participant_id')
      .notNull()
      .references(() => participants.id),
    /** the save-back path: an app built inside a client's project, stripped */
    savedFromAppId: uuid('saved_from_app_id').references(() => apps.id),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    /** Infora's own pre-built apps sit on the same shelf as a firm's own (§11) */
    suppliedByInfora: boolean('supplied_by_infora').notNull().default(false),
  },
  (t) => [
    index('playbooks_organisation_idx').on(t.organisationId),
    uniqueIndex('playbooks_org_name_version_unique').on(t.organisationId, t.name, t.version),
  ],
);
