// Contracts §3 — external endpoints, by milestone. Request bodies are zod
// schemas so apps/api validates against the same source of truth the surfaces
// type against; responses are plain types. No scope-widening parameter exists
// (principle 2): every read is pre-filtered server-side from
// (environment, requester), and the requester is resolved, never supplied
// (principle 3).

import { z } from 'zod';
import type {
  ClassificationFacet,
  ClassificationTerm,
  ContainerClassification,
  DocumentRelationship,
  DocumentRelationshipType,
  Id,
  Plan,
  PlanStage,
  Resolution,
  Run,
  StepType,
  Suggestion,
  Surface,
} from './shared';
import { PLAN_STAGES } from './shared';
import type { ProposedDocument } from './creator';
import type { LensSummary } from './lens';
import type { Locator } from './assembly';
import type { Finding, OpenFindingCount } from './finding';
import type { ExtractionReport, ProposedRule, RuleProposal, RuleSetVersion } from './rule-set';
import {
  EXCEPTED_CONTEXTS,
  RULE_ENFORCEMENTS,
  RULE_KINDS,
  RULE_ORIGINS,
  RULE_SCOPES,
} from './rule-set';
import { CHECK_FAMILIES } from './checker';
import { DOCUMENT_LANGUAGES, DOCUMENT_PURPOSES, DOCUMENT_TYPES } from './creator';
import { appDefinitionSchema } from './app-builder';
import type { AppBuildTurn, BuilderQuestion, GetAppResponse } from './app-builder';
import type { ApiError } from './errors';
import { scopeSchema } from './scope';
import type { ReachCounts } from './scope';

const id = z.uuid();

export const surfaceSchema = z.enum(['web', 'word_addin', 'copilot']) satisfies z.ZodType<Surface>;
export const resolutionSchema = z.enum([
  'accepted',
  'edited',
  'rejected',
]) satisfies z.ZodType<Resolution>;

// ── Conversations & runs (M3, M6) ──────────────────────────────────────────
//
// POST /projects/:projectId/conversations
// POST /conversations/:conversationId/runs
// GET  /runs/:runId
// GET  /conversations/:conversationId
//
// Read scope (ruled 2026-07-06): a Run bound to a Work item is project record —
// readable by the owner role in full. An ad-hoc Run (no Work item; every
// Copilot run in v1) is readable by the requester's organisation only; any
// other reader gets `404 not_found` (principle 4). The owner's audited
// override (ADR-0018) is post-skeleton.

export const createConversationBody = z.object({
  surface: surfaceSchema,
  workItemId: id.optional(),
  // a document-bound conversation is the multiplayer thread (ADR-0039, T-154):
  // visible to the document's sandbox participant scope, not just the org
  sandboxDocumentId: id.optional(),
});
export type CreateConversationBody = z.infer<typeof createConversationBody>;
export type CreateConversationResponse = { conversationId: Id }; // bound to the project environment for life (ADR-0025/0031)

export const createRunBody = z.object({
  request: z.string().min(1), // the Ask/draft turn
  sandboxDocumentId: id.optional(), // document targeted when drafting
  // T-299 — the Lens this turn is answered under. A REGISTER control, never a
  // reach one: the same question under every Lens returns an identical source
  // set (eval case PERM-05). An id the deployment does not carry is a `400`
  // and never a silent fall-back to a default — a Lens the user did not get is
  // worse than a refusal, because the answer still arrives and reads
  // plausibly. Omitted means no Lens, which is the shared core alone.
  lensId: z.string().min(1).optional(),
  // T-469 — the scope (ADR-0029's addendum of 2026-10-24). It replaces T-292's
  // `sourceContainerIds`, and the creator's and checker's own narrowing
  // fields, with ONE object and ONE convention: **absent means the whole
  // visible library; present means exactly it; an empty scope is a `400` in
  // words.** It NARROWS and cannot widen — the gateway intersects it with the
  // requester's entitled set after resolution, so an id the requester cannot
  // reach adds nothing and is never counted. A `savedScopeId` is resolved by
  // the API to term and container ids before the gateway sees it. It is a
  // relevance control, not an access one.
  scope: scopeSchema.optional(),
});
export type CreateRunBody = z.infer<typeof createRunBody>;
export type CreateRunResponse = Run; // completed, with steps, suggestions and citations
// (v1 returns on completion; streaming is a later, additive change)

// T-283 — GET /lenses: what the picker is allowed to offer.
//
// Deliberately NOT project-scoped and not access-resolved. The Lens set is a
// property of the DEPLOYMENT, identical for every requester — which is the
// point: if the list differed by who asked, a Lens would be a reach control.
// It carries summaries only (id, label, description, version); prohibitions
// and worked exchanges are prompt material and never leave the server.
//
// `defaultLensId` is CONFIG, not code (`DEFAULT_LENS_ID`), and may be null —
// a deployment that names none offers the shared core, which is the state the
// product shipped in before the Lens layer existed.
export type ListLensesResponse = { lenses: LensSummary[]; defaultLensId: string | null };

// T-254 — GET /organisation/costs: what this organisation's own people spent.
//
// Org-scoped by construction and org-admin only. Deliberately NOT a project
// report: a project's total would sum two organisations' private work into one
// number and hand it to whichever asked. Run records are producer-private (the
// 2026-07-12 ruling) and so is what they cost.
//
// `unpricedSteps` is not a footnote. Finding F7 was that every step recorded a
// cost of exactly zero; the way to repeat that is to sum the priced steps,
// omit the rest, and call the result "the cost". A total read without this
// number is a LOWER BOUND, and `unpricedModels` names the configuration gap.
export type UserCost = {
  userId: Id;
  userName: string;
  cost: number;
  tokensPrompt: number;
  tokensCompletion: number;
  pricedSteps: number;
  unpricedSteps: number;
};
export type OrganisationCostsResponse = {
  organisationId: Id;
  cost: number;
  pricedSteps: number;
  unpricedSteps: number;
  unpricedModels: string[];
  users: UserCost[];
};

export type GetRunResponse = Run; // the immutable audit read (owner path, M5)
export type GetConversationResponse = { runs: Run[] };

// T-253 — GET /runs/:runId/context (finding F5): the assembled context a run
// actually saw, reconstructed from its recorded source set at PASSAGE grain.
// Producer-private, exactly like the run record it belongs to. This is what
// turns "we log what it saw" from a claim into a demonstration in a client
// security review — the passages themselves, in the order the model received
// them, with the step that admitted each.
export type AssembledPassage = {
  stepId: Id;
  stepType: StepType;
  versionId: Id;
  documentReference: string | null;
  versionReference: string;
  chunkId: Id | null; // null = recorded before T-253, at document grain only
  chunkIndex: number | null;
  content: string | null; // null when the passage is no longer reconstructible
  // T-271 — WHERE in the document the passage sits, so the evidence answers
  // "what did your AI read, and where was it" rather than only the first half.
  // Null degrades to version grain: a chunk ingested before spans existed, or
  // one whose span no longer resolves against its version.
  locator: Locator | null;
};
// T-261 — GET /runs/:runId/plan: the analysis a run performed, read back.
//
// **The plan inherits the run's read scope EXACTLY** — producer-private (the
// 2026-07-12 ruling), so another organisation gets the same `404 not_found` as
// nonexistence. It is not a softer read than the run it belongs to and it is
// not a harder one: the plan IS the run's internals, and the client reviews the
// *document* through the review cycle rather than the agent's reasoning.
//
// `canRerun` is on the response rather than left to the caller to derive,
// because deriving it means a surface comparing participant ids and getting the
// rule slightly wrong somewhere: **a colleague in the same organisation may
// READ this plan and may not re-run it as themselves.** Re-running is a new Run
// with a new requester, which is the honest record — so the button is absent
// for a reader, exactly as an unentitled worker is absent rather than disabled.
export type GetRunPlanResponse = { plan: Plan; canRerun: boolean };

// T-267 — POST /runs/:runId/plan/rerun: edit the plan, then run it again.
//
// **Supersession, not mutation.** The edited plan is a NEW plan on a NEW run,
// and the old one is marked `superseded` pointing at it. A plan is evidence:
// "what did your AI do" has to survive the user editing it afterwards, so the
// version that produced the first answer stays exactly as it was.
//
// **An edited plan is `model_chosen` even if it started `declared`**, and this
// is not bookkeeping. A declared workflow's promise is that the same inputs
// produce the same steps in the same order — a hand-edited copy of it makes no
// such promise, whatever it still resembles, so it may not carry the label. The
// stored CHECK enforces the other half: a `model_chosen` plan may never name a
// workflow.
//
// **Two things a step may not say, and neither is a validation nicety.** It may
// not name a worker outside the requester's ASSEMBLED set — the offered set is
// the assembled one, so editing cannot reach a worker entitlement withheld. And
// it may not declare a scope in any spelling: a step declares none (T-469 put
// the scope on the PLAN, written once before retrieval, and a rerun INHERITS
// its plan's — the body carries no scope, so an edit cannot move the one the
// person declared), which is what makes "editing cannot widen scope" structural
// rather than checked.
export const rerunPlanStep = z
  .object({
    stage: z.enum(PLAN_STAGES),
    // absent = the orchestrator runs this stage itself; a `verify` step may
    // never name one, because the ground-check is code outside the plan
    worker: z.string().min(1).nullable().optional(),
    inputs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export const rerunPlanBody = z.object({ steps: z.array(rerunPlanStep).min(1) });
export type RerunPlanBody = z.infer<typeof rerunPlanBody>;
/** The new run, plus the plan it wrote and the plan it superseded. */
export type RerunPlanResponse = { run: Run; plan: Plan; supersededPlanId: Id };


export type GetRunContextResponse = {
  runId: Id;
  passages: AssembledPassage[];
  // stated rather than implied: a passage whose chunk row has since been
  // re-ingested under a new model, or which predates passage-grain recording,
  // cannot be reconstructed — and saying so is the honest answer
  unreconstructable: number;
};

// GET /projects/:projectId/history
//     added 2026-07-13 (T-108): the requester's own prompted turns on the
//     project, newest first — Ask chats and agent use in a document alike.
//     Self-scoped by construction (only runs the caller requested), so the
//     producer-private record read (T-104) is not widened. The document a
//     turn targeted is read off its suggestions; a document run that
//     produced none reads as a chat turn (residual, tracker).
export type HistoryEntry = {
  runId: Id;
  conversationId: Id;
  request: string;
  state: Run['state'];
  startedAt: string;
  sandboxDocument: { id: Id; title: string } | null; // null = an Ask chat turn
};
export type GetHistoryResponse = { items: HistoryEntry[] };

// ── Work items (M3, M5) ────────────────────────────────────────────────────
//
// GET /projects/:projectId/work-items
// GET /work-items/:workItemId

export type WorkItem = {
  id: Id;
  projectId: Id;
  type: string;
  title: string;
  status: string;
  // the deliverable's record half (ADR-0032 addendum, T-116): null for
  // owner-added reference material and future non-document types
  containerId: Id | null;
  assigneeParticipantId: Id | null;
};
export type ListWorkItemsResponse = { items: WorkItem[] };
export type GetWorkItemResponse = WorkItem & { runs: Run[] };

// ── Sandbox documents (M4 — the draft-location decision) ──────────────────
//
// POST  /projects/:projectId/sandbox-documents
// GET   /projects/:projectId/sandbox-documents
//       list added 2026-07-08 (T-051): the requester's organisation's private
//       project sandbox (ADR-0018) — org-scoped by construction, no parameter
// GET   /sandbox-documents/:id
// GET   /sandbox-documents/:id/suggestions
//       added 2026-07-08 (T-082): the document's Suggestions, newest first —
//       what the Editor's Suggestions tab renders; same scope as the document
// PATCH /sandbox-documents/:id
//       manual editing: no Suggestion, no Signal, no ceremony — by design
// PATCH /sandbox-documents/:id/title
//       rename (T-220, ADR-0043 P1): display-name edit on an UNBOUND document —
//       author-owned metadata, not content, so it takes no ambient version and
//       is allowed while checked out. A bound document (containerId set) keeps
//       the container's plan-owned name (ADR-0038) → 409 bound.
// POST  /sandbox-documents/:id/file
//       replace the canonical native file (T-220, ADR-0043 P1): multipart, an
//       'uploaded' document only, a new upload of the SAME format family — writes
//       a new blob + file_ref and bumps the working revision (an ambient
//       snapshot). Refused while head_locked (it rewrites canonical bytes, like
//       the T-122 conversion). T-453 (P2): the prior file is retained on its
//       working revision (sandbox_document_versions.file_ref, migration 0070).
// POST  /sandbox-documents/:id/editing-session
//       the pass an editing engine carries (T-453, ADR-0043 §4): one file, one
//       sign-in, an hour at most and never past the sign-in's own end. An
//       'uploaded' docx/xlsx/pptx the requester may read AND whose sandbox
//       admits them; anything else 404. The pass is worth nothing on its own —
//       every WOPI call re-checks the person's entitlement.
// GET   /wopi/files/:fileId                CheckFileInfo   ┐ the WOPI host
// GET   /wopi/files/:fileId/contents       GetFile         │ (T-453): the
// POST  /wopi/files/:fileId/contents       PutFile (PUT)   │ protocol's own
// POST  /wopi/files/:fileId                LOCK · GET_LOCK │ shapes, not
//                                          REFRESH_LOCK ·  │ Infora's — an
//                                          UNLOCK          ┘ engine speaks them
//       Sessionless; `access_token` is the pass. 401 for a bad pass, 404 for a
//       person no longer entitled. A save lands a v0.x working revision; a
//       second writer is refused 409 with the holder named in words
//       (X-WOPI-LockFailureReason, and `hint` in the body).

export type SandboxDocument = {
  id: Id;
  projectId: Id;
  organisationId: Id;
  title: string;
  // canonical format follows origin (ADR-0034, T-116)
  origin: 'authored' | 'uploaded';
  kind: 'text' | 'slides';
  // 'pdf' added by T-305 — an uploaded PDF is a first-class canonical format,
  // never converted to an editable one, and the only uploaded format whose
  // grounding text is extracted the moment it arrives
  format: 'infora_text' | 'docx' | 'xlsx' | 'pptx' | 'pdf';
  content: string;
  // the intended plan row this draft is producing (ADR-0032's missing link)
  containerId: Id | null;
  // the sandbox and folder it lives in (ADR-0036, T-157); null while unwired
  sandboxId: Id | null;
  folderId: Id | null;
  // authoring metadata that accrues in the sandbox (ADR-0038, T-166)
  authoringMetadata: Record<string, unknown>;
  // the freeze's check-out lock (ADR-0032)
  headLocked: boolean;
  // the current working revision in the sandbox, ISO 19650 v0.x (ADR-0041);
  // present on list/read where the ambient count is resolved
  workingRevision?: string;
  // the org-private freeze-series container, once a freeze has created it
  // (ADR-0032; T-355) — the internal QA cycle's id, previously returned only
  // by POST /freeze and unreachable from any read. Present on list/read.
  freezeContainerId?: Id | null;
  updatedAt: string;
};

// T-453 — what a signed-in browser hands an editing engine. `wopiSrc` is the
// file's address on the WOPI host as the ENGINE reaches it; `accessTokenTtl`
// is WOPI's own name and meaning — the pass's expiry, in ms since the epoch.
export type EditingSession = {
  documentId: Id;
  wopiSrc: string;
  accessToken: string;
  accessTokenTtl: number;
  // T-454 — the engine page the browser loads to edit this file (its WOPI
  // discovery `edit` action, with WOPISrc on the end); null when this server
  // has no editing engine, or the engine has no editor for the format
  editorUrl: string | null;
};

export type ListSandboxDocumentsResponse = { items: SandboxDocument[] };
export type ListSuggestionsResponse = { items: Suggestion[] };

export const createSandboxDocumentBody = z.object({
  title: z.string().min(1),
  // the intended plan row (ADR-0032's link), own-org library containers only
  containerId: id.optional(),
  // the sandbox (and optional folder) to create it in (ADR-0036, T-157)
  sandboxId: id.optional(),
  folderId: id.optional(),
});
export type CreateSandboxDocumentBody = z.infer<typeof createSandboxDocumentBody>;

// T-249 — carrying an answer into the editor, server-side (finding F2).
// The client used to create a document and then PATCH the answer into it, so
// the server never knew the content came from a run and could not check what
// it was widening. Naming the run makes the provenance the server's own fact,
// which is the only version of this that can enforce anything.
//
// `override` is the ONLY route past a refusal: explicit, reasoned, and
// attributed to the participant who sent it. There is no config key, no
// environment variable and no default that does this.
export const openRunInEditorBody = z.object({
  title: z.string().min(1).optional(),
  sandboxId: id.optional(),
  folderId: id.optional(),
  override: z.object({ reason: z.string().min(1) }).optional(),
});
export type OpenRunInEditorBody = z.infer<typeof openRunInEditorBody>;

export const patchSandboxDocumentBody = z.object({ content: z.string() });
// authoring metadata (ADR-0038, T-166): document-specific fields that accrue in
// the sandbox — revision, suitability, classification, relationships. A
// metadata-only edit, distinct from a content save (no ambient version).
export const patchSandboxMetadataBody = z.object({
  authoringMetadata: z.record(z.string(), z.unknown()),
});
export type PatchSandboxMetadataBody = z.infer<typeof patchSandboxMetadataBody>;
export type PatchSandboxDocumentBody = z.infer<typeof patchSandboxDocumentBody>;

// rename (T-220, ADR-0043 P1): the display name only. Allowed on an unbound
// document; a bound one keeps the container's plan-owned name (ADR-0038).
export const renameSandboxDocumentBody = z.object({ title: z.string().min(1) });
export type RenameSandboxDocumentBody = z.infer<typeof renameSandboxDocumentBody>;

// ── Sandbox comments (T-112, owner-ruled 2026-07-18) ───────────────────────
//
// GET    /sandbox-documents/:id/comments
//        every thread on the document, roots and replies flat (the surface
//        assembles threads via parentCommentId); same scope as the document —
//        the org-private sandbox, so the wall needs no new rule here
// POST   /sandbox-documents/:id/comments
//        a root comment (with an optional advisory quoted-span anchor) or a
//        reply (parentCommentId set); mentions name project participants
// PATCH  /sandbox-comments/:id
//        author-only body/mention edit — mutable like the sandbox (distinct
//        from the append-only DRR Comment, Slice A)
// DELETE /sandbox-comments/:id
//        author-only; deleting a root deletes its thread (204)
// POST   /sandbox-comments/:id/status
//        close/reopen the thread (root only) — any entitled participant, not
//        just the author: "suggest an edit" is prose in a comment, and the
//        colleague who makes the manual edit closes it
// GET    /projects/:projectId/participants
//        the @-mention picker: the requester's organisation's participants on
//        the project — org-scoped by construction, like the sandbox list
//        (mentioning someone who cannot see the document is useless anyway);
//        mention *delivery* is parked on the tracker, mentions render only

export type SandboxComment = {
  id: Id;
  sandboxDocumentId: Id;
  parentCommentId: Id | null;
  author: { participantId: Id; name: string };
  body: string;
  anchor: string | null; // quoted span against the mutable head — advisory, never blocking
  status: 'open' | 'closed';
  closedBy: { participantId: Id; name: string } | null;
  closedAt: string | null;
  mentions: Id[]; // participant ids referenced in the body
  createdAt: string;
  updatedAt: string;
};
export type ListSandboxCommentsResponse = { items: SandboxComment[] };

export const createSandboxCommentBody = z.object({
  body: z.string().min(1),
  anchor: z.string().min(1).optional(),
  parentCommentId: id.optional(),
  mentions: z.array(id).optional(),
});
export type CreateSandboxCommentBody = z.infer<typeof createSandboxCommentBody>;

export const patchSandboxCommentBody = z.object({
  body: z.string().min(1),
  mentions: z.array(id).optional(),
});
export type PatchSandboxCommentBody = z.infer<typeof patchSandboxCommentBody>;

export const setSandboxCommentStatusBody = z.object({ status: z.enum(['open', 'closed']) });
export type SetSandboxCommentStatusBody = z.infer<typeof setSandboxCommentStatusBody>;

/** @deprecated superseded by RosterEntry (ADR-0033, T-117): the participants
 * read is the project roster now; kept for the transition. */
export type ProjectParticipant = { participantId: Id; userId: Id; name: string };
/** @deprecated superseded by ListRosterResponse (ADR-0033, T-117). */
export type ListParticipantsResponse = { items: ProjectParticipant[] };

// ── Suggestion resolution — the Signal (M4) ────────────────────────────────
//
// POST /suggestions/:suggestionId/resolution
//
// Exactly one Signal per Suggestion (v1); a second call is `409 conflict`.
// Accept applies `content`, edit applies `editedContent`, reject applies nothing.

export const resolveSuggestionBody = z
  .object({
    resolution: resolutionSchema,
    editedContent: z.string().optional(),
  })
  .refine((body) => (body.resolution === 'edited') === (body.editedContent !== undefined), {
    message: "editedContent is required iff resolution is 'edited'",
  });
export type ResolveSuggestionBody = z.infer<typeof resolveSuggestionBody>;
export type ResolveSuggestionResponse = {
  signalId: Id;
  sandboxDocument?: SandboxDocument; // updated document on accept/edit
};

// ── Library (M2 read path, seed browsing) ──────────────────────────────────
//
// GET /projects/:projectId/library
//
// One row per container — the ruled list unit (2026-07-06); version history
// expands within the container view when Slice A lands. Pre-filtered to the
// requester's access-resolved slice; superseded/withdrawn stay out of
// grounding by ADR-0013 and are omitted here for the skeleton.

export type LibraryItem = {
  containerId: Id;
  documentReference: string;
  currentVersionId: Id;
  title: string | null; // the work item's title, or reference material's own (T-462)
  revision: string; // the current version reference (e.g. C01, P02)
  suitability: string | null; // ISO suitability code carried on the container metadata
  discipline: string | null; // discipline code carried on the container metadata
  producerName: string; // the producing organisation
  issuedAt: string; // ISO timestamp of the current version
  state: 'live';
  // T-304 — produced record, or received material? **Derived, never stored:**
  // a reference-material container is one with no work item (the 2026-07-31
  // ruling — the distinguishing fact is an absence, and ADR-0032's addendum
  // already says these carry none), so this field is that absence read out
  // rather than a flag some writer has to remember to set.
  //
  // It is on the wire because the surface has to be able to tell them apart:
  // a loaded consultee response listed indistinguishably beside an accepted
  // deliverable is the corpus quietly laundering itself into the produced
  // record. Both ground; only one was produced here.
  kind: 'deliverable' | 'reference';
  // T-388 — whether the AI may rely on this deliverable, and if not, why.
  contextState: ContextState;
  // T-389 — which side the reader is on decides which action they hold, and
  // `producerName` is a display string. The lifecycle acts on this screen are
  // the first that need the id: the owner withdraws, the producing organisation
  // proposes, and everyone else does neither (ADR-0013 §2).
  producingOrganisationId: Id;
  // T-389 — a producing organisation's proposed withdrawal, awaiting the owner.
  // On this list because a proposal leaves the deliverable LIVE and listed: it
  // is not in force until the owner answers, and the answer is asked for here.
  withdrawalProposal: { participantId: Id; name: string; reason: string } | null;
};
export type GetLibraryResponse = { items: LibraryItem[] };

// ── T-459 — the register's search and paging ────────────────────────────────
//
// GET /projects/:projectId/library/search — one row per container, paged,
// sorted, filtered, and — when `q` is given — ranked by the same index the
// agent grounds on: a coded reference or a title matches first (the lexical
// arm), then the nearest passage of the current version (the vector arm,
// under the deployment's pinned embedding model), access-resolved with the
// identical visibility predicate the list and retrieval use. Rows, never
// chunks: the unit a person recognises.
//
// `state` defaults to `live` because that is the library; `any` is the
// register of record (superseded and withdrawn rows stand as records on the
// plan and a document controller searches those too). Nothing here widens
// reach: every clause intersects the wall's own.
export const librarySearchQuery = z.object({
  q: z.string().trim().max(500).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['relevance', 'reference', 'title', 'issued', 'producer']).default('relevance'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  state: z.enum(['live', 'superseded', 'withdrawn', 'rejected', 'any']).default('live'),
  kind: z.enum(['deliverable', 'reference', 'any']).default('any'),
  discipline: z.string().trim().max(64).optional(),
  statusCode: z.string().trim().max(16).optional(),
  producerId: z.uuid().optional(),
});
export type LibrarySearchQuery = z.infer<typeof librarySearchQuery>;
export type LibrarySearchItem = Omit<LibraryItem, 'state'> & {
  state: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  /** why the row is here when `q` was given — the reference, the title, a passage of the content, or (no `q`) none */
  match: 'reference' | 'title' | 'content' | 'none';
};
export type GetLibrarySearchResponse = {
  items: LibrarySearchItem[];
  total: number;
  page: number;
  pageSize: number;
  q: string | null;
};

// ── T-460 — saved views: a named filter over a register, never an access object ──
//
// GET    /projects/:projectId/saved-views?register=   the requester's own, and the
//                                                      ones shared within their organisation
// POST   /projects/:projectId/saved-views              save the current query under a name
// DELETE /saved-views/:id                              the maker's act; an org admin's for a shared one
// T-469 — `scope`: the one register whose `filter` the server reads. A saved
// scope's filter is the typed scope, validated on save and resolved on use;
// every other register's filter stays stored and never interpreted.
export const savedViewRegister = z.enum(['library', 'plan', 'sandbox', 'review', 'scope']);
export type SavedViewRegister = z.infer<typeof savedViewRegister>;
export const createSavedViewBody = z.object({
  register: savedViewRegister,
  name: z.string().trim().min(1).max(80),
  /** the list's query as the screen sends it; stored, never interpreted by the server */
  filter: z.record(z.string(), z.unknown()),
  shared: z.boolean().default(false),
});
export type CreateSavedViewBody = z.infer<typeof createSavedViewBody>;
export type SavedView = {
  id: Id;
  projectId: Id;
  register: SavedViewRegister;
  name: string;
  filter: Record<string, unknown>;
  shared: boolean;
  /** the person who saved it — a named person on the record */
  savedBy: { participantId: Id; name: string };
  /** whether the requester made it (and so may delete it) */
  mine: boolean;
  createdAt: string;
};
export type ListSavedViewsResponse = { items: SavedView[] };

// GET /projects/:projectId/plan?page=&pageSize=&q=&sort=&direction= — the
// same read, paged and searched when asked; without `page` or `q` it answers
// as it always has (every row), so nothing already built changes shape.
export const planQuery = z.object({
  q: z.string().trim().max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  // T-462 — `relevance` ranks a searched plan as the library's search does; without a query it reads as `reference`
  sort: z.enum(['relevance', 'reference', 'title', 'state']).default('relevance'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  // T-462 — the register's filter chips, applied on the server so a page is a page of the filtered list
  state: z.enum(['live', 'superseded', 'withdrawn', 'rejected', 'any']).default('any'),
  kind: z.enum(['deliverable', 'reference', 'any']).default('any'),
  producerId: z.uuid().optional(),
});
export type PlanQuery = z.infer<typeof planQuery>;

// T-388 — CONTEXT STATE (ADR-0013 §6). **Derived, never stored**: a persisted
// "this grounds" flag would be a second state machine that could disagree with
// the first, and the drift would be invisible because every citation would still
// resolve. It is the answer to three conditions — in the library, record state
// `live`, and admitted by a code the project grounds on (ADR-0011's rider) —
// and it is READ-ONLY on the wire: no endpoint sets it, because there is
// nothing to set.
//
// `reason` is what follows the em dash in the badge — *"not used for AI answers
// — withdrawn"* — and is null exactly when the deliverable grounds. For a
// non-grounding acceptance code it is that code's own description, because the
// project wrote it: the 2021 National Annex requires each Published code's
// meaning to be set in the project's information standard, so there is no
// platform phrase for it that would be true of every project.
//
// **Context state is not access.** Component 2 remains the only place access is
// resolved; a deliverable out of the AI's reach is still readable, still
// openable, and may still be pinned deliberately as an attached source
// (ADR-0022) by anyone who could see it before.
export type ContextState = { grounds: boolean; reason: string | null };

// GET /versions/:versionId — the cited source, readable (T-094, 2026-07-09):
// a citation chip opens the version it names. Scoped exactly like the
// library (the version's project, through the wall predicate); superseded
// and withdrawn versions stay readable here — a citation in the immutable
// record must remain resolvable — with their state carried for the surface
// to badge. Never grounding: retrieval's pre-filters are untouched.
export type GetVersionResponse = {
  versionId: Id;
  // T-457 — the container, so a citation's source view can open the document page
  containerId: Id;
  documentReference: string;
  versionReference: string;
  content: string;
  // rejected: the cycle closed-rejected and the deliverable stands as a
  // record, never grounding (ADR-0032/0013, T-114)
  containerState: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  isCurrent: boolean;
};

// GET /versions/:versionId/passages/:chunkId — the passage a citation recorded
// (T-468, 2026-10-24). A citation row now carries the id of the stored chunk it
// was written from; this reads THAT row, by id, through the version's own
// visibility — it never searches, so the card shows what the run read and not
// what a query would find today. The chunk must belong to the version named
// (else 404). `passage` is null with `held: false` where a re-ingest has since
// replaced the chunk rows: the card then says so in words rather than showing a
// neighbour. `verbatim` is the source text as it really reads at the span, not
// the chunker's rewritten content. `span` is the character range into the
// version's content (the document page highlights it); `page` is present only
// where the source has pages (a docx has none, and none is invented).
export type GetPassageResponse = {
  versionId: Id;
  chunkId: Id;
  containerId: Id;
  documentReference: string;
  documentTitle: string | null;
  versionReference: string;
  containerState: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  isCurrent: boolean;
  passage: {
    chunkIndex: number;
    page?: number;
    paragraph?: number;
    span?: { start: number; end: number };
    verbatim: string;
  } | null;
  held: boolean;
};

// ── Auth & session (M1, M6) ────────────────────────────────────────────────
//
// POST   /auth/session — skeleton login for the seeded users (plan.md's recorded
//        build-time decision: email + password, httpOnly cookie; T-021 implements —
//        the cookie is the product, the response shape lands there).
// DELETE /auth/session — sign out (added 2026-07-14, T-111): clears the cookie,
//        204; idempotent and unauthenticated by design.
// GET    /me
//
// Copilot adds no endpoints: the API plugin (ADR-0031) calls the same
// contracts with `surface: 'copilot'`, identity mapped from Entra SSO via
// `User.external_identity`.

export const createSessionBody = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type CreateSessionBody = z.infer<typeof createSessionBody>;

// Display facts added 2026-07-08 (T-050): the workspace landing and rail
// render names and role badges, and every fact here is the requester's own
// entitlement — no wall implication, purely a completion of the read.
export type UserPreferences = { theme?: 'light' | 'dark' };
export type MeResponse = {
  userId: Id;
  name: string;
  email: string; // the requester's own sign-in identity (T-092, 2026-07-09)
  organisationId: Id;
  organisationName: string;
  orgRole: 'admin' | 'member'; // the requester's own administration role (ADR-0033, T-117) — a self fact
  preferences: UserPreferences; // personal settings (T-092, 2026-07-09)
  participants: Array<{
    projectId: Id;
    participantId: Id;
    projectName: string;
    ownerOrganisationName: string;
    membershipRole: 'owner' | 'member';
    // the elevated (super-user) capability on this project (T-174) — a self fact
    elevated: boolean;
  }>;
};

// Personal settings (T-092, 2026-07-09): both writes are self-scoped — the
// session's own user row, no id parameter, no wall implication.
//
// PATCH /me                 body: PatchMeBody          → MeResponse
// POST  /me/password        body: ChangePasswordBody   → 204 (401 on a wrong current password)
export const patchMeBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    preferences: z.object({ theme: z.enum(['light', 'dark']).optional() }).optional(),
  })
  .refine((body) => body.name !== undefined || body.preferences !== undefined, {
    message: 'nothing to change',
  });
export type PatchMeBody = z.infer<typeof patchMeBody>;

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;

// ── Slice A — document management (T-116, 2026-07-18; ADR-0032/0033/0034) ──
// Contracts §4. Implemented ticket by ticket (T-117–T-128); an endpoint 501s
// until its ticket lands.

// Roster & administration (ADR-0033, T-117).
// GET /projects/:projectId/participants is WIDENED to the project roster —
// the wall hides work, never presence; removed entries stay for attribution.
export type RosterEntry = {
  participantId: Id;
  userId: Id;
  name: string;
  organisationId: Id;
  organisationName: string;
  membershipRole: 'owner' | 'member';
  removedAt: string | null;
};
export type ListRosterResponse = { items: RosterEntry[] };

export type OrgUser = {
  userId: Id;
  name: string;
  email: string;
  orgRole: 'admin' | 'member';
  /** T-440 (ADR-0056 §12) — may this person build an app? The organisation's
   * own admin decides, per person; holding `orgRole: 'admin'` does not confer
   * it, because an implicit grant is a policy nobody chose. */
  mayBuildApps: boolean;
};
export type ListOrgUsersResponse = { items: OrgUser[] };

// T-315 — DELETE /organisation/users/:userId. The ACCOUNT-level removal, and
// the twin of removing a Participant rather than a synonym for it: this one
// ends every live session, because the person has left the organisation.
// The counts are returned because "when did they lose access, and how much of
// it" is the question an incident asks, and a bare 204 answers neither.
export type RemoveOrgUserResponse = {
  userId: Id;
  removedAt: string;
  /** live sessions ended (T-251's `revokeUserSessions`, wired here at last) */
  sessionsEnded: number;
  /** live Participant intervals closed — the seat cannot outlive the person */
  participationsClosed: number;
};

// T-308 — the firm's rulebook, org context (ADR-0020, ADR-0048 §4). Org-admin
// only and project-less: org context is portable to every project the
// organisation touches, so there is no project in any of these shapes.
//
// POST   /organisation/rulebooks    multipart upload; extracted, parsed into
//                                   clauses, bound to the organisation
// GET    /organisation/rulebooks    the organisation's own, live first
// DELETE /organisation/rulebooks/:id  retire — currency by state, never a delete
export type RulebookRecord = {
  id: Id;
  title: string;
  sourceFormat: string;
  clauses: number;
  /**
   * how many clauses carry a number. **Reported, not assumed.** ADR-0048 §5
   * lets a finding quote a rule *with its clause* — so a manual that parsed to
   * one unlabelled clause is one whose rules can only ever be quoted anonymously,
   * and the person who uploaded it should learn that now rather than from a
   * finding that reads oddly six weeks later.
   */
  labelled: number;
  loadedBy: { userId: Id; name: string };
  loadedAt: string;
  retiredAt: string | null;
};
export type ListRulebooksResponse = { items: RulebookRecord[] };

// T-397 — the PROJECT STYLE GUIDE (ADR-0053 §3). Project context, owner-curated,
// binding every organisation on the project — so the route is project-scoped
// where the rulebook's is organisation-scoped, and that difference is the whole
// classification: context is classified by OWNERSHIP, not by purpose (ADR-0021).
//
// GET    /projects/:projectId/style-guides       every participant on the
//                                                project — a guide that binds
//                                                you is one you may read
// POST   /projects/:projectId/style-guides       the OWNER organisation's super
//                                                user only (see style-guide.ts)
// DELETE /projects/:projectId/style-guides/:id   retire — never a delete
//
// The record is `RulebookRecord`'s shape and deliberately not a second type:
// the two style sources are read by one checker through one shape, and a
// separate record would be where they start to drift.
export type StyleGuideRecord = RulebookRecord;
export type ListStyleGuidesResponse = { items: StyleGuideRecord[] };

// ── T-424/T-425 — THE RULES WORKBENCH (ADR-0054 decisions 2–5) ─────────────
//
// POST /projects/:projectId/style-guides/:styleGuideId/rule-sets/extraction
//      the owner's super user only. Reads the guide's clauses, proposes rules,
//      and **stores nothing** — the review step sits between extraction and
//      saving, always (decision 2).
// POST /projects/:projectId/style-guides/:styleGuideId/rule-sets
//      the owner's super user only. THE MOMENT ANYTHING BINDS, and it always
//      writes a NEW version.
// GET  /projects/:projectId/style-guides/:styleGuideId/rule-sets/current
//      every participant — a rule that binds you is a rule you may look up.
//
// The guide's own title is the set's name, so there is no name field here: a
// project may hold several guides and T-397's store has always allowed it.

/**
 * The three creation parameters, and deliberately no more (decision 2), plus
 * the registers the set must cover.
 *
 * *Considered and left out: which document types a set applies to, and spelling
 * variety — the first is a second axis nobody has asked for (decision 5), the
 * second is a pattern rule.*
 */
export const extractRulesBody = z.object({
  registers: z.array(z.enum([...DOCUMENT_LANGUAGES, 'all'])).min(1),
  /** decision 5, default on: one tick for a client who wants only their own rules */
  fillGaps: z.boolean(),
  /** set once for the set and overridable per rule at review */
  defaultSeverity: z.enum(['required', 'advisory']),
});
export type ExtractRulesBody = z.infer<typeof extractRulesBody>;
export type ExtractRulesResponse = { rules: ProposedRule[]; report: ExtractionReport };

export const ruleBody = z.object({
  kind: z.enum(RULE_KINDS),
  origin: z.enum(RULE_ORIGINS),
  statement: z.string().trim().min(1).max(600),
  scope: z.enum(RULE_SCOPES),
  exceptedContexts: z.array(z.enum(EXCEPTED_CONTEXTS)).max(4),
  exceptedTerms: z.array(z.string().trim().min(1).max(120)).max(64),
  register: z.enum([...DOCUMENT_LANGUAGES, 'all']),
  enforcement: z.enum(RULE_ENFORCEMENTS),
  severity: z.enum(['required', 'advisory']),
  payload: z.record(z.string(), z.unknown()).default({}),
  /** required when the origin is `extracted` — the store's own CHECK is the floor */
  clauseId: id.optional(),
});

/**
 * The reviewed list, as the screen sends it back: **the whole list, never a
 * diff.**
 *
 * A version is the set as it stands, so a save carrying only what changed would
 * need a base version to apply against — and the moment two people are
 * reviewing, that base is stale. Sending the list is what makes *an amendment
 * is a new version* true at the wire as well as in the store. There is
 * deliberately **no per-rule acceptance flag**: bulk acceptance is permitted
 * (decision 2, owner-ruled), so a flag would describe a gate that does not
 * exist.
 */
export const saveRuleSetBody = z.object({ rules: z.array(ruleBody).max(500) });
export type SaveRuleSetBody = z.infer<typeof saveRuleSetBody>;

/** `null` where the guide has no accepted set — which is not an empty set. */
export type GetRuleSetResponse = { set: RuleSetVersion | null };

// ── T-426 — ANYONE PROPOSES; THE SUPER USER DECIDES (ADR-0054 decision 2) ──
//
// POST /projects/:projectId/style-guides/:styleGuideId/rule-sets/proposals
//      **any participant on the project.** A rule that binds you is one you may
//      argue with.
// GET  /projects/:projectId/style-guides/:styleGuideId/rule-sets/proposals
//      🔒 **the author, the author's own organisation, and the owner
//      organisation — nobody else.** A rival learning which rules a competitor
//      is arguing about is the ethical-wall breach nobody thinks of as crossing
//      the wall (ADR-0048 §6's precedent), so the predicate is applied in the
//      read's own WHERE and another firm's proposal is ABSENT, never refused.
// POST …/rule-sets/proposals/:proposalId/decision
//      the owner organisation's super user. Accepting one produces a NEW
//      version; declining records **no reason**, on the finding-dismissal
//      precedent.

export const proposeRuleBody = z.object({
  rule: ruleBody,
  /** the rule this would change; absent means it ADDS one */
  supersedesRuleId: id.optional(),
});
export type ProposeRuleBody = z.infer<typeof proposeRuleBody>;

export const decideProposalBody = z.object({
  decision: z.enum(['accept', 'decline']),
});
export type DecideProposalBody = z.infer<typeof decideProposalBody>;

/**
 * `mayDecide` is set by the SERVER and only where this requester may act — the
 * assembled-not-filtered rule at a button (T-269): an action nobody may take is
 * absent from the response rather than present and false, so a surface has
 * nothing to render disabled.
 */
export type ListRuleProposalsResponse = {
  items: RuleProposal[];
  mayDecide?: true;
};

export const enrolParticipantBody = z.object({ userId: id });
export type EnrolParticipantBody = z.infer<typeof enrolParticipantBody>;

export type MembershipRecord = {
  id: Id;
  organisationId: Id;
  organisationName: string;
  projectId: Id;
  role: 'owner' | 'member';
  state: 'proposed' | 'active';
  createdAt: string;
};
export const addMembershipBody = z.object({ organisationId: id });
export type AddMembershipBody = z.infer<typeof addMembershipBody>;

// The deliverable plan (ADR-0008/0033, T-118/T-119). GET /projects/:id/plan
// is access-decided with no parameter: a member reads its own organisation's
// rows (the TIDP), the owner reads all (the MIDP consolidation).
export type AppointmentGrant = {
  id: Id;
  containerId: Id;
  participantId: Id;
  name: string;
  isLead: boolean;
  // who made the appointment (T-372) — stored since ADR-0033 and surfaced now
  // because the undertaking card asks a named person to take on a duty, and a
  // request to do that should say who is asking
  grantedBy: { participantId: Id; name: string };
  grantedAt: string;
  revokedAt: string | null;
};
// T-372 (ADR-0033 addendum §2, 2026-08-22) — a reviewer grant now carries three
// answers, not one. `confirmedAt` is the OWNER's act (access begins there,
// where ADR-0015's share-first invariant bites); `acceptedAt` / `declinedAt` are
// the APPOINTEE's own, because a lead reviewer holds the deliverable's
// contractual verdict and nobody can give that undertaking on someone else's
// behalf. Only a lead grant is ever accepted or declined — a plain reviewer's
// appointment carries no undertaking to give.
//
// `declineReason` is a named person's stated refusal (personal-data.md) and is
// **owner-organisation-private**: the server nulls it for every other reader
// except the person who wrote it, so the producing side learns only that a lead
// reviewer is awaited, never why.
export type ReviewerGrant = AppointmentGrant & {
  confirmedAt: string | null; // null = proposed, no access
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null; // withheld unless you are owner-side or the decliner
};

// POST /reviewers/:grantId/acceptance — the appointee's own act, no body.
// POST /reviewers/:grantId/declination — the same, with the reason it needs.
// There is no override on either: a super user facing an absent lead
// re-appoints; they do not accept in that person's name.
export const declineAppointmentBody = z.object({ reason: z.string().trim().min(1) });
export type DeclineAppointmentBody = z.infer<typeof declineAppointmentBody>;

// POST /containers/:containerId/lead-reviewer — name the lead reviewer,
// REPLACING the standing one in a single transaction (T-377, ADR-0008/0033
// addenda 2026-08-22: the lead author "may amend the review group, the lead
// reviewer included"). One act, not a revoke-then-grant sequence, because the
// one-live-lead invariant makes the pair inseparable: fired separately, a
// failure between them strands the deliverable with no lead at all — the
// half-applied state the promotion window audit reproduced. Both interval rows
// still land on the record; the new grant follows the ordinary confirmation
// rules (a producing-side naming is a proposal and confers nothing).
export const nameLeadReviewerBody = z.object({ participantId: id });
export type NameLeadReviewerBody = z.infer<typeof nameLeadReviewerBody>;
export type LeadReviewerReplacement = {
  grant: ReviewerGrant; // the new lead appointment (proposed, or auto-confirmed owner-side)
  revoked: ReviewerGrant | null; // the standing lead it displaced; null when none stood
};

export type PlanRow = {
  containerId: Id;
  // null for a sandbox-scope (freeze-series) container — the org-private
  // internal QA series carries no coded reference and no plan row (ADR-0032);
  // T-355's qa-row read serves those through the same shape
  documentReference: string | null;
  producingOrganisationId: Id;
  producingOrganisationName: string;
  metadata: Record<string, unknown>;
  /**
   * T-405 — what the document IS, in a sentence or two, **typed by whoever
   * files or edits it and never generated**. Null where nobody has written one.
   * It rides the plan row because the plan is where document metadata is
   * edited, and it is read again in `GroundingSource` because the source
   * picker is where it does its work.
   */
  description: string | null;
  /** T-462 — the row's title however it is held: the work item's for a deliverable, the container's own for reference material (migration 0072). Never stored twice: the read coalesces. */
  title: string | null;
  state: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  // T-389 — whether this deliverable has been published into the owner's
  // library. The surface needs it because `withdrawn` is TWO ACTS THAT SHARE A
  // WORD (ADR-0013's 2026-08-27 amendment): before publication it is the
  // producer removing a row from its own plan, after it is the owner stopping a
  // published deliverable being relied on. A screen that called both "removed
  // from the plan" would be asserting the wrong one half the time.
  inLibrary: boolean;
  workItem: { id: Id; title: string; status: string } | null; // null = owner-added reference material
  currentVersion: { versionId: Id; versionReference: string; createdAt: string } | null;
  // the latest round verdict — derived. `isContractual` rides with it (T-392)
  // because the accepted-status surface has to state WHICH acceptance happened:
  // an accepting code ends the cycle, a contractual one also issues the `C`
  // revision (ADR-0003 as amended, ADR-0041 — the 2021 NA's `S4`/`S5` split).
  // Without it a screen would have to infer the answer from a revision prefix,
  // which reads the outcome backwards from its side effect.
  deliverableCode: { code: string; description: string; isContractual: boolean } | null;
  // the document owner (single, informational, amendable — T-189); null if unset
  documentOwner: { participantId: Id; name: string } | null;
  // why the deliverable was removed from the plan (state = withdrawn), if so
  withdrawnReason: string | null;
  // T-384 — WHICH SIDE withdrew it (ADR-0013 §5). Authority over record state
  // follows the publication boundary, so restoration has to know whether it is
  // undoing its own act or the other party's; `side` is derived from the
  // withdrawing participant's organisation against the container's producer.
  withdrawnBy: { participantId: Id; name: string; side: 'owner' | 'producer' } | null;
  // T-388 — whether the AI may rely on this deliverable, and if not, why. The
  // plan is where a `superseded`, `withdrawn` or `rejected` record is actually
  // read (the library list carries only the live corpus), so the badge needs it
  // on both reads.
  contextState: ContextState;
  // T-384 — a producing organisation's PROPOSED withdrawal of a deliverable
  // already published into the owner's library, awaiting the owner's answer
  // (ADR-0013 §2 — the owner sets record state, the producer proposes). Null
  // when none stands. A proposal is NOT in force: `state` is still `live` and
  // the deliverable still grounds until the owner confirms.
  withdrawalProposal: { participantId: Id; name: string; reason: string } | null;
  authors: AppointmentGrant[];
  reviewers: ReviewerGrant[];
  // live owner-granted shares (ADR-0016 as data, T-119); [] for non-owner readers.
  // T-456 — `shareId` rides with each so the owner's screen can revoke one
  // without a second read; only an owner reader ever sees the list at all.
  sharedWith: Array<{ shareId: Id; organisationId: Id; organisationName: string }>;
};
// planColumns is the requester organisation's org-standard extra column set
// (T-360, S3): schema field keys, fixed by that org's super user for everyone
// in the organisation — locked, no personal overrides; null = the default set
// (an empty selection is normalised to null, never stored as []).
export type GetPlanResponse = {
  items: PlanRow[];
  planColumns: string[] | null;
  // T-459 — present only when the read was paged or searched
  total?: number;
  page?: number;
  pageSize?: number;
};

// One predicate for "may this schema field be a plan column" — shared by the
// template export, the column write's legal set and the config surface, so the
// three cannot drift: never a role slot, never a serial (either flagging), and
// never a second Title.
export function isColumnableField(f: NamingSchemeField): boolean {
  return !f.role && !f.isSerial && f.type !== 'serial' && f.key !== 'title';
}

export const updatePlanColumnsBody = z.object({
  columns: z
    .array(z.string().min(1))
    .max(12)
    .nullable()
    .refine((cols) => cols === null || new Set(cols).size === cols.length, {
      message: 'duplicate column keys',
    }),
});
export type UpdatePlanColumnsBody = z.infer<typeof updatePlanColumnsBody>;
export type UpdatePlanColumnsResponse = { columns: string[] | null };

export const createPlanRowBody = z.object({
  documentReference: z.string().min(1),
  title: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePlanRowBody = z.infer<typeof createPlanRowBody>;

export const patchContainerBody = z.object({
  metadata: z.record(z.string(), z.unknown()),
  /**
   * T-405 — the document's own description, saved beside its metadata because
   * it is edited in the same dialog by the same person under the same
   * permission. **Optional and nullable are two different answers**: absent
   * means "this request is not about the description, leave it alone", and
   * `null` means "clear it". A caller that could only send a string would have
   * no way to say a description was written by mistake.
   */
  description: z.string().nullable().optional(),
});
export type PatchContainerBody = z.infer<typeof patchContainerBody>;

// T-359 (S3) — the plan batch import: a create-only act off the T-358 template.
// References are generated in file order, never read from the file; a whole-file
// verdict — any failing row refuses the lot, each failure naming the Excel row
// the user sees. Role-mapped and unrecognised columns are dropped and named.
export type PlanImportFailure = { row: number; problem: string };
export type PlanImportResult = {
  created: number;
  items: PlanRow[];
  ignoredColumns: string[];
};
export type PlanImportError = ApiError & { failures?: PlanImportFailure[] };

// the planned deliverable's title (a work-item field) — a producing-org
// super-user act, amendable at any time (T-201)
export const setPlanTitleBody = z.object({ title: z.string().min(1) });
export type SetPlanTitleBody = z.infer<typeof setPlanTitleBody>;

export const grantAppointmentBody = z.object({
  participantId: id,
  isLead: z.boolean().optional(),
});
export type GrantAppointmentBody = z.infer<typeof grantAppointmentBody>;

// Deliverable shares (ADR-0016 as data, T-119): the owner's grant is the only
// thing that opens a deliverable across the wall; interval rows, org-level.
export type DeliverableShare = {
  id: Id;
  containerId: Id;
  organisationId: Id;
  organisationName: string;
  grantedAt: string;
  revokedAt: string | null;
};
export const shareDeliverableBody = z.object({ organisationId: id });
export type ShareDeliverableBody = z.infer<typeof shareDeliverableBody>;

// ── Non-review transmittal, the acknowledgement gate, intra-org narrowing ──
// (ADR-0035, T-137). The write half of the gate the retrieval pre-filter and
// canReadDeliverable enforce. No parameter widens a requester's scope: the
// requester is resolved, the container/project are the only inputs.

// The owner issues a promoted library deliverable to organisations (§1–§2) —
// a first-class audited event that sets each receiving org's ceiling (the
// share) and, on issue, fires each org's standing routing rules (§3).
export const issueTransmittalBody = z.object({
  organisationIds: z.array(id).min(1),
  purposeCode: z.string().min(1).optional(),
});
export type IssueTransmittalBody = z.infer<typeof issueTransmittalBody>;
export type NonReviewTransmittal = {
  id: Id;
  containerId: Id;
  versionId: Id;
  recipientOrganisationIds: Id[];
  purposeCode: string | null;
  issuedAt: string;
};

// T-350 — the container's transmittal & acknowledgement history (ADR-0035
// addendum, ruled 2026-08-06). The three-way distribution-list cut is enforced
// in the endpoint's row construction, never by a client filtering a fuller
// payload: the OWNER sees every recipient organisation and its acknowledgement
// state; a RECEIVING organisation sees only its own rows; the PRODUCING
// organisation sees that issues occurred with the recipient list withheld.
export type TransmittalHistoryRecipient = {
  organisationId: Id;
  organisationName: string;
  acknowledged: { by: { participantId: Id; name: string }; at: string } | null;
};
export type TransmittalHistoryRow = {
  id: Id;
  // T-431 (ADR-0055 §1) — the third kind is on the SAME log, deliberately: the
  // value of the transmittal record is that "who has this been issued to?" has
  // one answer, and a separate external log would fork it.
  kind: 'review' | 'non_review' | 'external';
  direction: 'issue' | 'return' | null; // review kind only
  roundNumber: number | null; // review kind only
  roundState: Round['state'] | null; // review kind only — lets the surface tell "awaiting acknowledgement" from pre-gate history
  versionReference: string | null;
  sender: { participantId: Id; name: string };
  purposeCode: string | null;
  issuedAt: string;
  recipientOrganisations: TransmittalHistoryRecipient[]; // non_review only, cut per viewer
  recipientsWithheld: boolean; // the producing organisation's view of a non_review row
  // ADR-0051 — the receipt of a review submission (return-direction rows);
  // organisationName is whose behalf the receipt was on — the audit fact
  submissionAcknowledged: {
    by: { participantId: Id; name: string; organisationName: string };
    at: string;
  } | null;
  // T-431 — the external kind's recipient, cut per viewer exactly as the
  // organisation list above is: the project owner and the sending organisation
  // read the person; the producing organisation reads that an issue happened
  // with the recipient withheld (ADR-0055 §8, carrying ADR-0035's addendum
  // over unchanged). `null` on the other two kinds, and on a withheld row.
  externalRecipient: { name: string; email: string; expiresAt: string } | null;
  // T-436 — when the link was FIRST opened, or null while it has not been.
  //
  // It sits BESIDE `externalRecipient` rather than inside it, and that is the
  // ruling rather than a layout choice: the receipt is a fact of the ISSUE
  // record — the document was read — and not a fact about the person, who is
  // never identified (ADR-0055 §5). So it is cut exactly as `issuedAt` is, and
  // the producing organisation, which reads that its document left the project
  // and never to whom, reads this too. `null` on the other two kinds.
  externalOpenedAt: string | null;
};
export type ListContainerTransmittalsResponse = { items: TransmittalHistoryRow[] };

// The organisation-level acknowledgement (§4). No body — mode-aware server-side
// (controller vs open), fired on the requester's organisation's behalf for the
// deliverable's current version; the first firing clears the org gate.
export type Acknowledgement = {
  id: Id;
  containerId: Id;
  versionId: Id;
  organisationId: Id;
  acknowledgedBy: { participantId: Id; name: string };
  acknowledgedAt: string;
};

// ── External issue: a deliverable reaches a party with no account ──────────
// (ADR-0055, T-431/T-432.)
//
// The recipient is a NAME AND AN EMAIL ADDRESS and nothing else — never an
// Organisation, a Participant or a Membership. There is no access grant to
// resolve because the LINK is the access, which is the property that let this
// be built without reopening a clause of the wall. A link serves ONE NAMED
// VERSION of one document and expires; a later version does not retract it
// (ADR-0013, and ISO 19650's position that an issued document is a snapshot).
//
// Principle 3 holds as everywhere else: the body names the RECIPIENT, never the
// sender — who is sending is resolved from the session.

/** ADR-0055 §7's three levels, in widening-restriction order. */
export const EXTERNAL_ISSUE_PERMISSIONS = ['any_member', 'any_super_user', 'owner_super_user'] as const;
export type ExternalIssuePermission = (typeof EXTERNAL_ISSUE_PERMISSIONS)[number];

/** `requested` is somebody below the line asking; the other two are answers. */
export type ExternalIssueState = 'requested' | 'issued' | 'declined';

/** How long a link lives when the sender names no other figure. */
export const EXTERNAL_LINK_DEFAULT_DAYS = 30;

export const issueExternallyBody = z.object({
  recipientName: z.string().trim().min(1).max(200),
  recipientEmail: z.email().max(320),
  // WHY it is being sent, and WHAT is said with it — two different things, and
  // both required. A send with no stated reason is the emailed attachment this
  // replaces, which is the practice ADR-0055 exists to end.
  reason: z.string().trim().min(1).max(1000),
  message: z.string().trim().min(1).max(4000),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
export type IssueExternallyBody = z.infer<typeof issueExternallyBody>;

/**
 * One external issue — or one request to make one. The same shape for both,
 * because they are the same row: `state` says which, and a request carries
 * every fact the issue needs so that approving it invents nothing.
 */
export type ExternalIssue = {
  id: Id;
  containerId: Id;
  documentReference: string;
  versionId: Id;
  versionReference: string;
  recipientName: string;
  recipientEmail: string;
  reason: string;
  message: string;
  state: ExternalIssueState;
  /**
   * The opaque token that IS the access, present only on an issued row and only
   * to a viewer entitled to the row. The surface composes the link from it;
   * the API does not know the deployment's public origin.
   */
  linkToken: string | null;
  expiresAt: string | null;
  requestedBy: { participantId: Id; name: string };
  issuedBy: { participantId: Id; name: string } | null;
  declinedBy: { participantId: Id; name: string } | null;
  declineReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  /**
   * T-436 — when the link was FIRST opened, or null while it has not been.
   *
   * A later open changes nothing: the receipt is that the document was read,
   * not how often it was looked at. It is **not** gated behind the
   * recipient-withheld cut, because it says nothing about who the recipient is
   * — whoever held the link opened it (ADR-0055 §5).
   */
  openedAt: string | null;
};
export type ListExternalIssuesResponse = { items: ExternalIssue[] };

/** Approve or decline somebody else's request (ADR-0055 §7). */
export const answerExternalRequestBody = z.object({
  approve: z.boolean(),
  // required on a decline, and required for the reason every other refusal in
  // this record carries one: the person who asked reads it
  declineReason: z.string().trim().min(1).max(1000).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
export type AnswerExternalRequestBody = z.infer<typeof answerExternalRequestBody>;

/**
 * The project's external-issue configuration, and what THIS requester may do
 * with it. `mayIssue` / `mayApprove` are the assembled-not-filtered rule
 * (T-269, ADR-0053 §8) applied to a door: a person below the line is offered
 * the REQUEST action, never a disabled issue button.
 */
export type ExternalIssueSettings = {
  projectId: Id;
  permission: ExternalIssuePermission;
  standardMessage: string | null;
  mayIssue: boolean;
  mayApprove: boolean;
  mayConfigure: boolean;
};
export type GetExternalIssueSettingsResponse = ExternalIssueSettings;
export const setExternalIssueSettingsBody = z.object({
  permission: z.enum(EXTERNAL_ISSUE_PERMISSIONS).optional(),
  // null clears it; absent leaves it alone
  standardMessage: z.string().trim().max(4000).nullable().optional(),
});
export type SetExternalIssueSettingsBody = z.infer<typeof setExternalIssueSettingsBody>;

/**
 * What the recipient's browser reads — the ONLY read in the API resolved from
 * a token rather than from a session, and the only one with no project scope
 * behind it. It carries one version of one document and nothing else: no
 * project library, no roster, no other version, not even the ids by which
 * another read could be attempted.
 */
export type ExternalDocumentResponse = {
  documentReference: string;
  versionReference: string;
  title: string | null;
  content: string;
  recipientName: string;
  /** what the sender wrote, and the project's standing note if it has one */
  message: string;
  standardMessage: string | null;
  reason: string;
  senderOrganisationName: string;
  projectName: string;
  issuedAt: string;
  expiresAt: string;
  /** the rendered files of THIS version, fetched back through the same token */
  renditions: Array<{ id: Id; kind: 'pdf' | 'native'; format: string }>;
};

// Intra-organisation narrowing (§3): the receiving org's admin (or controller)
// narrows a shared deliverable to named Participants. Absent = whole-org.
export const grantParticipantBody = z.object({ participantId: id });
export type GrantParticipantBody = z.infer<typeof grantParticipantBody>;
export type ParticipantGrant = {
  id: Id;
  containerId: Id;
  organisationId: Id;
  participantId: Id;
  name: string;
  grantedAt: string;
  revokedAt: string | null;
};
// T-456 — GET /containers/:containerId/participant-grants: the requester's OWN
// organisation's live narrowing on a shared deliverable, so a screen can say
// who at the firm may see it and offer the revoke. Absent (404) when the
// requester's organisation holds no live share: there is nothing to narrow,
// and the owner's and the producer's organisations are never narrowed.
export type ListParticipantGrantsResponse = { items: ParticipantGrant[] };

// The standing routing rule (§3, MVP): a code pattern → a Participant, so a
// transmitted deliverable whose reference matches grants automatically.
export const createGrantRuleBody = z.object({
  codePattern: z.string().min(1),
  participantId: id,
});
export type CreateGrantRuleBody = z.infer<typeof createGrantRuleBody>;
export type GrantRule = {
  id: Id;
  projectId: Id;
  organisationId: Id;
  codePattern: string;
  participantId: Id;
  name: string;
  createdAt: string;
  revokedAt: string | null;
};
export type ListGrantRulesResponse = { items: GrantRule[] };

// The per-(organisation, project) acknowledgement-mode setting (§4): the org
// admin chooses controller or open, and nominates the controller Participant.
export const setAckModeBody = z.object({
  mode: z.enum(['controller', 'open']),
  controllerParticipantId: id.nullable().optional(),
});
export type SetAckModeBody = z.infer<typeof setAckModeBody>;
export type AcknowledgementModeSetting = {
  organisationId: Id;
  projectId: Id;
  mode: 'controller' | 'open';
  controllerParticipantId: Id | null;
};

// Acceptance codes (ADR-0003): the project's copied scheme.
export type AcceptanceCode = {
  id: Id;
  code: string;
  description: string;
  level: 'comment' | 'deliverable' | 'both';
  isAccepting: boolean;
  // T-383/T-390 (ADR-0003 as amended): an accepting code ends the cycle, but
  // only a CONTRACTUAL one issues the C revision (ADR-0041); `grounds` is
  // whether a deliverable admitted under this code enters the AI's reach.
  isContractual: boolean;
  grounds: boolean;
  sortOrder: number;
  retiredAt: string | null;
};

// T-390 — the code AS THE EDITOR READS IT: the code, plus the two facts that
// decide whether an edit is safe and whether it is even offered. Separate from
// `AcceptanceCode` because a round's own verdict (`Round.deliverableCode`)
// needs neither, and computing a blast radius for every round on every cycle
// read would be work nobody asked for.
export type AcceptanceCodeRow = AcceptanceCode & {
  // THE BLAST RADIUS, and it is what makes this screen safe rather than
  // dangerous: how many live library deliverables this code admitted. It turns
  // a checkbox into *"this will exclude forty-one deliverables from AI
  // answers"*. **It is a promise about the NEXT query**, which is only honest
  // because retrieval reads the flag live rather than caching the composite
  // (T-387, ADR-0013 §6) — the two have to agree, and this is the side making
  // the claim.
  liveDeliverables: number;
  // Whether this code has ever been used on a round. A used code is never
  // redefined in the ways that would change what it MEANT (ADR-0003: retire and
  // replace); the surface needs to know before it offers those edits.
  everUsed: boolean;
};
export type ListAcceptanceCodesResponse = { items: AcceptanceCodeRow[] };

// T-390 — the scheme's write path, which did not exist: a pilot firm could not
// represent its own acceptance scheme at all, independently of anything AI.
//
// Every write carries a REASON, and that is the point rather than ceremony.
// ADR-0003 requires a change here to be audited like a rails change (ADR-0030),
// because it alters what the AI may rely on across a whole project — silently,
// since every citation that already exists still resolves. "Who and when" a
// timestamp could give; the why is the half only the person making the change
// holds.
export const createAcceptanceCodeBody = z.object({
  code: z.string().min(1).max(16),
  description: z.string().min(1),
  level: z.enum(['comment', 'deliverable', 'both']).default('both'),
  isAccepting: z.boolean().default(false),
  isContractual: z.boolean().default(false),
  grounds: z.boolean().default(false),
  reason: z.string().min(1),
});
export type CreateAcceptanceCodeBody = z.infer<typeof createAcceptanceCodeBody>;

// A partial edit: exactly the properties the editor offers, each optional.
// `code` is absent on purpose — the letter IS the code's identity, and a
// project that wants a different one adds it and retires this (ADR-0003's
// retire-and-replace, which predates this ticket).
export const updateAcceptanceCodeBody = z.object({
  description: z.string().min(1).optional(),
  isAccepting: z.boolean().optional(),
  isContractual: z.boolean().optional(),
  grounds: z.boolean().optional(),
  retired: z.boolean().optional(),
  reason: z.string().min(1),
});
export type UpdateAcceptanceCodeBody = z.infer<typeof updateAcceptanceCodeBody>;

// Promotion & the freeze (ADR-0002/0032, T-120/T-125): the near-empty
// hand-off — "no wizard" is the acceptance test. Two legal sources: the live
// head snapshot, or the freeze series' QA-accepted frozen version.
export type PromotionResult = {
  versionId: Id;
  versionReference: string;
  cycleId: Id;
  roundId: Id;
  roundNumber: number;
  // which legal source promoted (ADR-0032; T-355 states it rather than
  // implying it): the live head snapshot, or the QA-accepted frozen version —
  // never a post-QA drifted head
  source: 'head' | 'qa_accepted_frozen';
};
export type FreezeResult = { versionId: Id; versionReference: string; containerId: Id };

// T-373 (ADR-0008 addendum, 2026-08-22) — the promotion window. ADR-0008 made
// promotion a near-empty hand-off on purpose, because a form filled in the
// moment is a form filled wrong; the window survives that objection by
// RECONFIRMING rather than composing. The plan-owned identity metadata is shown
// and LOCKED (ADR-0038 §2), so a thoughtless confirm produces exactly the plan's
// state, and the only thing the promotion itself takes is the review period for
// this one submission — the reviewer and metadata edits are the existing acts,
// each audited on its own endpoint, which the window fires before it promotes.
export const promoteDocumentBody = z.object({
  // working days, for THIS submission only; omitted = the project default
  reviewPeriodDays: z.number().int().min(1).max(365).optional(),
  // T-382 — the window's "what promotes is named" made honest under
  // concurrency: the source version the caller was SHOWN (null = the live
  // head). If a QA acceptance landed or was spent between the preflight and
  // the click, the answer changed and the POST refuses (409
  // promotion_state_changed) instead of promoting content nobody confirmed.
  // Omitted = no check, for callers that never stated a source.
  expectedSourceVersionReference: z.string().nullable().optional(),
  // T-332 (ADR-0049 §8) — force the promotion past open comment threads or
  // open findings. `Participant.elevated` ONLY, and every use is audited.
  //
  // It is an explicit flag rather than an inference from the tier, because the
  // gate has to be real for the person who holds the tier too: an elevated lead
  // author who has not seen the open items must be stopped exactly as an
  // ordinary one is, and then decide. A tier that silently waived the block
  // would make §7 mean "blocked unless you happen to be senior", which is not
  // what was ruled.
  overrideOpenItems: z.boolean().optional(),
});
export type PromoteDocumentBody = z.infer<typeof promoteDocumentBody>;

// What the window states BEFORE the click, read from the same decision the act
// runs (they cannot drift): which of ADR-0032's two legal sources would promote
// and — with the QA gate on — which frozen revision it is and who accepted it,
// what revision the promotion becomes, and the refusal it would answer with if
// it is not currently legal at all.
export type PromotionPreflight = {
  containerId: Id;
  source: 'head' | 'qa_accepted_frozen';
  sourceVersionReference: string | null;
  qaAcceptedBy: { participantId: Id; name: string } | null;
  qaAcceptedAt: string | null;
  versionReference: string; // the P revision this promotion would issue
  roundNumber: number;
  reviewPeriodDefaultDays: number;
  // the detail code the POST would refuse with, or null when it would succeed —
  // so the window states the blocker instead of the user finding it on the click
  blocker: string | null;
  /**
   * T-332 (ADR-0049 §7) — what is open, counted BEFORE the click.
   *
   * The window has to be able to say *how much* is outstanding rather than only
   * that something is, and the two lists are reported separately although the
   * gate treats them identically: they are two lists, and a single total would
   * leave the user unable to tell which one to go and clear.
   *
   * It is present whether or not it blocks, so the window can show a clean
   * deliverable's zeroes rather than making silence do the work.
   */
  openItems: { threads: number; findings: OpenFindingCount };
  /** whether THIS requester could force it (`Participant.elevated`, §8) — so
   * the window offers the override only to someone who holds it, instead of
   * showing everyone a control most of them will be refused on */
  canOverrideOpenItems: boolean;
};

// Release ("check in") — the audited unlock of a standalone check-out (ADR-0032
// addendum, T-180). An optional reason records the early-release note.
export const releaseCheckoutBody = z.object({ reason: z.string().optional() });
export type ReleaseCheckoutBody = z.infer<typeof releaseCheckoutBody>;

// The review cycle (ADR-0005–0014/0032, T-123/T-124/T-126). The cycle read
// applies ADR-0014 phasing server-side: the open round's comments are
// omitted for the authoring side; issued rounds are permanently visible.
export type CommentAnchor = {
  page?: number;
  quote?: string;
  rects?: Array<{ x: number; y: number; w: number; h: number }>;
  point?: { x: number; y: number };
}; // rendition-agnostic structured fields, never a sidecar (ADR-0006)

export type ReviewResponseRecord = {
  id: Id;
  commentId: Id;
  author: { participantId: Id; name: string };
  body: string;
  nextVersionId: Id | null;
  nextVersionAnchor: CommentAnchor | null;
  noChangeReason: string | null;
  createdAt: string;
};

export type ReviewComment = {
  id: Id;
  roundId: Id;
  versionId: Id;
  author: { participantId: Id; name: string };
  body: string;
  acceptanceCode: { id: Id; code: string } | null;
  anchor: CommentAnchor | null;
  createdAt: string;
  response: ReviewResponseRecord | null;
};

export type TransmittalRecord = {
  id: Id;
  roundId: Id;
  direction: 'issue' | 'return';
  sender: { participantId: Id; name: string };
  recipients: Id[];
  purposeCode: string | null;
  issuedAt: string;
  dueAt: string | null;
};

export type Round = {
  id: Id;
  number: number;
  versionId: Id;
  versionReference: string;
  // 'submitted' (ADR-0051): awaiting the owner organisation's acknowledgement —
  // project scope only; a sandbox-scope round is created 'open'
  state: 'submitted' | 'open' | 'issued' | 'responded';
  // ADR-0051: the owner organisation's receipt of the submission — set by the
  // acknowledge act that opens the round; null until then, and always null on
  // a sandbox-scope round
  acknowledgedBy: { participantId: Id; name: string } | null;
  acknowledgedAt: string | null;
  // ADR-0052: the reviewers who have stated their pass is done — reviewer-side
  // state, withheld from the authoring side while the round is open (the
  // ADR-0014 rule, applied server-side alongside the comments)
  reviewerCompletions: Array<{ participantId: Id; name: string; completedAt: string }>;
  // T-375 — the wall is a DIFFERENT RECORD, not a hidden column. The authoring
  // side does not receive the open round's comments (ADR-0014, applied
  // server-side), and `comments: []` alone cannot tell "none were written" from
  // "these are not yours to read yet" — silence would read as absence, which is
  // a different and wrong fact. This says which it is, so the surface can state
  // that content exists and why it is out of reach.
  commentsWithheld: boolean;
  // T-379 — the completion signals are walled exactly as the comments are
  // (ADR-0052 §4), and an empty `reviewerCompletions` alone cannot tell
  // "nobody has finished" from "not yours to know while the round is open"
  completionsWithheld: boolean;
  reviewPeriodTarget: string | null; // guides, never gates (ADR-0005)
  deliverableCode: AcceptanceCode | null;
  comments: ReviewComment[];
  transmittals: TransmittalRecord[];
};

export type ReviewCycle = {
  id: Id;
  containerId: Id;
  state: 'active' | 'accepted' | 'closed_rejected';
  editLockHolder: 'authoring' | 'reviewing';
  launchedAt: string;
  closedAt: string | null;
  // the audited reason a cycle was closed as rejected (T-194)
  closedReason: string | null;
  rounds: Round[];
};
export type GetCycleResponse = ReviewCycle | null;

// Closing a cycle as rejected is a permanent, audited stop (ADR-0032) — it
// requires an explicit free-text reason (T-194).
export const closeRejectedBody = z.object({ reason: z.string().min(1) });
export type CloseRejectedBody = z.infer<typeof closeRejectedBody>;

const commentAnchorSchema = z.object({
  page: z.number().int().min(1).optional(),
  quote: z.string().min(1).optional(),
  rects: z
    .array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }))
    .optional(),
  point: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const createReviewCommentBody = z.object({
  body: z.string().min(1),
  anchor: commentAnchorSchema.optional(),
  acceptanceCodeId: id.optional(),
});
export type CreateReviewCommentBody = z.infer<typeof createReviewCommentBody>;

export const patchReviewCommentBody = z.object({
  body: z.string().min(1).optional(),
  acceptanceCodeId: id.nullable().optional(),
  anchor: commentAnchorSchema.nullable().optional(),
});
export type PatchReviewCommentBody = z.infer<typeof patchReviewCommentBody>;

export const setDeliverableCodeBody = z.object({ acceptanceCodeId: id });
export type SetDeliverableCodeBody = z.infer<typeof setDeliverableCodeBody>;

export const issueRoundBody = z.object({
  recipients: z.array(id).optional(),
  purposeCode: z.string().min(1).optional(),
  dueAt: z.iso.datetime().optional(),
});
export type IssueRoundBody = z.infer<typeof issueRoundBody>;
export type IssueRoundResponse = { transmittalId: Id; cycle: ReviewCycle };

// The change link is declared as an anchor (the revised passage, at minimum
// its quote) — never as a version id: vN+1 does not exist while the respond
// phase runs (promotion is gated on the responses), so nextVersionId is
// stamped by the promotion that creates it, not sent by the client.
export const createReviewResponseBody = z
  .object({
    body: z.string().min(1),
    nextVersionAnchor: commentAnchorSchema.optional(),
    noChangeReason: z.string().min(1).optional(),
  })
  .refine((b) => (b.nextVersionAnchor?.quote ? !b.noChangeReason : !!b.noChangeReason), {
    message: 'exactly one of nextVersionAnchor.quote or noChangeReason', // ADR-0004
  });
export type CreateReviewResponseBody = z.infer<typeof createReviewResponseBody>;

// Renditions, upload & ambient history (ADR-0034, T-121/T-122/T-128).
export type Rendition = {
  id: Id;
  versionId: Id;
  kind: 'native' | 'pdf';
  format: 'docx' | 'xlsx' | 'pptx' | 'pdf';
  createdAt: string;
};
export type ListRenditionsResponse = { items: Rendition[] };

export type SandboxDocumentVersion = {
  id: Id;
  sandboxDocumentId: Id;
  // the ISO 19650 working revision, v0.x (ADR-0041) — v0.1 is the oldest snapshot
  versionReference: string;
  createdBy: { participantId: Id; name: string };
  createdAt: string;
}; // content fetched by restore/preview, not listed
export type ListSandboxHistoryResponse = { items: SandboxDocumentVersion[] };

export const restoreSandboxVersionBody = z.object({ historyVersionId: id });
export type RestoreSandboxVersionBody = z.infer<typeof restoreSandboxVersionBody>;

// ─────────────────────────────────────────────────────────────────────────────
// Slice A2 — producing-side surfaces (ADR-0036/0038/0039; refined 0022/0032). T-151.
// ─────────────────────────────────────────────────────────────────────────────

// Sandboxes & the participant scope (ADR-0036, T-153)
export type SandboxScope = 'multi_org' | 'single_org' | 'team' | 'named_user';
export type Sandbox = {
  id: Id;
  projectId: Id;
  name: string;
  scope: SandboxScope;
  owningOrganisationId: Id;
  // per-sandbox settings (ADR-0040, T-181); more settings accrue here
  allowMemberFolderCreate: boolean;
  // the third folder mode (ADR-0040 addendum 2026-08-09, T-365): the tree is
  // derived from the owning org's own plan rows — discipline folders over a
  // working folder per deliverable, system-owned. Composes with
  // allowMemberFolderCreate, which governs INSIDE a deliverable's folder.
  planLocked: boolean;
  // the QA gate (ADR-0032 addendum 2026-08-09, T-355): promotion's live-head
  // source is disabled while on — the QA-accepted frozen version is the only
  // legal source. Default on for project sandboxes; off for personal ones.
  promotionRequiresQa: boolean;
  // whether the requester may configure this sandbox's settings (a super-user of
  // the owning org, or the owner-super) — a self fact, decided server-side
  canConfigure: boolean;
  // the organisations admitted by a live org-grant (ADR-0036) — for the sandbox
  // card's owner/shared display; present on the list read (T-184)
  organisationIdsInScope?: Id[];
  // the auto-provisioned personal workspace every participant has (T-186)
  isPersonal: boolean;
};

// Update a sandbox's settings (ADR-0040, T-181) — a super-user act. Every field
// optional; only what is present changes.
export const updateSandboxSettingsBody = z.object({
  allowMemberFolderCreate: z.boolean().optional(),
  planLocked: z.boolean().optional(),
  promotionRequiresQa: z.boolean().optional(),
});
export type UpdateSandboxSettingsBody = z.infer<typeof updateSandboxSettingsBody>;
export type SandboxScopeGrantView = {
  id: Id;
  granteeType: 'organisation' | 'participant';
  organisationId: Id | null;
  participantId: Id | null;
};
export type ListSandboxesResponse = { items: Sandbox[] };
export type GetSandboxResponse = Sandbox & { grants: SandboxScopeGrantView[] };

export const createSandboxBody = z.object({
  name: z.string().min(1),
  scope: z.enum(['multi_org', 'single_org', 'team', 'named_user']),
  // initial access, admitted at creation (T-187): whole organisations (shared)
  // and/or specific participants (narrowed). The creator is always admitted.
  organisationIds: z.array(id).optional(),
  participantIds: z.array(id).optional(),
});
export type CreateSandboxBody = z.infer<typeof createSandboxBody>;

// widen the scope: add an organisation (multi/single-org) or a participant
// (team/named-user). Self-serve within own org; cross-org is owner-gated in the
// API (ADR-0018/0036). Exactly one of the two ids.
export const grantSandboxScopeBody = z
  .object({ organisationId: id.optional(), participantId: id.optional() })
  .refine(
    (b) => Boolean(b.organisationId) !== Boolean(b.participantId),
    'exactly one of organisationId or participantId',
  );
export type GrantSandboxScopeBody = z.infer<typeof grantSandboxScopeBody>;

// Folders (ADR-0036 drawer, T-153) — a view object, never an access object
// kind + containerId (T-365): 'discipline'/'deliverable' folders are derived
// from the plan in a plan-locked sandbox — system-owned, renamed by their row;
// a deliverable folder names the container drafts inside it bind to.
export type SandboxFolderKind = 'manual' | 'discipline' | 'deliverable';
export type SandboxFolder = {
  id: Id;
  sandboxId: Id;
  parentFolderId: Id | null;
  name: string;
  kind: SandboxFolderKind;
  containerId: Id | null;
};
export type ListFoldersResponse = { items: SandboxFolder[] };
// A folder name is one line of human text. Trimmed (whitespace-only is empty,
// not a name), bounded (T-364 made a NON-human the first thing that picks one,
// and `sandbox_folders.name` is unbounded `text` so the database backstops
// nothing), and free of control characters (a NUL byte is a Postgres error,
// a newline is a folder list that lies about its own shape).
export const folderName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  // a predicate rather than a regex: a control-character character class is
  // exactly what eslint's no-control-regex exists to catch, and the intent
  // reads better stated than encoded
  .refine(
    (value) => ![...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127),
    'no control characters',
  );
export const createFolderBody = z.object({ name: folderName, parentFolderId: id.optional() });
export type CreateFolderBody = z.infer<typeof createFolderBody>;
export const moveFolderBody = z.object({ parentFolderId: id.nullable() });
export type MoveFolderBody = z.infer<typeof moveFolderBody>;
export const moveDocumentBody = z.object({ folderId: id.nullable() });
export type MoveDocumentBody = z.infer<typeof moveDocumentBody>;

// Create-folder-structure (ADR-0040, T-182) — a super-user lays out a whole
// nested tree at once, rather than one folder at a time. A recursive node spec;
// the structure is created under parentFolderId (or the sandbox root). Reusable
// folder templates are a deliberate follow-up (build the free-form builder first).
export type FolderStructureNode = { name: string; children?: FolderStructureNode[] };

export const folderStructureNode: z.ZodType<FolderStructureNode> = z.lazy(() =>
  z.object({ name: folderName, children: z.array(folderStructureNode).optional() }),
);
export const createFolderStructureBody = z.object({
  parentFolderId: id.nullable().optional(),
  nodes: z.array(folderStructureNode).min(1),
});
export type CreateFolderStructureBody = z.infer<typeof createFolderStructureBody>;
export type CreateFolderStructureResult = { ok: true; created: number };

// T-364 (S6, ADR-0027 propose-confirm) — the structure builder's agent: a
// free-form ask becomes a CANDIDATE tree that fills the existing builder for a
// super-user to edit and confirm. It proposes only: the deterministic
// create-folder-structure endpoint above is still the one that writes, and the
// agent reads no sandbox content (`Q-020` untouched) and writes nothing.
export const proposeFolderStructureBody = z.object({ ask: z.string().min(1).max(2000) });
export type ProposeFolderStructureBody = z.infer<typeof proposeFolderStructureBody>;
// followUp carries the agent's question when the ask is too thin to shape a
// tree from — an assistive agent may ask, and asking is not failing.
export type ProposeFolderStructureResult = {
  nodes: FolderStructureNode[];
  followUp: string | null;
};

// Bind (ADR-0038, T-153) — the one-way transition; the API records a binding_event
export const bindDocumentBody = z.object({ containerId: id });
export type BindDocumentBody = z.infer<typeof bindDocumentBody>;

// The deliverable-plan (TIDP) schema — one unified field list (ADR-0008 homed,
// T-152; unified T-188). A field can be part of the coded reference (inCode), a
// metadata attribute, and/or an appointment role slot. The code-builder composes
// the reference from the code fields in order; the serial auto-increments.
export type SchemaFieldType = 'text' | 'select' | 'date' | 'person' | 'people' | 'serial';
// role slots map to the appointment mechanisms: author(s) / reviewer(s)+lead
// stay in the appointment tables (they drive the review cycle); document owner is
// a single-person informational appointment (T-188/T-189). All optional, amendable.
export type SchemaFieldRole = 'author' | 'document_owner' | 'reviewer' | 'lead_reviewer';
export type NamingSchemeField = {
  key: string;
  label: string;
  type?: SchemaFieldType; // default 'text'
  allowedValues?: string[]; // select options (the codes)
  allowedValueLabels?: Record<string, string>; // code -> human description (e.g. ECV -> Engineering – Civils)
  required?: boolean;
  inCode?: boolean; // participates in the coded reference (order matters)
  role?: SchemaFieldRole; // an appointment role slot
  isOriginator?: boolean; // code: carries cross-org uniqueness
  isSerial?: boolean; // code: the auto-allocated serial
  width?: number;
};
export type NamingScheme = { projectId: Id; separator: string; fields: NamingSchemeField[] };

// POST /projects/:projectId/naming-scheme/import — T-337, the firm's own
// spreadsheet as CANDIDATE fields. multipart, one `file` (.csv or .xlsx).
//
// **It writes nothing**, and the type says so: what comes back is a proposal
// the owner reviews and then saves through the `PUT` above. An import that
// wrote the scheme by arriving would let a mistyped upload rewrite a project's
// numbering, and numbering is what every reference in the record is built on.
//
// Deterministic — no model call, therefore **no Run**, therefore nothing for
// `runs.request` to echo. That matters beyond cost: an existing schema
// routinely names authors and reviewers in its role columns, so a path that
// recorded the upload would create a store of personal data nobody ruled on
// (personal-data.md). The `extractor` escape hatch for an unreadable sheet is
// T-274's, and is deliberately not on this path yet.
export type SchemaImportResponse = {
  fields: NamingSchemeField[];
  /** every row that did not become a code, by the row number Excel shows */
  skipped: Array<{ row: number; reason: string }>;
};
// T-376 — NOT nullable, and the difference is load-bearing rather than tidy.
// The read never returns null: `loadSchemeOrDefault` serves the Infora default
// when no scheme has been saved (T-188), so a project always has one. While the
// type said otherwise, `null` on the client meant BOTH "this project has no
// scheme" and "the scheme has not arrived yet" — and the plan screen rendered
// the same manual reference field for both, which turned a slow or failed read
// into an invitation to hand-type a reference. ADR-0008's rule is that the
// reference is generated, never invented; a nullable type that is never null is
// what let that be reopened by accident.
export type GetNamingSchemeResponse = NamingScheme;

// T-371 (ADR-0005 addendum, 2026-08-22) — the review period's project-level
// default, in WORKING DAYS (Monday to Friday; no holiday calendar is modelled
// anywhere, and a per-jurisdiction one is a separate job). It sits BESIDE the
// deliverable schema, not in it: the schema's fields are the header row of the
// fillable deliverables template (T-337/T-359), so a review period modelled as a
// schema attribute would arrive as a column nobody should be filling in.
// The value is a guide with no power over state (ADR-0005) — it computes each
// round's target at round creation, chases and flags overdue, and never closes
// a round.
export type ReviewPeriodSettings = { projectId: Id; defaultDays: number };
export type GetReviewPeriodResponse = ReviewPeriodSettings;
export const setReviewPeriodBody = z.object({ defaultDays: z.number().int().min(1).max(365) });
export type SetReviewPeriodBody = z.infer<typeof setReviewPeriodBody>;

// A field composes the coded reference when inCode is set, or — for schemes that
// predate the flag (T-188) — when it is a plain code-ish field (no role, a
// text/select/serial type). Roles and date/person fields are metadata, never code.
export function isCodeField(f: NamingSchemeField): boolean {
  return (
    f.inCode ??
    (!f.role && (f.type === undefined || f.type === 'text' || f.type === 'select' || f.type === 'serial'))
  );
}

// A select option's display label: the code, plus its human description when the
// scheme carries one — so a dropdown reads "ECV — Engineering – Civils" while the
// stored value and the composed reference stay the bare code.
export function optionLabel(value: string, labels?: Record<string, string>): string {
  const desc = labels?.[value];
  return desc ? `${value} — ${desc}` : value;
}

/**
 * T-338 — what a schema import would **add, change and drop**, computed before
 * anything moves.
 *
 * It lives here rather than in the screen for one reason: it is the function
 * that decides whether an owner's schema survives an import, and the surfaces
 * package has no test runner. A pure function over a contract type, beside
 * `defaultDeliverableSchema` and `isCodeField`, is the closest home that can be
 * pinned by tests — which for a destructive operation is not a nicety.
 *
 * **Matched on `key`** — the stable machine name the parse derives from the
 * sheet's own field name — with a label fallback, because a firm that renamed a
 * label without renaming the key would otherwise see its own field as new and
 * end up with two of it.
 */
export type NamingSchemeDiff = {
  add: NamingSchemeField[];
  change: Array<{ current: NamingSchemeField; incoming: NamingSchemeField; what: string[] }>;
  /** in the schema, absent from the sheet. NOT a removal — see `applyNamingSchemeImport` */
  drop: NamingSchemeField[];
};

const sameSchemaOptions = (a: NamingSchemeField, b: NamingSchemeField) =>
  JSON.stringify(a.allowedValues ?? []) === JSON.stringify(b.allowedValues ?? []) &&
  JSON.stringify(a.allowedValueLabels ?? {}) === JSON.stringify(b.allowedValueLabels ?? {});

export function diffNamingSchemeFields(
  current: NamingSchemeField[],
  incoming: NamingSchemeField[],
): NamingSchemeDiff {
  const add: NamingSchemeField[] = [];
  const change: NamingSchemeDiff['change'] = [];
  const matched = new Set<string>();
  for (const inc of incoming) {
    const existing =
      current.find((f) => f.key === inc.key) ??
      current.find((f) => f.label.trim().toLowerCase() === inc.label.trim().toLowerCase());
    if (!existing) {
      add.push(inc);
      continue;
    }
    matched.add(existing.key);
    const what: string[] = [];
    if (existing.label !== inc.label) what.push(`label “${existing.label}” → “${inc.label}”`);
    if (!sameSchemaOptions(existing, inc)) {
      what.push(`options ${existing.allowedValues?.length ?? 0} → ${inc.allowedValues?.length ?? 0}`);
    }
    if (what.length > 0) change.push({ current: existing, incoming: inc, what });
  }
  return { add, change, drop: current.filter((f) => !matched.has(f.key)) };
}

/**
 * Apply a diff to the field list — **in memory, for the editing table**. Nothing
 * here writes; the existing naming-scheme `PUT` is still what commits, which is
 * how the import gains no write path the owner did not already have.
 *
 * **A matched field keeps its `inCode`, `required`, `role`, `isOriginator`,
 * `isSerial` and `width`.** A spreadsheet of codes can express a field's name
 * and its options; it has no view on what a reference looks like or which
 * appointments a deliverable needs. An import that flattened those would
 * silently unmake the coded reference — the accident the ticket names, arriving
 * through a merge instead of a replace.
 *
 * **`dropMissing` is the caller's explicit choice and should default to false.**
 * A sheet not mentioning a field is weak evidence the field should go, because
 * most sheets cover one part of a schema.
 */
export function applyNamingSchemeImport(
  current: NamingSchemeField[],
  diff: NamingSchemeDiff,
  dropMissing: boolean,
): NamingSchemeField[] {
  const changeByKey = new Map(diff.change.map((c) => [c.current.key, c.incoming]));
  const dropped = new Set(dropMissing ? diff.drop.map((f) => f.key) : []);
  const kept = current
    .filter((f) => !dropped.has(f.key))
    .map((f) => {
      const inc = changeByKey.get(f.key);
      if (!inc) return f;
      return {
        ...f,
        label: inc.label,
        type: inc.allowedValues?.length ? ('select' as const) : f.type,
        allowedValues: inc.allowedValues,
        allowedValueLabels: inc.allowedValueLabels,
      };
    });
  // adds arrive at the END: order is the owner's to set, because it is what
  // orders the coded reference's segments, and a sheet has no view on that
  return [...kept, ...diff.add];
}

export const namingSchemeFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'select', 'date', 'person', 'people', 'serial']).optional(),
  allowedValues: z.array(z.string()).optional(),
  allowedValueLabels: z.record(z.string(), z.string()).optional(),
  required: z.boolean().optional(),
  inCode: z.boolean().optional(),
  role: z.enum(['author', 'document_owner', 'reviewer', 'lead_reviewer']).optional(),
  isOriginator: z.boolean().optional(),
  isSerial: z.boolean().optional(),
  width: z.number().int().positive().optional(),
});
export const upsertNamingSchemeBody = z.object({
  separator: z.string().min(1).default('-'),
  fields: z.array(namingSchemeFieldSchema),
});
export type UpsertNamingSchemeBody = z.infer<typeof upsertNamingSchemeBody>;

// The Infora default deliverable schema — the EWR-MWJV seven-segment document
// numbering convention (ISO 19650-2, NA.3 field codification), aligned to
// Network Rail coding: Project · Originator · Zone/Volume · ELR/Spatial ·
// Type/Form · Role/Discipline · Sequence. Preloads for a new project and is
// fully editable by the owner super-user (change fields, add fields). The option
// lists carry the routewide codes; the human descriptions live in the source
// numbering schema (133735-MWJ-Z0-XXX-PAN-PDC-000001). Example reference:
// 133735-MWJ-Z1-OXD-DRG-ECV-100001.
export function defaultDeliverableSchema(): { separator: string; fields: NamingSchemeField[] } {
  // Each select field pairs its codes with the routewide descriptions, so a
  // dropdown reads "ECV — Engineering – Civils". opts() keeps codes and labels
  // in lock-step and preserves order.
  const opts = (entries: Array<[string, string]>) => ({
    allowedValues: entries.map(([code]) => code),
    allowedValueLabels: Object.fromEntries(entries),
  });
  return {
    separator: '-',
    fields: [
      // Segment 1 — Project (fixed EWR project number)
      { key: 'project', label: 'Project', type: 'select', inCode: true, required: true, ...opts([['133735', 'EWR DCO Technical Partner']]) },
      // Segment 2 — Originator (technical partner / appointed party)
      {
        key: 'originator',
        label: 'Originator',
        type: 'select',
        inCode: true,
        isOriginator: true,
        required: true,
        ...opts([
          ['MWJ', 'Mott MacDonald & WSP JV (Technical Partner)'],
          ['EWR', 'East West Rail Corporate'],
        ]),
      },
      // Segment 3 — Zone / Volume (function): Z0–Z5 plus station codes
      {
        key: 'zone',
        label: 'Zone / Volume',
        type: 'select',
        inCode: true,
        required: true,
        ...opts([
          ['Z0', 'Route (project) wide'],
          ['Z1', 'Oxford to Bletchley incl. Milton Keynes'],
          ['OXF', 'Oxford Station'],
          ['OXP', 'Oxford Parkway Station'],
          ['BIT', 'Bicester Village Station'],
          ['WIS', 'Winslow Station (provisional)'],
          ['BLY', 'Bletchley Station'],
          ['MKC', 'Milton Keynes Station'],
          ['Z2', 'Bletchley to Bedford'],
          ['FEN', 'Fenny Stratford Station'],
          ['BWB', 'Bow Brickhill Station'],
          ['WOB', 'Woburn Sands Station'],
          ['APG', 'Aspley Guise Station'],
          ['RID', 'Ridgmont Station'],
          ['LID', 'Lidlington Station'],
          ['MLB', 'Millbrook Station'],
          ['SWR', 'Stewartby Station'],
          ['KMH', 'Kempston Hardwick Station'],
          ['Z3', 'Bedford'],
          ['BSJ', 'Bedford St Johns Station'],
          ['BDM', 'Bedford Station'],
          ['Z4', 'Bedford to River Rhee Viaduct'],
          ['TFD', 'Tempsford Station (provisional)'],
          ['CAE', 'Cambourne Station (provisional)'],
          ['Z5', 'River Rhee Viaduct to Cambridge'],
          ['CMS', 'Cambridge South Station (provisional)'],
          ['CBG', 'Cambridge Station'],
          ['CGE', 'Cambridge East Station'],
          ['CMB', 'Cambridge North Station'],
        ]),
      },
      // Segment 4 — ELR / Spatial (Network Rail engineering line references)
      {
        key: 'elr',
        label: 'ELR / Spatial',
        type: 'select',
        inCode: true,
        required: true,
        ...opts([
          ['DCL', 'Oxford Stn to Oxford North Jcn'],
          ['OXD', 'Oxford North Jcn to Bletchley Flyover'],
          ['BFO', 'Bletchley Flyover to Summit Jcn'],
          ['BBM', 'Summit Jcn to Bedford St Johns'],
          ['SPC1', 'Bedford St Johns to Bedford Station'],
          ['BRV', 'Bedford Station to River Rhee Viaduct'],
          ['SBR', 'Hauxton Jcn to Shepreth Branch Jcn'],
          ['BGK', 'Shepreth Branch Jcn to Cambridge Station'],
          ['CCH', 'Coldham Lane Jcn to Haughley Jcn'],
          ['LEC1', 'London Euston to Crewe Line'],
          ['XXX', 'Multiple ELRs / remote assets'],
        ]),
      },
      // Segment 5 — Type / Form (document type)
      {
        key: 'type',
        label: 'Type / Form',
        type: 'select',
        inCode: true,
        required: true,
        ...opts([
          ['AGN', 'Agenda'], ['AIR', 'Approval & Issue Record'], ['APP', 'Application'], ['ASS', 'Assessment'],
          ['BEP', 'BIM Execution Plan'], ['BOQ', 'Bill of Quantity'], ['BRF', 'Briefing Note'], ['CAL', 'Calculation'],
          ['CDA', 'Commercial Invoice'], ['CES', 'Commercial Estate'], ['CHK', 'Checklist'], ['CHR', 'Change Request'],
          ['CIA', 'Record of Authorities'], ['CMA', 'Acceptance'], ['CMF', 'Financial'], ['CMG', 'General'],
          ['CNT', 'Consents & Approval'], ['COA', 'Communication and Correspondence'], ['COR', 'Purchase Order'],
          ['COT', 'Notification and Notices'], ['CPP', 'Construction Phase Plan'], ['CPQ', 'Pre-Qualification Questionnaire'],
          ['CRE', 'Requirements'], ['CRF', 'Certificates'], ['DDR', 'Design Development Review'], ['DES', 'Derogation'],
          ['DRG', 'Drawing'], ['DRN', 'Document Review Notice'], ['EMP', 'Environmental Management Plan'], ['EST', 'Estimate'],
          ['EWN', 'Early Warning Notice'], ['FRM', 'Form'], ['GDN', 'Guidance Note'], ['HSF', 'Health & Safety File'],
          ['IDC', 'Interdisciplinary Design Check'], ['IDR', 'Interdisciplinary Design Review'], ['IMG', 'Image'],
          ['INS', 'Instruction'], ['LAZ', 'LiDAR File'], ['LET', 'Letter / Correspondence'], ['LOG', 'Log'], ['MAN', 'Manual'],
          ['MDA', 'Materials Data'], ['MEM', 'Memo'], ['MIN', 'Minutes'], ['MOA', 'Model (2D)'], ['MOC', 'Model (Coordination)'],
          ['MOD', 'Model (3D)'], ['NCR', 'Non-Conformance'], ['NOT', 'Notice / Notification'], ['OST', 'Ordnance Survey Tile'],
          ['PAF', 'Product Acceptance Form'], ['PAN', 'Project Advice Note'], ['PCI', 'PCIP'], ['PDD', 'Project Definition Document'],
          ['PDR', 'Preliminary Design Review'], ['PER', 'Permit'], ['PHO', 'Photograph'], ['PLN', 'Plan'], ['PMP', 'Process'],
          ['POD', 'Point Cloud File'], ['POL', 'Policy'], ['PPL', 'Proposal'], ['PRO', 'Procedure'], ['PRS', 'Presentation'],
          ['RCD', 'Record'], ['REG', 'Register'], ['REM', 'Remit'], ['REP', 'Report'], ['RFI', 'Request for Information'],
          ['SCH', 'Risk Assessment'], ['SDB', 'Schedule'], ['SKE', 'Sketch'], ['SPE', 'Specification'], ['SSC', 'Safety Case'],
          ['SSF', 'Signal Sighting Form'], ['STM', 'Statement'], ['STQ', 'Site Technical Query'], ['STR', 'Strategy'],
          ['SVY', 'Survey'], ['TIF', 'Task Information Form'], ['TQN', 'Technical Query'], ['TRN', 'Transmittal'],
          ['VID', 'Video'], ['ZIP', 'Zip Files'],
        ]),
      },
      // Segment 6 — Role / Discipline (Network Rail discipline codes)
      {
        key: 'discipline',
        label: 'Role / Discipline',
        type: 'select',
        inCode: true,
        required: true,
        ...opts([
          ['CCA', 'Contract Administration'], ['CES', 'Estimating'], ['COM', 'Commercial'], ['CPO', 'Procurement'],
          ['CSE', 'Consents and Stakeholder Engagement'], ['DEL', 'Delivery and Construction'], ['EAR', 'Engineering – Architecture'],
          ['ECV', 'Engineering – Civils'], ['EDP', 'Engineering – Depots'], ['EDR', 'Engineering – Drainage'],
          ['EDS', 'Engineering – Distribution'], ['EEN', 'Engineering – Environmental'], ['EFR', 'Engineering – Fire Systems'],
          ['EGE', 'Engineering – Geotechnical'], ['EHF', 'Engineering – Human Factors'], ['EHW', 'Engineering – Highways'],
          ['EME', 'Engineering – Mechanical & Electrical'], ['EMF', 'Engineering – Multi Functional'], ['EMG', 'Engineering Management'],
          ['EMN', 'Engineering – Maintenance'], ['EOH', 'Engineering – Overhead Contact Systems'], ['EPT', 'Engineering – Plant'],
          ['ERS', 'Engineering – Rivers and Scour'], ['ESC', 'Engineering – SCADA'], ['ESE', 'Engineering – Systems Engineering & Integration'],
          ['ESG', 'Engineering – Signalling'], ['ESS', 'Engineering – System Safety'], ['EST', 'Engineering – Structures'],
          ['ESU', 'Engineering – Surveying'], ['ETL', 'Engineering – Telecoms'], ['ETR', 'Engineering – Track'],
          ['ETT', 'Engineering – Traffic and Transport'], ['ETU', 'Engineering – Tunnelling'], ['EUT', 'Engineering – Utilities'],
          ['HEN', 'Landscape Architect'], ['HSE', 'Health, Safety and Wellbeing'], ['LEP', 'Land and Property'],
          ['MPM', 'Project Management'], ['OPP', 'Operations'], ['PDC', 'Document and Information Management'],
          ['PPC', 'Programme Controls'], ['PPL', 'Planning and Scheduling'], ['PPR', 'Programme Reporting'],
          ['PRK', 'Risk and Value'], ['QAS', 'Quality Assurance'],
        ]),
      },
      // Segment 7 — Sequence number (six-digit serial, allocated by the CDE)
      { key: 'serial', label: 'Sequence number', type: 'serial', inCode: true, isSerial: true, width: 6 },
      // Metadata attributes — carried on the deliverable, never in the code
      {
        key: 'suitability',
        // T-455 — the term is "status code" (ADR-0041's 2026-08-27 amendment,
        // CONTEXT.md); the key stays, because it is stored on every project's
        // copied schema and a key is not a label
        label: 'Status code',
        type: 'select',
        inCode: false,
        ...opts([
          ['S0', 'Work in progress'],
          ['S1', 'Suitable for coordination'],
          ['S2', 'Suitable for information'],
          ['S3', 'Suitable for review & comment'],
          ['S4', 'Suitable for stage approval'],
          ['S6', 'Suitable for PIM authorisation'],
          ['S7', 'Suitable for AIM authorisation'],
          ['A1', 'Authorised & accepted'],
          ['B1', 'Partially authorised'],
          ['CR', 'As-constructed record'],
        ]),
      },
      {
        key: 'security',
        label: 'Security classification',
        type: 'select',
        inCode: false,
        ...opts([
          ['OFFICIAL', 'Official'],
          ['OFFICIAL-SENSITIVE', 'Official – Sensitive'],
        ]),
      },
      {
        key: 'nativeFormat',
        label: 'Native format',
        type: 'select',
        inCode: false,
        ...opts([
          ['DOCX', 'Microsoft Word'],
          ['XLSX', 'Microsoft Excel'],
          ['PPTX', 'Microsoft PowerPoint'],
          ['DGN', 'MicroStation'],
          ['DWG', 'AutoCAD'],
          ['PDF', 'PDF'],
          ['IFC', 'IFC (openBIM)'],
          ['RVT', 'Revit'],
        ]),
      },
      // Appointment role slots (Prepared / Checked / Approved by, plus owner)
      { key: 'authors', label: 'Author(s)', type: 'people', role: 'author' },
      { key: 'documentOwner', label: 'Document owner', type: 'person', role: 'document_owner' },
      { key: 'reviewers', label: 'Reviewer(s)', type: 'people', role: 'reviewer' },
      { key: 'leadReviewer', label: 'Lead reviewer', type: 'person', role: 'lead_reviewer' },
    ],
  };
}

// generate a compliant reference: caller supplies the non-serial field values;
// the API composes and allocates the next serial for the producing org
export const generateReferenceBody = z.object({ values: z.record(z.string(), z.string()) });
export type GenerateReferenceBody = z.infer<typeof generateReferenceBody>;
export type GenerateReferenceResponse = { reference: string; serial: number };

export type NamingProposal = {
  id: Id;
  proposingOrganisationId: Id;
  body: string;
  status: 'pending' | 'accepted' | 'declined';
};
export type ListNamingProposalsResponse = { items: NamingProposal[] };
export const proposeNamingAdditionBody = z.object({ body: z.string().min(1) });
export type ProposeNamingAdditionBody = z.infer<typeof proposeNamingAdditionBody>;
export const resolveNamingProposalBody = z.object({ status: z.enum(['accepted', 'declined']) });
export type ResolveNamingProposalBody = z.infer<typeof resolveNamingProposalBody>;

// Plan authoring (ADR-0008/0033, T-152) — update a planned container (a TIDP
// row). createPlanRowBody already exists above (Slice A); this adds edit.
export const updatePlanRowBody = z.object({
  documentReference: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdatePlanRowBody = z.infer<typeof updatePlanRowBody>;

// Set (or clear) the deliverable's document owner (T-189) — a super-user act on
// the producing org's own row; null clears it.
export const setDocumentOwnerBody = z.object({ participantId: id.nullable() });
export type SetDocumentOwnerBody = z.infer<typeof setDocumentOwnerBody>;

// Remove a planned deliverable from the plan (T-189): the container stays as a
// record (state → withdrawn) with a free-text reason; a super-user act.
export const withdrawContainerBody = z.object({ reason: z.string().min(1) });
export type WithdrawContainerBody = z.infer<typeof withdrawContainerBody>;

// T-384 — the owner's answer to a producing organisation's proposed withdrawal
// of a published deliverable (ADR-0013 §2). `accept` withdraws it under the
// proposer's own reason; declining clears the proposal and leaves the record
// live. Owner-side only: once published, the record is the owner's.
export const resolveWithdrawalProposalBody = z.object({ accept: z.boolean() });
export type ResolveWithdrawalProposalBody = z.infer<typeof resolveWithdrawalProposalBody>;

// Attached-source working set (ADR-0022 refined, T-154)
export type AttachedSource = {
  id: Id;
  conversationId: Id;
  // T-391 — `library` pins a deliverable from the project library by container
  // id. It exists because ADR-0013's consequences already said a superseded or
  // withdrawn document "may still be pinned as an attached source to ask about
  // it deliberately", and the other three kinds could not express one.
  kind: 'sandbox' | 'upload' | 'web' | 'library';
  ref: string;
  label: string | null;
  // T-471 — set for a `sandbox` pin whose document sits in a working area the
  // READER is not in: the ref and label are then blank, and the client says
  // "a document from a working area you are not in". Never set for the pinner.
  hidden?: boolean;
  // T-391 — THE MARKER, resolved server-side for a `library` pin and null for
  // every other kind. Pinning an out-of-context document is legal and
  // deliberate; what separates that from dangerous use is the reader knowing
  // WHY it is out — *"withdrawn — the survey it rests on has been retracted"*
  // reads differently from a bare *"withdrawn"*, and differently again from
  // *"superseded"*. The withdrawal reason's visibility follows the container
  // (ADR-0013 §4), so anyone who could pin it could already read it.
  document: {
    containerId: Id;
    documentReference: string;
    contextState: ContextState;
    withdrawnReason: string | null;
  } | null;
};
export type ListAttachedSourcesResponse = { items: AttachedSource[] };
export const pinAttachedSourceBody = z.object({
  kind: z.enum(['sandbox', 'upload', 'web', 'library']),
  ref: z.string().min(1),
  label: z.string().optional(),
});
export type PinAttachedSourceBody = z.infer<typeof pinAttachedSourceBody>;

// Document presence (ADR-0039 real-time, first cut — T-175): who is present on a
// document now. A heartbeat marks the requester present; the read returns others
// seen within the window, self excluded.
export type PresenceEntry = { participantId: Id; name: string; initials: string };
export type ListPresenceResponse = { items: PresenceEntry[] };

// Deliverables shared to the requester's organisation whose current version it
// has not yet acknowledged (ADR-0035 §4) — the receiving org's inbox, since the
// gate withholds the deliverable itself until acknowledged. T-161.
export type PendingTransmittal = {
  containerId: Id;
  documentReference: string;
  versionId: Id;
  versionReference: string;
};
export type ListPendingTransmittalsResponse = { items: PendingTransmittal[] };

// ── T-467 — the home as a work queue ────────────────────────────────────────
//
// *In plain terms: the project home opens with what is waiting on you — a
// reviewer to confirm, an appointment to accept, a transmittal to acknowledge,
// a request to issue outside the project, a withdrawal to decide, comments to
// answer, findings to close — each one click from the screen where it is done;
// then the documents that moved most recently, and your saved views.*
//
// GET /projects/:projectId/work-queue — ONE aggregating read per project,
// access-resolved on the server: every arm is the same query the screen it
// points to runs, cut to the requester, so the queue never names a thing the
// person could not reach by hand.
export type WorkQueueKind =
  | 'confirm_reviewer'
  | 'accept_appointment'
  | 'acknowledge_transmittal'
  | 'approve_external_issue'
  | 'decide_withdrawal'
  | 'respond_to_comments'
  | 'close_findings';
export type WorkQueueItem = {
  kind: WorkQueueKind;
  /** the sentence: "Confirm Rachel Bowen as lead reviewer of WA-EIA-MST-001" */
  label: string;
  /** the path inside the project where the act is done */
  href: string;
  /** a count where the item stands for several (comments, findings) */
  count?: number;
  at: string | null;
};
export type RecentDocument = {
  kind: 'library' | 'draft';
  label: string;
  reference: string | null;
  href: string;
  at: string;
};
export type GetWorkQueueResponse = {
  items: WorkQueueItem[];
  recent: RecentDocument[];
  views: Array<{ id: Id; register: SavedViewRegister; name: string; filter: Record<string, unknown>; shared: boolean; mine: boolean }>;
};

// ── T-465 — the record-state change record ──────────────────────────────────
// GET /containers/:containerId/state-changes — every change of the container's
// record state, newest first, with who, when and why. *Plainly: the document's
// own history of being withdrawn, restored or superseded — both halves of an
// undone act stay on it.* Read through the plan row's own visibility.
export type ContainerStateChange = {
  id: Id;
  fromState: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  toState: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  reason: string | null;
  changedBy: { participantId: Id; name: string };
  changedAt: string;
};
export type ListContainerStateChangesResponse = { items: ContainerStateChange[] };

// ── T-463 — the AI transparency table, and the per-project feature switch ───
//
// *In plain terms: a page that says, for every AI feature, what it reads, what
// it may write, where it runs, what it keeps, and that it never trains on the
// project's data; and a switch the owner's super user can turn off per project,
// with a reason, that is written down like any other change to the project's
// rails (ADR-0030). A switched-off feature is absent from every launcher and
// its endpoint refuses — it is not greyed out.*
//
// The switch sits BENEATH the deployment tier (ADR-0037) and only narrows
// reach: nothing here can turn a feature on that the tier or the requester's
// own entitlement would refuse. The facts in each row are the registry's
// (apps/api/src/ai-features.ts), written once beside the code they describe.
export const AI_FEATURE_KEYS = [
  'ask',
  'drafting',
  'document_creator',
  'qa_checker',
  'structure_builder',
  'rule_extraction',
  'app_builder',
  'app_insights',
] as const;
export type AiFeatureKey = (typeof AI_FEATURE_KEYS)[number];
export type AiFeatureRow = {
  key: AiFeatureKey;
  label: string;
  /** where a person meets it */
  where: string;
  reads: string;
  mayWrite: string;
  keeps: string;
  /** the standing commitment (ADR-0026): never */
  trains: 'never';
  /** the retrieval index itself is the substrate and cannot be switched */
  switchable: boolean;
  enabled: boolean;
  /** the latest switch, when one has ever been thrown — who, when, why */
  lastChange: { name: string; at: string; reason: string; enabled: boolean } | null;
};
export type AiTransparencyResponse = {
  /** the deployment's posture, from the router (ADR-0037): where every call runs */
  tier: { tier: string; region: string[]; retention: string[]; jurisdiction: string[] };
  features: AiFeatureRow[];
  /** the owner's super user may throw a switch */
  mayConfigure: boolean;
  /** the project's switch history, newest first — read by anyone on the project */
  history: Array<{ key: AiFeatureKey; enabled: boolean; reason: string; name: string; at: string }>;
};
export const setAiFeatureBody = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(1).max(1000),
});
export type SetAiFeatureBody = z.infer<typeof setAiFeatureBody>;

// ── T-461 — bulk acts on a selection, and the register's export ─────────────
//
// *In plain terms: tick several rows and act on them once — transmit them,
// issue them outside the project, mark them superseded by one new document,
// classify them, or take them to Excel.*
//
// Every bulk write is ONE ACT over the selection: every row is checked before
// anything is written, a single refused row refuses the lot and names itself
// (`failures`), and the writes land in one transaction. The alternative — the
// screen looping over the single-row routes — leaves a half-done batch on a
// network blip with nothing in the record saying which half. Each bulk route
// reuses the single route's own checks and write, so there is never a second
// definition of what a transmittal or an external issue is.
const bulkContainerIds = z.array(id).min(1).max(200);
export type BulkFailure = { containerId: Id; documentReference: string | null; problem: string };
/** a bulk write refused whole: 409 with the rows that refused it */
export type BulkRefusal = ApiError & { failures: BulkFailure[] };

// POST /projects/:projectId/bulk/transmittals — the owner issues the same
// non-review transmittal for each selected row (ADR-0035): one share per
// receiving organisation per row, one transmittal per row.
export const bulkTransmitBody = z.object({
  containerIds: bulkContainerIds,
  organisationIds: z.array(id).min(1),
  purposeCode: z.string().min(1).optional(),
});
export type BulkTransmitBody = z.infer<typeof bulkTransmitBody>;
export type BulkTransmitResponse = { issued: number; transmittalIds: Id[] };

// POST /projects/:projectId/bulk/external-issues — the same recipient, reason
// and message for each row (ADR-0055); each row gets its own issue (or request)
// because the link is per revision of per document, never a bundle.
export const bulkIssueExternallyBody = issueExternallyBody.extend({ containerIds: bulkContainerIds });
export type BulkIssueExternallyBody = z.infer<typeof bulkIssueExternallyBody>;
export type BulkIssueExternallyResponse = { state: 'issued' | 'requested'; issueIds: Id[] };

// POST /projects/:projectId/bulk/supersessions — one replacement supersedes
// each selected row: a `supersedes` edge from the replacement to each (ADR-0045
// as amended), proposed by either party and confirmed in the same act when the
// caller is the owner. A row already carrying that proposed edge is confirmed
// rather than refused.
export const bulkSupersedeBody = z.object({
  containerIds: bulkContainerIds,
  replacementContainerId: id,
});
export type BulkSupersedeBody = z.infer<typeof bulkSupersedeBody>;
export type BulkSupersedeResponse = { state: 'confirmed' | 'proposed'; relationshipIds: Id[] };

// POST /projects/:projectId/bulk/classifications — one facet's term across the
// selection, a producing-organisation act (ADR-0045). The choice is explicit:
// `append` sets the term only on rows with nothing yet under that facet and
// leaves the others as they were; `replace` sets it on every row.
export const bulkClassifyBody = z.object({
  containerIds: bulkContainerIds,
  facetId: id,
  termId: id,
  mode: z.enum(['append', 'replace']),
});
export type BulkClassifyBody = z.infer<typeof bulkClassifyBody>;
export type BulkClassifyResponse = { set: number; kept: number };

// POST /projects/:projectId/plan/export — the selected rows as a workbook in
// the plan template's own shape (T-358): sheet 1 is Title + the scheme's code
// fields (read back out of each reference) + its metadata fields, so the file
// re-imports through POST /plan/import; sheet 2 is the record (reference,
// revision, state, producer, issued) that the import ignores by design.
export const planExportBody = z.object({ containerIds: bulkContainerIds });
export type PlanExportBody = z.infer<typeof planExportBody>;

// ── The project ontology (Drawer 6, ADR-0045, T-241) ────────────────────────
// Classification and relationship endpoints. Reads are pre-filtered server-side
// (principle 2): a relationship into a container the requester cannot see is
// never returned, so the ontology cannot leak existence across the wall.

// GET /projects/:projectId/classification-scheme — the owner-owned vocabulary
export type ClassificationSchemeResponse = {
  facets: Array<ClassificationFacet & { terms: ClassificationTerm[] }>;
};

// GET /containers/:containerId/classifications — the container's placements
export type ContainerClassificationRead = ContainerClassification & {
  facetKey: string;
  termCode: string;
  termLabel: string;
};
export type ContainerClassificationsResponse = { items: ContainerClassificationRead[] };

// PUT /containers/:containerId/classifications — set/replace one facet's term
// (upsert; one term per facet). termId must belong to facetId — the API checks.
export const setClassificationBody = z.object({ facetId: id, termId: id });
export type SetClassificationBody = z.infer<typeof setClassificationBody>;

// POST /containers/:containerId/relationships — propose an edge from this
// container to another (proposed, no effect until confirmed)
export const proposeRelationshipBody = z.object({
  toContainerId: id,
  type: z.enum([
    'supersedes',
    'references',
    'responds_to',
    'is_part_of',
    'derived_from',
  ]) satisfies z.ZodType<DocumentRelationshipType>,
});
export type ProposeRelationshipBody = z.infer<typeof proposeRelationshipBody>;

// GET /containers/:containerId/relationships — the container's edges, both
// directions, visibility-filtered. otherDocumentReference is the coded ref of
// the endpoint at the other end (always visible here, by the pre-filter).
export type ContainerRelationshipRead = DocumentRelationship & {
  direction: 'outgoing' | 'incoming';
  otherContainerId: Id;
  otherDocumentReference: string;
};
export type ContainerRelationshipsResponse = { items: ContainerRelationshipRead[] };

// ── The conflict register (T-245/T-246, ADR-0046) ────────────────────────────
// The ethical wall's positive-exclusion form. The register is ORG-PRIVATE: it
// reveals which of a firm's people are walled from what, which is close to
// revealing its engagements, so only the declaring organisation's own admins
// ever read it (ADR-0018 private floor). A project owner gets the attestation
// instead — evidence a control exists, never its contents (§8).

export type ConflictGrain = 'organisation' | 'individual';

// POST /organisation/conflict-exclusions — the declaring org's own admin only.
// The pair is unordered (§9); the API stores it canonically, so callers may
// send either order.
export const declareExclusionBody = z.object({
  projectAId: id,
  projectBId: id,
  grain: z.enum(['organisation', 'individual']) satisfies z.ZodType<ConflictGrain>,
  /** required at individual grain, forbidden at organisation grain */
  subjectUserId: id.optional(),
  reason: z.string().max(2000).optional(),
});
export type DeclareExclusionBody = z.infer<typeof declareExclusionBody>;

export type ConflictExclusionRecord = {
  id: Id;
  grain: ConflictGrain;
  subjectUserId: Id | null;
  subjectName: string | null;
  projectAId: Id;
  projectAName: string;
  projectBId: Id;
  projectBName: string;
  reason: string | null;
  declaredByName: string;
  declaredAt: string;
  withdrawnAt: string | null;
};
export type ListConflictExclusionsResponse = { items: ConflictExclusionRecord[] };

/**
 * A live Participant grant that a newly declared exclusion would breach.
 * REPORTED, never revoked (§4): an automatic revocation could remove a
 * specialist mid-examination, and a wall control that causes an unattributed
 * outage gets switched off rather than trusted.
 */
export type RetrospectiveConflict = {
  userId: Id;
  userName: string;
  projectAId: Id;
  projectAName: string;
  projectBId: Id;
  projectBName: string;
};
export type DeclareExclusionResponse = {
  exclusion: ConflictExclusionRecord;
  /** existing grants this exclusion now covers — for the admin to act on */
  retrospectiveConflicts: RetrospectiveConflict[];
};

// GET /projects/:projectId/conflict-attestations — the OWNER's view.
// Deliberately carries no exclusion data of any kind: not a count, not a date
// from the register, not a subject. Only who attested, for which organisation,
// and when (§8).
export type ConflictAttestationRecord = {
  organisationId: Id;
  organisationName: string;
  attested: boolean;
  attestedByName: string | null;
  attestedAt: string | null;
};
export type ListConflictAttestationsResponse = {
  required: boolean;
  items: ConflictAttestationRecord[];
};

// PATCH /projects/:projectId/conflict-attestation — owner sets the requirement
export const setAttestationRequirementBody = z.object({ required: z.boolean() });
export type SetAttestationRequirementBody = z.infer<typeof setAttestationRequirementBody>;

// ── Purge (T-340, ADR-0050 §5–§6) ──────────────────────────────────────────
//
// POST /projects/:projectId/purges   — erase a sandbox document and everything
//                                      derived from it. Org-admin only, typed
//                                      confirmation, recorded with a name.
// GET  /projects/:projectId/purges   — the organisation's own purge record.
//
// **Delete and Purge are two acts.** Delete is T-128's bin — restorable,
// self-service, and unchanged. Purge has no undo, reaches the derived stores,
// and is bounded by *whose material it is*: an organisation's own working
// material, and **never** anything promoted into the library, which is the
// owner's record and the owner's act to remove from (§7).
//
// The confirmation is the document's **own title**, typed. A phrase the person
// has to read the row to know is a different thing from a word they can reflex
// past, and it is checked **server-side** — a client-side-only confirmation is
// a speed bump for a person and nothing at all for a script.
export const purgeRequestBody = z.object({
  sandboxDocumentId: z.uuid(),
  confirmation: z.string().min(1),
});
export type PurgeRequestBody = z.infer<typeof purgeRequestBody>;

/**
 * What the purge reached, counted while there was still something to count.
 * It is on the wire because "it worked" is not an answer to "was this actually
 * erased" — the numbers are what a firm can hold Infora to.
 */
export type PurgeReach = {
  ambientVersions: number;
  comments: number;
  checkoutEvents: number;
  bindingEvents: number;
  suggestions: number;
  signals: number;
  frozenVersions: number;
  chunks: number;
  renditions: number;
  blobs: number;
};
export type PurgeResponse = { purgeId: Id; reached: PurgeReach };

export type PurgeRecord = {
  id: Id;
  subjectKind: string;
  // the title outlives the document deliberately: a record naming only a uuid
  // answers "something was erased" and nothing else
  subjectTitle: string;
  reached: PurgeReach;
  purgedAt: string;
  purgedByName: string;
};
export type ListPurgesResponse = { items: PurgeRecord[] };

// POST /projects/:projectId/library-removals — T-341, ADR-0050 §7.
//
// **The second step, and it cannot be the first.** Withdraw already stops a
// container grounding — `state = 'live'` is a pre-filter inside the retrieval
// query — and it is reversible. This erases, and is not. Refused on a container
// that is not withdrawn, so the two cannot collapse into one click.
//
// **The authority is the owner organisation's**, not the producer's. It is
// where the property already sits (ADR-0016), and the alternative lets a
// consultancy erase six months of corpus ahead of a dispute, leaving the
// produced record intact but uncheckable.
//
// ⚠ Refused (`has_review_record`) on a container carrying a work item or a
// review cycle: §8 says the owner **retains** the deliverables and the
// review-cycle metadata, so erasing one would destroy a signed-off record to
// solve a problem that record does not have. The incident this act exists for
// is a wrongly-loaded reference document, which has neither.
export const libraryRemovalBody = z.object({
  containerId: z.uuid(),
  /** the deliverable reference, typed — checked server-side */
  confirmation: z.string().min(1),
});
export type LibraryRemovalBody = z.infer<typeof libraryRemovalBody>;

export type LibraryRemovalResponse = {
  removalId: Id;
  reached: { versions: number; chunks: number; renditions: number; blobs: number };
};

// T-292 — GET /projects/:projectId/grounding-scope: what the composer's
// **Data sources** and **Context** chips read, in one call.
//
// `sources` is computed from the SAME pre-filter retrieval grounds on, so the
// chip cannot show a document the answer could not have used, and an empty
// array is the real answer rather than a loading state — which is the whole
// point, because a grounded answer over an empty scope is the most misleading
// state Ask can be in and looks exactly like a good one.
export type GroundingSource = {
  containerId: Id;
  /**
   * T-335 — the live version a grounded draft would actually use. The document
   * creator binds sources **by version**: a container is a series, a draft
   * rests on one revision of it, and the manifest recording what the document
   * was built from has to name which.
   */
  versionId: Id;
  documentReference: string;
  /** the deliverable's title, absent for reference material (T-304) */
  title: string | null;
  /**
   * T-405 — what the document IS, in a sentence or two, **typed by whoever
   * filed or edited it and never generated**. Null where nobody has written
   * one, which is most of an existing corpus: the picker then says nothing
   * rather than inventing something, and a model-written description would be
   * an uncited claim about a document sitting beside its own grounded content.
   */
  description: string | null;
};
export type GetGroundingScopeResponse = {
  sources: GroundingSource[];
  /** the per-turn assembly token budget every run is built inside (ADR-0029 §5) */
  assemblyTokenBudget: number;
  /**
   * T-470 — how many of `sources` carry each classification term, keyed by
   * term id. Counted over exactly the documents in `sources`, so it is the
   * number of VISIBLE, readable documents and nothing the wall hides. A term
   * no listed document carries is absent (read it as zero).
   */
  termCounts: Record<Id, number>;
};

// T-470 — POST /projects/:projectId/scope-preview: what a scope would reach,
// before anything is asked.
//
// *In plain terms: as a person builds a scope in the picker, this says "14
// documents in your scope can be read" — or "nothing" — without running a
// search or a model.*
//
// It is the same count `POST /runs` takes before it spends anything
// (`reachCounts`, T-469), minus `read`, which only a finished run has. The wall
// is applied in the count itself, so the browser cannot compute this and the
// numbers never move because of a share between two other organisations. A
// saved scope is resolved on the server; another firm's does not exist (404).
// Absent `scope` is the whole visible library — the one convention.
export const scopePreviewBody = z.object({ scope: scopeSchema.optional() }).strict();
export type ScopePreviewBody = z.infer<typeof scopePreviewBody>;
export type ScopePreviewResponse = ReachCounts;

// T-295 — GET /runs/:runId/destination-check?sandboxId=…: what the destination
// selector shows BEFORE the click.
//
// **It is a preview of the write's own decision, never a second judgement.**
// The handler calls the same `checkPropagation` over the same freshly-computed
// audiences that `POST /runs/:runId/sandbox-document` calls — T-373's rule from
// the promotion window, one slice along: a preflight computed separately from
// the act it previews is a preflight that will eventually lie. So the selector
// surfaces what the backend already refuses and invents nothing.
//
// `reason` names BOTH labels when the destination is broader, because "refused"
// on its own tells a user nothing they can act on. `allowed: false` is a
// **block by default**, not a warning: writing anyway needs the explicit
// override `openRunInEditorBody` already carries, with its recorded reason.
export type DestinationCheckResponse = {
  allowed: boolean;
  /** the most restrictive label across the run's source set */
  sourceLabel: AccessLabelName;
  /** the label of the sandbox the answer would be written into */
  destinationLabel: AccessLabelName;
  /** present only when refused; names both labels in one sentence */
  reason?: string;
};
/** The lattice, most restrictive first. Spelled out because `contracts`
 *  depends on nothing and this crosses the boundary (the T-313 precedent). */
export type AccessLabelName =
  | 'participant_narrowed'
  | 'single_organisation'
  | 'multi_organisation'
  | 'project_wide';

// ── T-309 — THE DOCUMENT CREATOR, AND THE PLAN IT SHOWS BEFORE THE CLICK ────
//
// *In plain terms: before anything is generated the system works out, in
// ordinary code, which steps will run and roughly what they cost, and shows
// that. It also states what the result will cover — and states it again in the
// same shape afterwards, so "here is your document" is never an unqualified
// claim about material the run did not reach.*
//
// The types are here and the FUNCTION that fills them is in `capabilities`,
// because pricing needs the model rates and `contracts` depends on nothing.
// They are here rather than there for the surface's sake: `apps/web` sees
// `contracts` and `ui` alone, and a plan it cannot type is a plan it cannot
// render.
//
// POST /projects/:id/tools/document-creation/plan   the plan, no spend
// POST /projects/:id/tools/document-creation/runs   the plan, then the run
export type PlannedToolStep = {
  /** the declaring workflow's own step id */
  key: string;
  stage: PlanStage;
  /** the capability that will run it, or null where the orchestrator does */
  worker: string | null;
  /** what this step does, in words a non-engineer reads */
  label: string;
  estimate: {
    calls: number;
    tokensPrompt: number;
    tokensCompletion: number;
    /**
     * **null = this deployment declared no rate for the model, NEVER "free"**
     * (T-254, finding F7). Zero is a price; null is nobody priced it, and a
     * plausible zero is what a business case gets built on.
     */
    cost: number | null;
  };
};

export type ToolPlan = {
  workflowId: string;
  workflowVersion: number;
  steps: PlannedToolStep[];
  /**
   * ADR-0053 §5 — stated **before** the run and again beside the output after
   * it, in the same shape. A first-class output, not a footnote: it is the only
   * thing distinguishing a document built from four sources from one built from
   * none.
   */
  coverage: string;
  cost: {
    /** null when any step is unpriced — a partial sum wearing a total's name */
    total: number | null;
    priced: boolean;
  };
  /**
   * ADR-0053 §5 — refusal is reserved for the pathological case and is said in
   * the plan, **before any spend**, never as a caveat under a finished result.
   * Non-null means: do not offer the button.
   */
  refusal: string | null;
  /**
   * T-336 — **which shape the planner took**, in the user's words (ADR-0053
   * §4). *"One pass over the whole draft"*, *"a pass per section, then a
   * comparison"*, *"…compared in groups"*. Optional because the document
   * creator has one shape and naming it would be noise.
   */
  shape?: string;
  /**
   * T-406 — statements about **how the run will behave**, said before the
   * click. A note is not a `caveat`: a caveat is a degradation ("a
   * contradiction between two sections in different groups will not be
   * found"), and diluting that word with anything else would cost it its
   * meaning. A note is a resolution the user is entitled to see coming — the
   * ruled style precedence is the first and, today, the only one.
   */
  notes?: string[];
  /**
   * T-408 (ADR-0053 addendum A2) — **the document this plan proposes**, above
   * the step list: an overview, then a short description per section. Optional
   * because only the creator has one — the checker proposes no document, it
   * reads one.
   */
  proposal?: ProposedDocument;
  /**
   * T-336 — what this plan is **weaker at**, said before the run rather than
   * discovered after it (ADR-0053 §4: *"it degrades loudly or not at all"*).
   * The very-long shape compares section summaries in groups, so a
   * contradiction between two sections in different groups is not looked for —
   * and a run that did not say so would report a clean cross-section result it
   * had not earned.
   */
  caveats?: string[];
};

/**
 * T-412 — a sub-section at the wire.
 *
 * The same three fields a section has, and **no `subSections` of its own**:
 * V1 allows one level. A deeper level arriving on the wire is **stripped at
 * the parse** — zod drops what the schema does not declare — so the request
 * is honoured to the depth V1 has rather than refused outright; the outline
 * suite pins that this is a strip, not a refusal, so nobody hardens against
 * a refusal the door never performs (comment corrected in review,
 * 2026-09-01 — it previously claimed a refusal).
 */
export const documentSubSectionBody = z.object({
  heading: z.string().min(1),
  purpose: z.string().min(1),
  brief: z.string().min(1).optional(),
});

export const documentSectionBody = z.object({
  heading: z.string().min(1),
  purpose: z.string().min(1),
  /**
   * T-408 — the author's replacement for the planner's own description of this
   * section. A **parameter**, exactly like the answers above it; the step list
   * is computed from it and is editable by nobody (ADR-0053 addendum A2).
   */
  brief: z.string().min(1).optional(),
  /**
   * T-412 — the parts nested under this section. Optional, because most
   * sections have none; every entry is a section in its own right once the run
   * starts — separately drafted, separately described on the plan, separately
   * counted in both coverage sentences — and what it has that a top-level
   * section does not is a parent.
   */
  subSections: z.array(documentSubSectionBody).optional(),
});

/**
 * T-414 (ADR-0053 addendum A5) — saving a composed outline for the firm.
 *
 * **The label and the outline, and nothing else.** No project, because the
 * store is org-private and project-less by construction (the rulebook's
 * scoping); no organisation, because identity comes off the resolved session
 * and never off a request body (contracts principle 3); and no "who saved it",
 * for the same reason. **Sub-sections ride** — the whole point of saving an
 * outline is saving the one you built, and T-412 made that one able to nest.
 */
export const saveStartingOutlineBody = z.object({
  label: z.string().min(1).max(120),
  sections: z.array(documentSectionBody).min(1),
});
export type SaveStartingOutlineBody = z.infer<typeof saveStartingOutlineBody>;

export const documentCreationBody = z.object({
  /**
   * T-407 (ADR-0053 addendum A1) — **the outline the author composed**, and
   * the body's `templateId` is gone with it. A template is now a *starting
   * outline* the surface reads from `GET …/starting-outlines` and copies into
   * these sections; by the time a request is made, what the run draws its
   * shape from is the author's list and nothing else. That is what "a template
   * seeds but never locks" means at the wire.
   *
   * At least one section, because a document with no sections is not a
   * document — and refusing here is refusing before any spend.
   */
  sections: z.array(documentSectionBody).min(1),
  brief: z.string().min(1),
  /**
   * T-406 (ADR-0053 addendum A1) — the launcher's four answers. **Run
   * parameters**: recorded on the run, carried into the manifest, and the step
   * list is computed in code from them, so the same answers give the same
   * steps. The catalogues, their copy and the ruled precedence sentence live in
   * `creator.ts`.
   */
  purpose: z.enum(DOCUMENT_PURPOSES),
  language: z.enum(DOCUMENT_LANGUAGES),
  documentType: z.enum(DOCUMENT_TYPES),
  /**
   * Which of the project's style guides apply — **more than one may be
   * selected**, and the store has always been able to hold more than one, so
   * this needed no migration. An empty list is a real answer: a project with no
   * guides loaded shows the control honestly empty rather than hiding it, and
   * the drafting call is then told there are none rather than being told
   * nothing.
   */
  styleGuideIds: z.array(id),
  /**
   * T-469 — the part of the library this draft may draw on, **chosen before
   * drafting** (replaces `sourceVersionIds`). Absent means the whole visible
   * library. The gateway's pre-filter applies it — named documents are matched
   * by container, so the state rules retrieval already enforces pick the
   * current live version; a document the requester cannot reach is not a way
   * in and is never counted.
   */
  scope: scopeSchema.optional(),
  /**
   * T-471 — the working set: documents the author pinned from working areas
   * they are in, read as background marked user-supplied. **Never grounds,
   * never cited.** The server checks each one's reach and refuses the run, in
   * words, for one the author cannot reach. Nothing is added for the author.
   */
  attachedDocumentIds: z.array(id).default([]),
  destinationSandboxId: id,
  title: z.string().min(1),
});
export type DocumentCreationBody = z.infer<typeof documentCreationBody>;

export type DocumentCreationPlanResponse = { plan: ToolPlan };

// ── T-409 — THE AGENT PANE (ADR-0053 addendum A2, second half) ──────────────
//
// *In plain terms: beside the plan, a pane where the author can tell an agent
// what it got wrong for one section — "no, this should set out X in bullets" —
// and the agent rewrites that section's description. Then the plan redraws.*
//
// 🔒 **THE AGENT EDITS THE BRIEF AND ONLY THE BRIEF.** A brief is a parameter,
// exactly like the launcher's answers, and the step list underneath is computed
// in code from the parameters. So the model never touches a step list, the run
// stays `declared`, and ADR-0053 §12 is not reopened — what changed is that one
// more input became conversationally revisable *before* the run.
//
// **It PROPOSES; it does not apply.** The revised brief comes back to the
// surface, which sets it through the same code path a typed correction takes
// (T-408). There is deliberately no second door: two ways to change a brief is
// two chances for them to produce different plans.
export const reviseSectionBriefBody = z.object({
  /** the section under revision — its heading, for the agent's context */
  heading: z.string().min(1),
  /** what the author said belongs in it */
  purpose: z.string().min(1),
  /** the description as it stands, whether computed or already corrected */
  brief: z.string().min(1),
  /** what the author says is wrong with it, in their own words */
  ask: z.string().min(1),
});
export type ReviseSectionBriefBody = z.infer<typeof reviseSectionBriefBody>;

/**
 * The revised description, or a question.
 *
 * `followUp` rather than an error where the agent cannot act, on the structure
 * agent's own pattern (T-364): an assistive agent that cannot shape an answer
 * should **ask**, not fail the surface. Exactly one of the two is non-null.
 */
export type ReviseSectionBriefResult = { brief: string | null; followUp: string | null };

export type DocumentCreationRunResponse = {
  run: Run;
  /** the plan as it was shown before the click — the same object, recorded */
  plan: ToolPlan;
  /** ADR-0053 §5's second statement, in the SAME SHAPE as `plan.coverage` */
  coverage: string;
  /** null where the write was withheld: the label refused the destination */
  documentId: Id | null;
  manifest: Array<{ versionId: Id; usedFor: string }>;
  /** both labels, named — a refusal a user cannot act on reads as a broken system */
  label: { computed: string; destination: string; refusal: string | null };
  withheld: string[];
  unreachableSources: Id[];
};

// ── T-334 — THE TOOLS SECTION (Slice V1-T, ADR-0053 decision 1/11) ──────────
//
// *In plain terms: the rail has had a "Tools" item since the skeleton, and it
// has been empty ever since. This is the list that fills it — the standalone
// things a consultant can open and run.*
//
// 🔒 **ASSEMBLED FROM ENTITLEMENTS, NOT FILTERED** (T-269's rule, applied to
// tools exactly as to workers). A tool the requester cannot use is **absent**,
// never disabled and never greyed — so the section can never advertise a
// capability the viewer has no way to reach. There is no `enabled` flag in this
// shape, deliberately.
//
// **`unbuilt` is a different thing from unentitled, and the difference is why
// it exists.** An unentitled tool is absent because it is not yours; an
// `unbuilt` one is absent-from-use because nobody has built it yet, and saying
// so is more honest than a section that quietly has one tile in it. It names
// what it waits on, so the copy cannot go stale silently.
export type ToolState = 'available' | 'unbuilt';

export type ToolSummary = {
  id: string;
  label: string;
  /** what it does, in the words a consultant would use */
  description: string;
  state: ToolState;
  /** present exactly when `unbuilt` — what this is waiting on, named */
  waitsOn?: string;
  /** where launching it goes; present exactly when `available` */
  href?: string;
};

export type ListToolsResponse = { items: ToolSummary[] };

// ── T-311 — the marked-up edit: resolving findings ──────────────────────────
//
// *In plain terms: a reviewer works through what the checker found. Each mark
// is either taken — the suggested wording replaces what is there — or set
// aside. Corrections that are the same small change made over and over may be
// taken in one click; new sentences the AI wrote may not, and must be read one
// at a time.*
//
// **The three words are the reviewer's three acts, and `dismissed` is not
// `rejected`.** A rejected *Suggestion* is a judgement about a piece of
// proposed prose and writes a Signal (ADR-0026's raw material). A dismissed
// *finding* is a judgement about the defect itself — *"this is not a problem,
// or not one I am going to act on"* — and a finding with no proposed fix has no
// Suggestion to reject at all. Both close the finding; only the first has an
// opinion about wording to record.
export const resolveFindingBody = z.object({
  resolution: z.enum(['accepted', 'edited', 'dismissed']),
  /** required for `edited`, refused otherwise — the reviewer's own wording */
  editedContent: z.string().min(1).optional(),
});
export type ResolveFindingBody = z.infer<typeof resolveFindingBody>;

/**
 * Bulk triage (ADR-0053 §6), and the two halves are permitted on **different
 * terms** rather than being one feature with a flag.
 *
 * 🔒 **`accept` is admitted for MECHANICAL fixes only**, and the server checks
 * every id before applying any of them. Fifty-five identical capitalisations
 * are one decision applied fifty-five times and clicking it fifty-five times
 * adds nothing but fatigue — but a **rewrite** is model-written prose, and
 * accepting new prose unread is exactly the act ADR-0048 §3 exists to prevent.
 * A batch containing one rewrite is refused **whole**, so a client that grouped
 * wrongly cannot half-apply a decision the reviewer did not take.
 *
 * **`dismiss` is admitted for anything and records no reason.** Dismissing
 * changes no work product: declining forty advisory findings from one rule is
 * one professional judgement, not forty skipped. It **resolves** findings; it
 * does not override ADR-0049 §7's promotion gate, which blocks on *open*
 * findings and is unaffected in kind.
 */
export const bulkResolveFindingsBody = z.object({
  action: z.enum(['accept', 'dismiss']),
  findingIds: z.array(id).min(1),
});
export type BulkResolveFindingsBody = z.infer<typeof bulkResolveFindingsBody>;

/**
 * What a resolution did, including the honest failure.
 *
 * `driftedAnchors` names findings whose anchor no longer matches the text under
 * it — the sandbox head is mutable by design, so a mark can drift between the
 * run and the click. **A drifted anchor degrades, never blocks** (the
 * Suggestion pattern, T-112): the finding stays open, nothing is written over
 * the wrong words, and the reviewer is told which ones need looking at rather
 * than being handed a silent partial success.
 */
export type ResolveFindingsResponse = {
  applied: Id[];
  dismissed: Id[];
  driftedAnchors: Id[];
  /** the document as it now stands, where anything was applied */
  content: string | null;
};

// ── T-336 — THE QA CHECKER AS A TOOL ────────────────────────────────────────
//
// *In plain terms: you pick a draft, pick which checks to run and how hard to
// look, and are shown a plan — which steps will run, roughly what they will
// cost, and exactly what the run will and will not cover. Only then does
// anything happen. Afterwards the same coverage sentence comes back with what
// actually happened in it, beside the findings.*
//
// **Two endpoints and ONE planner**, T-309's rule one tool along: a preflight
// computed separately from the act it previews is a preflight that will
// eventually lie. The plan the user saw and the plan the run executed cannot
// differ, because there is only one.
//
// POST /projects/:id/tools/qa-check/plan   the plan, no spend
// POST /projects/:id/tools/qa-check/runs   the plan, then the run
export const qaCheckBody = z.object({
  /** a run covers ONE document (ADR-0053 §1) */
  sandboxDocumentId: id,
  families: z.array(z.enum(CHECK_FAMILIES)).min(1),
  depth: z.enum(['quick', 'full']),
  /**
   * T-469 — the part of the library to check against (replaces
   * `scopeVersionIds`). **Absent is the DEFAULT and means the whole
   * access-resolved library**; an empty scope is a `400`, no longer a second
   * way of saying "everything". `Q-028`'s explicit case: a scope selected
   * pre-retrieval, recorded on the plan, visible to the user.
   */
  scope: scopeSchema.optional(),
  /**
   * Documents pinned from the user's own sandbox (ADR-0022's working set).
   * **Never grounds, never cited** — the evidence is an excerpt. Pinning a
   * *library* document here would silently yield the weaker treatment, which is
   * why the launcher names the two affordances differently.
   */
  attachedDocumentIds: z.array(id).default([]),
  /** completeness checks against this; absent runs the placeholder half only */
  templateId: z.string().optional(),
  /**
   * T-418 — a conversation the caller opened **before** the run, so it can
   * watch the run's own Step rows tick off while the request is still in
   * flight.
   *
   * *In plain terms: a long check should read as working rather than hung, and
   * the only way a browser can show that is to be able to look the run up
   * before it finishes.*
   *
   * 🔒 **THIS ADDS NO ENGINE STATE AND NO SECOND RUN SHAPE.** A tool run has
   * always opened a Conversation like every other run (ADR-0028 §1); until now
   * the endpoint opened it itself and the caller learned its id only in the
   * response — which is far too late to watch anything. Passing one in moves
   * *when* the row is created, not *what* is created, and a caller that passes
   * none gets exactly the previous behaviour. The id is checked against the
   * requester's own project before it is used, so this is not a way to attach
   * a run to somebody else's thread.
   */
  conversationId: id.optional(),
});
export type QaCheckBody = z.infer<typeof qaCheckBody>;

export type QaCheckPlanResponse = { plan: ToolPlan };

export type QaCheckRunResponse = {
  run: Run;
  /** the plan as it was shown before the click — the same object, recorded */
  plan: ToolPlan;
  /**
   * ADR-0053 §5's second statement, in the SAME SHAPE as `plan.coverage`.
   *
   * 🔒 It is an output **beside** the findings and not a footnote under them,
   * because it is the only thing distinguishing a clean result from an
   * unexamined one: *"no findings"* must always read as *"no findings in what
   * was read"*, and this sentence is what makes that true on the screen.
   */
  coverage: string;
  findings: Finding[];
};

// ── The app builder (T-439–T-441, ADR-0056) ─────────────────────────────────
//
// *In plain terms: the requests behind an app — creating one, saying who it is
// open to, declaring a table, typing a row into it, submitting it, and the
// client accepting or rejecting it.*
//
// Every body below names a SUBJECT and never the requester (principle 3): the
// organisation the app is opened to, the participant an app is reassigned to,
// the organisation a table is shared with. Who is asking comes from the session
// alone, and the read predicate is computed from that — never from anything a
// caller sends.

/** POST /projects/:projectId/apps — create an app instance (ADR-0056 §1).
 * The initial participant scope rides the creation, exactly as a sandbox's
 * does (T-187): an app that exists for a moment with no scope is an app whose
 * first read has no answer. */
export const createAppBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  /** the ADR-0036 ladder's initial rungs; both may be empty, and the creator's
   * own organisation is granted regardless — an app nobody can open, including
   * the person who just made it, is a bug rather than a strict default */
  organisationIds: z.array(id).default([]),
  participantIds: z.array(id).default([]),
});
export type CreateAppBody = z.infer<typeof createAppBody>;

/** POST /apps/:appId/scope — widen the scope, live (ADR-0036, ADR-0056 §1).
 * Exactly one grantee per grant: the ladder is emergent from the grant set. */
export const grantAppScopeBody = z
  .object({ organisationId: id.optional(), participantId: id.optional() })
  .refine((b) => (b.organisationId === undefined) !== (b.participantId === undefined), {
    message: 'a scope grant names exactly one of an organisation or a participant',
  });
export type GrantAppScopeBody = z.infer<typeof grantAppScopeBody>;

/** POST /apps/:appId/reassign — reassign-or-close when the owner goes
 * (ADR-0056 §5, §7). The project owner names one of their own people. */
export const reassignAppBody = z.object({ participantId: id });
export type ReassignAppBody = z.infer<typeof reassignAppBody>;

/** PATCH /apps/:appId/definition — the builder's working copy. Publishing is a
 * separate act (POST /apps/:appId/publish) with no body: what is published is
 * always the working copy as it stands, so there is nothing to send. */
export const patchAppDefinitionBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  // T-442 — validated against the real shape rather than `z.unknown()`. A
  // screen written outside the app-screen grammar (app-builder.ts) fails HERE,
  // so nothing that could name a URL or a credential ever reaches the store.
  definition: appDefinitionSchema.optional(),
});
export type PatchAppDefinitionBody = z.infer<typeof patchAppDefinitionBody>;

/**
 * POST /apps/:appId/builder/screen — T-442. **The agent PROPOSES a screen and
 * never applies one** (ADR-0027, and the preview-confirm lane T-337, T-364 and
 * T-409 all stay in): what comes back is a screen in the closed grammar, which
 * the builder then saves through the SAME `PATCH /definition` a hand-made
 * change takes. Two ways to write a screen would be two chances for them to
 * disagree about what a screen may contain.
 */
export const writeAppScreenBody = z.object({
  /** which declared table the screen is over */
  appTableId: id,
  /** what the builder said the screen should do, in their own words */
  purpose: z.string().min(1).max(2000),
  /** the screen being revised, when the builder is asking for a change rather
   * than a first draft */
  current: z.string().max(20000).nullable().default(null),
});
export type WriteAppScreenBody = z.infer<typeof writeAppScreenBody>;


/** What the builder's agent says back. `screen` is null when the agent could
 * not shape one — a follow-up question, never a failure, on T-364's rule. */
export type WriteAppScreenResponse = {
  /** the screen, serialised in the grammar, ready to be PATCHed onto the
   * interface; null when the agent asked instead */
  source: string | null;
  followUp: string | null;
};


/**
 * T-449 — `POST /apps/:appId/builder/conversation`: one thing a builder says to
 * the agent. The agent's reply, and whatever it did to the working copy, come
 * back with the app as it now stands. Who is speaking comes from the session,
 * never from the body (principle 3).
 */
export const sayToBuilderBody = z.object({ say: z.string().trim().min(1).max(4000) });
export type SayToBuilderBody = z.infer<typeof sayToBuilderBody>;

/** `GET /apps/:appId/builder/conversation` — the stored conversation, oldest
 * first, to the people who may build the app and nobody else. */
export type BuildConversationResponse = { turns: AppBuildTurn[] };

export type SayToBuilderResponse = {
  /** the person's turn and the agent's reply, as stored */
  turns: AppBuildTurn[];
  /** the app after the agent's acts — the panel redraws from this */
  app: GetAppResponse;
};

/**
 * T-448 — what `POST /apps/:appId/publish` answers when it refuses (409).
 *
 * `detail` is the sentence a person reads, naming each question still open;
 * `questions` is the same list as data, so a surface can mark each one where it
 * lives without parsing the sentence.
 */
export type PublishRefusedResponse = ApiError & {
  error: 'conflict';
  detail: string;
  questions: BuilderQuestion[];
};

/** POST /apps/:appId/tables — declare a table (ADR-0056 §2). `hasAcceptance`
 * is the builder's per-table choice (§2a), asked rather than found (§2b). */
export const declareAppTableBody = z.object({
  name: z.string().min(1),
  columns: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .regex(/^[a-z0-9_]+$/, 'a column key is lower-case letters, digits and underscores'),
        label: z.string().min(1),
        type: z.enum(['text', 'number', 'date', 'boolean', 'choice']),
        required: z.boolean().default(false),
        choices: z.array(z.string().min(1)).optional(),
      }),
    )
    .min(1),
  kind: z.enum(['data', 'insight', 'reference']).default('data'),
  hasAcceptance: z.boolean().default(false),
});
export type DeclareAppTableBody = z.infer<typeof declareAppTableBody>;

/**
 * PATCH /app-tables/:appTableId — T-442. The ONLY field a declared table can
 * change, and only while it is empty.
 *
 * It exists because the agent's first required question (ADR-0056 §2b) has to
 * be answerable when it is asked — including about a table declared before
 * anybody asked. **Only while the table holds no rows**: whether a table holds
 * contractual data decides whether its rows change hands on acceptance (§2a),
 * and changing that under rows that already exist would retrospectively make
 * somebody's figure into somebody else's record, or take it back.
 */
export const setAppTableAcceptanceBody = z.object({ hasAcceptance: z.boolean() });
export type SetAppTableAcceptanceBody = z.infer<typeof setAppTableAcceptanceBody>;

/** POST /app-tables/:appTableId/shares — the project owner shares one table
 * with one named organisation (ADR-0056 §6): deliberate, audited, revocable,
 * and never reaching a third organisation. */
export const shareAppTableBody = z.object({ organisationId: id });
export type ShareAppTableBody = z.infer<typeof shareAppTableBody>;

/** POST /app-tables/:appTableId/rows — enter a row. On a table with an
 * acceptance step a row starts as a `draft`, read by its entering organisation
 * ALONE (the 2026-09-06 addendum, ruling 3); `submit: true` submits it in the
 * same act, which is what the form's "Submit" button does. */
export const enterAppRowBody = z.object({
  values: z.record(z.string(), z.unknown()),
  submit: z.boolean().default(false),
});
export type EnterAppRowBody = z.infer<typeof enterAppRowBody>;

/** PATCH /app-rows/:appRowId — edit before acceptance; the prior version is
 * kept as a row of its own. An accepted row is never edited (trigger). */
export const editAppRowBody = z.object({ values: z.record(z.string(), z.unknown()) });
export type EditAppRowBody = z.infer<typeof editAppRowBody>;

/** POST /app-rows/:appRowId/decision — accept or reject, by the project owner
 * (ADR-0056 §2a). **A rejection carries a required reason** (ruling 4), read by
 * the submitting organisation on the row; the database refuses one without. */
export const decideAppRowBody = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('accept') }),
  z.object({ decision: z.literal('reject'), reason: z.string().min(1) }),
]);
export type DecideAppRowBody = z.infer<typeof decideAppRowBody>;

/**
 * POST /apps/:appId/exports — T-444. A person downloads the app's data as a
 * spreadsheet, or one insight as a Word file.
 *
 * **The body says what to cover, never who may see it.** There is no field
 * here by which a caller could ask for another organisation's rows, and the
 * file is built from the same read the rows screen makes, as the same person
 * (principle 3). `appTableIds` NARROWS the sheets, on the same footing as any
 * other narrowing: naming a table the requester cannot read yields an empty
 * sheet, not an error and not a row.
 */
export const exportAppBody = z.discriminatedUnion('format', [
  z.object({ format: z.literal('xlsx'), appTableIds: z.array(id).max(50).default([]) }),
  z.object({ format: z.literal('docx'), appRowId: id }),
]);
export type ExportAppBody = z.infer<typeof exportAppBody>;

/**
 * One export, as recorded (ADR-0056 §8, drawer 9's `app_exports`).
 *
 * **The stamp is provenance, not authorship.** There is no producer field here
 * and no agent-drafted marking, and there must never be one: a stamp naming the
 * app's agent as author would drift into the label the owner declined. Who
 * exported IS recorded — in this row, which is an audit record, and NOT in the
 * file, which is the person's to edit and send on.
 */
export type AppExportRecord = {
  id: Id;
  appId: Id;
  exportedByName: string;
  exportedByOrganisationName: string;
  exportedAt: string;
  /** the moment the data was read — what "as of" means on the file's stamp */
  dataAsOf: string;
  tablesCovered: Id[];
  rowsCovered: number;
};

export type ListAppExportsResponse = { items: AppExportRecord[] };

/** POST /apps/:appId/runs — run the app by hand. `scheduled` is stored from
 * T-443 and honoured when a clock exists (ADR-0056 §13d), so the only trigger
 * a caller may ask for today is `manual`. */
export const runAppBody = z.object({ trigger: z.literal('manual').default('manual') });
export type RunAppBody = z.infer<typeof runAppBody>;

/**
 * POST /apps/:appId/playbook — T-445. Save this app to the firm's workspace as
 * a playbook (ADR-0056 §10).
 *
 * **There is nothing in this body about what travels**, and there must never
 * be: what travels is the definition and the table declarations, always, and no
 * rows, ever. A field by which a caller could ask for "the reference rows too"
 * is precisely the softening the owner struck on 2026-09-06 — *"by reference
 * tables i meant the database structure for an app, not the content from within
 * it"* — and the database refuses one anyway (`playbooks_carry_no_rows`).
 *
 * `name` is what the template is called on the shelf, defaulting to the app's
 * own name. **Saving again under the same name makes the next VERSION** rather
 * than a second entry, which is what keeps a shelf from filling with
 * near-duplicates of one app.
 */
export const saveAppAsPlaybookBody = z.object({ name: z.string().min(1).optional() });
export type SaveAppAsPlaybookBody = z.infer<typeof saveAppAsPlaybookBody>;

/**
 * POST /projects/:projectId/apps/deployments — T-445. Deploy a playbook into
 * this project as a NEW app instance (ADR-0056 §10).
 *
 * **A copy, with no live link.** The instance records which playbook and which
 * version it came from; editing or re-saving the playbook afterwards changes
 * nothing that is already deployed, and building on the instance changes
 * nothing on the shelf. That is not a policy the routes keep — a save writes a
 * new playbook row, so there is no shared record for either side to change.
 *
 * The body names the playbook and, optionally, what to call the instance here.
 * It does NOT name a scope: nothing about who could open the app in the project
 * it was saved from means anything in this one — an organisation id from
 * another project is another project's fact — so the deployed instance starts
 * open to the deploying firm alone, for its builder to widen deliberately.
 */
export const deployPlaybookBody = z.object({
  playbookId: id,
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type DeployPlaybookBody = z.infer<typeof deployPlaybookBody>;

/** PATCH /organisation/users/:userId/app-building — the org admin decides who
 * among their OWN people may build (ADR-0056 §12). Claude's mechanism for the
 * ADR's policy: the record fixed who decides, not the control. Widening
 * reverses, which is why it is a toggle and not a one-way grant. */
export const setAppBuilderBody = z.object({ mayBuildApps: z.boolean() });
export type SetAppBuilderBody = z.infer<typeof setAppBuilderBody>;

// ── T-451/T-452 — the file source (ADR-0059) ──────────────────────────────
//
// *In plain terms: an app table can point at one spreadsheet the project
// already holds — a sandbox document or a library record — name the block of
// cells that holds the data and what each column means, and every new version
// of that file refills the table.*
//
// 🔒 **A PERSON'S PANEL ACT, AND NO AGENT ACT** (ADR-0059 decision 4). None of
// these shapes appears among the builder agent's acts; attaching is done from
// the panel, by someone who may build the app AND can open the document.
//
// 🔒 **THE BODY NEVER NAMES WHO ENTERED THE ROWS.** Imported rows are stamped
// with the person whose act produced the file version (decision 2), resolved
// from the document's own record. There is no field below by which a caller
// could put somebody else's name, or organisation, on an imported figure.

/** Which document a source points at — exactly one of the pair (0069's CHECK). */
export const sourceDocumentRef = z
  .object({ sandboxDocumentId: id.optional(), containerId: id.optional() })
  .refine((b) => (b.sandboxDocumentId === undefined) !== (b.containerId === undefined), {
    message: 'a source points at exactly one of a sandbox document or a library record',
  });
export type SourceDocumentRef = z.infer<typeof sourceDocumentRef>;

/** One source column → one declared column. */
export const sourceMappingEntry = z.object({
  /** the header text in the spreadsheet, as it reads there */
  header: z.string().trim().min(1).max(500),
  /** the declared column's key on the app table */
  columnKey: z.string().min(1).max(200),
});
export type SourceMappingEntry = z.infer<typeof sourceMappingEntry>;

/**
 * POST /app-tables/:appTableId/source — attach a source, or change an attached
 * one's region and mapping. The first import runs in the same act, so the
 * builder sees the rows land (or the receipt saying why they did not).
 *
 * `headerRow` is the WHOLE header row of the region the builder picked, as
 * `GET /apps/:appId/source-documents/regions` listed it; the mapping names the
 * columns that feed the table. On every later import the region is re-found by
 * the mapped headers' texts, never by cell coordinates (the Power BI lesson).
 */
export const attachTableSourceBody = z
  .object({
    sandboxDocumentId: id.optional(),
    containerId: id.optional(),
    sheet: z.string().min(1).max(200),
    headerRow: z.array(z.string().max(500)).min(1).max(500),
    mapping: z.array(sourceMappingEntry).min(1).max(500),
  })
  .refine((b) => (b.sandboxDocumentId === undefined) !== (b.containerId === undefined), {
    message: 'a source points at exactly one of a sandbox document or a library record',
  });
export type AttachTableSourceBody = z.infer<typeof attachTableSourceBody>;

/** A spreadsheet the builder could point a table at — one they can open. */
export type SourceDocumentOption = {
  kind: 'sandbox' | 'library';
  /** the sandbox document's id, or the library record's (container) id */
  id: Id;
  title: string;
  /** the version the document is at now: `v0.3` for a sandbox document, the
   * issued revision (`P02`) for a library record */
  version: string;
};

/** `GET /apps/:appId/source-documents` — builders only. */
export type ListSourceDocumentsResponse = { items: SourceDocumentOption[] };

/**
 * A table-shaped region Infora found in a spreadsheet: a header row of at least
 * two headings with the rows beneath it, ending at the first blank row. **Never
 * loose cells** — the reliable unit of selection is a block with a header row,
 * which is the Power BI lesson ADR-0059 is built on.
 */
export type SourceRegion = {
  sheet: string;
  /** the header row's number as Excel shows it (1-based) */
  headerRowNumber: number;
  headers: string[];
  /** how many rows sit under the headers today */
  rowCount: number;
  /** the first few rows, as text, so the builder can tell regions apart */
  sample: string[][];
};

/** `GET /apps/:appId/source-documents/regions?sandboxDocumentId=…|containerId=…` */
export type ListSourceRegionsResponse = { regions: SourceRegion[] };

/** The last import's receipt — what the panel shows beside refresh-now. */
export type SourceImportReceipt = {
  at: string;
  succeeded: boolean;
  /** a sentence a person reads: what came in, or why nothing did */
  outcome: string;
};

/** A table's source, as its builders see it. */
export type AppTableSourceRecord = {
  id: Id;
  appTableId: Id;
  document: {
    kind: 'sandbox' | 'library';
    id: Id;
    /** null when THIS builder can no longer open the document — the source
     * keeps feeding (decision 4), but its title is not shown to someone who
     * may not read it */
    title: string | null;
    /** the version the document is at now; null when this builder cannot open it */
    currentVersion: string | null;
  };
  sheet: string;
  headerRow: string[];
  mapping: SourceMappingEntry[];
  configuredByName: string;
  configuredAt: string;
  /** which version of the document the table's rows reflect — moves only on a
   * successful import */
  reflectsVersion: string | null;
  lastImport: SourceImportReceipt | null;
  detachedAt: string | null;
  /** may this builder change the region or mapping? Only while they can still
   * open the document (decision 4) */
  mayReconfigure: boolean;
};

/** `GET /app-tables/:appTableId/source`, and every source act's answer. */
export type AppTableSourceResponse = { source: AppTableSourceRecord | null };
