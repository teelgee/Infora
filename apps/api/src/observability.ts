// T-219 — minimal observability at the boundary: a request id on every
// response, one structured JSON log line per request, and an unauthenticated
// liveness probe that pings the database.
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { sql } from 'drizzle-orm';
import type { Db } from '@infora/db';
import type { AppEnv } from './requester';

/**
 * Request id + boundary log line. The id is response-only for now (no inbound
 * correlation until there is an upstream to correlate with); logging is
 * suppressed under NODE_ENV=test so test output stays clean.
 */
export function requestObservability(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    await next();
    c.header('X-Request-Id', requestId);
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        JSON.stringify({
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          durationMs: Math.round(performance.now() - startedAt),
          requestId,
        }),
      );
    }
  };
}

/** GET /health — sessionless (exempted in the session middleware), one
 * `select 1` against the database: 200 {"ok":true} or 503. */
export function healthRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  app.get('/health', async (c) => {
    try {
      await deps.db.execute(sql`select 1`);
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });
  return app;
}
