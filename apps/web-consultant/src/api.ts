// The thin typed client (contracts principle 1): every call is a contracts
// shape; nothing is resolved locally. Identity rides the httpOnly cookie.
import type {
  ApiError,
  CreateConversationResponse,
  GetWorkItemResponse,
  ListSandboxDocumentsResponse,
  ListSuggestionsResponse,
  ListWorkItemsResponse,
  MeResponse,
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
  workItems: (projectId: string) =>
    request<ListWorkItemsResponse>(`/projects/${projectId}/work-items`),
  workItem: (workItemId: string) => request<GetWorkItemResponse>(`/work-items/${workItemId}`),
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
  createRun: (conversationId: string, requestText: string, sandboxDocumentId?: string) =>
    request<Run>(`/conversations/${conversationId}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        request: requestText,
        ...(sandboxDocumentId !== undefined && { sandboxDocumentId }),
      }),
    }),
};
