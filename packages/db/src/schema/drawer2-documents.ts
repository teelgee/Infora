// Drawer 2 — documents, the grounding corpus (ADR-0002, ADR-0011, ADR-0013;
// rebuilt for Slice A per ADR-0032/0034, T-114).
import {
  boolean,
  check,
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
import { organisations, participants, projects, sessions, users } from './drawer1-parties.js';

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
    // the deliverable's document owner (ADR-0042/T-189) — a single named person,
    // informational and amendable at any time; distinct from the author/reviewer
    // appointments that drive the review cycle (ADR-0017)
    documentOwnerParticipantId: uuid('document_owner_participant_id').references(
      (): AnyPgColumn => participants.id,
    ),
    // why a planned deliverable was removed from the plan (T-189): removal keeps
    // the container as a record (state → withdrawn) with this free-text reason
    withdrawnReason: text('withdrawn_reason'),
    // WHICH SIDE withdrew it (T-383, ADR-0013 §5 as amended 2026-08-27).
    // Authority over record state follows the publication boundary, so
    // restoration must know whether it is undoing its own act or the other
    // party's — as built either side could restore what the other withdrew and
    // neither act recorded the other. A NAMED PERSON on a destructive act,
    // registered in docs/architecture/personal-data.md; participant grain, like
    // every other attribution here, because the act is project-scoped.
    withdrawnByParticipantId: uuid('withdrawn_by_participant_id').references(
      (): AnyPgColumn => participants.id,
    ),
    // T-405 (migration 0062, drawn in data-model.md drawer 2) — a sentence or
    // two saying WHAT THE DOCUMENT IS, so a person choosing sources in the
    // document creator can tell one reference from another.
    //
    // On the CONTAINER and not the version because it describes the series,
    // not one revision — the same reason `document_reference` lives here.
    //
    // 🔒 **TYPED, NEVER GENERATED** (session Cr residual, Claude-ruled
    // 2026-08-31). A model-written description would be an uncited claim about
    // a document sitting beside that document's own grounded content, which is
    // exactly the distinction the product exists to hold. Nullable because most
    // of the corpus predates it and an absent description is honest.
    // Not personal data: it describes a document, not a person.
    description: text('description'),
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

// T-301 — the elevated tier's refusal record (the 2026-07-31 ruling;
// data-model.md Drawer 2). The gate is not new — T-174/T-176 built it — but a
// refusal left no trace, so "did anyone try to end this deliverable and get
// stopped" had no answer. The conflict register's `conflict_refusals` (T-246)
// is the precedent: a control nobody can see operating is a control nobody can
// audit.
//
// `supersede` is absent from this enum ON PURPOSE. Nothing in the build sets a
// container superseded, and whether the OWNER organisation may do it at all is
// Q-036 — the first cross-organisation container write. Adding the value ahead
// of that ruling would put a claim in the schema no code can make true.
export const elevatedAction = pgEnum('elevated_action', [
  'close_rejected',
  'container_withdraw',
  // recovery rather than destruction, and recorded anyway: the record answers
  // "who attempted an act this tier holds and was refused", and omitting one
  // direction of the same gate leaves it incomplete while looking complete
  'container_restore',
  // T-332 (ADR-0049 §8) — forcing a promotion past open comment threads or open
  // findings. It joins the two destructive acts because it is the same kind of
  // thing: an act heavier than a project role should routinely carry, which is
  // exactly the company the 2026-07-31 ruling put this tier in.
  'promote_over_open_items',
]);

// Append-only (enforced by trigger, T-008): a refusal record a super-user could
// quietly delete is worth nothing, and the people who hold this tier are
// exactly the people who would want to.
export const elevatedRefusals = pgTable(
  'elevated_refusals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    containerId: uuid('container_id')
      .notNull()
      .references((): AnyPgColumn => containers.id),
    // identity from the record, never from the caller (contracts principle 3).
    // Participant grain rather than User: the tier is a PROJECT capability, and
    // the same person may hold it on one project and not another.
    attemptedByParticipantId: uuid('attempted_by_participant_id')
      .notNull()
      .references(() => participants.id),
    action: elevatedAction('action').notNull(),
    // stored although exactly one value is possible today: a row reading
    // "refused, tier elevated" still means what it meant once a second tier
    // exists, where a bare "refused" would change meaning that day — and every
    // historic row would change with it, silently.
    requiredTier: text('required_tier').notNull().default('elevated'),
    refusedAt: timestamp('refused_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('elevated_refusals_container_idx').on(t.containerId, t.refusedAt)],
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
    // T-271 — the character range in versions.content this chunk was packed
    // from. Stored because it CANNOT be recovered: the chunker rewrites
    // inter-sentence whitespace, so a chunk that crossed a paragraph break is
    // not a substring of its own version and indexOf returns -1 (T-270 finding
    // 1). Everything else a citation shows — paragraph now, page and section
    // when the formats carrying them land — is derived from this span.
    //
    // Nullable: chunks written before this ticket carry none, and such a
    // passage degrades to version grain rather than rendering a locator nobody
    // can follow.
    startOffset: integer('start_offset'),
    endOffset: integer('end_offset'),
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
// T-305 added 'pdf' (migration 0048): PDF was on the output side only
// (`rendition_format`, ADR-0004's record rendition) and had no input path at
// all. An uploaded PDF is canonical like the other natives, and is the one
// uploaded format whose grounding text is extracted the moment it arrives —
// it has no conversion path by design, so it is text at upload or never.
export const documentFormat = pgEnum('document_format', [
  'infora_text',
  'docx',
  'xlsx',
  'pptx',
  'pdf',
]);

// ── Sandboxes (ADR-0036, T-145) — the participant-scoped working area ────────
// A project holds an unlimited number of sandboxes, each scoped on a ladder
// from broad to narrow: multi-org ⊃ single-org ⊃ team ⊃ named-user. Narrower is
// a strict subset of broader; separation is by provisioning a narrower sandbox,
// never by walling a shared one (participant-private). The single-org sandbox
// is the default home for a producing org's TIDP deliverables.
export const sandboxScope = pgEnum('sandbox_scope', [
  'multi_org',
  'single_org',
  'team',
  'named_user',
]);
// a scope grant admits either a whole organisation (multi_org/single_org) or a
// named participant (team/named_user)
export const sandboxGranteeType = pgEnum('sandbox_grantee_type', ['organisation', 'participant']);

export const sandboxes = pgTable('sandboxes', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  scope: sandboxScope('scope').notNull(),
  // the organisation that provisions and owns the sandbox — for a cross-org
  // (multi_org) sandbox this is the owner-approved provisioner (ADR-0018/0019)
  owningOrganisationId: uuid('owning_organisation_id')
    .notNull()
    .references(() => organisations.id),
  createdByParticipantId: uuid('created_by_participant_id')
    .notNull()
    .references(() => participants.id),
  // per-sandbox setting (ADR-0040, T-181): may an ordinary participant create
  // folders, or must they work within the structure a super-user laid out? On by
  // default (the current self-serve behaviour); a super-user of the owning org (or
  // the owner-super) turns it off. The seed of a per-sandbox settings surface.
  allowMemberFolderCreate: boolean('allow_member_folder_create').notNull().default(true),
  // the third folder mode (ADR-0040 addendum 2026-08-09, T-365): the tree is
  // DERIVED from the owning org's own plan rows — discipline folders over a
  // working folder per deliverable, system-owned, appearing as rows are
  // created and tracking their row. Composes with allowMemberFolderCreate,
  // which still governs member freedom INSIDE a deliverable's folder.
  planLocked: boolean('plan_locked').notNull().default(false),
  // the QA gate (ADR-0032 addendum 2026-08-09, T-355): with this on, the
  // live-head promotion source is disabled — the QA-accepted frozen version is
  // the only legal source. Default ON for EVERY sandbox, personal included:
  // scratch work is unbound and cannot promote, so exempting the personal
  // workspace only opened a route around the team's gate.
  promotionRequiresQa: boolean('promotion_requires_qa').notNull().default(true),
  // the auto-provisioned personal workspace every participant has in a project
  // (ADR-0036 refinement, T-186): named_user scope, granted only to its owner,
  // server-created (never through the super-user-gated create path). One per
  // participant, enforced below.
  isPersonal: boolean('is_personal').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sandboxes_personal_unique')
    .on(t.createdByParticipantId)
    .where(sql`${t.isPersonal}`),
]);

// The live, revocable participant scope, as append-only intervals (ADR-0036):
// add widens, close (removed_at) revokes — colocated with access so a revoke
// takes effect in the same transaction as the read (ADR-0024), while the
// revoked party's authored work stays attributed. Exactly one of
// organisation_id / participant_id is set, matched to grantee_type (CHECK in
// the migration).
export const sandboxScopeGrants = pgTable(
  'sandbox_scope_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.id, { onDelete: 'cascade' }),
    granteeType: sandboxGranteeType('grantee_type').notNull(),
    organisationId: uuid('organisation_id').references(() => organisations.id),
    participantId: uuid('participant_id').references(() => participants.id),
    grantedByParticipantId: uuid('granted_by_participant_id')
      .notNull()
      .references(() => participants.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    index('sandbox_scope_grants_sandbox_idx').on(t.sandboxId),
    // one live grant per (sandbox, organisation) and per (sandbox, participant)
    uniqueIndex('sandbox_scope_grants_live_org_unique')
      .on(t.sandboxId, t.organisationId)
      .where(sql`${t.removedAt} IS NULL AND ${t.organisationId} IS NOT NULL`),
    uniqueIndex('sandbox_scope_grants_live_participant_unique')
      .on(t.sandboxId, t.participantId)
      .where(sql`${t.removedAt} IS NULL AND ${t.participantId} IS NOT NULL`),
  ],
);

// SharePoint-shaped folders inside a sandbox (ADR-0036 drawer, T-146): create,
// nest (parent_folder_id), and move a document or folder by re-parenting. A
// folder organises the view only — it is never an access object; scope stays
// the sandbox's (a document's access is its sandbox's grant set, ADR-0036),
// so nest/move never change who can see a document, only where it sits.
export const sandboxFolderKind = pgEnum('sandbox_folder_kind', ['manual', 'discipline', 'deliverable']);

export const sandboxFolders = pgTable(
  'sandbox_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sandboxId: uuid('sandbox_id')
      .notNull()
      .references(() => sandboxes.id, { onDelete: 'cascade' }),
    parentFolderId: uuid('parent_folder_id').references((): AnyPgColumn => sandboxFolders.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    // T-365 (ADR-0040 addendum): 'discipline' and 'deliverable' folders are
    // system-derived from the plan in a plan-locked sandbox — system-owned
    // (never hand-created, hand-renamed or hand-moved), named by their row,
    // kept (badged off-plan) when the row is withdrawn. 'manual' is every
    // folder a person made.
    kind: sandboxFolderKind('kind').notNull().default('manual'),
    // the plan container a 'deliverable' folder works for — how renames track
    // the row, and how the bind target pre-selects (ADR-0038 addendum)
    containerId: uuid('container_id').references(() => containers.id),
    createdByParticipantId: uuid('created_by_participant_id')
      .notNull()
      .references(() => participants.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sandbox_folders_sandbox_idx').on(t.sandboxId),
    // one derived working folder per (sandbox, container) — the sync's idempotency
    uniqueIndex('sandbox_folders_deliverable_unique')
      .on(t.sandboxId, t.containerId)
      .where(sql`${t.containerId} IS NOT NULL`),
    // and one discipline folder per (sandbox, name) — concurrent syncs race on
    // the same discipline, and a duplicate system folder is permanent (0044)
    uniqueIndex('sandbox_folders_discipline_unique')
      .on(t.sandboxId, t.name)
      .where(sql`${t.kind} = 'discipline'`),
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
  // organisation in the skeleton; retained while the sandbox_id path (ADR-0036,
  // T-145) is wired through the API (T-153)
  organisationId: uuid('organisation_id')
    .notNull()
    .references(() => organisations.id),
  // the real sandbox this document lives in (ADR-0036) — every document lives in
  // a sandbox; the create path defaults to the org's single-org sandbox when
  // none is named (T-171, NOT NULL)
  sandboxId: uuid('sandbox_id')
    .notNull()
    .references(() => sandboxes.id),
  // where the document sits in the sandbox's folder tree (ADR-0036, T-146);
  // null = the sandbox root. A view fact only, never an access fact.
  folderId: uuid('folder_id').references(() => sandboxFolders.id),
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
  // authoring metadata (ADR-0038, T-147): revision / suitability attributes,
  // document classification, relationships — accrues in the sandbox and carries
  // on promotion. Identity metadata (code, discipline) is plan-owned on the
  // container and read-only here; on an unbound document all metadata is
  // authoring metadata, freely editable, until a binding transition locks
  // identity onto the container.
  authoringMetadata: jsonb('authoring_metadata').notNull().default({}),
  createdByParticipantId: uuid('created_by_participant_id')
    .notNull()
    .references(() => participants.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // safe lifecycle (T-128, the ProjectWise A1 fold-in): soft-delete with
  // self-service restore — recovery is never a helpdesk ticket
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  // T-453 — the editing engine's WOPI lock (ADR-0043 §2), RIDING the check-out
  // rather than beside it: while an engine holds the head, head_locked is true
  // and these name which engine lock it is, because WOPI requires the host to
  // compare the engine's string on every save. A WOPI lock lapses after 30
  // minutes unless the engine re-asserts it.
  wopiLock: text('wopi_lock'),
  wopiLockExpiresAt: timestamp('wopi_lock_expires_at', { withTimezone: true }),
}, (t) => [
  check('sandbox_documents_wopi_lock_pair', sql`(${t.wopiLock} IS NULL) = (${t.wopiLockExpiresAt} IS NULL)`),
  // one mechanism (ADR-0043 §2): an engine lock never exists beside an
  // unlocked head, so every path that refuses a checked-out document refuses
  // an engine-held one for the same reason
  check('sandbox_documents_wopi_lock_holds_head', sql`${t.wopiLock} IS NULL OR ${t.headLocked}`),
]);

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
    // T-453 — the native file this working revision had (ADR-0043 P2): an
    // uploaded document's history is a list of real files, not only dates.
    // Null for authored revisions and for every revision written before 0070.
    fileRef: text('file_ref'),
    createdByParticipantId: uuid('created_by_participant_id')
      .notNull()
      .references(() => participants.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sandbox_document_versions_document_idx').on(t.sandboxDocumentId)],
);

// Binding as a first-class event (ADR-0038, T-147): the audited, one-way
// transition where a sandbox working document joins a planned container and
// wears its coded reference and plan-owned identity. Append-only — the record
// of who bound which document to which container, and when. Binding does not
// snapshot; promotion (a Version) is the later, separate event. The one-way
// lock (container_id, once set, cannot change or clear) is enforced by a
// trigger on sandbox_documents.
export const bindingEvents = pgTable(
  'binding_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sandboxDocumentId: uuid('sandbox_document_id')
      .notNull()
      .references(() => sandboxDocuments.id),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    boundByParticipantId: uuid('bound_by_participant_id')
      .notNull()
      .references(() => participants.id),
    boundAt: timestamp('bound_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('binding_events_document_idx').on(t.sandboxDocumentId)],
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

// Document presence (ADR-0039 real-time, first cut — T-175): who is currently
// viewing/editing a document. A heartbeat upserts last_seen; a reader treats
// anyone seen within a short window as "present". This is the concrete first
// step of the deferred real-time half (a full CRDT sync engine remains later);
// presence follows the document's access (participant-private to its sandbox).
export const documentPresence = pgTable(
  'document_presence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sandboxDocumentId: uuid('sandbox_document_id')
      .notNull()
      .references(() => sandboxDocuments.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('document_presence_doc_participant_unique').on(t.sandboxDocumentId, t.participantId)],
);

// The freeze check-out audit (ADR-0032 addendum, T-180): an append-only trail of
// who checked a document out (froze it — locked the head) and who released it. The
// live lock is sandbox_documents.head_locked; this table is its history. A freeze
// locks the head and appends 'checked_out'; the standalone release path — or a
// review round's issue / close — unlocks and appends 'released'. One mechanism (the
// head lock), audited both ways. The lock is on the document, so it holds for any
// format (authored text or an uploaded docx/pptx/xlsx).
export const sandboxCheckoutAction = pgEnum('sandbox_checkout_action', ['checked_out', 'released']);
export const sandboxCheckoutEvents = pgTable(
  'sandbox_checkout_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sandboxDocumentId: uuid('sandbox_document_id')
      .notNull()
      .references(() => sandboxDocuments.id, { onDelete: 'cascade' }),
    action: sandboxCheckoutAction('action').notNull(),
    byParticipantId: uuid('by_participant_id')
      .notNull()
      .references(() => participants.id),
    // why released (optional) — the audited early-release note (ADR-0032)
    reason: text('reason'),
    // T-453 — the engine lock this row's check-out or release was, when an
    // editing engine caused it; null on a person's freeze. The participant is
    // whose pass the engine presented, so the trail still names a person.
    wopiLock: text('wopi_lock'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sandbox_checkout_events_document_idx').on(t.sandboxDocumentId)],
);

// T-453 — the editing engine's pass (ADR-0043 §4; T-317's rule applied): one
// file, one sign-in, short-lived, and worth nothing on its own — every WOPI
// call re-resolves the person's slice and the sandbox's live grants. Stored
// rather than self-contained so it dies with the session that asked for it;
// only the sha-256 is kept, so reading this table cannot mint a working pass.
export const wopiAccessTokens = pgTable(
  'wopi_access_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    sandboxDocumentId: uuid('sandbox_document_id')
      .notNull()
      .references(() => sandboxDocuments.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('wopi_access_tokens_expires_idx').on(t.expiresAt)],
);

// ── The naming scheme (ADR-0008 homed, T-148, Beat 1) ───────────────────────
// Owner-defined and project-wide, but not fixed. The definition is an ordered
// list of fields with allowed values; the code-builder (T-152) composes a
// compliant reference and auto-increments a serial within the producing org's
// own allocation, with cross-organisation uniqueness carried on the originator
// field. One scheme per project.
export const projectNamingSchemes = pgTable(
  'project_naming_schemes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    separator: text('separator').notNull().default('-'),
    // ordered fields: [{ key, label, allowedValues?, isOriginator?, isSerial?, width? }]
    fields: jsonb('fields').notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('project_naming_schemes_project_unique').on(t.projectId)],
);

// Per-(project, organisation, series) serial allocation — the auto-increment the
// code-builder draws on. The series key is the composed prefix (every field but
// the serial), so serials never collide within an organisation's own allocation
// and cross-org distinctness rides the originator field.
export const namingSerials = pgTable(
  'naming_serials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    seriesKey: text('series_key').notNull(),
    nextSerial: integer('next_serial').notNull().default(1),
  },
  (t) => [uniqueIndex('naming_serials_unique').on(t.projectId, t.organisationId, t.seriesKey)],
);

// A producer's proposed addition to the project-wide scheme — negotiation lives
// at the scheme level, not per code (Beat 1). The owner folds it in or declines.
export const namingProposalStatus = pgEnum('naming_proposal_status', [
  'pending',
  'accepted',
  'declined',
]);
export const namingSchemeProposals = pgTable('naming_scheme_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  proposingOrganisationId: uuid('proposing_organisation_id')
    .notNull()
    .references(() => organisations.id),
  proposedByParticipantId: uuid('proposed_by_participant_id')
    .notNull()
    .references(() => participants.id),
  body: text('body').notNull(),
  status: namingProposalStatus('status').notNull().default('pending'),
  resolvedByParticipantId: uuid('resolved_by_participant_id').references(() => participants.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// T-340 — the purge record (ADR-0050 §5–§6; migration 0049). Delete is T-128's
// bin, restorable and self-service; **Purge is the second act** — it genuinely
// erases, including the derived stores, which is the half that makes it real.
//
// Append-only by trigger, deliberately: the whole value of this row is that it
// survives the act it describes, and a purge record a super-user could quietly
// delete is worth nothing.
//
// The subject is kept as TEXT rather than as a foreign key. The document is
// gone — that is the point — so a reference would dangle, and a record that
// cannot be read answers nothing.
export const purgeEvents = pgTable(
  'purge_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    // User grain rather than Participant: purge is an ORG ADMIN act, and org
    // administration is an account capability rather than a project one
    purgedByUserId: uuid('purged_by_user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    subjectKind: text('subject_kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
    subjectTitle: text('subject_title').notNull(),
    // counts of what it reached, STORED rather than recomputed for the obvious
    // reason: afterwards there is nothing left to count. This is what makes the
    // row answer "was it actually erased, and how much of it" rather than
    // merely "somebody pressed the button".
    reached: jsonb('reached').notNull().default({}),
    purgedAt: timestamp('purged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('purge_events_org_idx').on(t.organisationId, t.purgedAt)],
);
