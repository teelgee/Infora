// T-051 — sandbox documents: create, list, open. The sandbox is the
// uncontrolled working area (draft-location decision): one implicit private
// project sandbox per organisation (ADR-0018), so every read here is scoped
// to the requester's organisation by construction — there is no parameter.
// Manual editing (PATCH) stays with T-082.
import { Hono } from 'hono';
import { and, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  createSandboxDocumentBody,
  patchSandboxDocumentBody,
  patchSandboxMetadataBody,
  renameSandboxDocumentBody,
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
//
// T-394 — it is named after the organisation that owns it, and the name is a
// TEST SUBSTRATE fact as much as a display one. It used to be the literal
// string `Sandbox`, which is also the label of the sandbox screen's own
// "+ Sandbox" toolbar control — so the moment anything created a document, the
// screen carried two controls whose accessible name was `Sandbox`, and every
// `getByRole('button', { name: 'Sandbox' })` in the browser suite became a
// strict-mode violation. That is a collision the product created for itself,
// not a selector problem: the org's default working area is *the
// organisation's*, and saying so is both the better label and a name no
// toolbar button can share. `sandboxDefaultName` is exported so the guard
// against the collision returning can be a test rather than a convention.
export function sandboxDefaultName(organisationName: string): string {
  // deliberately does not contain the word "sandbox": a non-exact role query
  // for `Sandbox` matches by substring, so a name like "Acme — project
  // sandbox" would re-create exactly the ambiguity this ticket removed. The
  // noun is CONTEXT.md's own opening word for a sandbox, and it keeps the card
  // from reading as its owner line repeated twice.
  return `${organisationName} — working area`;
}

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
  const [organisation] = await db
    .select({ name: s.organisations.name })
    .from(s.organisations)
    .where(eq(s.organisations.id, organisationId))
    .limit(1);
  const [sandbox] = await db
    .insert(s.sandboxes)
    .values({
      projectId,
      name: sandboxDefaultName(organisation!.name),
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
    // the working revision per document (ISO 19650 v0.x, ADR-0041): one grouped
    // count over the ambient history, never a query per row
    const counts = rows.length
      ? await deps.db
          .select({ docId: s.sandboxDocumentVersions.sandboxDocumentId, n: count() })
          .from(s.sandboxDocumentVersions)
          .where(inArray(s.sandboxDocumentVersions.sandboxDocumentId, rows.map((r) => r.id)))
          .groupBy(s.sandboxDocumentVersions.sandboxDocumentId)
      : [];
    const countByDoc = new Map(counts.map((r) => [r.docId, Number(r.n)]));
    // the freeze-series container per document (T-355): one batched lookup —
    // org-private machinery, and these are already the org's own documents
    const freezeRows = rows.length
      ? await deps.db
          .select({ id: s.containers.id, sandboxDocumentId: s.containers.sandboxDocumentId })
          .from(s.containers)
          .where(
            and(
              inArray(s.containers.sandboxDocumentId, rows.map((r) => r.id)),
              eq(s.containers.scope, 'sandbox'),
            ),
          )
      : [];
    const freezeByDoc = new Map(freezeRows.map((r) => [r.sandboxDocumentId!, r.id]));
    return c.json({
      items: rows.map((r) => toSandboxDocument(r, countByDoc.get(r.id) ?? 0, freezeByDoc.get(r.id) ?? null)),
    } satisfies ListSandboxDocumentsResponse);
  });

  const documentScope = resourceScope(deps, 'id', resourceHomes.sandboxDocument);

  app.get('/sandbox-documents/:id', documentScope, async (c) => {
    const [row] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    const [freeze] = await deps.db
      .select({ id: s.containers.id })
      .from(s.containers)
      .where(and(eq(s.containers.sandboxDocumentId, row!.id), eq(s.containers.scope, 'sandbox')))
      .limit(1);
    return c.json(toSandboxDocument(row!, undefined, freeze?.id ?? null));
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

  // T-220 — rename (ADR-0043 P1, ADR-0038): the display name only. Like the
  // metadata edit it is author-owned, takes no ambient version, and is allowed
  // while the head is checked out (a title isn't canonical content). A bound
  // document's name is the container's plan-owned reference, so renaming one is
  // refused (409 bound) — it stays stable across the working-doc lifecycle.
  app.patch('/sandbox-documents/:id/title', documentScope, async (c) => {
    const body = renameSandboxDocumentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'title required' } satisfies ApiError, 400);
    }
    const [doc] = await deps.db
      .select({ containerId: s.sandboxDocuments.containerId })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    if (!doc) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    if (doc.containerId) {
      return c.json({ error: 'conflict', detail: 'bound' } satisfies ApiError, 409);
    }
    const [row] = await deps.db
      .update(s.sandboxDocuments)
      .set({ title: body.data.title, updatedAt: sql`now()` })
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .returning();
    return c.json(toSandboxDocument(row!));
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
    // rows are newest-first; the working series counts from the oldest, so v0.1 is
    // the first snapshot and the newest is v0.{total} (ADR-0041)
    const items = rows.map((r, i) => ({
      id: r.id,
      sandboxDocumentId: r.sandboxDocumentId,
      versionReference: `v0.${rows.length - i}`,
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
    const [locked] = await deps.db
      .select({ headLocked: s.sandboxDocuments.headLocked })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    // a checked-out document must be released before it can be removed (T-180)
    if (locked?.headLocked) return c.json({ error: 'conflict', detail: 'head_locked' } satisfies ApiError, 409);
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

// ambientCount = number of ambient save-snapshots; the working revision is
// v0.{count} (the initial head is v0.1, ADR-0041). Omitted when not resolved.
export function toSandboxDocument(
  row: typeof s.sandboxDocuments.$inferSelect,
  ambientCount?: number,
  freezeContainerId?: string | null,
): SandboxDocument {
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
    ...(ambientCount !== undefined && { workingRevision: `v0.${Math.max(1, ambientCount)}` }),
    // T-355: the internal QA cycle's container, resolved on list/read — the
    // freeze endpoint was the only place this id ever surfaced before
    ...(freezeContainerId !== undefined && { freezeContainerId }),
    updatedAt: row.updatedAt.toISOString(),
  };
}
