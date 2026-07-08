// API-level session helper — the substrate T-054/T-061/T-080 build on. Talks
// to the e2e api directly (not through the vite proxy), holding the httpOnly
// session cookie the way a browser would.
import type { APIRequestContext } from '@playwright/test';
import { request as playwrightRequest } from '@playwright/test';
import { API_URL } from '../../playwright.config';

export const SEEDED = {
  password: 'wrenfield-dev',
  owner: 'rachel.bowen@trentmoor.example',
  consultant: 'eleanor.price@calderhale.example',
  noParticipant: 'marcus.webb@calderhale.example',
  thirdOrg: 'priya.nair@halvern.example',
} as const;

export class ApiSession {
  private constructor(readonly context: APIRequestContext) {}

  /** Log a seeded user in; the returned session carries the cookie. */
  static async login(email: string, password: string = SEEDED.password): Promise<ApiSession> {
    const context = await playwrightRequest.newContext({ baseURL: API_URL });
    const res = await context.post('/auth/session', { data: { email, password } });
    if (res.status() !== 204) {
      throw new Error(`seeded login failed for ${email} (${res.status()}) — is the DB seeded?`);
    }
    return new ApiSession(context);
  }

  async get<T>(path: string): Promise<T> {
    return this.json(await this.context.get(path));
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    return this.json(await this.context.post(path, { data }));
  }

  async patch<T>(path: string, data: unknown): Promise<T> {
    return this.json(await this.context.patch(path, { data }));
  }

  /** Raw response, for status-code assertions (deny-as-404 and friends). */
  raw(method: 'get' | 'post' | 'patch', path: string, data?: unknown) {
    return this.context[method](path, data === undefined ? undefined : { data });
  }

  async dispose() {
    await this.context.dispose();
  }

  private async json<T>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
    if (!res.ok()) {
      throw new Error(`${res.status()} on ${res.url()}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }
}
