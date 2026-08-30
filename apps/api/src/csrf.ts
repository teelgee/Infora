// T-218 — the CSRF posture's enforcement layer (ADR-0044): state-changing
// requests with a body must declare application/json — a cross-origin HTML
// form cannot — except the multipart upload, which instead requires
// browser-declared provenance (Origin / Sec-Fetch-Site) consistent with the
// T-216 origin allowlist, because a cross-site multipart POST is a simple
// request the content-type gate cannot cover. Bodyless writes pass untouched.
import type { MiddlewareHandler } from 'hono';
import type { ApiError } from '@infora/contracts';
import type { AppEnv } from './requester';

const writeMethods = new Set(['POST', 'PUT', 'PATCH']);

// the legitimately non-JSON write surfaces: T-122's multipart upload,
// T-220's replace-the-native-file, T-359's plan import, T-337's schema import
// and T-308's rulebook load, each carrying a file body
const multipartPaths = [
  /^\/projects\/[^/]+\/sandbox-uploads$/,
  /^\/sandbox-documents\/[^/]+\/file$/,
  /^\/projects\/[^/]+\/plan\/import$/,
  /^\/projects\/[^/]+\/naming-scheme\/import$/,
  /^\/organisation\/rulebooks$/,
  // T-397 — the project style guide, the rulebook's twin one store along
  /^\/projects\/[^/]+\/style-guides$/,
];

export function csrfGuard(options: { allowedOrigins: string[] }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!writeMethods.has(c.req.method)) return next();

    // gate on the presence of a body: the bodyless action POSTs (promotion,
    // revocations, heartbeats, DELETE /auth/session…) carry no forgeable
    // payload and must keep working without a declared content type
    // real clients declare framing (Content-Length / Transfer-Encoding); the
    // in-process fetch of the test harness does not, so fall back to the raw
    // Request's body stream, which is null exactly when there is no body
    const contentLength = c.req.header('content-length');
    const hasBody =
      c.req.header('transfer-encoding') !== undefined ||
      (contentLength !== undefined ? contentLength !== '0' : c.req.raw.body !== null);
    if (!hasBody) return next();

    if (multipartPaths.some((pattern) => pattern.test(c.req.path))) {
      const site = c.req.header('sec-fetch-site');
      if (site !== undefined && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
        return c.json({ error: 'forbidden', detail: 'cross-site upload' } satisfies ApiError, 403);
      }
      const origin = c.req.header('origin');
      const self = new URL(c.req.url).origin;
      if (origin !== undefined && origin !== self && !options.allowedOrigins.includes(origin)) {
        return c.json({ error: 'forbidden', detail: 'cross-origin upload' } satisfies ApiError, 403);
      }
      // neither header declared: a non-browser client — browsers always
      // declare Origin on a cross-site POST, so the forged case cannot
      // arrive undeclared (ADR-0044 §3)
      return next();
    }

    const contentType = c.req.header('content-type');
    if (contentType === undefined || !contentType.toLowerCase().startsWith('application/json')) {
      return c.json(
        { error: 'invalid', detail: 'content-type must be application/json' } satisfies ApiError,
        400,
      );
    }
    await next();
  };
}
