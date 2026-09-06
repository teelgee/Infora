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
  // an authenticated user whose organisation holds NO Membership on the project
  // (T-022's wall subject). Named before T-300 existed: "third org" here means
  // outside the project, NOT Org C on it — that is `secondConsultant` below.
  thirdOrg: 'priya.nair@halvern.example',
  // T-300 — Org C, the second consultant ON the Wrenfield project. Session B's
  // story: brought in to probe cross-organisation sharing, and the organisation
  // whose invisibility to Calder & Hale a buyer will actually poke at.
  secondConsultant: 'nadia.okonjo@redgate.example',
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

  /** Raw response, for status-code assertions (deny-as-404 and friends).
   * `delete` joined the set at T-440: removing a Participant is how the app
   * substrate's DEFUNCT case is reached, and it is a real act rather than a
   * fixture. */
  raw(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, data?: unknown) {
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
