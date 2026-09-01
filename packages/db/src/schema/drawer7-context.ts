// Drawer 7 — the scoped context stores (ADR-0020, component 4), T-308 and T-397.
//
// The tables behind component 4's three stores. TWO OF THE THREE now have
// them: org context (the firm's rulebook, T-308) and project context (the
// project style guide, T-397). Programme context still has none and is not
// implied by these four.
//
// **The two stores are the same shape and a different key, and the key is the
// ruling.** ADR-0021 classifies context BY OWNERSHIP, not by purpose. A firm's
// drafting manual is the firm's own IP and leaves when the firm leaves the
// project, so its only scope key is the organisation and it rides the
// **informing** channel. A project style guide belongs to the project and binds
// every organisation on it, so its only scope key is the project and it rides
// the **guiding** channel — the first material that channel has ever actually
// carried (CONTEXT.md: "the project's templates, style guides and guardrails").
// ADR-0048 §4 originally put the rulebook on guiding; that was corrected by its
// own dated addendum (2026-08-30) and the label moved with it.
//
// A rulebook is a firm's house drafting manual. ADR-0048 §4 as corrected: it
// rides the INFORMING channel in its entirety — it steers the checker's
// judgement, it is not a grounded source, and it is never cited as project
// fact. Nothing about the substance moved with the label: *does not ground*,
// *quotable but never cited* and *private to its organisation* hold identically
// on informing, and this table is untouched by the correction. A restatement
// of an ISO clause is still the firm's own document (ADR-0048 Context), so
// nothing here ever becomes groundable by what it happens to contain.
//
// ORG-PRIVATE AND PROJECT-LESS BY CONSTRUCTION. Org context is portable to
// every project the organisation touches (ADR-0020), so there is deliberately
// no `project_id` and no wall predicate on these tables: the only key is the
// organisation. That is also the authority-corpus spike's Finding 4 applied
// early — a store walled by a different rule than `version_chunks`' must not
// sit inside the table whose entire purpose is enforcing that one.
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { organisations, projects, users } from './drawer1-parties.js';

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

/**
 * A PROJECT STYLE GUIDE — project context, owner-curated, binding every
 * organisation on the project (ADR-0053 §3). T-397.
 *
 * **The only scope key is the project, and there is deliberately no
 * `organisation_id`.** This is not org material scoped to a project; it is the
 * project's own. An owning-organisation column would make it a firm's manual
 * wearing a project's name, and the wall would then have two answers to "who
 * may read this clause" — which is exactly what makes a quoted style-guide
 * clause NOT org-private where a quoted rulebook clause is (ADR-0053 §9).
 *
 * The shape is `rulebooks`' one store along, and nothing about it is copied for
 * tidiness: every decision it repeats — the nullable clause label, the verbatim
 * text, the span, currency by state — has the same reason here that it had
 * there, and two style sources stored differently would need two readers.
 */
export const projectStyleGuides = pgTable(
  'project_style_guides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    title: text('title').notNull(),
    sourceFormat: text('source_format').notNull(),
    // USER grain, matching the rulebook's: curating project context is an
    // administrative act by a person, and a control nobody can see operating is
    // a control nobody can audit. Registered in personal-data.md.
    loadedByUserId: uuid('loaded_by_user_id')
      .notNull()
      .references(() => users.id),
    loadedAt: timestamp('loaded_at', { withTimezone: true }).notNull().defaultNow(),
    // currency by state, never a delete: a finding written against a clause
    // since withdrawn still resolves to the words it quoted
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [index('project_style_guides_project_idx').on(t.projectId)],
);

/** One clause, stored as the guide really reads it — `rulebook_clauses`' rule. */
export const projectStyleGuideClauses = pgTable(
  'project_style_guide_clauses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    styleGuideId: uuid('style_guide_id')
      .notNull()
      .references(() => projectStyleGuides.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    /** the clause number as the guide writes it; nullable, and the null is honest */
    clause: text('clause'),
    heading: text('heading'),
    content: text('content').notNull(),
    spanStart: integer('span_start').notNull(),
    spanEnd: integer('span_end').notNull(),
  },
  (t) => [
    uniqueIndex('project_style_guide_clauses_ordinal_unique').on(t.styleGuideId, t.ordinal),
    index('project_style_guide_clauses_guide_idx').on(t.styleGuideId),
  ],
);

/**
 * A SAVED STARTING OUTLINE — a composed document outline a member of a firm
 * kept for reuse (T-414, ADR-0053 **addendum A5**).
 *
 * *In plain terms: an outline somebody built in the document creator and kept,
 * so a colleague can start from it next time.*
 *
 * **Org context, and the rulebook's scoping exactly** — org-private and
 * project-less by construction. How a firm structures its documents is firm
 * know-how that travels to every project it touches and must never reach
 * another organisation on the project, so `organisation_id` is the **only**
 * scope key and there is no `project_id` and no wall predicate. That is
 * ADR-0020's argument, and it is the same one `rulebooks` above rests on.
 *
 * **`sections` is jsonb rather than rows, and the reason is what it is FOR.**
 * A starting outline is a **seed for a form**, not an audited record: nothing
 * is ever quoted from it, nothing cites it, and the moment it is chosen it
 * becomes a copy the author edits freely (A1's "seeds but never locks"). That
 * is the opposite of `rulebook_clauses`, which is rows precisely because a
 * finding quotes a clause verbatim and must resolve to the words it quoted.
 * Storing an outline as rows would buy an addressability nobody needs and cost
 * a join on every read of a menu.
 */
export const startingOutlines = pgTable(
  'starting_outlines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // the ONLY scope key — see the block above
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    /** what a colleague picks it out of a list by */
    label: text('label').notNull(),
    /**
     * The composed structure: headings, purposes, and one level of
     * sub-sections (T-412). Typed at the surface and at the wire; stored as
     * the shape the creator's own outline takes, so choosing one is a copy
     * rather than a translation.
     */
    sections: jsonb('sections').notNull(),
    // USER grain, matching `rulebooks.loaded_by_user_id` one table up and for
    // the same reason: keeping an outline for the firm is an account-level act
    // with no project to hold a Participant of. A named person — registered in
    // docs/architecture/personal-data.md in this ticket's own commit.
    savedByUserId: uuid('saved_by_user_id')
      .notNull()
      .references(() => users.id),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Currency by state, never a delete. A curator retires an outline and it
     * stops being offered; **documents already made from it are untouched**,
     * which is true by construction rather than by care — a chosen outline was
     * copied into the request, so no document has ever held a reference to
     * this row.
     */
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [index('starting_outlines_organisation_idx').on(t.organisationId)],
);

// ── T-423 — THE RULE SET: a style guide's typed rules, and its versions ─────
//
// *In plain terms: a project's style guide stops being only a document and
// gains a list of rules — the writing rules somebody accepted, stored one by
// one with what each applies to and where it does not, so most of them can be
// checked by ordinary code rather than by asking the AI.* ADR-0054 decisions
// 2–5, drawn in docs/build/data-model.md drawer 7 before this was written.
//
// 🔒 **`project_style_guide_clauses` IS NOT REPLACED, AND THAT IS THE POINT.**
// An extracted rule POINTS AT the clause it came from, because ADR-0048 §5's
// verbatim quotation resolves through it: a finding quotes the words the
// client's guide really carries, never Infora's restructuring of them. The
// pointer is non-null **exactly when** the origin is `extracted`, and the
// migration carries that as a CHECK rather than as a convention.
//
// **A version is immutable once saved**, on T-397's retire-never-edit
// precedent one store along: the stored rule text is what past findings quoted,
// so an amendment is a NEW version and never an edit. Enforced by trigger
// (`0064`), not by care — which is what makes the run's version stamp
// (decision 7) mean anything at all.
//
// **Proposals ride the same table** (T-426), carrying a state, the proposer and
// the decider. Two shapes for "a rule" would be two answers to what binds: a
// proposal is a rule that has not been accepted, and accepting one copies it
// into a new version rather than flipping something in place.

/**
 * One saved version of one guide's rule set. Append-only.
 *
 * `accepted_by_user_id` is **a named person** — registered in
 * docs/architecture/personal-data.md at ADR-0054's own ruling, alongside the
 * proposer and the decider below; this table keeps that row true rather than
 * adding one. USER grain, matching `loaded_by_user_id` two tables up and for
 * the same reason: accepting a project's writing standard is an act by a
 * person, and a control nobody can see operating is a control nobody can audit.
 */
export const projectStyleGuideRuleSets = pgTable(
  'project_style_guide_rule_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    styleGuideId: uuid('style_guide_id')
      .notNull()
      .references(() => projectStyleGuides.id, { onDelete: 'cascade' }),
    /** 1, 2, 3 … within one guide. An amendment is the next one, never an edit */
    version: integer('version').notNull(),
    acceptedByUserId: uuid('accepted_by_user_id')
      .notNull()
      .references(() => users.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * T-429 — the judgement rules compiled ONCE, here, at save (ADR-0054
     * decision 6). Same rules in, same brief out, so a drafting run keeps a
     * declared workflow's kind of guarantee; and the owner's super user can
     * read exactly what the drafting model is told. Empty where the set has no
     * judgement rules, which is a real answer and not a missing one.
     */
    draftingBrief: text('drafting_brief').notNull().default(''),
  },
  (t) => [
    uniqueIndex('project_style_guide_rule_sets_version_unique').on(t.styleGuideId, t.version),
    index('project_style_guide_rule_sets_guide_idx').on(t.styleGuideId),
  ],
);

/**
 * One rule. **Typed by HOW IT IS ENFORCED, not by what it is about** (decision
 * 4) — which is what decides whether checking it costs a model call.
 *
 * The three fields every rule carries beyond its kind are the ones that make a
 * deterministic check accurate rather than noisy: its **scope**, its
 * **exceptions in two typed halves**, and whether it **raises findings or only
 * steers drafting**. Without the exceptions, *use "scheme", not "project"*
 * fires on the Project Board and on every quoted document title, and the
 * consultant switches the check off.
 */
export const projectStyleGuideRules = pgTable(
  'project_style_guide_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ruleSetVersionId: uuid('rule_set_version_id')
      .notNull()
      .references(() => projectStyleGuideRuleSets.id, { onDelete: 'cascade' }),
    /** reading order within the version; the stable sort key the review screen uses */
    ordinal: integer('ordinal').notNull(),
    /** term | pattern | structure | measured | judgement */
    kind: text('kind').notNull(),
    /** extracted | typed | infora_proposed */
    origin: text('origin').notNull(),
    /**
     * 🔒 The pointer ADR-0048 §5's quotation resolves through — **non-null
     * exactly when `origin` is `extracted`** (CHECK in 0064). No cascade: a
     * clause is never deleted, only its guide retired, and a rule whose clause
     * vanished would be a quote nobody can check.
     */
    clauseId: uuid('clause_id').references(() => projectStyleGuideClauses.id),
    /** the rule in one sentence — Infora's restructuring, never quoted as the client's */
    statement: text('statement').notNull(),
    /** document | section | paragraph | sentence | heading | list | caption | table */
    scope: text('scope').notNull(),
    /** the enumerated half: quotations | references | code | headings */
    exceptedContexts: text('excepted_contexts').array().notNull().default([]),
    /** the authored half: exact words the rule leaves alone — the honest proper-name mechanism */
    exceptedTerms: text('excepted_terms').array().notNull().default([]),
    /** the creator's own DOCUMENT_LANGUAGES, plus `all`. Not a new vocabulary (decision 5) */
    register: text('register').notNull(),
    /** raises_findings | steers_only */
    enforcement: text('enforcement').notNull(),
    /** ADR-0048's existing two levels: required | advisory */
    severity: text('severity').notNull(),
    /** the kind-specific half — a term's swap pair, a pattern's expression, a judgement's examples */
    payload: jsonb('payload').notNull().default({}),
    /**
     * T-426 — **null for a rule of the saved set**; `pending`, `accepted` or
     * `declined` for a proposal. One table, because a proposal IS a rule that
     * has not been accepted, and two tables would be two answers to what binds.
     */
    proposalState: text('proposal_state'),
    /** the rule this proposal would change; null where it adds one */
    supersedesRuleId: uuid('supersedes_rule_id').references((): AnyPgColumn => projectStyleGuideRules.id),
    /** **a named person** — the proposer, registered at ADR-0054's ruling */
    proposedByUserId: uuid('proposed_by_user_id').references(() => users.id),
    proposedAt: timestamp('proposed_at', { withTimezone: true }),
    /** **a named person** — who accepted or declined. There is deliberately no reason column */
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    // ordering is a property of the SET, so proposals are outside it
    uniqueIndex('project_style_guide_rules_ordinal_unique')
      .on(t.ruleSetVersionId, t.ordinal)
      .where(sql`${t.proposalState} IS NULL`),
    index('project_style_guide_rules_version_idx').on(t.ruleSetVersionId),
    index('project_style_guide_rules_proposal_idx')
      .on(t.proposalState)
      .where(sql`${t.proposalState} IS NOT NULL`),
  ],
);
