// Drawer 4 — AI output & feedback, the Signal loop (ADR-0021, ADR-0028).
// Suggestions are per-item with an advisory anchor (ruled 2026-07-06).
import {
  check,
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
