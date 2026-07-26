// The thin typed client (contracts principle 1): every call is a contracts
// shape; nothing is resolved locally. Identity rides the httpOnly cookie.
import type {
  ApiError,
  CreateConversationResponse,
  CreateReviewCommentBody,
  CreateSandboxCommentBody,
  FreezeResult,
  IssueRoundResponse,
  ListAcceptanceCodesResponse,
  ListRenditionsResponse,
  PromotionResult,
  ReviewComment,
  ReviewCycle,
  ReviewResponseRecord,
  Round,
  GetConversationResponse,
  GetHistoryResponse,
  GetLibraryResponse,
  GetPlanResponse,
  GetVersionResponse,
  GetWorkItemResponse,
  ListOrgUsersResponse,
  ListRosterResponse,
  ListSandboxCommentsResponse,
  ListSandboxDocumentsResponse,
  ListSuggestionsResponse,
  ListWorkItemsResponse,
  MeResponse,
  PatchMeBody,
  PlanRow,
  Resolution,
  ResolveSuggestionResponse,
  AppointmentGrant,
  ReviewerGrant,
  RosterEntry,
  Run,
  SandboxComment,
  SandboxDocument,
  GetNamingSchemeResponse,
  UpsertNamingSchemeBody,
  GenerateReferenceResponse,
  ListNamingProposalsResponse,
  ListSandboxesResponse,
  Sandbox,
  GetSandboxResponse,
  SandboxScopeGrantView,
  ListFoldersResponse,
  SandboxFolder,
  FolderStructureNode,
  CreateFolderStructureResult,
  ListAttachedSourcesResponse,
  AttachedSource,
  NonReviewTransmittal,
  Acknowledgement,
  ListPendingTransmittalsResponse,
  ListPresenceResponse,
} from '@infora/contracts';

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.error ?? `request failed (${status})`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestError(res.status, body);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// A multipart POST — the browser sets the multipart/form-data boundary itself,
// so (unlike request) we never declare a content type (T-122/T-220 uploads).
async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestError(res.status, body);
  }
  return (await res.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<void>('/auth/session', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/session', { method: 'DELETE' }), // T-111
  me: () => request<MeResponse>('/me'),
  patchMe: (body: PatchMeBody) =>
    request<MeResponse>('/me', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  workItems: (projectId: string) =>
    request<ListWorkItemsResponse>(`/projects/${projectId}/work-items`),
  workItem: (workItemId: string) => request<GetWorkItemResponse>(`/work-items/${workItemId}`),
  run: (runId: string) => request<Run>(`/runs/${runId}`),
  library: (projectId: string) => request<GetLibraryResponse>(`/projects/${projectId}/library`),
  version: (versionId: string) => request<GetVersionResponse>(`/versions/${versionId}`),
  sandboxDocuments: (projectId: string) =>
    request<ListSandboxDocumentsResponse>(`/projects/${projectId}/sandbox-documents`),
  createSandboxDocument: (projectId: string, title: string, sandboxId?: string, folderId?: string) =>
    request<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        ...(sandboxId !== undefined && { sandboxId }),
        ...(folderId !== undefined && { folderId }),
      }),
    }),
  sandboxDocument: (id: string) => request<SandboxDocument>(`/sandbox-documents/${id}`),
  documentSuggestions: (id: string) =>
    request<ListSuggestionsResponse>(`/sandbox-documents/${id}/suggestions`),
  // T-112 — sandbox comments: working-draft threads, mutable like the sandbox
  participants: (projectId: string) =>
    request<ListRosterResponse>(`/projects/${projectId}/participants`),
  // T-118/T-119 — the deliverable plan (ADR-0008/0033)
  plan: (projectId: string) => request<GetPlanResponse>(`/projects/${projectId}/plan`),
  createPlanRow: (
    projectId: string,
    documentReference: string,
    title: string,
    metadata?: Record<string, unknown>,
  ) =>
    request<PlanRow>(`/projects/${projectId}/plan`, {
      method: 'POST',
      body: JSON.stringify({ documentReference, title, ...(metadata !== undefined && { metadata }) }),
    }),
  setDocumentOwner: (containerId: string, participantId: string | null) =>
    request<PlanRow>(`/containers/${containerId}/document-owner`, {
      method: 'PATCH',
      body: JSON.stringify({ participantId }),
    }),
  setPlanTitle: (containerId: string, title: string) =>
    request<PlanRow>(`/containers/${containerId}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  withdrawDeliverable: (containerId: string, reason: string) =>
    request<PlanRow>(`/containers/${containerId}/withdrawal`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  restoreDeliverable: (containerId: string) =>
    request<PlanRow>(`/containers/${containerId}/restoration`, { method: 'POST' }),
  grantAuthor: (containerId: string, participantId: string, isLead: boolean) =>
    request<AppointmentGrant>(`/containers/${containerId}/authors`, {
      method: 'POST',
      body: JSON.stringify({ participantId, isLead }),
    }),
  revokeAuthor: (grantId: string) =>
    request<AppointmentGrant>(`/authors/${grantId}/revocation`, { method: 'POST' }),
  grantReviewer: (containerId: string, participantId: string, isLead: boolean) =>
    request<ReviewerGrant>(`/containers/${containerId}/reviewers`, {
      method: 'POST',
      body: JSON.stringify({ participantId, isLead }),
    }),
  revokeReviewer: (grantId: string) =>
    request<ReviewerGrant>(`/reviewers/${grantId}/revocation`, { method: 'POST' }),
  confirmReviewer: (grantId: string) =>
    request<ReviewerGrant>(`/reviewers/${grantId}/confirmation`, { method: 'POST' }),
  // T-120–T-126 — promotion, the freeze and the round loop (ADR-0032)
  cycle: (containerId: string) => request<ReviewCycle | null>(`/containers/${containerId}/cycle`),
  acceptanceCodes: (projectId: string) =>
    request<ListAcceptanceCodesResponse>(`/projects/${projectId}/acceptance-codes`),
  promoteDocument: (documentId: string) =>
    request<PromotionResult>(`/sandbox-documents/${documentId}/promotion`, { method: 'POST' }),
  freezeDocument: (documentId: string) =>
    request<FreezeResult>(`/sandbox-documents/${documentId}/freeze`, { method: 'POST' }),
  releaseDocument: (documentId: string, reason?: string) =>
    request<{ ok: true }>(`/sandbox-documents/${documentId}/release`, {
      method: 'POST',
      body: JSON.stringify(reason !== undefined ? { reason } : {}),
    }),
  addReviewComment: (roundId: string, body: CreateReviewCommentBody) =>
    request<ReviewComment>(`/rounds/${roundId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setDeliverableCode: (roundId: string, acceptanceCodeId: string) =>
    request<Round>(`/rounds/${roundId}/deliverable-code`, {
      method: 'POST',
      body: JSON.stringify({ acceptanceCodeId }),
    }),
  issueRound: (roundId: string) =>
    request<IssueRoundResponse>(`/rounds/${roundId}/issue`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  respondToComment: (commentId: string, body: string, noChangeReason: string) =>
    request<ReviewResponseRecord>(`/review-comments/${commentId}/response`, {
      method: 'POST',
      body: JSON.stringify({ body, noChangeReason }),
    }),
  closeRejected: (cycleId: string, reason: string) =>
    request<ReviewCycle>(`/cycles/${cycleId}/close-rejected`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  renditions: (versionId: string) =>
    request<ListRenditionsResponse>(`/versions/${versionId}/renditions`),
  // T-117 — access administration (ADR-0033): org admins staff their seat
  orgUsers: () => request<ListOrgUsersResponse>('/organisation/users'),
  enrolParticipant: (projectId: string, userId: string) =>
    request<RosterEntry>(`/projects/${projectId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  removeParticipant: (projectId: string, participantId: string) =>
    request<RosterEntry>(`/projects/${projectId}/participants/${participantId}`, {
      method: 'DELETE',
    }),
  documentComments: (id: string) =>
    request<ListSandboxCommentsResponse>(`/sandbox-documents/${id}/comments`),
  createComment: (documentId: string, body: CreateSandboxCommentBody) =>
    request<SandboxComment>(`/sandbox-documents/${documentId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patchComment: (commentId: string, body: string, mentions?: string[]) =>
    request<SandboxComment>(`/sandbox-comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body, ...(mentions !== undefined && { mentions }) }),
    }),
  deleteComment: (commentId: string) =>
    request<void>(`/sandbox-comments/${commentId}`, { method: 'DELETE' }),
  setCommentStatus: (commentId: string, status: 'open' | 'closed') =>
    request<SandboxComment>(`/sandbox-comments/${commentId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  patchSandboxDocument: (id: string, content: string) =>
    request<SandboxDocument>(`/sandbox-documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  // T-166 — metadata editors (ADR-0038)
  setSandboxMetadata: (id: string, authoringMetadata: Record<string, unknown>) =>
    request<SandboxDocument>(`/sandbox-documents/${id}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify({ authoringMetadata }),
    }),
  // T-220 — rename (unbound only) and replace the native file (uploaded only)
  renameSandboxDocument: (id: string, title: string) =>
    request<SandboxDocument>(`/sandbox-documents/${id}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  replaceSandboxFile: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm<SandboxDocument>(`/sandbox-documents/${id}/file`, form);
  },
  // T-122 upload path, wired to the surface: the native file is canonical
  // (origin 'uploaded'); it lands in the organisation's default sandbox.
  uploadSandboxFile: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm<SandboxDocument>(`/projects/${projectId}/sandbox-uploads`, form);
  },
  setContainerMetadata: (containerId: string, metadata: Record<string, unknown>) =>
    request<{ ok: true }>(`/containers/${containerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ metadata }),
    }),
  conversation: (conversationId: string) =>
    request<GetConversationResponse>(`/conversations/${conversationId}`),
  history: (projectId: string) => request<GetHistoryResponse>(`/projects/${projectId}/history`),
  createConversation: (projectId: string, workItemId?: string, sandboxDocumentId?: string) =>
    request<CreateConversationResponse>(`/projects/${projectId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({
        surface: 'web',
        ...(workItemId !== undefined && { workItemId }),
        ...(sandboxDocumentId !== undefined && { sandboxDocumentId }),
      }),
    }),

  // ── Slice A2 (T-152/153/154) ──────────────────────────────────────────────
  namingScheme: (projectId: string) =>
    request<GetNamingSchemeResponse>(`/projects/${projectId}/naming-scheme`),
  putNamingScheme: (projectId: string, body: UpsertNamingSchemeBody) =>
    request<{ ok: true }>(`/projects/${projectId}/naming-scheme`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  generateReference: (projectId: string, values: Record<string, string>) =>
    request<GenerateReferenceResponse>(`/projects/${projectId}/naming-scheme/references`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    }),
  namingProposals: (projectId: string) =>
    request<ListNamingProposalsResponse>(`/projects/${projectId}/naming-scheme/proposals`),
  proposeNaming: (projectId: string, body: string) =>
    request<{ id: string }>(`/projects/${projectId}/naming-scheme/proposals`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  resolveNamingProposal: (proposalId: string, status: 'accepted' | 'declined') =>
    request<{ ok: true }>(`/naming-proposals/${proposalId}/resolution`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  sandboxes: (projectId: string) =>
    request<ListSandboxesResponse>(`/projects/${projectId}/sandboxes`),
  createSandbox: (
    projectId: string,
    body: { name: string; scope: Sandbox['scope']; organisationIds?: string[]; participantIds?: string[] },
  ) =>
    request<Sandbox>(`/projects/${projectId}/sandboxes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  sandbox: (sandboxId: string) => request<GetSandboxResponse>(`/sandboxes/${sandboxId}`),
  updateSandboxSettings: (sandboxId: string, body: { allowMemberFolderCreate?: boolean }) =>
    request<Sandbox>(`/sandboxes/${sandboxId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  grantSandboxScope: (sandboxId: string, body: { organisationId?: string; participantId?: string }) =>
    request<SandboxScopeGrantView>(`/sandboxes/${sandboxId}/scope-grants`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeSandboxScope: (grantId: string) =>
    request<{ ok: true }>(`/sandbox-scope-grants/${grantId}/revocation`, { method: 'POST' }),
  folders: (sandboxId: string) => request<ListFoldersResponse>(`/sandboxes/${sandboxId}/folders`),
  createFolderStructure: (
    sandboxId: string,
    nodes: FolderStructureNode[],
    parentFolderId?: string | null,
  ) =>
    request<CreateFolderStructureResult>(`/sandboxes/${sandboxId}/folder-structure`, {
      method: 'POST',
      body: JSON.stringify({ nodes, ...(parentFolderId != null && { parentFolderId }) }),
    }),
  createFolder: (sandboxId: string, name: string, parentFolderId?: string) =>
    request<SandboxFolder>(`/sandboxes/${sandboxId}/folders`, {
      method: 'POST',
      body: JSON.stringify({ name, ...(parentFolderId !== undefined && { parentFolderId }) }),
    }),
  moveFolder: (folderId: string, parentFolderId: string | null) =>
    request<{ ok: true }>(`/folders/${folderId}/move`, {
      method: 'POST',
      body: JSON.stringify({ parentFolderId }),
    }),
  moveDocument: (documentId: string, folderId: string | null) =>
    request<{ ok: true }>(`/sandbox-documents/${documentId}/move`, {
      method: 'POST',
      body: JSON.stringify({ folderId }),
    }),
  bindDocument: (documentId: string, containerId: string) =>
    request<{ ok: true; containerId: string }>(`/sandbox-documents/${documentId}/binding`, {
      method: 'POST',
      body: JSON.stringify({ containerId }),
    }),
  // T-175 — document presence (ADR-0039 real-time, first cut)
  documentPresence: (documentId: string) =>
    request<ListPresenceResponse>(`/sandbox-documents/${documentId}/presence`),
  heartbeatPresence: (documentId: string) =>
    request<{ ok: true }>(`/sandbox-documents/${documentId}/presence`, { method: 'POST' }),
  attachedSources: (conversationId: string) =>
    request<ListAttachedSourcesResponse>(`/conversations/${conversationId}/attached-sources`),
  pinAttachedSource: (
    conversationId: string,
    body: { kind: AttachedSource['kind']; ref: string; label?: string },
  ) =>
    request<AttachedSource>(`/conversations/${conversationId}/attached-sources`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  unpinAttachedSource: (sourceId: string) =>
    request<{ ok: true }>(`/attached-sources/${sourceId}/unpin`, { method: 'POST' }),
  // T-161 — non-review transmittal + the acknowledgement gate (ADR-0035)
  issueTransmittal: (containerId: string, organisationIds: string[], purposeCode?: string) =>
    request<NonReviewTransmittal>(`/containers/${containerId}/transmittals`, {
      method: 'POST',
      body: JSON.stringify({ organisationIds, ...(purposeCode !== undefined && { purposeCode }) }),
    }),
  acknowledgeDeliverable: (containerId: string) =>
    request<Acknowledgement>(`/containers/${containerId}/acknowledgement`, { method: 'POST' }),
  pendingTransmittals: (projectId: string) =>
    request<ListPendingTransmittalsResponse>(`/projects/${projectId}/pending-transmittals`),
  resolveSuggestion: (suggestionId: string, resolution: Resolution, editedContent?: string) =>
    request<ResolveSuggestionResponse>(`/suggestions/${suggestionId}/resolution`, {
      method: 'POST',
      body: JSON.stringify({ resolution, ...(editedContent !== undefined && { editedContent }) }),
    }),
  createRun: (
    conversationId: string,
    requestText: string,
    sandboxDocumentId?: string,
    signal?: AbortSignal, // cancels the wait, not the run (T-097; tracker)
  ) =>
    request<Run>(`/conversations/${conversationId}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        request: requestText,
        ...(sandboxDocumentId !== undefined && { sandboxDocumentId }),
      }),
      ...(signal !== undefined && { signal }),
    }),
};
