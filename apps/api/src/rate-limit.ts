// T-217 — in-memory sliding-window rate limiting at the API boundary: login
// guesses per IP, run creation (paid model calls) per user. Seam: this
// per-process Map becomes a shared store (Redis) at the infra session.
import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { ApiError } from '@infora/contracts';
import type { AppEnv } from './requester';

export type SlidingWindow = {
  /** Record a hit for `key`; false when the key is over its limit. */
  allow: (key: string, now?: number) => boolean;
};

export function createSlidingWindow(limit: number, windowMs: number): SlidingWindow {
  const hits = new Map<string, number[]>();
  return {
    allow(key, now = Date.now()) {
      const fresh = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      if (fresh.length >= limit) {
        hits.set(key, fresh); // pruned, not extended: a blocked hit never lengthens the block
        return false;
      }
      fresh.push(now);
      hits.set(key, fresh);
      return true;
    },
  };
}

/**
 * The requester's IP: proxy header first, then the socket. Undefined when
 * neither is known — in-process test requests carry no connection, and an
 * unidentifiable caller is not throttled rather than sharing one bucket.
 */
export function clientIp(c: Context<AppEnv>): string | undefined {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded !== undefined) return forwarded.split(',')[0]!.trim();
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

export function rateLimit(options: {
  limit: number;
  windowMs: number;
  /** Only these methods are throttled (a DELETE /auth/session is free). */
  methods: string[];
  key: (c: Context<AppEnv>) => string | undefined;
}): MiddlewareHandler<AppEnv> {
  const window = createSlidingWindow(options.limit, options.windowMs);
  return async (c, next) => {
    if (options.methods.includes(c.req.method)) {
      const key = options.key(c);
      if (key !== undefined && !window.allow(key)) {
        return c.json(
          { error: 'rate_limited', detail: 'too many requests' } satisfies ApiError,
          429,
        );
      }
    }
    await next();
  };
}
