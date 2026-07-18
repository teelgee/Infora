// Contracts §3 — external endpoints, by milestone. Request bodies are zod
// schemas so apps/api validates against the same source of truth the surfaces
// type against; responses are plain types. No scope-widening parameter exists
// (principle 2): every read is pre-filtered server-side from
// (environment, requester), and the requester is resolved, never supplied
// (principle 3).

import { z } from 'zod';
import type { Id, Resolution, Run, Suggestion, Surface } from './shared';

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
});
export type CreateConversationBody = z.infer<typeof createConversationBody>;
export type CreateConversationResponse = { conversationId: Id }; // bound to the project environment for life (ADR-0025/0031)

export const createRunBody = z.object({
  request: z.string().min(1), // the Ask/draft turn
  sandboxDocumentId: id.optional(), // document targeted when drafting
});
export type CreateRunBody = z.infer<typeof createRunBody>;
export type CreateRunResponse = Run; // completed, with steps, suggestions and citations
// (v1 returns on completion; streaming is a later, additive change)

export type GetRunResponse = Run; // the immutable audit read (owner path, M5)
export type GetConversationResponse = { runs: Run[] };

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
  // the freeze's check-out lock (ADR-0032)
  headLocked: boolean;
  updatedAt: string;
};

export type ListSandboxDocumentsResponse = { items: SandboxDocument[] };
export type ListSuggestionsResponse = { items: Suggestion[] };

export const createSandboxDocumentBody = z.object({
  title: z.string().min(1),
  // the intended plan row (ADR-0032's link), own-org library containers only
  containerId: id.optional(),
});
export type CreateSandboxDocumentBody = z.infer<typeof createSandboxDocumentBody>;

export const patchSandboxDocumentBody = z.object({ content: z.string() });
export type PatchSandboxDocumentBody = z.infer<typeof patchSandboxDocumentBody>;

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
  grantedAt: string;
  revokedAt: string | null;
};
export type ReviewerGrant = AppointmentGrant & { confirmedAt: string | null }; // null = proposed, no access

export type PlanRow = {
  containerId: Id;
  documentReference: string;
  producingOrganisationId: Id;
  producingOrganisationName: string;
  metadata: Record<string, unknown>;
  state: 'live' | 'superseded' | 'withdrawn' | 'rejected';
  workItem: { id: Id; title: string; status: string } | null; // null = owner-added reference material
  currentVersion: { versionId: Id; versionReference: string; createdAt: string } | null;
  deliverableCode: { code: string; description: string } | null; // latest round verdict — derived
  authors: AppointmentGrant[];
  reviewers: ReviewerGrant[];
  // live owner-granted shares (ADR-0016 as data, T-119); [] for non-owner readers
  sharedWith: Array<{ organisationId: Id; organisationName: string }>;
};
export type GetPlanResponse = { items: PlanRow[] };

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
};
export type FreezeResult = { versionId: Id; versionReference: string; containerId: Id };

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
  state: 'open' | 'issued' | 'responded';
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
  rounds: Round[];
};
export type GetCycleResponse = ReviewCycle | null;

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

export const createReviewResponseBody = z
  .object({
    body: z.string().min(1),
    nextVersionId: id.optional(),
    nextVersionAnchor: commentAnchorSchema.optional(),
    noChangeReason: z.string().min(1).optional(),
  })
  .refine((b) => (b.nextVersionId ? !b.noChangeReason : !!b.noChangeReason), {
    message: 'exactly one of nextVersionId or noChangeReason', // ADR-0004
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
  createdBy: { participantId: Id; name: string };
  createdAt: string;
}; // content fetched by restore/preview, not listed
export type ListSandboxHistoryResponse = { items: SandboxDocumentVersion[] };

export const restoreSandboxVersionBody = z.object({ historyVersionId: id });
export type RestoreSandboxVersionBody = z.infer<typeof restoreSandboxVersionBody>;
