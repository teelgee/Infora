// The thin typed client (contracts principle 1): every call is a contracts
// shape; nothing is resolved locally. Identity rides the httpOnly cookie.
import type {
  ApiError,
  GetWorkItemResponse,
  ListWorkItemsResponse,
  MeResponse,
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
};
