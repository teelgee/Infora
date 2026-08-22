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
  Resolution,
  Run,
  StepType,
  Suggestion,
  Surface,
} from './shared';
import type { LensSummary } from './lens';
import type { Locator } from './assembly';
import type { ApiError } from './errors';

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
//       the T-122 conversion). Durable prior-blob retention is deferred to P2.

export type SandboxDocument = {
  id: Id;
  projectId: Id;
  organisationId: Id;
  title: string;
  // canonical format follows origin (ADR-0034, T-116)
  origin: 'authored' | 'uploaded';
  kind: 'text' | 'slides';
  format: 'infora_text' | 'docx' | 'xlsx' | 'pptx';
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
  title: string | null; // the deliverable title (work-item), when planned
  revision: string; // the current version reference (e.g. C01, P02)
  suitability: string | null; // ISO suitability code carried on the container metadata
  discipline: string | null; // discipline code carried on the container metadata
  producerName: string; // the producing organisation
  issuedAt: string; // ISO timestamp of the current version
  state: 'live';
};
export type GetLibraryResponse = { items: LibraryItem[] };

// GET /versions/:versionId — the cited source, readable (T-094, 2026-07-09):
// a citation chip opens the version it names. Scoped exactly like the
// library (the version's project, through the wall predicate); superseded
// and withdrawn versions stay readable here — a citation in the immutable
// record must remain resolvable — with their state carried for the surface
// to badge. Never grounding: retrieval's pre-filters are untouched.
export type GetVersionResponse = {
  versionId: Id;
  documentReference: string;
  versionReference: string;
  content: string;
  // rejected: the cycle closed-rejected and the deliverable stands as a
  // record, never grounding (ADR-0032/0013, T-114)
  containerState: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  isCurrent: boolean;
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

export type OrgUser = { userId: Id; name: string; email: string; orgRole: 'admin' | 'member' };
export type ListOrgUsersResponse = { items: OrgUser[] };

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

export type PlanRow = {
  containerId: Id;
  // null for a sandbox-scope (freeze-series) container — the org-private
  // internal QA series carries no coded reference and no plan row (ADR-0032);
  // T-355's qa-row read serves those through the same shape
  documentReference: string | null;
  producingOrganisationId: Id;
  producingOrganisationName: string;
  metadata: Record<string, unknown>;
  state: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  workItem: { id: Id; title: string; status: string } | null; // null = owner-added reference material
  currentVersion: { versionId: Id; versionReference: string; createdAt: string } | null;
  deliverableCode: { code: string; description: string } | null; // latest round verdict — derived
  // the document owner (single, informational, amendable — T-189); null if unset
  documentOwner: { participantId: Id; name: string } | null;
  // why the deliverable was removed from the plan (state = withdrawn), if so
  withdrawnReason: string | null;
  authors: AppointmentGrant[];
  reviewers: ReviewerGrant[];
  // live owner-granted shares (ADR-0016 as data, T-119); [] for non-owner readers
  sharedWith: Array<{ organisationId: Id; organisationName: string }>;
};
// planColumns is the requester organisation's org-standard extra column set
// (T-360, S3): schema field keys, fixed by that org's super user for everyone
// in the organisation — locked, no personal overrides; null = the default set
// (an empty selection is normalised to null, never stored as []).
export type GetPlanResponse = { items: PlanRow[]; planColumns: string[] | null };

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
  kind: 'review' | 'non_review';
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
  sortOrder: number;
  retiredAt: string | null;
};
export type ListAcceptanceCodesResponse = { items: AcceptanceCode[] };

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
export type GetNamingSchemeResponse = NamingScheme | null;

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
        label: 'Suitability code',
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

// Attached-source working set (ADR-0022 refined, T-154)
export type AttachedSource = {
  id: Id;
  conversationId: Id;
  kind: 'sandbox' | 'upload' | 'web';
  ref: string;
  label: string | null;
};
export type ListAttachedSourcesResponse = { items: AttachedSource[] };
export const pinAttachedSourceBody = z.object({
  kind: z.enum(['sandbox', 'upload', 'web']),
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
