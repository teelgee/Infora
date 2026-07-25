import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ApiError } from '@infora/contracts';
import { createAssembler } from '@infora/knowledge';
import {
  createCiteLeaf,
  createDraftLeaf,
  createGroundCheckLeaf,
  createRetrieveLeaf,
} from '@infora/orchestration';
import { administrationRoutes } from './administration';
import { authRoutes } from './auth';
import { commentRoutes } from './comments';
import { libraryRoutes } from './library';
import { cycleRoutes } from './cycle';
import { namingRoutes } from './naming';
import { healthRoutes, requestObservability } from './observability';
import { containerRoutes, planRoutes } from './plan';
import { clientIp, rateLimit } from './rate-limit';
import { sessionMiddleware } from './requester';
import type { AppDeps, AppEnv } from './requester';
import { renditionRoutes } from './renditions';
import { runRoutes } from './runs';
import { attachedSourceRoutes } from './attached';
import { sandboxRoutes } from './sandbox';
import { sandboxRoutes2 } from './sandboxes';
import { suggestionRoutes } from './suggestions';
import { transmittalRoutes } from './transmittal';
import { uploadRoutes } from './upload';

export type { AppDeps } from './requester';

// T-009 registered every contracts.md §3 endpoint (as 501 scaffolding where
// the milestone hadn't landed); T-023 puts requester resolution in front of
// each. T-086 replaced the last placeholder — every route is live.
// The local web origins: vite dev (:5173) and the e2e harness (:5273). In
// both, the browser talks to the API through the vite proxy — same-origin —
// so even the default allowlist is belt-and-braces, and anything else needs
// an explicit ALLOWED_ORIGINS.
const devOrigins = ['http://localhost:5173', 'http://localhost:5273'];

export function buildApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  // T-219: outermost — every response gets an X-Request-Id, every request
  // one JSON log line (method, path, status, duration, requestId)
  app.use('*', requestObservability());

  // T-216: CORS from an explicit allowlist — an unlisted Origin gets no
  // CORS headers at all (hono's cors would still emit allow-credentials, so
  // it only runs for allowlisted origins) — plus baseline security headers.
  const allowedOrigins = deps.allowedOrigins ?? devOrigins;
  const corsMiddleware = cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    credentials: true, // the session cookie is the credential
  });
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined && allowedOrigins.includes(origin)) return corsMiddleware(c, next);
    // a preflight from an unlisted origin is answered, but bare — no allows
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    await next();
  });
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
  });

  // T-217: login guesses are throttled per IP before any credential check
  app.use(
    '/auth/session',
    rateLimit({
      limit: deps.rateLimits?.loginPerMinute ?? 10,
      windowMs: 60_000,
      methods: ['POST'],
      key: clientIp,
    }),
  );

  // T-023: identity resolved from the session on every request but login
  app.use('*', sessionMiddleware(deps));

  // T-217: run creation invokes paid model calls — throttled per user (the
  // session middleware has resolved the requester by here)
  app.use(
    '/conversations/:conversationId/runs',
    rateLimit({
      limit: deps.rateLimits?.runsPerMinute ?? 30,
      windowMs: 60_000,
      methods: ['POST'],
      key: (c) => c.get('user')?.id,
    }),
  );

  // Liveness probe (T-219) — sessionless, DB-pinging
  app.route('/', healthRoutes(deps));

  // Auth & session (M1, M6) — T-021
  app.route('/', authRoutes(deps));

  // Conversations, runs & work items (M3, M5, M6) — T-046. The chain's
  // leaves are bound once here: retrieval reaches stores only through the
  // assembly gateway (T-030), draft through the Router.
  const assemble = createAssembler({ db: deps.db, router: deps.router });
  app.route(
    '/',
    runRoutes({
      db: deps.db,
      leaves: {
        retrieve: createRetrieveLeaf({ assemble }),
        draft: createDraftLeaf(deps.router),
        groundCheck: createGroundCheckLeaf(),
        cite: createCiteLeaf(),
      },
    }),
  );

  // Sandbox documents (M4) — organisation-private inside the project
  // (ADR-0018): create/list/open (T-051), suggestions read + manual PATCH (T-082)
  app.route('/', sandboxRoutes(deps));

  // Sandboxes, participant scope, folders, bind (Slice A2, ADR-0036/0038) — T-153
  app.route('/', sandboxRoutes2(deps));

  // Attached-source working set on a conversation (Slice A2, ADR-0022) — T-154
  app.route('/', attachedSourceRoutes(deps));

  // Sandbox comments (T-112) — working-draft threads, scope riding the document's
  app.route('/', commentRoutes(deps));

  // Access administration + the roster (Slice A, ADR-0033) — T-117
  app.route('/', administrationRoutes(deps));

  // The deliverable plan: TIDP rows, MIDP consolidation, appointments
  // (Slice A, ADR-0008/0017/0033) — T-118/T-119
  app.route('/', planRoutes(deps));
  app.route('/', containerRoutes(deps));

  // Naming scheme + code-builder (Slice A2, ADR-0008 homed) — T-152
  app.route('/', namingRoutes(deps));

  // Promotion + the review cycle (Slice A, ADR-0002/0005–0014/0032) — T-120+
  app.route('/', cycleRoutes({ db: deps.db, router: deps.router }));

  // Renditions: the record's stored exports (Slice A, ADR-0004/0034) — T-121
  app.route('/', renditionRoutes(deps));

  // Upload + open-in-editor conversion (Slice A, ADR-0034) — T-122
  app.route('/', uploadRoutes(deps));

  // Suggestion resolution — the Signal (M4) — T-053
  app.route('/', suggestionRoutes(deps));

  // Library (M2 read path) — T-086
  app.route('/', libraryRoutes(deps));

  // Non-review transmittal, the acknowledgement gate, intra-org narrowing +
  // the standing routing rule (ADR-0035) — T-137
  app.route('/', transmittalRoutes(deps));

  // Principle 4: nonexistence and denial read identically — the §4 envelope,
  // and no 405 that would distinguish a live path from a dead one.
  app.notFound((c) => c.json({ error: 'not_found' } satisfies ApiError, 404));

  return app;
}
