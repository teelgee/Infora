// Drawer 5 — the review cycle (rebuilt for Slice A, T-115; ADR-0032/0033,
// mechanics per ADRs 0002–0017). One workflow at two scopes — the org-private
// internal formal cycle and the wall-crossing project cycle — role-agnostic:
// an authoring side and a reviewing side per instance. The DRR is the cycle's
// record, not a separate table (ADR-0009 refined).
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
import { sql } from 'drizzle-orm';
import { organisations, participants, projects } from './drawer1-parties.js';
import { containers, versions } from './drawer2-documents.js';

// ── Acceptance codes (ADR-0003 made storable, 2026-07-18) ──────────────────
// Per-project rows, seeded by COPYING Infora's default scheme at project
// creation — never a shared reference, so one project's edits cannot rewrite
// another's history. A code ever referenced is immutable: retire and replace,
// never redefine (retired_at — valid on old rounds, unavailable for new).
export const acceptanceCodeLevel = pgEnum('acceptance_code_level', [
  'comment',
  'deliverable',
  'both',
]);

export const acceptanceCodes = pgTable(
  'acceptance_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    code: text('code').notNull(),
    description: text('description').notNull(),
    level: acceptanceCodeLevel('level').notNull().default('both'),
    // a deliverable-level code that ends the cycle and closes the work item
    isAccepting: boolean('is_accepting').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    // codes unique among the live set; a retired code's letter may be reused
    uniqueIndex('acceptance_codes_project_code_live_unique')
      .on(t.projectId, t.code)
      .where(sql`${t.retiredAt} IS NULL`),
  ],
);

// ── The cycle (the instance unit; its record is the DRR) ───────────────────
// Both terminals are explicit human action: acceptance via the lead
// reviewer's accepting code; rejection closed by the lead author or project
// owner — audited via closed_by/closed_at (ADR-0032).
export const reviewCycleState = pgEnum('review_cycle_state', [
  'active',
  'accepted',
  'closed_rejected',
]);
export const editLockSide = pgEnum('edit_lock_side', ['authoring', 'reviewing']);

export const reviewCycles = pgTable(
  'review_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    state: reviewCycleState('state').notNull().default('active'),
    // the single write token, flipped by transmittal in both directions
    // (ADR-0014); a cycle opens with the reviewers holding the pen
    editLockHolder: editLockSide('edit_lock_holder').notNull().default('reviewing'),
    launchedAt: timestamp('launched_at', { withTimezone: true }).notNull().defaultNow(),
    closedByParticipantId: uuid('closed_by_participant_id').references(() => participants.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    // the one-in-flight rule (ADR-0002): at most one active cycle per container
    uniqueIndex('review_cycles_one_active_per_container')
      .on(t.containerId)
      .where(sql`${t.state} = 'active'`),
  ],
);

// ── Rounds ─────────────────────────────────────────────────────────────────
export const roundState = pgEnum('round_state', ['open', 'issued', 'responded']);

export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => reviewCycles.id),
    number: integer('number').notNull(),
    // the frozen version under review — anchors never drift (ADR-0006)
    versionId: uuid('version_id')
      .notNull()
      .references(() => versions.id),
    state: roundState('state').notNull().default('open'),
    // guides — reminders and overdue — never gates (ADR-0005)
    reviewPeriodTarget: timestamp('review_period_target', { withTimezone: true }),
    // the lead reviewer's authoritative per-round verdict, suggested from the
    // comment codes (ADR-0003); a code with is_accepting ends the cycle
    deliverableCodeId: uuid('deliverable_code_id').references(() => acceptanceCodes.id),
  },
  (t) => [
    uniqueIndex('rounds_cycle_number_unique').on(t.cycleId, t.number),
    // ADR-0014's load-bearing invariant, held by the schema not convention:
    // at most one open round per cycle
    uniqueIndex('rounds_one_open_per_cycle')
      .on(t.cycleId)
      .where(sql`${t.state} = 'open'`),
  ],
);

// ── Transmittals & snapshots (append-only records, ADR-0009/0010) ──────────
export const transmittalDirection = pgEnum('transmittal_direction', ['issue', 'return']);

export const transmittals = pgTable('transmittals', {
  id: uuid('id').primaryKey().defaultRandom(),
  roundId: uuid('round_id')
    .notNull()
    .references(() => rounds.id),
  // issue: the closed round to the authoring side, revealing it and handing
  // over the pen; return: the next version back, opening the next round
  direction: transmittalDirection('direction').notNull(),
  senderParticipantId: uuid('sender_participant_id')
    .notNull()
    .references(() => participants.id),
  recipients: uuid('recipients').array().notNull().default([]),
  purposeCode: text('purpose_code'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp('due_at', { withTimezone: true }),
});

export const reviewSnapshots = pgTable(
  'review_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transmittalId: uuid('transmittal_id')
      .notNull()
      .references(() => transmittals.id),
    // the comments and responses as they stood — retrievable, never a
    // surface users open (ADR-0009)
    content: jsonb('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('review_snapshots_transmittal_unique').on(t.transmittalId)],
);

// ── Comments & responses ───────────────────────────────────────────────────
// Live and moderatable while their round is open (the lead reviewer may
// amend, ADR-0007); frozen by trigger once the round is issued (ADR-0014).
// Distinct from the mutable working-area sandbox_comments (Drawer 2) and
// from agent Suggestions (Drawer 4).
export const reviewComments = pgTable(
  'review_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id),
    versionId: uuid('version_id')
      .notNull()
      .references(() => versions.id),
    authorParticipantId: uuid('author_participant_id')
      .notNull()
      .references(() => participants.id),
    body: text('body').notNull(),
    acceptanceCodeId: uuid('acceptance_code_id').references(() => acceptanceCodes.id),
    // structured fields, rendition-agnostic — page + highlight/point on the
    // PDF at project scope (ADR-0006); the sandbox-scope surface is parked
    anchor: jsonb('anchor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('review_comments_round_idx').on(t.roundId)],
);

// The authoring side's reply (first-class per ADR-0032; the comment-to-
// resolution moat data): the mandatory link to the next version's section,
// or an explicit no-change with a reason (ADR-0004) — exactly one of the
// two. Editable during the respond phase; frozen once the round responds.
export const responses = pgTable(
  'responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => reviewComments.id),
    authorParticipantId: uuid('author_participant_id')
      .notNull()
      .references(() => participants.id),
    body: text('body').notNull(),
    nextVersionId: uuid('next_version_id').references(() => versions.id),
    nextVersionAnchor: jsonb('next_version_anchor'),
    noChangeReason: text('no_change_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('responses_comment_unique').on(t.commentId)],
);

// ── Appointment grants (ADR-0017/0033) ─────────────────────────────────────
// Append-only interval rows on the container: an amendment is a new row or a
// closed interval, never an edit — "who could act in round N" reconstructs
// from the intervals against the round's timestamps. No copy at cycle
// launch: the cycle reads the live sets.
export const deliverableAuthors = pgTable(
  'deliverable_authors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id),
    isLead: boolean('is_lead').notNull().default(false),
    grantedByParticipantId: uuid('granted_by_participant_id')
      .notNull()
      .references(() => participants.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('deliverable_authors_container_idx').on(t.containerId),
    // exactly one live lead author per deliverable (ADR-0017)
    uniqueIndex('deliverable_authors_one_live_lead')
      .on(t.containerId)
      .where(sql`${t.isLead} = true AND ${t.revokedAt} IS NULL`),
  ],
);

// Reviewer rows add propose-then-confirm: the producing organisation may
// propose from the visible roster, conferring NO access until the owner
// confirms — where ADR-0015's share-first invariant bites (ADR-0033).
export const deliverableReviewers = pgTable(
  'deliverable_reviewers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id),
    isLead: boolean('is_lead').notNull().default(false),
    grantedByParticipantId: uuid('granted_by_participant_id')
      .notNull()
      .references(() => participants.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    confirmedByParticipantId: uuid('confirmed_by_participant_id').references(() => participants.id),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [
    index('deliverable_reviewers_container_idx').on(t.containerId),
    // exactly one live lead reviewer per deliverable (ADR-0017)
    uniqueIndex('deliverable_reviewers_one_live_lead')
      .on(t.containerId)
      .where(sql`${t.isLead} = true AND ${t.revokedAt} IS NULL`),
  ],
);

// Owner-granted, organisation-level shares per deliverable (ADR-0016 made
// storable, T-119): the only thing that opens a deliverable across the wall.
// Interval rows like the appointment grants — revocation closes, nothing is
// deleted, and visibility is producer | owner | live-share, applied as SQL
// pre-filters wherever the library is read or grounded.
export const deliverableShares = pgTable(
  'deliverable_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    grantedByParticipantId: uuid('granted_by_participant_id')
      .notNull()
      .references(() => participants.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('deliverable_shares_container_idx').on(t.containerId),
    uniqueIndex('deliverable_shares_live_unique')
      .on(t.containerId, t.organisationId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);
