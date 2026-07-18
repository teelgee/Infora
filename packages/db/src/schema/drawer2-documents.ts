// Drawer 2 — documents, the grounding corpus (ADR-0002, ADR-0011, ADR-0013;
// rebuilt for Slice A per ADR-0032/0034, T-114).
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
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organisations, participants, projects } from './drawer1-parties.js';

// rejected: the cycle was closed-rejected and never resubmitted — the document
// stays in the library as a record and never grounds (ADR-0013/0032)
export const containerState = pgEnum('container_state', [
  'live',
  'superseded',
  'withdrawn',
  'rejected',
]);
// a library container is a deliverable (a plan row, ADR-0008); a sandbox
// container is a sandbox document's freeze series — org-private, no coded
// reference, auto-created at first freeze (ADR-0032)
export const containerScope = pgEnum('container_scope', ['library', 'sandbox']);

export const containers = pgTable(
  'containers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    scope: containerScope('scope').notNull().default('library'),
    // whose plan row this is — container creation and metadata are
    // producing-organisation acts; an organisation's deliverable plan is its
    // set of planned library-scope containers (ADR-0033)
    producingOrganisationId: uuid('producing_organisation_id')
      .notNull()
      .references(() => organisations.id),
    // null at sandbox scope — the freeze series and the issued series are two
    // reference sequences (the P-rev/C-rev convention, ADR-0032)
    documentReference: text('document_reference'),
    // set only at sandbox scope: whose freeze series this is (ADR-0032)
    sandboxDocumentId: uuid('sandbox_document_id').references(
      (): AnyPgColumn => sandboxDocuments.id,
    ),
    inLibrary: boolean('in_library').notNull().default(false),
    state: containerState('state').notNull().default('live'),
    // plan-authored extras (ADR-0008); the per-project schema is deferred with
    // the naming scheme — at-a-glance columns are derived by query, never
    // duplicated here (2026-07-18 ruling)
    metadata: jsonb('metadata').notNull().default({}),
  },
  (t) => [
    uniqueIndex('containers_project_reference_unique').on(t.projectId, t.documentReference),
    // one freeze series per sandbox document
    uniqueIndex('containers_sandbox_document_unique')
      .on(t.sandboxDocumentId)
      .where(sql`${t.sandboxDocumentId} IS NOT NULL`),
  ],
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

// A stored, immutable, one-way export bound to its version — a snapshot of
// the record, never an editing surface (ADR-0034, T-114). Native = the asset
// the client owns and reuses (generated for authored documents, the file
// itself for uploaded ones); pdf = the authoritative review-and-record
// rendition (ADR-0004). Append-only by trigger, like its Version. The
// dwg/CAD format class is deliberately deferred.
export const renditionKind = pgEnum('rendition_kind', ['native', 'pdf']);
export const renditionFormat = pgEnum('rendition_format', ['docx', 'xlsx', 'pptx', 'pdf']);

export const renditions = pgTable(
  'renditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => versions.id),
    kind: renditionKind('kind').notNull(),
    format: renditionFormat('format').notNull(),
    // a pointer into the dev blob substrate; real storage is the infra session
    contentRef: text('content_ref').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('renditions_version_kind_unique').on(t.versionId, t.kind)],
);

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

// canonical format follows origin (ADR-0034): authored = Infora structured
// text is canonical; uploaded = the native file is canonical. A slide deck is
// a differently-shaped authored document, not a rendition trick.
export const documentOrigin = pgEnum('document_origin', ['authored', 'uploaded']);
export const documentKind = pgEnum('document_kind', ['text', 'slides']);
export const documentFormat = pgEnum('document_format', ['infora_text', 'docx', 'xlsx', 'pptx']);

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
  origin: documentOrigin('origin').notNull().default('authored'),
  kind: documentKind('kind').notNull().default('text'),
  format: documentFormat('format').notNull().default('infora_text'),
  // content stays NOT NULL until the upload path lands (T-122 relaxes it and
  // adds the one-of-content-or-file check per ADR-0034/data-model Drawer 2)
  content: text('content').notNull().default(''),
  // the canonical native file when uploaded (T-122 writes it)
  fileRef: text('file_ref'),
  // the intended plan row this draft is producing — the previously missing
  // sandbox-document ↔ deliverable link (ADR-0032); null for ad-hoc documents
  containerId: uuid('container_id').references(() => containers.id),
  // the freeze's check-out lock: set while a sandbox-scope round is open,
  // released by transmittal-back or audited early release (ADR-0032)
  headLocked: boolean('head_locked').notNull().default(false),
  createdByParticipantId: uuid('created_by_participant_id')
    .notNull()
    .references(() => participants.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // safe lifecycle (T-128, the ProjectWise A1 fold-in): soft-delete with
  // self-service restore — recovery is never a helpdesk ticket
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Ambient version history (ADR-0032, T-114; written from T-128): the
// SharePoint-style automatic snapshot at each save boundary — browsable,
// restorable, a working tool, not a record. Nothing review-grade binds to it
// and it never grounds; restore copies a snapshot back into the head, it
// never rewrites history. Distinct from the freeze (an immutable Version in
// the document's sandbox-scope container).
export const sandboxDocumentVersions = pgTable(
  'sandbox_document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sandboxDocumentId: uuid('sandbox_document_id')
      .notNull()
      .references(() => sandboxDocuments.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdByParticipantId: uuid('created_by_participant_id')
      .notNull()
      .references(() => participants.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sandbox_document_versions_document_idx').on(t.sandboxDocumentId)],
);

export const sandboxCommentStatus = pgEnum('sandbox_comment_status', ['open', 'closed']);

// Working-draft comment threads on a sandbox document (T-112, owner-ruled
// 2026-07-18). Mutable like the sandbox it annotates — distinct from the
// append-only DRR Comment (drawer 5). The anchor is a quoted span against
// the mutable head: advisory, never blocking (the Suggestion pattern).
// status is meaningful on thread roots only (parent_comment_id null).
export const sandboxComments = pgTable(
  'sandbox_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sandboxDocumentId: uuid('sandbox_document_id')
      .notNull()
      .references(() => sandboxDocuments.id, { onDelete: 'cascade' }),
    parentCommentId: uuid('parent_comment_id').references((): AnyPgColumn => sandboxComments.id, {
      onDelete: 'cascade',
    }),
    authorParticipantId: uuid('author_participant_id')
      .notNull()
      .references(() => participants.id),
    body: text('body').notNull(),
    anchor: text('anchor'),
    status: sandboxCommentStatus('status').notNull().default('open'),
    closedByParticipantId: uuid('closed_by_participant_id').references(() => participants.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    mentions: uuid('mentions').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sandbox_comments_document_idx').on(t.sandboxDocumentId)],
);

