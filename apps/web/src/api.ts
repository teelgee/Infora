// The thin typed client (contracts principle 1): every call is a contracts
// shape; nothing is resolved locally. Identity rides the httpOnly cookie.
import type {
  ApiError,
  ConflictExclusionRecord,
  DeclareExclusionBody,
  DeclareExclusionResponse,
  ListConflictAttestationsResponse,
  ListConflictExclusionsResponse,
  ClassificationSchemeResponse,
  ContainerClassificationsResponse,
  ContainerRelationshipsResponse,
  DocumentRelationship,
  DocumentRelationshipType,
  CreateConversationResponse,
  CreateReviewCommentBody,
  CreateSandboxCommentBody,
  FreezeResult,
  IssueRoundResponse,
  LeadReviewerReplacement,
  ListAcceptanceCodesResponse,
  ListRenditionsResponse,
  PromotionPreflight,
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
  ListLensesResponse,
  ListRosterResponse,
  ListSandboxCommentsResponse,
  ListSandboxDocumentsResponse,
  ListSuggestionsResponse,
  ListWorkItemsResponse,
  MeResponse,
  PatchMeBody,
  PlanImportResult,
  PlanRow,
  ProposeFolderStructureResult,
  Resolution,
  ResolveSuggestionResponse,
  AppointmentGrant,
  ReviewerGrant,
  RosterEntry,
  Run,
  SandboxComment,
  SandboxDocument,
  GetNamingSchemeResponse,
  GetReviewPeriodResponse,
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
  ListContainerTransmittalsResponse,
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

// A binary GET — fetched (never navigated: browser navigations carry
// Accept: text/html and the dev proxy hands those the SPA shell, T-358), then
// saved through a transient object-URL anchor.
async function downloadFile(path: string): Promise<void> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestError(res.status, body);
  }
  const filename =
    res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'download';
  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  // T-249 — carrying an answer into the editor is one server-side act, not a
  // create followed by a content PATCH: the server has to know the content
  // came from this run to check what the destination would widen (docs/build/plan.md — Slice Ask Wave 0
  // R2). A destination broader than the answer's sources answers 403.
  openRunInEditor: (runId: string, sandboxId?: string) =>
    request<SandboxDocument>(`/runs/${runId}/sandbox-document`, {
      method: 'POST',
      body: JSON.stringify({ ...(sandboxId !== undefined && { sandboxId }) }),
    }),
  sandboxDocument: (id: string) => request<SandboxDocument>(`/sandbox-documents/${id}`),
  documentSuggestions: (id: string) =>
    request<ListSuggestionsResponse>(`/sandbox-documents/${id}/suggestions`),
  // T-112 — sandbox comments: working-draft threads, mutable like the sandbox
  participants: (projectId: string) =>
    request<ListRosterResponse>(`/projects/${projectId}/participants`),
  // T-118/T-119 — the deliverable plan (ADR-0008/0033)
  plan: (projectId: string) => request<GetPlanResponse>(`/projects/${projectId}/plan`),
  // T-360 — the org-standard plan columns (locked; null = default set)
  setPlanColumns: (projectId: string, columns: string[] | null) =>
    request<{ columns: string[] | null }>(`/projects/${projectId}/plan/columns`, {
      method: 'PUT',
      body: JSON.stringify({ columns }),
    }),
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
  // T-377 — name the lead reviewer, replacing the standing one in a single
  // transaction; never fired as a revoke-then-grant pair (see contracts)
  nameLeadReviewer: (containerId: string, participantId: string) =>
    request<LeadReviewerReplacement>(`/containers/${containerId}/lead-reviewer`, {
      method: 'POST',
      body: JSON.stringify({ participantId }),
    }),
  confirmReviewer: (grantId: string) =>
    request<ReviewerGrant>(`/reviewers/${grantId}/confirmation`, { method: 'POST' }),
  // T-372 (ADR-0033 addendum §2) — the appointee's own answer. Only ever their
  // own grant: there is no participant parameter because there is no override.
  acceptAppointment: (grantId: string) =>
    request<ReviewerGrant>(`/reviewers/${grantId}/acceptance`, { method: 'POST' }),
  declineAppointment: (grantId: string, reason: string) =>
    request<ReviewerGrant>(`/reviewers/${grantId}/declination`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  // T-364 — the structure builder's agent: propose a candidate tree from a
  // free-form ask. Proposes only; the deterministic endpoint still writes.
  proposeFolderStructure: (sandboxId: string, ask: string) =>
    request<ProposeFolderStructureResult>(`/sandboxes/${sandboxId}/folder-structure/proposal`, {
      method: 'POST',
      body: JSON.stringify({ ask }),
    }),
  // T-355 — the freeze container's row read (org-private internal QA)
  qaRow: (containerId: string) => request<PlanRow>(`/containers/${containerId}/qa-row`),
  // T-120–T-126 — promotion, the freeze and the round loop (ADR-0032)
  cycle: (containerId: string) => request<ReviewCycle | null>(`/containers/${containerId}/cycle`),
  acceptanceCodes: (projectId: string) =>
    request<ListAcceptanceCodesResponse>(`/projects/${projectId}/acceptance-codes`),
  // T-373 — what the promotion window states before the click, off the same
  // decision the act runs
  promotionPreflight: (documentId: string) =>
    request<PromotionPreflight>(`/sandbox-documents/${documentId}/promotion-preflight`),
  promoteDocument: (
    documentId: string,
    reviewPeriodDays?: number,
    // T-382 — the source version the caller was shown (null = the live head);
    // the POST refuses if the answer changed since. Omit to skip the check.
    expectedSourceVersionReference?: string | null,
  ) =>
    request<PromotionResult>(`/sandbox-documents/${documentId}/promotion`, {
      method: 'POST',
      body: JSON.stringify({
        ...(reviewPeriodDays !== undefined ? { reviewPeriodDays } : {}),
        ...(expectedSourceVersionReference !== undefined
          ? { expectedSourceVersionReference }
          : {}),
      }),
    }),
  freezeDocument: (documentId: string) =>
    request<FreezeResult>(`/sandbox-documents/${documentId}/freeze`, { method: 'POST' }),
  releaseDocument: (documentId: string, reason?: string) =>
    request<{ ok: true }>(`/sandbox-documents/${documentId}/release`, {
      method: 'POST',
      body: JSON.stringify(reason !== undefined ? { reason } : {}),
    }),
  // ADR-0051 (T-346) — the owner organisation acknowledges a submission,
  // opening the round for review
  acknowledgeRound: (roundId: string) =>
    request<ReviewCycle>(`/rounds/${roundId}/acknowledge`, { method: 'POST' }),
  // ADR-0052 (T-353) — the reviewer's own completion signal on an open round
  markReviewComplete: (roundId: string) =>
    request<ReviewCycle>(`/rounds/${roundId}/review-completion`, { method: 'POST' }),
  withdrawReviewComplete: (roundId: string) =>
    request<ReviewCycle>(`/rounds/${roundId}/review-completion`, { method: 'DELETE' }),
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
  // ADR-0004 — exactly one of the two: the revised passage that answers the
  // comment (the version id is stamped at promotion), or an explicit no-change
  respondToComment: (
    commentId: string,
    body: string,
    outcome: { changeQuote: string } | { noChangeReason: string },
  ) =>
    request<ReviewResponseRecord>(`/review-comments/${commentId}/response`, {
      method: 'POST',
      body: JSON.stringify(
        'changeQuote' in outcome
          ? { body, nextVersionAnchor: { quote: outcome.changeQuote } }
          : { body, noChangeReason: outcome.noChangeReason },
      ),
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
  // T-246 — the conflict register (ADR-0046). Org-private: these reads return
  // only the caller's OWN organisation's register, never another's.
  conflictExclusions: (includeWithdrawn = false) =>
    request<ListConflictExclusionsResponse>(
      `/organisation/conflict-exclusions${includeWithdrawn ? '?includeWithdrawn=true' : ''}`,
    ),
  declareExclusion: (body: DeclareExclusionBody) =>
    request<DeclareExclusionResponse>('/organisation/conflict-exclusions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  withdrawExclusion: (exclusionId: string) =>
    request<ConflictExclusionRecord>(`/conflict-exclusions/${exclusionId}/withdrawal`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  // The owner's view — carries no register data by construction (ADR-0046 §8)
  conflictAttestations: (projectId: string) =>
    request<ListConflictAttestationsResponse>(`/projects/${projectId}/conflict-attestations`),
  setAttestationRequired: (projectId: string, required: boolean) =>
    request<{ required: boolean }>(`/projects/${projectId}/conflict-attestation`, {
      method: 'PATCH',
      body: JSON.stringify({ required }),
    }),
  attestConflictPolicy: (projectId: string) =>
    request<{ attestedAt: string }>(`/projects/${projectId}/conflict-attestation`, {
      method: 'POST',
      body: JSON.stringify({}),
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
  // T-371 (ADR-0005 addendum) — the review period's project-level default, in
  // working days. Beside the schema, never inside it.
  reviewPeriod: (projectId: string) =>
    request<GetReviewPeriodResponse>(`/projects/${projectId}/review-period`),
  setReviewPeriod: (projectId: string, defaultDays: number) =>
    request<GetReviewPeriodResponse>(`/projects/${projectId}/review-period`, {
      method: 'PATCH',
      body: JSON.stringify({ defaultDays }),
    }),
  generateReference: (projectId: string, values: Record<string, string>) =>
    request<GenerateReferenceResponse>(`/projects/${projectId}/naming-scheme/references`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    }),
  // T-358 — the fillable plan template (S2): a fetch-then-save, never a
  // navigation (the dev proxy hands navigations the SPA shell)
  downloadPlanTemplate: (projectId: string) =>
    downloadFile(`/projects/${projectId}/naming-scheme/template`),
  // T-359 — the batch import off the template (S3): create-only, references
  // generated in file order, whole-file verdict
  importPlan: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm<PlanImportResult>(`/projects/${projectId}/plan/import`, form);
  },
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
  updateSandboxSettings: (sandboxId: string, body: { allowMemberFolderCreate?: boolean; planLocked?: boolean; promotionRequiresQa?: boolean }) =>
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
  // T-350 — the container's transmittal & acknowledgement history; the
  // three-way distribution cut arrives already applied by the server
  containerTransmittals: (containerId: string) =>
    request<ListContainerTransmittalsResponse>(`/containers/${containerId}/transmittals`),
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
    // T-283 — the Lens this turn is answered under. Sent per RUN, never held
    // on the conversation: an answer's Lens is a property of the answer, so
    // switching changes the next one and leaves history as it was produced.
    lensId?: string,
  ) =>
    request<Run>(`/conversations/${conversationId}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        request: requestText,
        ...(sandboxDocumentId !== undefined && { sandboxDocumentId }),
        ...(lensId !== undefined && { lensId }),
      }),
      ...(signal !== undefined && { signal }),
    }),

  // T-283 — the Lens picker's options. Deployment-wide, not project-scoped:
  // the same list for every requester, because a list that differed by who
  // asked would make a Lens a reach control.
  lenses: () => request<ListLensesResponse>('/lenses'),

  // T-241/T-243 — the project ontology (ADR-0045): classification vocabulary +
  // typed relationship edges.
  classificationScheme: (projectId: string) =>
    request<ClassificationSchemeResponse>(`/projects/${projectId}/classification-scheme`),
  containerClassifications: (containerId: string) =>
    request<ContainerClassificationsResponse>(`/containers/${containerId}/classifications`),
  setClassification: (containerId: string, facetId: string, termId: string) =>
    request<void>(`/containers/${containerId}/classifications`, {
      method: 'PUT',
      body: JSON.stringify({ facetId, termId }),
    }),
  containerRelationships: (containerId: string) =>
    request<ContainerRelationshipsResponse>(`/containers/${containerId}/relationships`),
  proposeRelationship: (containerId: string, toContainerId: string, type: DocumentRelationshipType) =>
    request<DocumentRelationship>(`/containers/${containerId}/relationships`, {
      method: 'POST',
      body: JSON.stringify({ toContainerId, type }),
    }),
  confirmRelationship: (relationshipId: string) =>
    request<DocumentRelationship>(`/relationships/${relationshipId}/confirmation`, { method: 'POST' }),
  retireRelationship: (relationshipId: string) =>
    request<DocumentRelationship>(`/relationships/${relationshipId}/retirement`, { method: 'POST' }),
};
