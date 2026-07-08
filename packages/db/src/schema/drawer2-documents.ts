// Drawer 2 — documents, the grounding corpus (ADR-0002, ADR-0011, ADR-0013).
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { organisations, participants, projects } from './drawer1-parties.js';

export const containerState = pgEnum('container_state', ['live', 'superseded', 'withdrawn']);

export const containers = pgTable(
  'containers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    documentReference: text('document_reference').notNull(),
    inLibrary: boolean('in_library').notNull().default(false),
    state: containerState('state').notNull().default('live'),
  },
  (t) => [uniqueIndex('containers_project_reference_unique').on(t.projectId, t.documentReference)],
);

// Append-only (enforced by trigger, T-008).
export const versions = pgTable('versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  containerId: uuid('container_id')
    .notNull()
    .references(() => containers.id),
  versionReference: text('version_reference').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // inline text is the dev substrate; becomes a content_ref into blob storage
  // at the infra/security session (data-model.md Drawer 2)
  content: text('content').notNull(),
  isCurrent: boolean('is_current').notNull().default(true),
});

// The grounding corpus's retrieval index (T-012, ADR-0024): derived,
// rebuildable rows — chunk text and vector co-located with the relational
// access data so ADR-0022's access/state rules run as SQL pre-filters in the
// same query as similarity. The embedding model id and version are pinned
// beside every vector; a model change is a re-index migration, never a mix.
// Dimensions match the pinned Voyage default (packages/model).
export const versionChunks = pgTable(
  'version_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => versions.id),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    embeddingModelId: text('embedding_model_id').notNull(),
    embeddingModelVersion: text('embedding_model_version').notNull(),
  },
  (t) => [
    // unique per pinned model: each embedding model is its own index over the
    // same corpus (ADR-0024), so e.g. the e2e substrate's fake index coexists
    // with the real one
    uniqueIndex('version_chunks_version_model_chunk_unique').on(
      t.versionId,
      t.embeddingModelId,
      t.chunkIndex,
    ),
    index('version_chunks_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

// Deliberately mutable — the uncontrolled working area (draft-location
// decision, 2026-07-04). The one non-append-only content table by design.
export const sandboxDocuments = pgTable('sandbox_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  // whose sandbox it sits in — one implicit private project sandbox per
  // organisation in the skeleton; the full sandbox model is a later drawer
  organisationId: uuid('organisation_id')
    .notNull()
    .references(() => organisations.id),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  createdByParticipantId: uuid('created_by_participant_id')
    .notNull()
    .references(() => participants.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
