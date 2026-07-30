// T-255 — the harness: the real application, over real HTTP.
//
// This is the part of the eval design that is not negotiable (docs/ask/07 §4).
// A runner that calls internal functions tests nothing about the boundary
// where identity is established (apps/api/src/requester.ts), and a permission
// case that skips that boundary is theatre. So the harness composes the app
// exactly as a deployment does (buildApp), listens on a loopback socket, and
// every case then speaks to it with fetch and a session cookie, like a client.
//
// The providers are the deterministic fakes the e2e substrate already runs on
// (apps/api/src/test-router.ts) — the reason a smoke tier can run on every
// commit without provider keys and return the same answer every time.
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { buildApp } from '@infora/api/app';
import { FAKE_EMBED_VERSION, fakeRouter, fakeVector } from '@infora/api/test-router';
import { createDb } from '@infora/db';
import type { Db } from '@infora/db';

/**
 * The eval harness writes and reads its OWN pinned index (ADR-0024: each
 * embedding model is its own index over the same corpus). Not fastidiousness —
 * `ingestVersions` walks every version in the database and replaces its chunks
 * wholesale under the model it was given, so a fixture sharing `fake-embed`
 * with the ingest suite can be re-chunked underneath a running case. A frozen
 * fixture that another suite can rewrite is not frozen.
 */
export const EVAL_EMBED_MODEL = 'eval-embed';

export type Harness = {
  baseUrl: string;
  db: Db;
  /** the routing table in use, recorded in every result file (docs/ask/04 §5) */
  routing: { chat: string; embedding: string };
  embed(text: string): { vector: number[]; modelId: string; modelVersion: string };
  close(): Promise<void>;
};

export async function startHarness(): Promise<Harness> {
  const { db, pool } = createDb();
  const router = fakeRouter(undefined, EVAL_EMBED_MODEL);
  const app = buildApp({
    db,
    sessionSecret: 'eval-harness-secret',
    router,
    // the harness logs in once per case execution from one address, and a
    // determinism check runs the same case ten times in a row — far past the
    // production throttles, which exist to slow credential guessing and paid
    // model calls. The substrate raises them rather than shaping the suites,
    // as the e2e substrate does (apps/api/src/e2e-server.ts).
    rateLimits: { loginPerMinute: 10_000, runsPerMinute: 10_000 },
  });

  const server = await listen(app.fetch);
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    db,
    routing: { chat: 'fake-chat', embedding: EVAL_EMBED_MODEL },
    embed: (text) => ({
      vector: fakeVector(text),
      modelId: EVAL_EMBED_MODEL,
      modelVersion: FAKE_EMBED_VERSION,
    }),
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await pool.end();
    },
  };
}

function listen(fetch: Parameters<typeof serve>[0]['fetch']): Promise<ServerType> {
  return new Promise((resolve) => {
    // port 0 = an ephemeral port: concurrent harnesses (and the dev server on
    // :3000, and the e2e substrate on :3210) never collide
    const server = serve({ fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(server));
  });
}

/** A logged-in session: the httpOnly cookie a browser would hold. */
export class HarnessSession {
  private constructor(
    private readonly baseUrl: string,
    private readonly cookie: string,
    readonly email: string,
  ) {}

  static async login(harness: Harness, email: string, password: string): Promise<HarnessSession> {
    const res = await fetch(`${harness.baseUrl}/auth/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.status !== 204) {
      throw new Error(`eval login failed for ${email} (${res.status})`);
    }
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    if (cookie === undefined) throw new Error(`no session cookie returned for ${email}`);
    return new HarnessSession(harness.baseUrl, cookie, email);
  }

  get(path: string): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, { headers: { cookie: this.cookie } });
  }

  post(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { cookie: this.cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}
