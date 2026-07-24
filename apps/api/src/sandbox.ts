// T-051 — sandbox documents: create, list, open. The sandbox is the
// uncontrolled working area (draft-location decision): one implicit private
// project sandbox per organisation (ADR-0018), so every read here is scoped
// to the requester's organisation by construction — there is no parameter.
// Manual editing (PATCH) stays with T-082.
import { Hono } from 'hono';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import {
  createSandboxDocumentBody,
  patchSandboxDocumentBody,
  patchSandboxMetadataBody,
  restoreSandboxVersionBody,
} from '@infora/contracts';
import type {
  ApiError,
  ListSandboxDocumentsResponse,
  ListPresenceResponse,
  ListSandboxHistoryResponse,
  ListSuggestionsResponse,
  SandboxDocument,
} from '@infora/contracts';
import { canAccessSandbox } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { readDocumentSuggestions } from '@infora/orchestration';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';

// T-171 — a document always lives in a sandbox (sandbox_id NOT NULL). When none
// is named, it lands in the organisation's default single-org sandbox, created
// on first use with an organisation scope grant (ADR-0036).
export async function ensureDefaultSandbox(
  db: Db,
  projectId: string,
  organisationId: string,
  participantId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: s.sandboxes.id })
    .from(s.sandboxes)
    .where(
      and(
        eq(s.sandboxes.projectId, projectId),
        eq(s.sandboxes.owningOrganisationId, organisationId),
        eq(s.sandboxes.scope, 'single_org'),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      name: 'Sandbox',
      scope: 'single_org',
      owningOrganisationId: organisationId,
      createdByParticipantId: participantId,
    })
    .returning();
  await db.insert(s.sandboxScopeGrants).values({
    sandboxId: sandbox!.id,
    granteeType: 'organisation',
    organisationId,
    grantedByParticipantId: participantId,
  });
  return sandbox!.id;
}

export function sandboxRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  app.post('/projects/:projectId/sandbox-documents', project, async (c) => {
    const body = createSandboxDocumentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'title required' } satisfies ApiError, 400);
    }
    const slice = c.get('slice');
    if (body.data.containerId) {
      // the draft's plan link (T-129, ADR-0032): the container must be the
      // requester organisation's own library-scope plan row on this project
      const [container] = await deps.db
        .select()
        .from(s.containers)
        .where(eq(s.containers.id, body.data.containerId))
        .limit(1);
      if (
        !container ||
        container.projectId !== slice.projectId ||
        container.scope !== 'library' ||
        container.producingOrganisationId !== slice.organisationId
      ) {
        return c.json({ error: 'not_found' } satisfies ApiError, 404);
      }
    }
    // resolve the sandbox: a named one must admit the requester (ADR-0036); if
    // none is named, the document lands in the organisation's default single-org
    // sandbox (sandbox_id is NOT NULL — every document lives in a sandbox, T-171)
    let sandboxId: string;
    if (body.data.sandboxId) {
      const [sandbox] = await deps.db
        .select()
        .from(s.sandboxes)
        .where(eq(s.sandboxes.id, body.data.sandboxId))
        .limit(1);
      const grants = sandbox
        ? await deps.db
            .select()
            .from(s.sandboxScopeGrants)
            .where(
              and(
                eq(s.sandboxScopeGrants.sandboxId, sandbox.id),
                isNull(s.sandboxScopeGrants.removedAt),
              ),
            )
        : [];
      if (!sandbox || sandbox.projectId !== slice.projectId || !canAccessSandbox(slice, grants)) {
        return c.json({ error: 'not_found' } satisfies ApiError, 404);
      }
      sandboxId = sandbox.id;
    } else {
      sandboxId = await ensureDefaultSandbox(deps.db, slice.projectId, slice.organisationId, slice.participantId);
    }
    const [row] = await deps.db
      .insert(s.sandboxDocuments)
      .values({
        projectId: slice.projectId,
        organisationId: slice.organisationId,
        title: body.data.title,
        containerId: body.data.containerId ?? null,
        sandboxId,
        folderId: body.data.folderId ?? null,
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
          // the recycle bin is its own view (T-128): ?deleted=1
          c.req.query('deleted') === '1'
            ? sql`${s.sandboxDocuments.deletedAt} IS NOT NULL`
            : isNull(s.sandboxDocuments.deletedAt),
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
  // T-166 — authoring-metadata edit (ADR-0038): metadata-only, no ambient
  // content version; allowed even while the head is checked out (it isn't content)
  app.patch('/sandbox-documents/:id/metadata', documentScope, async (c) => {
    const body = patchSandboxMetadataBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'authoringMetadata required' } satisfies ApiError, 400);
    }
    const [row] = await deps.db
      .update(s.sandboxDocuments)
      .set({ authoringMetadata: body.data.authoringMetadata, updatedAt: sql`now()` })
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .returning();
    if (!row) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    return c.json(toSandboxDocument(row));
  });

  // T-175 — document presence (ADR-0039 real-time, first cut). Heartbeat marks
  // the requester present on the document; the read returns others seen in the
  // last 30s, self excluded. Scoped by documentScope (the requester can see the
  // document); a full sandbox-scope, cross-org presence is a later refinement.
  app.post('/sandbox-documents/:id/presence', documentScope, async (c) => {
    const slice = c.get('slice');
    await deps.db
      .insert(s.documentPresence)
      .values({ sandboxDocumentId: c.req.param('id'), participantId: slice.participantId })
      .onConflictDoUpdate({
        target: [s.documentPresence.sandboxDocumentId, s.documentPresence.participantId],
        set: { lastSeenAt: sql`now()` },
      });
    return c.json({ ok: true });
  });

  app.get('/sandbox-documents/:id/presence', documentScope, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select({ participantId: s.documentPresence.participantId, name: s.users.name })
      .from(s.documentPresence)
      .innerJoin(s.participants, eq(s.documentPresence.participantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(
        and(
          eq(s.documentPresence.sandboxDocumentId, c.req.param('id')),
          ne(s.documentPresence.participantId, slice.participantId),
          sql`${s.documentPresence.lastSeenAt} > now() - interval '30 seconds'`,
        ),
      );
    const items = rows.map((r) => ({
      participantId: r.participantId,
      name: r.name,
      initials: r.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join(''),
    }));
    return c.json({ items } satisfies ListPresenceResponse);
  });

  app.patch('/sandbox-documents/:id', documentScope, async (c) => {
    const body = patchSandboxDocumentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'content required' } satisfies ApiError, 400);
    }
    const [locked] = await deps.db
      .select({ headLocked: s.sandboxDocuments.headLocked })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    if (locked?.headLocked) {
      // checked out: an internal round is open on the frozen head (ADR-0032)
      return c.json({ error: 'conflict', detail: 'head_locked' } satisfies ApiError, 409);
    }
    const [row] = await deps.db
      .update(s.sandboxDocuments)
      // DB time, like the insert default — one clock for updatedAt
      .set({ content: body.data.content, updatedAt: sql`now()` })
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .returning();
    // the ambient history: a snapshot at every save boundary (T-128,
    // ADR-0032) — a working tool, browsable and restorable, never a record
    await deps.db.insert(s.sandboxDocumentVersions).values({
      sandboxDocumentId: row!.id,
      content: row!.content,
      createdByParticipantId: c.get('slice').participantId,
    });
    return c.json(toSandboxDocument(row!));
  });

  // T-128 — the ambient history, newest first (content stays behind restore)
  app.get('/sandbox-documents/:id/history', documentScope, async (c) => {
    const rows = await deps.db
      .select({
        id: s.sandboxDocumentVersions.id,
        sandboxDocumentId: s.sandboxDocumentVersions.sandboxDocumentId,
        createdAt: s.sandboxDocumentVersions.createdAt,
        participantId: s.sandboxDocumentVersions.createdByParticipantId,
        name: s.users.name,
      })
      .from(s.sandboxDocumentVersions)
      .innerJoin(s.participants, eq(s.sandboxDocumentVersions.createdByParticipantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, c.req.param('id')))
      .orderBy(desc(s.sandboxDocumentVersions.createdAt));
    const items = rows.map((r) => ({
      id: r.id,
      sandboxDocumentId: r.sandboxDocumentId,
      createdBy: { participantId: r.participantId, name: r.name },
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json({ items } satisfies ListSandboxHistoryResponse);
  });

  // Restore copies a snapshot back into the head — never rewrites history.
  app.post('/sandbox-documents/:id/restore', documentScope, async (c) => {
    const body = restoreSandboxVersionBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid' } satisfies ApiError, 400);
    const [locked] = await deps.db
      .select({ headLocked: s.sandboxDocuments.headLocked })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    if (locked?.headLocked) {
      return c.json({ error: 'conflict', detail: 'head_locked' } satisfies ApiError, 409);
    }
    const [snapshot] = await deps.db
      .select()
      .from(s.sandboxDocumentVersions)
      .where(
        and(
          eq(s.sandboxDocumentVersions.id, body.data.historyVersionId),
          eq(s.sandboxDocumentVersions.sandboxDocumentId, c.req.param('id')),
        ),
      )
      .limit(1);
    if (!snapshot) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    const [row] = await deps.db
      .update(s.sandboxDocuments)
      .set({ content: snapshot.content, updatedAt: sql`now()` })
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .returning();
    await deps.db.insert(s.sandboxDocumentVersions).values({
      sandboxDocumentId: row!.id,
      content: row!.content,
      createdByParticipantId: c.get('slice').participantId,
    });
    return c.json(toSandboxDocument(row!));
  });

  // T-128 — safe lifecycle (the ProjectWise A1 fold-in): soft-delete with
  // self-service restore; recovery is never a helpdesk ticket.
  app.delete('/sandbox-documents/:id', documentScope, async (c) => {
    const [row] = await deps.db
      .update(s.sandboxDocuments)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(s.sandboxDocuments.id, c.req.param('id')), isNull(s.sandboxDocuments.deletedAt)))
      .returning();
    if (!row) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    return c.json(toSandboxDocument(row));
  });

  app.post('/sandbox-documents/:id/undelete', documentScope, async (c) => {
    const [row] = await deps.db
      .update(s.sandboxDocuments)
      .set({ deletedAt: null })
      .where(and(eq(s.sandboxDocuments.id, c.req.param('id')), sql`${s.sandboxDocuments.deletedAt} IS NOT NULL`))
      .returning();
    if (!row) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    return c.json(toSandboxDocument(row));
  });

  return app;
}

export function toSandboxDocument(row: typeof s.sandboxDocuments.$inferSelect): SandboxDocument {
  return {
    id: row.id,
    projectId: row.projectId,
    organisationId: row.organisationId,
    title: row.title,
    origin: row.origin,
    kind: row.kind,
    format: row.format,
    content: row.content,
    containerId: row.containerId,
    sandboxId: row.sandboxId,
    folderId: row.folderId,
    authoringMetadata: (row.authoringMetadata ?? {}) as Record<string, unknown>,
    headLocked: row.headLocked,
    updatedAt: row.updatedAt.toISOString(),
  };
}
