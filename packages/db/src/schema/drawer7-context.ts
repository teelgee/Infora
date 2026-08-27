// Drawer 7 — the scoped context stores (ADR-0020, component 4), T-308.
//
// The first tables behind component 4's three stores, which until now had
// none: `guiding` in the assembly gateway returned an empty array because
// there was nothing to return. Org context only — programme and project
// context are NOT implied by these two tables and get their own when their
// slices start.
//
// A rulebook is a firm's house drafting manual. ADR-0048 §4: it rides the
// GUIDING channel in its entirety — it steers the checker's judgement, it is
// not a grounded source, and it is never cited as project fact. A restatement
// of an ISO clause is still the firm's own document (ADR-0048 Context), so
// nothing here ever becomes groundable by what it happens to contain.
//
// ORG-PRIVATE AND PROJECT-LESS BY CONSTRUCTION. Org context is portable to
// every project the organisation touches (ADR-0020), so there is deliberately
// no `project_id` and no wall predicate on these tables: the only key is the
// organisation. That is also the authority-corpus spike's Finding 4 applied
// early — a store walled by a different rule than `version_chunks`' must not
// sit inside the table whose entire purpose is enforcing that one.
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organisations, users } from './drawer1-parties.js';

export const rulebooks = pgTable(
  'rulebooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // the ONLY scope key. No project: org context travels to every project the
    // organisation touches, and a project column would be a narrower thing
    // wearing the same name (ADR-0020).
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    title: text('title').notNull(),
    // what was uploaded, for the honest report of what could be read out of it
    sourceFormat: text('source_format').notNull(),
    // USER grain, not Participant: loading org context is an account-level
    // administrative act and has no project to hold a Participant of.
    loadedByUserId: uuid('loaded_by_user_id')
      .notNull()
      .references(() => users.id),
    loadedAt: timestamp('loaded_at', { withTimezone: true }).notNull().defaultNow(),
    // currency by state, never a delete: a finding written against a rule that
    // has since been withdrawn still resolves to the words it quoted
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [index('rulebooks_organisation_idx').on(t.organisationId)],
);

/**
 * One clause, stored **as the manual really reads it**.
 *
 * NOT the chunker's output, and the difference is the whole ticket. The
 * sentence-packing chunker trims sentences and rejoins them with a single
 * space, so a chunk is not a substring of its own source (T-270 finding 1).
 * ADR-0048 §5 lets a finding quote a rule VERBATIM while never citing it — so
 * the stored unit must be the text itself, addressed by the number the manual
 * gives it (*§4.2*, not "page 11"). A rulebook chunked for steer alone would
 * have satisfied the guiding channel and left the ruling unimplementable at
 * the surface, which is exactly the trap T-308's ticket names.
 */
export const rulebookClauses = pgTable(
  'rulebook_clauses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rulebookId: uuid('rulebook_id')
      .notNull()
      .references(() => rulebooks.id, { onDelete: 'cascade' }),
    /** reading order within the rulebook; the stable sort key */
    ordinal: integer('ordinal').notNull(),
    /**
     * the clause number as the manual writes it — `4.2`, `12.4.7` — digits and
     * dots only, because `§` is a rendering convention and not part of the
     * address.
     *
     * NULLABLE, and the null is honest rather than a gap: text before the
     * first numbered heading, or a manual with no numbering at all, still
     * steers the checker; it simply cannot be quoted *with a reference*. The
     * same discipline as the locator — never a guessed address, because an
     * invented one looks checkable.
     */
    clause: text('clause'),
    /** the heading text beside the number, when there is one */
    heading: text('heading'),
    /** the clause verbatim, exactly as the extracted document reads */
    content: text('content').notNull(),
    // the span into the rulebook's extracted text, so a quote is checkable
    // rather than merely precise — T-271's discipline, one store along
    spanStart: integer('span_start').notNull(),
    spanEnd: integer('span_end').notNull(),
  },
  (t) => [
    uniqueIndex('rulebook_clauses_ordinal_unique').on(t.rulebookId, t.ordinal),
    index('rulebook_clauses_rulebook_idx').on(t.rulebookId),
  ],
);
