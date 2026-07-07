import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ApiError } from '@infora/contracts';
import { createAssembler } from '@infora/knowledge';
import {
  createCiteLeaf,
  createDraftLeaf,
  createGroundCheckLeaf,
  createRetrieveLeaf,
} from '@infora/orchestration';
import { authRoutes } from './auth';
import { projectScope, resourceHomes, resourceScope, sessionMiddleware } from './requester';
import type { AppDeps, AppEnv } from './requester';
import { runRoutes } from './runs';

export type { AppDeps } from './requester';

// T-009: every contracts.md §3 endpoint registered; T-023 puts requester
// resolution in front of each. The 501 body is scaffolding outside the
// contracts §4 envelope; each placeholder names the ticket that replaces it.
const notImplemented = (ticket: string) => (c: Context) =>
  c.json({ error: 'not_implemented', ticket }, 501);

export function buildApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  // T-023: identity resolved from the session on every request but login
  app.use('*', sessionMiddleware(deps));

  // Auth & session (M1, M6) — T-021
  app.route('/', authRoutes(deps));

  const project = projectScope(deps);

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

  // Sandbox documents (M4) — organisation-private inside the project (ADR-0018)
  app.post('/projects/:projectId/sandbox-documents', project, notImplemented('T-051'));
  app.get(
    '/sandbox-documents/:id',
    resourceScope(deps, 'id', resourceHomes.sandboxDocument),
    notImplemented('T-051'),
  );
  app.patch(
    '/sandbox-documents/:id',
    resourceScope(deps, 'id', resourceHomes.sandboxDocument),
    notImplemented('T-082'),
  );

  // Suggestion resolution — the Signal (M4) — T-053
  app.post(
    '/suggestions/:suggestionId/resolution',
    resourceScope(deps, 'suggestionId', resourceHomes.suggestion),
    notImplemented('T-053'),
  );

  // Library (M2 read path)
  app.get('/projects/:projectId/library', project, notImplemented('M2'));

  // Principle 4: nonexistence and denial read identically — the §4 envelope,
  // and no 405 that would distinguish a live path from a dead one.
  app.notFound((c) => c.json({ error: 'not_found' } satisfies ApiError, 404));

  return app;
}
