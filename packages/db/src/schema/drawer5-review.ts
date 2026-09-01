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
    // T-383, ADR-0003 as amended 2026-08-27. Two properties join is_accepting,
    // both per-project configuration rather than platform constants — the
    // scheme is copied at creation, so a project owns its own answers.
    //   is_contractual — an accepting code ends the cycle, but only a
    //     CONTRACTUAL one issues the C revision (ADR-0041): ISO's own
    //     preliminary/contractual split, "we have agreed this" against "we have
    //     agreed most of this, with comments".
    //   grounds — whether a deliverable admitted under this code enters the
    //     AI's reach (ADR-0013 §6). It cannot be a fixed mapping even in
    //     principle: the 2021 National Annex makes Published codes
    //     stage-agnostic and leaves each An code's meaning to the project's own
    //     information standard, so the standard itself refuses to fix it.
    // Both default false — the restrictive direction, which is the visible one.
    isContractual: boolean('is_contractual').notNull().default(false),
    grounds: boolean('grounds').notNull().default(false),
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

// ── The acceptance-code change record (T-390, ADR-0003 as amended) ─────────
// Append-only by trigger (T-008): the edit this records is not a preference.
// Turning `grounds` off changes what the AI may rely on across a whole project,
// SILENTLY — every citation that already exists still resolves — so ADR-0003
// requires it to be audited like a rails change (ADR-0030). There is no
// rails-change machinery to reuse (rails as scoped records is undrawn), and
// every audit in this repo is a purpose-built append-only table, so this is one
// more of those.
//
// One property per row, with its old and new value, and the REASON in free
// text: a code's history reads as a sequence of decisions, not of states, and
// a whole-row snapshot would invite a reader to reconstruct the decision from a
// diff — which is the thing the reason exists to make unnecessary.
export const acceptanceCodeChangeField = pgEnum('acceptance_code_change_field', [
  'created',
  'description',
  'is_accepting',
  'is_contractual',
  'grounds',
  'retired',
]);

export const acceptanceCodeChanges = pgTable(
  'acceptance_code_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    acceptanceCodeId: uuid('acceptance_code_id')
      .notNull()
      .references(() => acceptanceCodes.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    // identity from the record, never from the caller. Participant grain: the
    // scheme is the owner organisation's, per project, so the same person may
    // hold this on one project and not another. A named person — registered in
    // docs/architecture/personal-data.md.
    changedByParticipantId: uuid('changed_by_participant_id')
      .notNull()
      .references(() => participants.id),
    field: acceptanceCodeChangeField('field').notNull(),
    // rendered as text so one column serves a boolean and a label alike; null
    // on `created`, where there is no previous value to state
    previousValue: text('previous_value'),
    newValue: text('new_value'),
    // why, in the owner's own words. The half a diff cannot reconstruct.
    reason: text('reason').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('acceptance_code_changes_project_idx').on(t.projectId, t.changedAt)],
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
    // the audited reason a cycle was closed as rejected (T-194) — a mandatory
    // free-text explanation captured at the destructive stop (ADR-0032)
    closedReason: text('closed_reason'),
  },
  (t) => [
    // the one-in-flight rule (ADR-0002): at most one active cycle per container
    uniqueIndex('review_cycles_one_active_per_container')
      .on(t.containerId)
      .where(sql`${t.state} = 'active'`),
  ],
);

// ── Rounds ─────────────────────────────────────────────────────────────────
// ADR-0051: a project-scope round is created 'submitted' and opens for review
// only when a Participant of the owner organisation acknowledges the
// submission transmittal. A sandbox-scope round is created 'open' — the
// org-private cycle has no owner in the loop, so no gate. The DB default
// stays 'open'; the promotion path sets 'submitted' explicitly.
export const roundState = pgEnum('round_state', ['submitted', 'open', 'issued', 'responded']);

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
    // ADR-0051: the owner organisation's receipt of the submission — the one
    // act that moves a project-scope round submitted → open, recorded who/
    // when. On the ROUND, not the transmittal: transmittals are append-only
    // by trigger (the ADR-0009/0010 record discipline), and the round is the
    // thing the act transitions. A migration CHECK binds the pair together.
    // Stores a named Participant — personal-data.md, retained per ADR-0050.
    acknowledgedByParticipantId: uuid('acknowledged_by_participant_id').references(
      () => participants.id,
    ),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
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

// ── Transmittals & snapshots (append-only records, ADR-0009/0010/0035) ──────
export const transmittalDirection = pgEnum('transmittal_direction', ['issue', 'return']);
// ADR-0035 §1: a transmittal has two kinds of one event. A review transmittal
// issues a version into its round, flips the DRR edit lock and freezes a
// snapshot; a non_review transmittal issues a promoted library deliverable to
// an organisation and carries NONE of that — no round, no edit lock, no
// snapshot. The CHECK in the migration binds round_id/direction to the review
// kind and container_id/version_id to non_review, so no edit-lock path can
// ever attach to a non_review row.
//
// T-431 (ADR-0055 §1) adds a THIRD kind, `external`: the same deliverable and
// version issued to a person with no Infora account. It is a kind rather than a
// second table because the audited facts are identical in all three — sender,
// deliverable, version, purpose, date — and a second table would fork the one
// place "who has this been issued to?" is answerable. It carries the non-review
// shape exactly (no round, no direction, so no edit lock and no snapshot), and
// migration 0065 extends the CHECK to say so rather than leaving the new value
// unconstrained. Its recipients are NOT organisations: `recipient_organisation_ids`
// stays empty and the person is a row in `external_recipients` below.
export const transmittalKind = pgEnum('transmittal_kind', ['review', 'non_review', 'external']);

export const transmittals = pgTable('transmittals', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: transmittalKind('kind').notNull().default('review'),
  // review kind only — null for non_review (the CHECK enforces the pairing)
  roundId: uuid('round_id').references(() => rounds.id),
  // issue: the closed round to the authoring side, revealing it and handing
  // over the pen; return: the next version back, opening the next round
  direction: transmittalDirection('direction'),
  // non_review kind only — the deliverable and version issued to organisations
  // (the review kind reaches its version and recipients through the round)
  containerId: uuid('container_id').references(() => containers.id),
  versionId: uuid('version_id').references(() => versions.id),
  senderParticipantId: uuid('sender_participant_id')
    .notNull()
    .references(() => participants.id),
  // review recipients are named participants; non_review recipients are the
  // receiving organisations whose ceiling the issue sets (ADR-0035 §2)
  recipients: uuid('recipients').array().notNull().default([]),
  recipientOrganisationIds: uuid('recipient_organisation_ids').array().notNull().default([]),
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

// ── The external recipient (T-431/T-432, ADR-0055) ─────────────────────────
// A person with NO Infora account who is sent one finished document: a
// landowner, a consultee, a supplier engaged for one piece of work. The row is
// a NAME AND AN EMAIL ADDRESS and never an Organisation, a Participant or a
// Membership — there is no access grant to resolve, because the LINK is the
// access (ADR-0055 §3). No clause of the wall changes.
//
// ONE TABLE FOR THE REQUEST AND THE ISSUE, and the reason is the personal data.
// ADR-0055 §7 lets anyone below the project's who-may-issue line submit a
// REQUEST carrying every fact the issue needs — which is the same four fields
// about the same named person. A second table would put a person with no
// account in two places, and the register's promise that this material is
// deletable on request (ADR-0050 §6) would then have two paths to keep true.
// So the lifecycle is a state on one row: `requested` → `issued` | `declined`.
export const externalIssueState = pgEnum('external_issue_state', [
  'requested',
  'issued',
  'declined',
]);

export const externalRecipients = pgTable(
  'external_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // the deliverable and the ONE named version the link serves. Held here and
    // not only through the transmittal because a REQUEST has no transmittal
    // yet: a transmittal is the audited record of an issue that happened, and
    // asking is not issuing.
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    versionId: uuid('version_id')
      .notNull()
      .references(() => versions.id),
    // written only when the issue actually happens (state = 'issued')
    transmittalId: uuid('transmittal_id').references(() => transmittals.id),
    // ADR-0055 §9 — the four fields, all typed by a person, and the platform's
    // first stored data about someone who has no account and consented to
    // nothing. Registered in docs/architecture/personal-data.md at ruling.
    name: text('name').notNull(),
    email: text('email').notNull(),
    reason: text('reason').notNull(),
    message: text('message').notNull(),
    state: externalIssueState('state').notNull().default('requested'),
    // the access itself: opaque, unguessable, and serving one version. Null
    // until the issue happens, so a pending or declined request is not a link.
    linkToken: text('link_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // who supplied the facts — the sender on a direct issue, the asker on a
    // request. Always present: nothing here is written by the platform.
    requestedByParticipantId: uuid('requested_by_participant_id')
      .notNull()
      .references(() => participants.id),
    // who let it out of the project. On a direct issue this is the sender
    // themself; on an approved request it is the person above the line.
    issuedByParticipantId: uuid('issued_by_participant_id').references(() => participants.id),
    declinedByParticipantId: uuid('declined_by_participant_id').references(() => participants.id),
    // a decline is answered, not merely refused — the asker reads this
    declineReason: text('decline_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    // the recipient's own read resolves the token and nothing else
    uniqueIndex('external_recipients_link_token_unique').on(t.linkToken),
    // the deliverable's issue log, and the project's pending-request queue
    index('external_recipients_container_idx').on(t.containerId),
  ],
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

// ── Per-reviewer completion (ADR-0052, T-353) ──────────────────────────────
// A round-scoped SIGNAL: the reviewer states their pass over the version is
// done. Not derivable from comments (a reviewer with nothing to say is done,
// not absent). Deletable while the round is open — a resumed review is a
// changed mind, not an audit event; the act is legal only on an open round,
// which freezes the set at issue with no trigger. Reviewer-side state,
// walled from the authoring side until issue exactly like the open round's
// comments (ADR-0014). Stores a named Participant — personal-data.md.
export const reviewCompletions = pgTable(
  'review_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('review_completions_round_participant_unique').on(t.roundId, t.participantId),
  ],
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
    // T-372 (ADR-0033 addendum §2, 2026-08-22) — the THIRD party to the
    // handshake: the appointee themselves. Propose-then-confirm is two
    // organisations acting about a person; a lead reviewer holds the
    // deliverable's contractual verdict, and nobody can give that undertaking
    // on someone else's behalf. Set only by the appointee, never overridable —
    // a super user facing an absent lead re-appoints rather than signing for
    // them. Where the appointee is owner-side, acceptance IS the confirmation
    // (a proposal is non-confirming "unless the proposer is owner-side"), so
    // appointment and access collapse into one click.
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    // a named person's stated refusal, in free text (personal-data.md).
    // Owner-organisation-private: the producing side learns only that a lead
    // reviewer is awaited, never why.
    declineReason: text('decline_reason'),
  },
  (t) => [
    index('deliverable_reviewers_container_idx').on(t.containerId),
    // exactly one live lead reviewer per deliverable (ADR-0017) — and a
    // DECLINED appointment is not one, so a refusal never blocks the
    // replacement it exists to ask for (T-372)
    uniqueIndex('deliverable_reviewers_one_live_lead')
      .on(t.containerId)
      .where(sql`${t.isLead} = true AND ${t.revokedAt} IS NULL AND ${t.declinedAt} IS NULL`),
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

// ── The acknowledgement gate (ADR-0035 §4) ─────────────────────────────────
// A non-review transmittal is acknowledged once ON THE RECEIVING
// ORGANISATION'S BEHALF before the deliverable becomes visible or groundable
// to anyone in it. ORGANISATION grain: one row clears the gate for every
// entitled Participant of that organisation. PER VERSION (owner-ruled
// 2026-07-20): a newly promoted version re-triggers the gate, so the row keys
// on (container, version, organisation). Append-only — a receipt is never
// un-received; there is no revoked_at.
export const deliverableAcknowledgements = pgTable(
  'deliverable_acknowledgements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    versionId: uuid('version_id')
      .notNull()
      .references(() => versions.id),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    // who fired it, on the organisation's behalf (the audit fact — organisation
    // grain in effect, not per person, ADR-0035 §4)
    acknowledgedByParticipantId: uuid('acknowledged_by_participant_id')
      .notNull()
      .references(() => participants.id),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('deliverable_acknowledgements_container_idx').on(t.containerId),
    // one acknowledgement per (version, organisation) — organisation grain
    uniqueIndex('deliverable_acknowledgements_version_org_unique').on(
      t.versionId,
      t.organisationId,
    ),
  ],
);

// ── Intra-organisation narrowing (ADR-0035 §3) ─────────────────────────────
// Under the organisation-level ceiling a non-review transmittal sets, deliverable
// visibility MAY narrow to named Participants of the receiving organisation.
// PARTICIPANT grain, CONTAINER-scoped (the deliverable, not the version — the
// narrowing is keyed on the coded reference). Absent for a (container,
// organisation) = whole-organisation default: every entitled Participant sees
// it. Interval rows like the shares — revocation closes, nothing is deleted.
// Never widens the org ceiling (ADR-0015): a grant only narrows within a share.
export const deliverableParticipantGrants = pgTable(
  'deliverable_participant_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    // the receiving organisation the narrowing sits within — the grant is the
    // receiving organisation's own business (its org admin / controller, §3)
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id),
    grantedByParticipantId: uuid('granted_by_participant_id')
      .notNull()
      .references(() => participants.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('deliverable_participant_grants_container_org_idx').on(t.containerId, t.organisationId),
    uniqueIndex('deliverable_participant_grants_live_unique')
      .on(t.containerId, t.participantId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

// ── Standing routing rule (ADR-0035 §3, MVP — owner-ruled 2026-07-20) ───────
// Rule-driven granting is what dissolves the document controller rather than
// relocating the act: a discipline or team is mapped to a code pattern, and
// when a matching deliverable is transmitted to this organisation the right
// Participants are granted automatically (fired at transmittal-issue). The
// receiving organisation's own rule; code_pattern is a SQL LIKE pattern
// matched against the container's document_reference. Interval rows.
export const deliverableGrantRules = pgTable(
  'deliverable_grant_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    // the receiving organisation whose standing rule this is
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    // a SQL LIKE pattern against container.document_reference (e.g. 'WA-GEO-%')
    codePattern: text('code_pattern').notNull(),
    // the Participant to grant when a transmitted deliverable's code matches
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id),
    createdByParticipantId: uuid('created_by_participant_id')
      .notNull()
      .references(() => participants.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('deliverable_grant_rules_project_org_idx').on(t.projectId, t.organisationId),
  ],
);

/**
 * T-332 — the audited use of the promotion override (ADR-0049 §8).
 *
 * Promotion is **blocked** by open comment threads or open findings (§7,
 * owner-ruled against the recommendation to warn): nothing reaches the
 * controlled library with loose ends. §8 adds the only lawful way past, because
 * **a block with no escape is a deadlock rather than a stricter gate** — a
 * finding against a paragraph a later redraft deleted, or a thread whose author
 * has left the project, would otherwise prevent promotion permanently. The
 * override is `Participant.elevated` only, and every use lands here.
 *
 * NOT `elevated_refusals`, which is its near-twin: that table records an act
 * **refused** for want of the tier and this one records an act **performed**
 * with it. One table for both would need a column meaning "did this happen",
 * which is two records wearing one shape.
 *
 * THE COUNTS ARE STORED RATHER THAN RECOMPUTED, for `purge_events`' reason one
 * store along: afterwards there is nothing to count. Threads get closed and
 * findings get cleared in the ordinary course of the work, so a record that
 * recomputed them would report zero — answering "somebody pressed the button"
 * instead of "somebody pressed the button past four open threads", which is the
 * only version of this record worth keeping.
 *
 * No reason column, deliberately: §8 names exactly two things the record must
 * say — who did it, and what was open at the time — and both are here.
 */
export const promotionOverrides = pgTable(
  'promotion_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    /** the P revision the forced promotion issued — the thing that reached the
     * library with loose ends, named rather than inferred from a timestamp */
    versionId: uuid('version_id')
      .notNull()
      .references(() => versions.id),
    // identity from the record, never from the caller. A named person, and
    // registered in docs/architecture/personal-data.md.
    overriddenByParticipantId: uuid('overridden_by_participant_id')
      .notNull()
      .references(() => participants.id),
    /** what was open at the time. Two columns although the gate treats the two
     * lists identically (§7): they ARE two lists, and a single total would make
     * the record unable to say which kind of loose end was left. */
    openThreads: integer('open_threads').notNull(),
    openFindings: integer('open_findings').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('promotion_overrides_container_idx').on(t.containerId, t.createdAt)],
);
