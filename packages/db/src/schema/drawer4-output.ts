// Drawer 4 — AI output & feedback, the Signal loop (ADR-0021, ADR-0028).
// Suggestions are per-item with an advisory anchor (ruled 2026-07-06).
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { participants } from './drawer1-parties.js';
import { sandboxDocuments, versions } from './drawer2-documents.js';
import { runs, steps, workItems } from './drawer3-execution.js';

export const suggestionKind = pgEnum('suggestion_kind', ['insert', 'replace']);
export const resolution = pgEnum('resolution', ['accepted', 'edited', 'rejected']);

export const suggestions = pgTable('suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id),
  workItemId: uuid('work_item_id').references(() => workItems.id),
  sandboxDocumentId: uuid('sandbox_document_id')
    .notNull()
    .references(() => sandboxDocuments.id),
  kind: suggestionKind('kind').notNull(),
  // advisory quoted span against the mutable sandbox head; null in the skeleton
  anchor: jsonb('anchor'),
  content: text('content').notNull(),
  rationale: text('rationale').notNull(),
});

export const citations = pgTable(
  'citations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    suggestionId: uuid('suggestion_id').references(() => suggestions.id),
    stepId: uuid('step_id').references(() => steps.id),
    versionId: uuid('version_id').references(() => versions.id),
    authorityRef: text('authority_ref'),
    claimSpan: jsonb('claim_span'),
  },
  () => [
    // a citation resolves to a grounded library source or an authority ref (ADR-0021)
    check('citations_source_present', sql`version_id IS NOT NULL OR authority_ref IS NOT NULL`),
  ],
);

// Append-only (trigger, T-008); one resolution per suggestion in v1.
export const signals = pgTable(
  'signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    suggestionId: uuid('suggestion_id')
      .notNull()
      .references(() => suggestions.id),
    resolution: resolution('resolution').notNull(),
    editedContent: text('edited_content'),
    resolvedByParticipantId: uuid('resolved_by_participant_id')
      .notNull()
      .references(() => participants.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('signals_one_per_suggestion').on(t.suggestionId)],
);

// ── T-310 — THE CHECKER'S FINDINGS ──────────────────────────────────────────
//
// *Plainly: when someone runs the QA checker over a draft, each problem it
// finds is one row here — what is wrong, where in the draft it is, what it
// rests on, and whether anybody has dealt with it yet.*
//
// **Drawer 4 and not drawer 2**, which is the near-miss worth naming: a finding
// resolves like a sandbox comment and is counted beside one by ADR-0049 §7, but
// it is **produced by a run**, it may carry a **Suggestion** as its proposed
// fix, and clearing it is a human resolution of an agent's output. That is
// drawer 4's whole subject. A finding filed beside comments would be a run's
// output living in the working area's drawer.
//
// **Mutable, like the sandbox it annotates**, for the sandbox comment's reason
// exactly: an append-only finding would need a second table to say it had been
// cleared. Everything append-only about it — that a run produced it, what it
// spent, what it saw — is already on the Step row.
//
// 🔒 **PER RUN OF ONE DOCUMENT, AND NOTHING ACROSS RUNS.** There is no column,
// index or key here relating one run's findings to the previous run's. That is
// deliberate and it is not a gap: **whether findings persist across runs of the
// same document** — so a dismissal is remembered, and a finding re-raised next
// week is recognised as the same one — is ADR-0048's own open lifecycle
// question, given a driver by ADR-0053 §13 and left unruled. Building the
// carry-over now would be answering it in schema.
export const checkFamily = pgEnum('check_family', [
  'style',
  'corpus_accuracy',
  'self_contradiction',
  'readability',
  'completeness',
]);

/** ADR-0048 §7 — three inputs, three honest treatments. It decides the citation
 *  treatment, which is why it discriminates the evidence rather than labelling
 *  it. */
export const findingInput = pgEnum('finding_input', [
  'corpus',
  'attached',
  'rulebook',
  // T-310 — the draft measured against ITSELF or its own template.
  // Self-contradiction, readability and completeness (ADR-0053 §2) have no
  // corpus passage, attached excerpt or clause to point at; forcing one into
  // `corpus` with an empty citation list would store exactly the dishonest row
  // the union in `contracts` exists to make untypeable. Nothing external, so
  // nothing cited.
  'draft',
]);

/** T-328's two levels. Neither word is a verdict, and `required` is not
 *  `blocking` — ADR-0049 §7 blocks on an OPEN finding of either. */
export const findingSeverity = pgEnum('finding_severity', ['required', 'advisory']);

/** The sandbox comment's vocabulary, deliberately (T-328): the promotion gate
 *  counts one shape over both lists, so the surface never has to explain why
 *  one stops you and the other does not. */
export const findingStatus = pgEnum('finding_status', ['open', 'closed']);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id),
    sandboxDocumentId: uuid('sandbox_document_id')
      .notNull()
      .references(() => sandboxDocuments.id, { onDelete: 'cascade' }),
    checkFamily: checkFamily('check_family').notNull(),
    input: findingInput('input').notNull(),
    /**
     * The discriminated payload — a `Citation[]`, an attached excerpt, or a
     * quoted clause with the source it came from and that source's SCOPE.
     *
     * ⚠ The scope is the one privacy fact the sandbox document cannot answer:
     * a quoted **firm rulebook** clause is org-private and a quoted **project
     * style guide** clause is not (ADR-0053 §9), because the posture belongs to
     * the source's scope rather than to the word "rulebook". It is resolved
     * through `rulebooks` / `project_style_guides` at read time; the column
     * records which store to ask, never the answer.
     */
    evidence: jsonb('evidence').notNull(),
    /** T-271's `Locator`. REQUIRED — a finding that does not point into the
     *  text is a report and not a tool (ADR-0048 §2). */
    anchor: jsonb('anchor').notNull(),
    /** a defect, never a verdict (ADR-0048 §3) */
    defect: text('defect').notNull(),
    severity: findingSeverity('severity').notNull(),
    /** ADR-0048 §3 — the fix rides the Suggestion path that is already audited,
     *  already reversible and already produces Signals. The checker gains no
     *  write path the drafting side lacks. */
    proposedRevisionId: uuid('proposed_revision_id').references(() => suggestions.id),
    /** T-398's `classifyFix` verdict, computed from the text and never supplied
     *  by the model. T-311's accept-all reads exactly this. */
    fix: jsonb('fix'),
    status: findingStatus('status').notNull().default('open'),
    closedByParticipantId: uuid('closed_by_participant_id').references(() => participants.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('findings_document_idx').on(t.sandboxDocumentId),
    index('findings_run_idx').on(t.runId),
    // the column and the payload cannot disagree: `input` exists so the wall
    // predicate and the grouping query are ordinary SQL rather than jsonb
    // digging, and the copy is safe only because this refuses the version where
    // they differ
    check('findings_input_matches_evidence', sql`evidence->>'input' = input::text`),
    // T-328's own words about `Finding.fix`: present exactly when the proposed
    // revision is. An unclassified fix would have to be treated as one kind or
    // the other, and either default is wrong at T-311's accept-all.
    check(
      'findings_fix_with_revision',
      sql`(proposed_revision_id IS NULL) = (fix IS NULL)`,
    ),
    // a resolution with nobody's name on it is not an audit record — the
    // `users.removed_by_user_id` pattern, one drawer along
    check(
      'findings_closed_names_who',
      sql`(status = 'open') = (closed_by_participant_id IS NULL AND closed_at IS NULL)`,
    ),
  ],
);
