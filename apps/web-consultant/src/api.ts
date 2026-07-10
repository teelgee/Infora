// The thin typed client (contracts principle 1): every call is a contracts
// shape; nothing is resolved locally. Identity rides the httpOnly cookie.
import type {
  ApiError,
  CreateConversationResponse,
  GetLibraryResponse,
  GetVersionResponse,
  GetWorkItemResponse,
  ListSandboxDocumentsResponse,
  ListSuggestionsResponse,
  ListWorkItemsResponse,
  MeResponse,
  PatchMeBody,
  Resolution,
  ResolveSuggestionResponse,
  Run,
  SandboxDocument,
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

export const api = {
  login: (email: string, password: string) =>
    request<void>('/auth/session', { method: 'POST', body: JSON.stringify({ email, password }) }),
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
  createSandboxDocument: (projectId: string, title: string) =>
    request<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  sandboxDocument: (id: string) => request<SandboxDocument>(`/sandbox-documents/${id}`),
  documentSuggestions: (id: string) =>
    request<ListSuggestionsResponse>(`/sandbox-documents/${id}/suggestions`),
  patchSandboxDocument: (id: string, content: string) =>
    request<SandboxDocument>(`/sandbox-documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  createConversation: (projectId: string, workItemId?: string) =>
    request<CreateConversationResponse>(`/projects/${projectId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ surface: 'web', ...(workItemId !== undefined && { workItemId }) }),
    }),
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
