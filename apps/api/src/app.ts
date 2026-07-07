import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ApiError } from '@infora/contracts';
import type { Db } from '@infora/db';
import { authRoutes } from './auth';

// T-009: every contracts.md §3 endpoint registered, handlers empty. The 501
// body is scaffolding outside the contracts §4 envelope; each placeholder
// names the ticket that replaces it.
const notImplemented = (ticket: string) => (c: Context) =>
  c.json({ error: 'not_implemented', ticket }, 501);

export type AppDeps = { db: Db; sessionSecret: string };

export function buildApp(deps: AppDeps) {
  const app = new Hono();

  // Auth & session (M1, M6) — T-021
  app.route('/', authRoutes(deps));

  // Conversations & runs (M3, M6)
  app.post('/projects/:projectId/conversations', notImplemented('T-046'));
  app.post('/conversations/:conversationId/runs', notImplemented('T-046'));
  app.get('/conversations/:conversationId', notImplemented('T-046'));
  app.get('/runs/:runId', notImplemented('T-046'));

  // Work items (M3, M5)
  app.get('/projects/:projectId/work-items', notImplemented('T-046'));
  app.get('/work-items/:workItemId', notImplemented('T-046'));

  // Sandbox documents (M4)
  app.post('/projects/:projectId/sandbox-documents', notImplemented('T-051'));
  app.get('/sandbox-documents/:id', notImplemented('T-051'));
  app.patch('/sandbox-documents/:id', notImplemented('T-082'));

  // Suggestion resolution — the Signal (M4)
  app.post('/suggestions/:suggestionId/resolution', notImplemented('T-053'));

  // Library (M2 read path)
  app.get('/projects/:projectId/library', notImplemented('M2'));

  // Principle 4: nonexistence and denial read identically — the §4 envelope,
  // and no 405 that would distinguish a live path from a dead one.
  app.notFound((c) => c.json({ error: 'not_found' } satisfies ApiError, 404));

  return app;
}
