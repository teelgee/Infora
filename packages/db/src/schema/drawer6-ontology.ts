// Drawer 6 — the project ontology (ADR-0045, T-240): the classification
// vocabulary deliverables classify against, and the typed edges between them.
// Colocated relational tables, NOT a graph store — the ontology adds semantic
// pre-filters to the same access+state query the retrieval path already runs
// (ADR-0022/0024). Metadata and structure only, never a grounded corpus
// (ADR-0011/0021 — grounding is unchanged). Owner-owned, seeded by COPYING an
// Infora default grounded in Uniclass 2015 / ISO 19650 at project creation —
// the acceptance-code / naming-scheme pattern (ADR-0003/0008), extended the way
// the naming scheme is (a producer proposes, the owner folds in).
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { participants, projects } from './drawer1-parties.js';
import { containers } from './drawer2-documents.js';
import { runs } from './drawer3-execution.js';

// ── Classification facet — one axis of classification, per project ───────────
// discipline, system / asset breakdown, work package, document type, phase.
// Seeded by copy; owned by the project-library owner. The source records which
// standard a facet came from so the provenance behind a classification is
// legible (the "says who?" answer, ADR-0045 Fork 1).
export const classificationFacetSource = pgEnum('classification_facet_source', [
  'uniclass_2015',
  'iso_19650',
  'custom',
]);

export const classificationFacets = pgTable(
  'classification_facets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    // the stable key the API and pre-filter address (e.g. 'discipline', 'system')
    key: text('key').notNull(),
    name: text('name').notNull(),
    source: classificationFacetSource('source').notNull().default('custom'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('classification_facets_project_key_unique').on(t.projectId, t.key)],
);

// ── Classification term — a term within a facet, hierarchical ────────────────
// Breakdown structures are trees (parent_term_id self-reference). Currency-by-
// state: a term ever referenced is immutable — retire and replace, never
// redefine (retired_at — valid and displayed on old classifications, unavailable
// for new), the acceptance-code rule (ADR-0003/0013).
export const classificationTerms = pgTable(
  'classification_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facetId: uuid('facet_id')
      .notNull()
      .references(() => classificationFacets.id),
    parentTermId: uuid('parent_term_id').references((): AnyPgColumn => classificationTerms.id),
    // the scheme code (e.g. the Uniclass 'Ss_25'); null-able display via label
    code: text('code').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    index('classification_terms_facet_idx').on(t.facetId),
    // codes unique among the live set of a facet; a retired code may be reused
    uniqueIndex('classification_terms_facet_code_live_unique')
      .on(t.facetId, t.code)
      .where(sql`${t.retiredAt} IS NULL`),
  ],
);

// ── Container classification — a container's placement under a term ──────────
// Agent-proposed, human-editable (ADR-0045): it rides the plan / authoring
// metadata, so it is MUTABLE like container.metadata — a reclassification
// overwrites (not append-only). facet_id is denormalised from the term so the
// one-term-per-facet rule is a DB unique index. proposed_by_run_id records an
// agent origin (null = human-set), so a surface can badge "suggested,
// unconfirmed"; set_by_participant_id is null while an agent proposal is
// unconfirmed.
export const containerClassifications = pgTable(
  'container_classifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    facetId: uuid('facet_id')
      .notNull()
      .references(() => classificationFacets.id),
    termId: uuid('term_id')
      .notNull()
      .references(() => classificationTerms.id),
    proposedByRunId: uuid('proposed_by_run_id').references(() => runs.id),
    setByParticipantId: uuid('set_by_participant_id').references(() => participants.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('container_classifications_container_idx').on(t.containerId),
    // one term per facet per container (facet derived through the term)
    uniqueIndex('container_classifications_container_facet_unique').on(t.containerId, t.facetId),
  ],
);

// ── Document relationship (the edge) — a typed link between two containers ────
// First-class, directional (ADR-0045). An INTERVAL row like the deliverable
// shares / reviewer appointments (Drawer 5): nothing is hard-deleted, currency
// is by state (retired_at), and it is agent-proposed / human-confirmed —
// confirmed_by_participant_id null = proposed and NOT yet live; only a
// confirmed, un-retired edge counts. `supersedes` records the link ADR-0013's
// supersede *state* implies. Visibility rides both endpoints' deliverable
// visibility (producer | owner | live share), applied as the same SQL pre-filter
// as the library reads (the API layer, T-241), so an edge into a walled
// container is never seen.
export const documentRelationshipType = pgEnum('document_relationship_type', [
  'supersedes',
  'references',
  'responds_to',
  'is_part_of',
  'derived_from',
]);

export const documentRelationships = pgTable(
  'document_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    fromContainerId: uuid('from_container_id')
      .notNull()
      .references(() => containers.id),
    toContainerId: uuid('to_container_id')
      .notNull()
      .references(() => containers.id),
    type: documentRelationshipType('type').notNull(),
    proposedByRunId: uuid('proposed_by_run_id').references(() => runs.id),
    createdByParticipantId: uuid('created_by_participant_id')
      .notNull()
      .references(() => participants.id),
    confirmedByParticipantId: uuid('confirmed_by_participant_id').references(() => participants.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    index('document_relationships_from_idx').on(t.fromContainerId),
    index('document_relationships_to_idx').on(t.toContainerId),
    // one live edge of a given type between the same ordered pair; a retired
    // edge may be re-proposed
    uniqueIndex('document_relationships_live_unique')
      .on(t.fromContainerId, t.toContainerId, t.type)
      .where(sql`${t.retiredAt} IS NULL`),
  ],
);
