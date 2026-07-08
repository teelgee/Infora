// Contracts §3 — external endpoints, by milestone. Request bodies are zod
// schemas so apps/api validates against the same source of truth the surfaces
// type against; responses are plain types. No scope-widening parameter exists
// (principle 2): every read is pre-filtered server-side from
// (environment, requester), and the requester is resolved, never supplied
// (principle 3).

import { z } from 'zod';
import type { Id, Resolution, Run, Surface } from './shared';

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
  assigneeParticipantId: Id | null;
};
export type ListWorkItemsResponse = { items: WorkItem[] };
export type GetWorkItemResponse = WorkItem & { runs: Run[] };

// ── Sandbox documents (M4 — the draft-location decision) ──────────────────
//
// POST  /projects/:projectId/sandbox-documents
// GET   /sandbox-documents/:id
// PATCH /sandbox-documents/:id
//       manual editing: no Suggestion, no Signal, no ceremony — by design

export type SandboxDocument = {
  id: Id;
  projectId: Id;
  organisationId: Id;
  title: string;
  content: string;
  updatedAt: string;
};

export const createSandboxDocumentBody = z.object({ title: z.string().min(1) });
export type CreateSandboxDocumentBody = z.infer<typeof createSandboxDocumentBody>;

export const patchSandboxDocumentBody = z.object({ content: z.string() });
export type PatchSandboxDocumentBody = z.infer<typeof patchSandboxDocumentBody>;

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

// ── Auth & session (M1, M6) ────────────────────────────────────────────────
//
// POST /auth/session — skeleton login for the seeded users (plan.md's recorded
// build-time decision: email + password, httpOnly cookie; T-021 implements —
// the cookie is the product, the response shape lands there).
// GET  /me
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
export type MeResponse = {
  userId: Id;
  name: string;
  organisationId: Id;
  organisationName: string;
  participants: Array<{
    projectId: Id;
    participantId: Id;
    projectName: string;
    ownerOrganisationName: string;
    membershipRole: 'owner' | 'member';
  }>;
};
