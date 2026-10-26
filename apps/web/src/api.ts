// The thin typed client (contracts principle 1): every call is a contracts
// shape; nothing is resolved locally. Identity rides the httpOnly cookie.
import type {
  GetPlanCoverageResponse,
  MilestoneInput,
  GetWorkQueueResponse,
  ListContainerStateChangesResponse,
  AiFeatureKey,
  AiTransparencyResponse,
  SetAiFeatureBody,
  BulkClassifyBody,
  BulkClassifyResponse,
  BulkIssueExternallyBody,
  BulkIssueExternallyResponse,
  BulkSupersedeBody,
  BulkSupersedeResponse,
  BulkTransmitBody,
  BulkTransmitResponse,
  ApiError,
  AppRecord,
  AppRowResponse,
  AppRunResponse,
  AppTableRecord,
  AppTableSourceResponse,
  AttachTableSourceBody,
  CreateAppBody,
  DeclareAppTableBody,
  DecideAppRowBody,
  EnterAppRowBody,
  ListSourceDocumentsResponse,
  ListSourceRegionsResponse,
  SourceDocumentRef,
  GetAppResponse,
  GrantAppScopeBody,
  ListAppRowsResponse,
  ListAppExportsResponse,
  ListPlaybooksResponse,
  PlaybookResponse,
  SaveAppAsPlaybookBody,
  DeployPlaybookBody,
  ListAppRunsResponse,
  ListAppsResponse,
  PatchAppDefinitionBody,
  WriteAppScreenBody,
  BuildConversationResponse,
  SayToBuilderBody,
  SayToBuilderResponse,
  WriteAppScreenResponse,
  ConflictExclusionRecord,
  DeclareExclusionBody,
  DeclareExclusionResponse,
  ListConflictAttestationsResponse,
  ListConflictExclusionsResponse,
  BulkConfirmIntakeBody,
  BulkConfirmIntakeResponse,
  ClassificationSchemeResponse,
  ConfirmIntakeBody,
  ConfirmIntakeResult,
  GetLibraryAdmissionResponse,
  GetContainerCurrencyResponse,
  ConfirmCurrentResponse,
  GetRecheckDefaultsResponse,
  PatchRecheckDefaultsBody,
  IndexIntakeResponse,
  ListReferenceIntakeResponse,
  ReferenceIntakeQuery,
  UploadReferenceIntakeResponse,
  ContainerClassificationsResponse,
  ContainerRelationshipsResponse,
  DocumentRelationship,
  DocumentRelationshipType,
  CreateConversationResponse,
  CreateReviewCommentBody,
  CreateSandboxCommentBody,
  FreezeResult,
  InternalReviewResult,
  RequestInternalReviewBody,
  IssueRoundResponse,
  LeadReviewerReplacement,
  ListAcceptanceCodesResponse,
  CreateAcceptanceCodeBody,
  UpdateAcceptanceCodeBody,
  ListRenditionsResponse,
  AnswerExternalRequestBody,
  ExternalDocumentResponse,
  ExternalIssue,
  GetExternalIssueSettingsResponse,
  IssueExternallyBody,
  ListExternalIssuesResponse,
  SetExternalIssueSettingsBody,
  PromotionPreflight,
  PromotionResult,
  ReviewComment,
  ReviewCycle,
  ReviewResponseRecord,
  Round,
  GetConversationResponse,
  GetHistoryResponse,
  DestinationCheckResponse,
  EditingSession,
  ListSandboxHistoryResponse,
  DocumentCreationBody,
  DocumentCreationPlanResponse,
  DocumentCreationRunResponse,
  GetGroundingScopeResponse,
  ScopePreviewResponse,
  Scope,
  ListStartingOutlinesResponse,
  SaveStartingOutlineBody,
  StartingOutline,
  ReviseSectionBriefBody,
  ReviseSectionBriefResult,
  ListStyleGuidesResponse,
  ListToolsResponse,
  GetLibraryResponse,
  GetReaderDocumentResponse,
  GetPlanResponse,
  GetRunPlanResponse,
  GetPassageResponse,
  GetVersionResponse,
  GetWorkItemResponse,
  ListOrgUsersResponse,
  ListLensesResponse,
  ListNotificationsResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  ListRosterResponse,
  ListRulebooksResponse,
  ExtractRulesBody,
  ExtractRulesResponse,
  GetRuleSetResponse,
  ListRuleProposalsResponse,
  ProposeRuleBody,
  RuleProposal,
  SaveRuleSetBody,
  StyleGuideRecord,
  ListFindingsResponse,
  QaCheckBody,
  QaCheckPlanResponse,
  QaCheckRunResponse,
  ListSandboxCommentsResponse,
  ResolveFindingsResponse,
  GetWorkingAreaResponse,
  ListSandboxDocumentsResponse,
  ListSuggestionsResponse,
  ListWorkItemsResponse,
  MeResponse,
  PatchMeBody,
  PatchReviewCommentBody,
  PlanImportResult,
  SchemaImportResponse,
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
  GetExportAuthorshipAppendixResponse,
  DocumentProvenanceResponse,
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
  GetSandboxActivityResponse,
  ListPresenceResponse,
  DeliverableShare,
  ParticipantGrant,
  ListParticipantGrantsResponse,
  PurgeRequestBody,
  PurgeResponse,
  ListPurgesResponse,
  LibraryRemovalBody,
  LibraryRemovalResponse,
  RulebookRecord,
  GetLibrarySearchResponse,
  LibrarySearchQuery,
  PlanQuery,
  CreateSavedViewBody,
  ListSavedViewsResponse,
  SavedView,
  SavedViewRegister,
  ContainerCitedByResponse,
  ContainerImpactResponse,
  StaleGroundingResponse,
} from '@infora/contracts';

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.error ?? `request failed (${status})`);
  }
}

// T-459 — a query string from a partial query object; undefined values are left out
function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
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
  const filename = dispositionFilename(res.headers.get('content-disposition'));
  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** T-488 — the file name a response asks for: the RFC 5987 `filename*` (the real
 * name, any characters) first, else the plain `filename`, else "download". */
export function dispositionFilename(header: string | null): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // fall through to the plain name
    }
  }
  return header?.match(/filename="([^"]+)"/)?.[1] ?? 'download';
}

// T-444 — a binary POST. An export is an ACT before it is a file: it records
// an `app_exports` row and stores the blob, then hands the bytes back in the
// same response. Fetched rather than navigated, for `downloadFile`'s reason.
async function downloadPost(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestError(res.status, problem);
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

// T-399 — the check request, as multipart: the same JSON body in one field and
// the files beside it. One body shape either way, because a second one would be
// a second answer to what a check request is.
function checkForm(body: QaCheckBody, uploads: readonly File[]): FormData {
  const form = new FormData();
  form.append('body', JSON.stringify(body));
  for (const file of uploads) form.append('file', file);
  return form;
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
  // T-329/T-331 — the two scopes are different on purpose (ADR-0049 §6b): the
  // rail's is the user's OWN across every project they can reach, the panel's
  // is one project's. Without the split a mention on a second project would be
  // silently invisible, because the rail sits beneath a project switcher and
  // would otherwise inherit its scope.
  notifications: () => request<ListNotificationsResponse>('/notifications'),
  projectNotifications: (projectId: string) =>
    request<ListNotificationsResponse>(`/projects/${projectId}/notifications`),
  markNotificationRead: (id: string) =>
    request<MarkNotificationReadResponse>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: (projectId?: string) =>
    request<MarkAllNotificationsReadResponse>(
      projectId === undefined
        ? '/notifications/read-all'
        : `/projects/${projectId}/notifications/read-all`,
      { method: 'POST' },
    ),
  workItem: (workItemId: string) => request<GetWorkItemResponse>(`/work-items/${workItemId}`),
  run: (runId: string) => request<Run>(`/runs/${runId}`),
  library: (projectId: string) => request<GetLibraryResponse>(`/projects/${projectId}/library`),
  // T-483 — the document page for a reader who is not on the plan row
  readerDocument: (containerId: string) =>
    request<GetReaderDocumentResponse>(`/containers/${containerId}/reader`),

  // T-292 — what the composer's Data sources and Context chips read. NOT the
  // library list: membership is necessary and no longer sufficient, and the
  // server computes this off the same pre-filter retrieval grounds on.
  //
  // T-486 — the Documents group is searched on the server and shows the first 50
  // matches: `q` narrows it, and the answer says how many matched and how many
  // the whole scope holds.
  groundingScope: (projectId: string, q?: string, signal?: AbortSignal) =>
    request<GetGroundingScopeResponse>(
      `/projects/${projectId}/grounding-scope${q !== undefined && q.trim() !== '' ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
      signal !== undefined ? { signal } : undefined,
    ),
  // T-470 — what a scope would reach, counted by the server under the wall; runs
  // no search and spends nothing
  scopePreview: (projectId: string, scope: Scope | undefined, signal?: AbortSignal) =>
    request<ScopePreviewResponse>(`/projects/${projectId}/scope-preview`, {
      method: 'POST',
      body: JSON.stringify(scope === undefined ? {} : { scope }),
      ...(signal !== undefined && { signal }),
    }),
  // T-334/T-335 — the Tools section, and the document creator's two calls. The
  // plan and the run take the SAME body: they are one request seen twice, which
  // is what stops the preview and the act disagreeing.
  tools: (projectId: string) => request<ListToolsResponse>(`/projects/${projectId}/tools`),
  documentCreationPlan: (projectId: string, body: DocumentCreationBody) =>
    request<DocumentCreationPlanResponse>(`/projects/${projectId}/tools/document-creation/plan`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  documentCreationRun: (projectId: string, body: DocumentCreationBody) =>
    request<DocumentCreationRunResponse>(`/projects/${projectId}/tools/document-creation/runs`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  version: (versionId: string) => request<GetVersionResponse>(`/versions/${versionId}`),
  // T-468 — the passage a citation recorded, read by id (never a search)
  passage: (versionId: string, chunkId: string) =>
    request<GetPassageResponse>(`/versions/${versionId}/passages/${chunkId}`),
  sandboxDocuments: (projectId: string) =>
    request<ListSandboxDocumentsResponse>(`/projects/${projectId}/sandbox-documents`),
  // T-471 — the documents this person may pin: every live document in a working
  // area they are in, searched by title on the server, 50 at a time
  workingArea: (projectId: string, q: string, page = 1, signal?: AbortSignal) =>
    request<GetWorkingAreaResponse>(
      `/projects/${projectId}/working-area?${new URLSearchParams({ ...(q.trim() !== '' && { q: q.trim() }), page: String(page) })}`,
      signal === undefined ? undefined : { signal },
    ),
  // T-456 — the bin (T-128's recycle view) and its two acts, reachable at last
  deletedSandboxDocuments: (projectId: string) =>
    request<ListSandboxDocumentsResponse>(`/projects/${projectId}/sandbox-documents?deleted=1`),
  deleteSandboxDocument: (id: string) =>
    request<SandboxDocument>(`/sandbox-documents/${id}`, { method: 'DELETE' }),
  undeleteSandboxDocument: (id: string) =>
    request<SandboxDocument>(`/sandbox-documents/${id}/undelete`, { method: 'POST' }),
  restoreSandboxVersion: (id: string, historyVersionId: string) =>
    request<SandboxDocument>(`/sandbox-documents/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ historyVersionId }),
    }),
  // T-456 — erasure (ADR-0050 §§5–7): the typed confirmation is checked
  // server-side; the client only carries what the person typed
  purgeSandboxDocument: (projectId: string, body: PurgeRequestBody) =>
    request<PurgeResponse>(`/projects/${projectId}/purges`, { method: 'POST', body: JSON.stringify(body) }),
  purges: (projectId: string) => request<ListPurgesResponse>(`/projects/${projectId}/purges`),
  removeLibraryContainer: (projectId: string, body: LibraryRemovalBody) =>
    request<LibraryRemovalResponse>(`/projects/${projectId}/library-removals`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
  openRunInEditor: (runId: string, sandboxId?: string, overrideReason?: string) =>
    request<SandboxDocument>(`/runs/${runId}/sandbox-document`, {
      method: 'POST',
      body: JSON.stringify({
        ...(sandboxId !== undefined && { sandboxId }),
        // T-295 — the explicit override the block-by-default rule requires. A
        // reason is mandatory and is recorded on the run and in the audit
        // trail; the surface never sends one the user did not type.
        ...(overrideReason !== undefined && { override: { reason: overrideReason } }),
      }),
    }),
  // T-295 — what the destination selector shows BEFORE the click. The server
  // runs the same propagation check the write runs, so this previews the
  // refusal rather than making a second judgement about it.
  destinationCheck: (runId: string, sandboxId: string) =>
    request<DestinationCheckResponse>(
      `/runs/${runId}/destination-check?sandboxId=${encodeURIComponent(sandboxId)}`,
    ),
  // T-293 — the plan a run performed, read back for the progress rail. The
  // rail shows what ACTUALLY ran, so it is fetched after the run reports and
  // never guessed at while one is in flight.
  runPlan: (runId: string) => request<GetRunPlanResponse>(`/runs/${runId}/plan`),
  sandboxDocument: (id: string) => request<SandboxDocument>(`/sandbox-documents/${id}`),
  // T-454 — the browser editor: a pass for the engine (one file, this sign-in),
  // and the working revisions a save lands as
  editingSession: (id: string) =>
    request<EditingSession>(`/sandbox-documents/${id}/editing-session`, { method: 'POST' }),
  sandboxDocumentHistory: (id: string) =>
    request<ListSandboxHistoryResponse>(`/sandbox-documents/${id}/history`),
  documentSuggestions: (id: string) =>
    request<ListSuggestionsResponse>(`/sandbox-documents/${id}/suggestions`),
  // T-112 — sandbox comments: working-draft threads, mutable like the sandbox
  participants: (projectId: string) =>
    request<ListRosterResponse>(`/projects/${projectId}/participants`),
  // T-118/T-119 — the deliverable plan (ADR-0008/0033)
  plan: (projectId: string) => request<GetPlanResponse>(`/projects/${projectId}/plan`),
  // T-460 — saved views: a named filter over a register, never an access object
  savedViews: (projectId: string, register: SavedViewRegister) =>
    request<ListSavedViewsResponse>(`/projects/${projectId}/saved-views?register=${register}`),
  createSavedView: (projectId: string, body: CreateSavedViewBody) =>
    request<SavedView>(`/projects/${projectId}/saved-views`, { method: 'POST', body: JSON.stringify(body) }),
  deleteSavedView: (viewId: string) => request<void>(`/saved-views/${viewId}`, { method: 'DELETE' }),
  // T-459 — the register's paged and searched reads
  planPage: (projectId: string, query: Partial<PlanQuery>) =>
    request<GetPlanResponse>(`/projects/${projectId}/plan?${queryString(query)}`),
  // T-481 — the coverage view, and a row's milestones (set as a whole)
  planCoverage: (projectId: string) => request<GetPlanCoverageResponse>(`/projects/${projectId}/plan/coverage`),
  setMilestones: (containerId: string, milestones: MilestoneInput[]) =>
    request<PlanRow>(`/containers/${containerId}/milestones`, {
      method: 'PUT',
      body: JSON.stringify({ milestones }),
    }),
  librarySearch: (projectId: string, query: Partial<LibrarySearchQuery>) =>
    request<GetLibrarySearchResponse>(`/projects/${projectId}/library/search?${queryString(query)}`),
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
  // T-467 — the home's one aggregating read
  workQueue: (projectId: string) => request<GetWorkQueueResponse>(`/projects/${projectId}/work-queue`),
  // T-465 — the document's own record of state changes
  containerStateChanges: (containerId: string) =>
    request<ListContainerStateChangesResponse>(`/containers/${containerId}/state-changes`),
  restoreDeliverable: (containerId: string) =>
    request<PlanRow>(`/containers/${containerId}/restoration`, { method: 'POST' }),
  // T-389 — the owner's answer to a producing organisation's proposed
  // withdrawal of a published deliverable (T-384, ADR-0013 §2)
  resolveWithdrawalProposal: (containerId: string, accept: boolean) =>
    request<PlanRow>(`/containers/${containerId}/withdrawal-proposal/resolution`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    }),
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
  // T-456 — the owner's share (ADR-0016) and the receiving organisation's
  // narrowing (ADR-0035 §3), both reachable from the plan row at last
  shareDeliverable: (containerId: string, organisationId: string) =>
    request<DeliverableShare>(`/containers/${containerId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ organisationId }),
    }),
  revokeShare: (shareId: string) =>
    request<DeliverableShare>(`/shares/${shareId}/revocation`, { method: 'POST' }),
  participantGrants: (containerId: string) =>
    request<ListParticipantGrantsResponse>(`/containers/${containerId}/participant-grants`),
  grantParticipant: (containerId: string, participantId: string) =>
    request<ParticipantGrant>(`/containers/${containerId}/participant-grants`, {
      method: 'POST',
      body: JSON.stringify({ participantId }),
    }),
  revokeParticipantGrant: (grantId: string) =>
    request<ParticipantGrant>(`/participant-grants/${grantId}/revocation`, { method: 'POST' }),
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
  // T-390 — the scheme's write path, which did not exist. Every write carries a
  // reason: the change is audited like a rails change (ADR-0003/0030), because
  // it alters what the AI may rely on across a whole project.
  createAcceptanceCode: (projectId: string, body: CreateAcceptanceCodeBody) =>
    request<ListAcceptanceCodesResponse>(`/projects/${projectId}/acceptance-codes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAcceptanceCode: (codeId: string, body: UpdateAcceptanceCodeBody) =>
    request<ListAcceptanceCodesResponse>(`/acceptance-codes/${codeId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
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
    // T-332 (ADR-0049 §8) — force it past open threads/findings. Elevated only,
    // and audited. Sent only when the person actually asked: the flag is the
    // act, not a property of holding the tier.
    overrideOpenItems?: boolean,
  ) =>
    request<PromotionResult>(`/sandbox-documents/${documentId}/promotion`, {
      method: 'POST',
      body: JSON.stringify({
        ...(reviewPeriodDays !== undefined ? { reviewPeriodDays } : {}),
        ...(expectedSourceVersionReference !== undefined
          ? { expectedSourceVersionReference }
          : {}),
        ...(overrideOpenItems === true ? { overrideOpenItems } : {}),
      }),
    }),
  freezeDocument: (documentId: string) =>
    request<FreezeResult>(`/sandbox-documents/${documentId}/freeze`, { method: 'POST' }),
  // T-478 — freeze + name the QA reviewer + a note, one act
  requestInternalReview: (documentId: string, body: RequestInternalReviewBody) =>
    request<InternalReviewResult>(`/sandbox-documents/${documentId}/internal-review`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
  // T-356 — ADR-0007's "moderate in the open": the lead reviewer edits or
  // amends a reviewer's comment and its code within the OPEN round. The
  // endpoint has existed since Slice A with no client method and no control
  // anywhere; this is the missing half. There is deliberately no delete — the
  // record is amended in the open, never quietly emptied, and once the round
  // is issued the snapshot is frozen (ADR-0009) and the server refuses.
  patchReviewComment: (commentId: string, body: PatchReviewCommentBody) =>
    request<ReviewComment>(`/review-comments/${commentId}`, {
      method: 'PATCH',
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
  // T-311 — the marked-up edit. ONE read behind both views (the marks in the
  // text and the grouped-by-check panel): a second read would be a second
  // answer to "what did the checker find", and the two would eventually
  // disagree about which marks exist.
  // T-474 — computed now, never stored
  // T-475 — who wrote each paragraph, worked out now from the record
  provenance: (sandboxDocumentId: string) =>
    request<DocumentProvenanceResponse>(`/sandbox-documents/${sandboxDocumentId}/provenance`),
  staleGrounding: (sandboxDocumentId: string) =>
    request<StaleGroundingResponse>(`/sandbox-documents/${sandboxDocumentId}/stale-grounding`),
  findings: (sandboxDocumentId: string) =>
    request<ListFindingsResponse>(`/sandbox-documents/${sandboxDocumentId}/findings`),
  resolveFinding: (
    sandboxDocumentId: string,
    findingId: string,
    resolution: 'accepted' | 'edited' | 'dismissed',
    editedContent?: string,
  ) =>
    request<ResolveFindingsResponse>(
      `/sandbox-documents/${sandboxDocumentId}/findings/${findingId}/resolution`,
      {
        method: 'POST',
        body: JSON.stringify({
          resolution,
          ...(editedContent !== undefined && { editedContent }),
        }),
      },
    ),
  /** 🔒 `accept` is refused server-side unless EVERY id is a mechanical fix. */
  bulkResolveFindings: (
    sandboxDocumentId: string,
    action: 'accept' | 'dismiss',
    findingIds: string[],
  ) =>
    request<ResolveFindingsResponse>(`/sandbox-documents/${sandboxDocumentId}/findings/bulk`, {
      method: 'POST',
      body: JSON.stringify({ action, findingIds }),
    }),
  // T-336 — the QA checker as a tool. TWO endpoints and ONE planner behind
  // them: a preflight computed separately from the act it previews is a
  // preflight that will eventually lie (T-309's rule, one tool along).
  //
  // T-399 — a file may ride either call. It goes multipart ONLY when there is a
  // file, so the ordinary check request stays the JSON one it has always been;
  // and it rides BOTH calls because the plan has to be computed over the same
  // attachment the run will read, or the preflight would understate the
  // coverage of the thing it is previewing.
  qaCheckPlan: (projectId: string, body: QaCheckBody, uploads: readonly File[] = []) =>
    uploads.length > 0
      ? requestForm<QaCheckPlanResponse>(
          `/projects/${projectId}/tools/qa-check/plan`,
          checkForm(body, uploads),
        )
      : request<QaCheckPlanResponse>(`/projects/${projectId}/tools/qa-check/plan`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
  qaCheckRun: (projectId: string, body: QaCheckBody, uploads: readonly File[] = []) =>
    uploads.length > 0
      ? requestForm<QaCheckRunResponse>(
          `/projects/${projectId}/tools/qa-check/runs`,
          checkForm(body, uploads),
        )
      : request<QaCheckRunResponse>(`/projects/${projectId}/tools/qa-check/runs`, {
          method: 'POST',
          body: JSON.stringify(body),
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
  // T-477 — `where` is the sandbox and folder the person was standing in; absent, the default sandbox
  uploadSandboxFile: (projectId: string, file: File, where?: { sandboxId?: string; folderId?: string | null }) => {
    const form = new FormData();
    form.append('file', file);
    if (where?.sandboxId) form.append('sandboxId', where.sandboxId);
    if (where?.folderId) form.append('folderId', where.folderId);
    return requestForm<SandboxDocument>(`/projects/${projectId}/sandbox-uploads`, form);
  },
  // T-472 — reference-material intake. One file per request: the screen's
  // progress count is fed by each request's own answer.
  uploadReferenceFile: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm<UploadReferenceIntakeResponse>(`/projects/${projectId}/reference-intake`, form);
  },
  referenceIntake: (projectId: string, query: ReferenceIntakeQuery = {}) =>
    request<ListReferenceIntakeResponse>(`/projects/${projectId}/reference-intake?${queryString(query)}`),
  confirmIntake: (projectId: string, id: string, body: ConfirmIntakeBody) =>
    request<Extract<ConfirmIntakeResult, { ok: true }>>(`/projects/${projectId}/reference-intake/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  confirmIntakeBulk: (projectId: string, body: BulkConfirmIntakeBody) =>
    request<BulkConfirmIntakeResponse>(`/projects/${projectId}/reference-intake/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rejectIntake: (projectId: string, id: string) =>
    request<{ id: string; rejected: true }>(`/projects/${projectId}/reference-intake/${id}/reject`, { method: 'POST' }),
  indexIntake: (projectId: string, id: string) =>
    request<IndexIntakeResponse>(`/projects/${projectId}/reference-intake/${id}/index`, { method: 'POST' }),
  libraryAdmission: (containerId: string) =>
    request<GetLibraryAdmissionResponse>(`/containers/${containerId}/library-admission`),
  // T-473 — currency on reference material: the document page's card, the
  // owner's "Confirm current", and the project's re-check intervals
  containerCurrency: (containerId: string) =>
    request<GetContainerCurrencyResponse>(`/containers/${containerId}/currency`),
  confirmCurrent: (containerId: string) =>
    request<ConfirmCurrentResponse>(`/containers/${containerId}/confirm-current`, { method: 'POST' }),
  recheckDefaults: (projectId: string) =>
    request<GetRecheckDefaultsResponse>(`/projects/${projectId}/recheck-defaults`),
  setRecheckDefaults: (projectId: string, body: PatchRecheckDefaultsBody) =>
    request<GetRecheckDefaultsResponse>(`/projects/${projectId}/recheck-defaults`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  // T-405 — `description` is OMITTED when the caller passes nothing, which the
  // server reads as "leave it alone"; `null` clears it. Sending `undefined`
  // through `JSON.stringify` drops the key, which is exactly the wanted
  // behaviour, so the conditional is written out rather than left to chance.
  // T-409 — the agent pane. It PROPOSES a revised description; the caller
  // applies it through the same path a typed correction takes.
  reviseSectionBrief: (projectId: string, body: ReviseSectionBriefBody) =>
    request<ReviseSectionBriefResult>(
      `/projects/${projectId}/tools/document-creation/section-brief/revision`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  // T-407 — the starting outlines this deployment carries. A menu, never a
  // shape: the outline the run uses is the one the author composed in the body.
  startingOutlines: (projectId: string) =>
    request<ListStartingOutlinesResponse>(
      `/projects/${projectId}/tools/document-creation/starting-outlines`,
    ),
  // T-414 (ADR-0053 addendum A5) — keep the outline you just built, for your
  // firm. The organisation and the person come off the session, never off the
  // body, so neither is sent.
  saveStartingOutline: (projectId: string, body: SaveStartingOutlineBody) =>
    request<StartingOutline>(`/projects/${projectId}/tools/document-creation/starting-outlines`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // T-414 — a curator stops one being offered. Retire, never delete: documents
  // already made from it are untouched.
  retireStartingOutline: (projectId: string, outlineId: string) =>
    request<{ ok: true }>(
      `/projects/${projectId}/tools/document-creation/starting-outlines/${outlineId}`,
      { method: 'DELETE' },
    ),
  // T-406 — the project's style guides. T-397 built the endpoint; the creator's
  // launcher is its first surface, because a guide the drafting call follows is
  // one the author has to be able to pick.
  styleGuides: (projectId: string) =>
    request<ListStyleGuidesResponse>(`/projects/${projectId}/style-guides`),
  // T-422 — the firm's own shelf. **No project in the path, and that is the
  // ruling**: org context travels to every project the organisation touches
  // (ADR-0020), so one shelf serves every door. T-308's tier is unchanged —
  // a member's read answers as nonexistence, which the Knowledge screen renders
  // as an absent list rather than a disabled control.
  rulebooks: () => request<ListRulebooksResponse>(`/organisation/rulebooks`),
  // T-456 — load and retire the firm's drafting manual (T-308's routes, with
  // a door at last); org-admin's tier, refused as absence to anyone else
  loadRulebook: (file: File, title?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (title && title.trim()) form.append('title', title.trim());
    return requestForm<RulebookRecord>(`/organisation/rulebooks`, form);
  },
  retireRulebook: (rulebookId: string) =>
    request<RulebookRecord>(`/organisation/rulebooks/${rulebookId}`, { method: 'DELETE' }),
  // T-424 — a new style guide. **The file is optional** (ADR-0054 decision 2):
  // a client with no written standard starts from Infora's baseline, and the
  // same endpoint produces the same object either way.
  createStyleGuide: (projectId: string, title: string, file?: File) => {
    const form = new FormData();
    form.append('title', title);
    if (file !== undefined) form.append('file', file);
    // `requestForm`, never `request`: the browser sets the multipart boundary
    // itself, so the content type must not be declared (T-122/T-220's rule).
    return requestForm<StyleGuideRecord>(`/projects/${projectId}/style-guides`, form);
  },
  // T-424 — the extraction. It PROPOSES and stores nothing; the reviewed list
  // comes back through `saveRuleSet` below, which is where anything binds.
  extractRules: (projectId: string, styleGuideId: string, body: ExtractRulesBody) =>
    request<ExtractRulesResponse>(
      `/projects/${projectId}/style-guides/${styleGuideId}/rule-sets/extraction`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  // T-425 — the save: the whole reviewed list, never a diff, because a version
  // is the set as it stands. The accepting person comes off the session.
  saveRuleSet: (projectId: string, styleGuideId: string, body: SaveRuleSetBody) =>
    request<GetRuleSetResponse>(`/projects/${projectId}/style-guides/${styleGuideId}/rule-sets`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // T-425 — the current set, readable by every participant: a rule that binds
  // you is a rule you may look up.
  currentRuleSet: (projectId: string, styleGuideId: string) =>
    request<GetRuleSetResponse>(
      `/projects/${projectId}/style-guides/${styleGuideId}/rule-sets/current`,
    ),
  // T-426 — anyone on the project may propose a change to a rule that binds
  // them. The proposer comes off the session, never off the body.
  proposeRule: (projectId: string, styleGuideId: string, body: ProposeRuleBody) =>
    request<RuleProposal>(
      `/projects/${projectId}/style-guides/${styleGuideId}/rule-sets/proposals`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  // 🔒 The list is walled server-side: another firm's proposal is ABSENT from
  // the response, so there is nothing here to filter and nothing to grey out.
  // `mayDecide` arrives only where this requester may act.
  ruleProposals: (projectId: string, styleGuideId: string) =>
    request<ListRuleProposalsResponse>(
      `/projects/${projectId}/style-guides/${styleGuideId}/rule-sets/proposals`,
    ),
  decideRuleProposal: (
    projectId: string,
    styleGuideId: string,
    proposalId: string,
    decision: 'accept' | 'decline',
  ) =>
    request<RuleProposal>(
      `/projects/${projectId}/style-guides/${styleGuideId}/rule-sets/proposals/${proposalId}/decision`,
      { method: 'POST', body: JSON.stringify({ decision }) },
    ),
  setContainerMetadata: (
    containerId: string,
    metadata: Record<string, unknown>,
    description?: string | null,
  ) =>
    request<{ ok: true }>(`/containers/${containerId}`, {
      method: 'PATCH',
      body: JSON.stringify(
        description === undefined ? { metadata } : { metadata, description },
      ),
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
  // T-475 — whether exported documents end with the authorship appendix
  exportAuthorshipAppendix: (projectId: string) =>
    request<GetExportAuthorshipAppendixResponse>(`/projects/${projectId}/export-authorship-appendix`),
  setExportAuthorshipAppendix: (projectId: string, enabled: boolean) =>
    request<GetExportAuthorshipAppendixResponse>(`/projects/${projectId}/export-authorship-appendix`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
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
  // T-337 — a firm's own spreadsheet as CANDIDATE fields. It writes nothing;
  // the existing putNamingScheme is still what commits.
  importSchema: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm<SchemaImportResponse>(`/projects/${projectId}/naming-scheme/import`, form);
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
  // T-477 — presence and the "changed since you looked" dot for every row, in one read
  sandboxActivity: (projectId: string) =>
    request<GetSandboxActivityResponse>(`/projects/${projectId}/sandbox-documents/activity`),
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
  // T-431 — external issue (ADR-0055). `externalDocument` is the ONLY call in
  // this client that carries no session: the recipient has no account, and the
  // token in the path is the whole of their access.
  externalIssueSettings: (projectId: string) =>
    request<GetExternalIssueSettingsResponse>(`/projects/${projectId}/external-issue-settings`),
  setExternalIssueSettings: (projectId: string, body: SetExternalIssueSettingsBody) =>
    request<GetExternalIssueSettingsResponse>(`/projects/${projectId}/external-issue-settings`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  issueExternally: (containerId: string, body: IssueExternallyBody) =>
    request<ExternalIssue>(`/containers/${containerId}/external-issues`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // T-432 — the request queue and its answer. One endpoint issues or requests
  // depending on the project's setting, so `issueExternally` above is both acts
  // and the response's `state` says which happened.
  // T-457 — the document page's Transmittals tab lists a deliverable's own issues
  containerExternalIssues: (containerId: string) =>
    request<ListExternalIssuesResponse>(`/containers/${containerId}/external-issues`),
  projectExternalIssues: (projectId: string) =>
    request<ListExternalIssuesResponse>(`/projects/${projectId}/external-issues`),
  answerExternalRequest: (id: string, body: AnswerExternalRequestBody) =>
    request<ExternalIssue>(`/external-issues/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  externalDocument: (token: string) =>
    request<ExternalDocumentResponse>(`/external-documents/${encodeURIComponent(token)}`),
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
    // T-470 — the scope control's choice, sent as the request's SCOPE. Sent
    // only when the person chose one: absent means the whole library you can
    // reach, and an empty scope is a 400, so the surface never sends one.
    scope?: Scope,
  ) =>
    request<Run>(`/conversations/${conversationId}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        request: requestText,
        ...(sandboxDocumentId !== undefined && { sandboxDocumentId }),
        ...(lensId !== undefined && { lensId }),
        ...(scope !== undefined && { scope }),
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
  // T-474 — the owner's dialog: library edges and the owner's own work only
  containerImpact: (containerId: string) =>
    request<ContainerImpactResponse>(`/containers/${containerId}/impact`),
  // T-474 — "cited by": what the requester may see that rests on this document
  containerCitedBy: (containerId: string) =>
    request<ContainerCitedByResponse>(`/containers/${containerId}/cited-by`),
  proposeRelationship: (containerId: string, toContainerId: string, type: DocumentRelationshipType) =>
    request<DocumentRelationship>(`/containers/${containerId}/relationships`, {
      method: 'POST',
      body: JSON.stringify({ toContainerId, type }),
    }),
  confirmRelationship: (relationshipId: string) =>
    request<DocumentRelationship>(`/relationships/${relationshipId}/confirmation`, { method: 'POST' }),
  retireRelationship: (relationshipId: string) =>
    request<DocumentRelationship>(`/relationships/${relationshipId}/retirement`, { method: 'POST' }),
  // T-461 — bulk acts over a register selection: one act, refused whole with
  // the rows named (a 409 carrying `failures`), or landed together.
  bulkTransmit: (projectId: string, body: BulkTransmitBody) =>
    request<BulkTransmitResponse>(`/projects/${projectId}/bulk/transmittals`, { method: 'POST', body: JSON.stringify(body) }),
  bulkIssueExternally: (projectId: string, body: BulkIssueExternallyBody) =>
    request<BulkIssueExternallyResponse>(`/projects/${projectId}/bulk/external-issues`, { method: 'POST', body: JSON.stringify(body) }),
  bulkSupersede: (projectId: string, body: BulkSupersedeBody) =>
    request<BulkSupersedeResponse>(`/projects/${projectId}/bulk/supersessions`, { method: 'POST', body: JSON.stringify(body) }),
  bulkClassify: (projectId: string, body: BulkClassifyBody) =>
    request<BulkClassifyResponse>(`/projects/${projectId}/bulk/classifications`, { method: 'POST', body: JSON.stringify(body) }),
  exportPlanRows: (projectId: string, containerIds: string[]) =>
    downloadPost(`/projects/${projectId}/plan/export`, { containerIds }),
  // T-481 — the whole plan, in the shape it imports in
  exportWholePlan: (projectId: string) => downloadPost(`/projects/${projectId}/plan/export`, { all: true }),
  // T-463 — the AI transparency table and the per-project feature switch
  aiTransparency: (projectId: string) => request<AiTransparencyResponse>(`/projects/${projectId}/ai-transparency`),
  workspaceAiTransparency: () => request<AiTransparencyResponse>('/ai-transparency'),
  setAiFeature: (projectId: string, feature: AiFeatureKey, body: SetAiFeatureBody) =>
    request<AiTransparencyResponse>(`/projects/${projectId}/ai-features/${feature}`, { method: 'PUT', body: JSON.stringify(body) }),
  exportAiTransparency: (projectId: string) => downloadFile(`/projects/${projectId}/ai-transparency/export`),
  // T-440/T-441 — the app builder's substrate (ADR-0056). The list is
  // ASSEMBLED server-side: an app the requester cannot open never reaches this
  // client, and `mayCreate` is the server's answer to the org-admin toggle
  // rather than something the screen derives from a role.
  apps: (projectId: string) => request<ListAppsResponse>(`/projects/${projectId}/apps`),
  createApp: (projectId: string, body: CreateAppBody) =>
    request<AppRecord>(`/projects/${projectId}/apps`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  app: (appId: string) => request<GetAppResponse>(`/apps/${appId}`),
  patchAppDefinition: (appId: string, body: PatchAppDefinitionBody) =>
    request<AppRecord>(`/apps/${appId}/definition`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  publishApp: (appId: string) => request<AppRecord>(`/apps/${appId}/publish`, { method: 'POST' }),
  // T-442 — the single-screen writer. It PROPOSES: what comes back is saved
  // through `patchAppDefinition` like any other change, so a screen it drew and
  // a screen a person edited travel the same road and meet the same validation.
  writeAppScreen: (appId: string, body: WriteAppScreenBody) =>
    request<WriteAppScreenResponse>(`/apps/${appId}/builder/screen`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // T-449/T-450 — the build conversation: stored against the app, read and
  // spoken to by its builders alone. The agent's acts come back with the app as
  // it now stands, so the panel and the conversation never disagree.
  buildConversation: (appId: string) =>
    request<BuildConversationResponse>(`/apps/${appId}/builder/conversation`),
  sayToBuilder: (appId: string, body: SayToBuilderBody) =>
    request<SayToBuilderResponse>(`/apps/${appId}/builder/conversation`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  grantAppScope: (appId: string, body: GrantAppScopeBody) =>
    request<AppRecord>(`/apps/${appId}/scope`, { method: 'POST', body: JSON.stringify(body) }),
  revokeAppScope: (appId: string, grantId: string) =>
    request<AppRecord>(`/apps/${appId}/scope/${grantId}/revocation`, { method: 'POST' }),
  declareAppTable: (appId: string, body: DeclareAppTableBody) =>
    request<AppTableRecord>(`/apps/${appId}/tables`, { method: 'POST', body: JSON.stringify(body) }),
  // T-442 — the one field a declared table can change, and only while it is
  // empty: whether its rows change hands on acceptance.
  setAppTableAcceptance: (appTableId: string, hasAcceptance: boolean) =>
    request<AppTableRecord>(`/app-tables/${appTableId}`, {
      method: 'PATCH',
      body: JSON.stringify({ hasAcceptance }),
    }),
  // T-451/T-452 — the file source (ADR-0059): a builder's panel acts. The
  // rows an import writes name the file version's uploader, which the server
  // resolves — nothing here could name anybody.
  sourceDocuments: (appId: string) =>
    request<ListSourceDocumentsResponse>(`/apps/${appId}/source-documents`),
  sourceRegions: (appId: string, document: SourceDocumentRef) =>
    request<ListSourceRegionsResponse>(
      `/apps/${appId}/source-documents/regions?${new URLSearchParams(
        document.sandboxDocumentId !== undefined
          ? { sandboxDocumentId: document.sandboxDocumentId }
          : { containerId: document.containerId! },
      ).toString()}`,
    ),
  tableSource: (appTableId: string) => request<AppTableSourceResponse>(`/app-tables/${appTableId}/source`),
  attachTableSource: (appTableId: string, body: AttachTableSourceBody) =>
    request<AppTableSourceResponse>(`/app-tables/${appTableId}/source`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  refreshTableSource: (appTableId: string) =>
    request<AppTableSourceResponse>(`/app-tables/${appTableId}/source/refresh`, { method: 'POST' }),
  detachTableSource: (appTableId: string) =>
    request<AppTableSourceResponse>(`/app-tables/${appTableId}/source/detachment`, { method: 'POST' }),
  shareAppTable: (appTableId: string, organisationId: string) =>
    request<AppTableRecord>(`/app-tables/${appTableId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ organisationId }),
    }),
  revokeAppTableShare: (appTableId: string, shareId: string) =>
    request<AppTableRecord>(`/app-tables/${appTableId}/shares/${shareId}/revocation`, {
      method: 'POST',
    }),
  reassignApp: (appId: string, participantId: string) =>
    request<AppRecord>(`/apps/${appId}/reassignment`, {
      method: 'POST',
      body: JSON.stringify({ participantId }),
    }),
  closeApp: (appId: string) => request<AppRecord>(`/apps/${appId}/closure`, { method: 'POST' }),
  runApp: (appId: string) =>
    request<AppRunResponse>(`/apps/${appId}/runs`, {
      method: 'POST',
      body: JSON.stringify({ trigger: 'manual' }),
    }),
  appRuns: (appId: string) => request<ListAppRunsResponse>(`/apps/${appId}/runs`),
  // T-444 — the export. The file contains only what this person may read,
  // decided by the same predicate over the same routes, and its stamp says what
  // data and when — never who produced it (ADR-0056 §8).
  // T-488 — an uploaded file, taken back out of a working area; the server runs
  // the same access check the document's opening does
  downloadSandboxDocument: (id: string) => downloadFile(`/sandbox-documents/${id}/file`),
  exportAppData: (appId: string, appTableIds: string[] = []) =>
    downloadPost(`/apps/${appId}/exports`, { format: 'xlsx', appTableIds }),
  exportAppInsight: (appId: string, appRowId: string) =>
    downloadPost(`/apps/${appId}/exports`, { format: 'docx', appRowId }),
  appExports: (appId: string) => request<ListAppExportsResponse>(`/apps/${appId}/exports`),
  // T-445 — the playbook: the firm's own shelf, saving an app onto it, and
  // deploying a copy into another project. The shelf is org-private and carries
  // no project at all — like the rulebook beside it, org context is portable.
  playbooks: () => request<ListPlaybooksResponse>('/organisation/playbooks'),
  saveAppAsPlaybook: (appId: string, body: SaveAppAsPlaybookBody) =>
    request<PlaybookResponse>(`/apps/${appId}/playbook`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deployPlaybook: (projectId: string, body: DeployPlaybookBody) =>
    request<GetAppResponse>(`/projects/${projectId}/apps/deployments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // T-441 — the rows themselves. Every row comes back with what THIS person may
  // do to it, resolved server-side: a surface that worked it out would be a
  // second copy of the access rule.
  appRows: (appTableId: string) => request<ListAppRowsResponse>(`/app-tables/${appTableId}/rows`),
  enterAppRow: (appTableId: string, body: EnterAppRowBody) =>
    request<AppRowResponse>(`/app-tables/${appTableId}/rows`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  editAppRow: (appRowId: string, values: Record<string, unknown>) =>
    request<AppRowResponse>(`/app-rows/${appRowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ values }),
    }),
  submitAppRow: (appRowId: string) =>
    request<AppRowResponse>(`/app-rows/${appRowId}/submission`, { method: 'POST' }),
  decideAppRow: (appRowId: string, body: DecideAppRowBody) =>
    request<AppRowResponse>(`/app-rows/${appRowId}/decision`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  correctAppRow: (appRowId: string, body: EnterAppRowBody) =>
    request<AppRowResponse>(`/app-rows/${appRowId}/correction`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  retireAppRow: (appRowId: string) =>
    request<AppRowResponse>(`/app-rows/${appRowId}/retirement`, { method: 'POST' }),
};
