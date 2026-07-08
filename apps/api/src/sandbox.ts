// T-051 — sandbox documents: create, list, open. The sandbox is the
// uncontrolled working area (draft-location decision): one implicit private
// project sandbox per organisation (ADR-0018), so every read here is scoped
// to the requester's organisation by construction — there is no parameter.
// Manual editing (PATCH) stays with T-082.
import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { createSandboxDocumentBody, patchSandboxDocumentBody } from '@infora/contracts';
import type {
  ApiError,
  ListSandboxDocumentsResponse,
  ListSuggestionsResponse,
  SandboxDocument,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { readDocumentSuggestions } from '@infora/orchestration';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';

export function sandboxRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  app.post('/projects/:projectId/sandbox-documents', project, async (c) => {
    const body = createSandboxDocumentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'title required' } satisfies ApiError, 400);
    }
    const slice = c.get('slice');
    const [row] = await deps.db
      .insert(s.sandboxDocuments)
      .values({
        projectId: slice.projectId,
        organisationId: slice.organisationId,
        title: body.data.title,
        createdByParticipantId: slice.participantId,
      })
      .returning();
    return c.json(toSandboxDocument(row!), 201);
  });

  app.get('/projects/:projectId/sandbox-documents', project, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(
        and(
          eq(s.sandboxDocuments.projectId, slice.projectId),
          eq(s.sandboxDocuments.organisationId, slice.organisationId),
        ),
      )
      .orderBy(desc(s.sandboxDocuments.updatedAt));
    return c.json({ items: rows.map(toSandboxDocument) } satisfies ListSandboxDocumentsResponse);
  });

  const documentScope = resourceScope(deps, 'id', resourceHomes.sandboxDocument);

  app.get('/sandbox-documents/:id', documentScope, async (c) => {
    const [row] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    return c.json(toSandboxDocument(row!));
  });

  // T-082: the document's Suggestions, newest first (contracts, 2026-07-08)
  app.get('/sandbox-documents/:id/suggestions', documentScope, async (c) => {
    const items = await readDocumentSuggestions(deps.db, c.req.param('id'));
    return c.json({ items } satisfies ListSuggestionsResponse);
  });

  // T-082: manual editing — no Suggestion, no Signal, no ceremony, by design
  app.patch('/sandbox-documents/:id', documentScope, async (c) => {
    const body = patchSandboxDocumentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'content required' } satisfies ApiError, 400);
    }
    const [row] = await deps.db
      .update(s.sandboxDocuments)
      // DB time, like the insert default — one clock for updatedAt
      .set({ content: body.data.content, updatedAt: sql`now()` })
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .returning();
    return c.json(toSandboxDocument(row!));
  });

  return app;
}

export function toSandboxDocument(row: typeof s.sandboxDocuments.$inferSelect): SandboxDocument {
  return {
    id: row.id,
    projectId: row.projectId,
    organisationId: row.organisationId,
    title: row.title,
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
  };
}
