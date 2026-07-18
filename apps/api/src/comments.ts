// T-112 — sandbox comments: Word-style working-draft threads on a sandbox
// document, mutable like the sandbox itself (distinct from the append-only
// DRR Comment, Slice A). Scope rides the document's: the org-private sandbox,
// so the wall needs no new rule here. Author-only writes answer `forbidden` —
// the one within-the-wall case the envelope carries it for.
import { Hono } from 'hono';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  createSandboxCommentBody,
  patchSandboxCommentBody,
  setSandboxCommentStatusBody,
} from '@infora/contracts';
import type {
  ApiError,
  ListSandboxCommentsResponse,
  SandboxComment,
} from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';

type CommentRow = typeof s.sandboxComments.$inferSelect;

export function commentRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);
  const documentScope = resourceScope(deps, 'id', resourceHomes.sandboxDocument);
  const commentScope = resourceScope(deps, 'id', resourceHomes.sandboxComment);

  // (The @-mention picker moved to administration.ts at T-117: the project
  // roster, widened per ADR-0033.)

  app.get('/sandbox-documents/:id/comments', documentScope, async (c) => {
    const rows = await deps.db
      .select()
      .from(s.sandboxComments)
      .where(eq(s.sandboxComments.sandboxDocumentId, c.req.param('id')))
      .orderBy(asc(s.sandboxComments.createdAt));
    return c.json({ items: await withNames(deps.db, rows) } satisfies ListSandboxCommentsResponse);
  });

  app.post('/sandbox-documents/:id/comments', documentScope, async (c) => {
    const body = createSandboxCommentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'body required' } satisfies ApiError, 400);
    }
    const slice = c.get('slice');
    const documentId = c.req.param('id');

    if (body.data.parentCommentId !== undefined) {
      // a reply points at a root on this document; one level deep by design
      const [parent] = await deps.db
        .select()
        .from(s.sandboxComments)
        .where(eq(s.sandboxComments.id, body.data.parentCommentId))
        .limit(1);
      if (!parent || parent.sandboxDocumentId !== documentId || parent.parentCommentId !== null) {
        return c.json(
          { error: 'invalid', detail: 'parentCommentId must be a thread root on this document' } satisfies ApiError,
          400,
        );
      }
    }

    const badMention = await invalidMention(deps.db, slice, body.data.mentions ?? []);
    if (badMention) {
      return c.json(
        { error: 'invalid', detail: 'mentions must name participants who can see this document' } satisfies ApiError,
        400,
      );
    }

    const [row] = await deps.db
      .insert(s.sandboxComments)
      .values({
        sandboxDocumentId: documentId,
        parentCommentId: body.data.parentCommentId ?? null,
        authorParticipantId: slice.participantId,
        body: body.data.body,
        anchor: body.data.anchor ?? null,
        mentions: body.data.mentions ?? [],
      })
      .returning();
    return c.json((await withNames(deps.db, [row!]))[0]!, 201);
  });

  // author-only body/mention edit — mutable like the sandbox
  app.patch('/sandbox-comments/:id', commentScope, async (c) => {
    const body = patchSandboxCommentBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'body required' } satisfies ApiError, 400);
    }
    const slice = c.get('slice');
    const comment = await readComment(deps.db, c.req.param('id'));
    if (comment.authorParticipantId !== slice.participantId) {
      return c.json({ error: 'forbidden', detail: 'only the author may edit a comment' } satisfies ApiError, 403);
    }
    const badMention = await invalidMention(deps.db, slice, body.data.mentions ?? []);
    if (badMention) {
      return c.json(
        { error: 'invalid', detail: 'mentions must name participants who can see this document' } satisfies ApiError,
        400,
      );
    }
    const [row] = await deps.db
      .update(s.sandboxComments)
      .set({
        body: body.data.body,
        ...(body.data.mentions !== undefined ? { mentions: body.data.mentions } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(s.sandboxComments.id, comment.id))
      .returning();
    return c.json((await withNames(deps.db, [row!]))[0]!);
  });

  // author-only; deleting a root deletes its thread (FK cascade)
  app.delete('/sandbox-comments/:id', commentScope, async (c) => {
    const slice = c.get('slice');
    const comment = await readComment(deps.db, c.req.param('id'));
    if (comment.authorParticipantId !== slice.participantId) {
      return c.json({ error: 'forbidden', detail: 'only the author may delete a comment' } satisfies ApiError, 403);
    }
    await deps.db.delete(s.sandboxComments).where(eq(s.sandboxComments.id, comment.id));
    return c.body(null, 204);
  });

  // close/reopen the thread — any entitled participant, not just the author:
  // "suggest an edit" is prose in a comment, and the colleague who makes the
  // manual edit closes it
  app.post('/sandbox-comments/:id/status', commentScope, async (c) => {
    const body = setSandboxCommentStatusBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid', detail: 'status required' } satisfies ApiError, 400);
    }
    const slice = c.get('slice');
    const comment = await readComment(deps.db, c.req.param('id'));
    if (comment.parentCommentId !== null) {
      return c.json({ error: 'invalid', detail: 'status lives on the thread root' } satisfies ApiError, 400);
    }
    const closing = body.data.status === 'closed';
    const [row] = await deps.db
      .update(s.sandboxComments)
      .set({
        status: body.data.status,
        closedByParticipantId: closing ? slice.participantId : null,
        closedAt: closing ? sql`now()` : null,
        updatedAt: sql`now()`,
      })
      .where(eq(s.sandboxComments.id, comment.id))
      .returning();
    return c.json((await withNames(deps.db, [row!]))[0]!);
  });

  return app;
}

/** The comment row behind an already-scoped :id — scoping proved it exists. */
async function readComment(db: Db, id: string): Promise<CommentRow> {
  const [row] = await db.select().from(s.sandboxComments).where(eq(s.sandboxComments.id, id)).limit(1);
  return row!;
}

/** True when any mention is not an entitled same-org participant on the project. */
async function invalidMention(
  db: Db,
  slice: { projectId: string; organisationId: string },
  mentions: string[],
): Promise<boolean> {
  if (mentions.length === 0) return false;
  const rows = await db
    .select({ id: s.participants.id })
    .from(s.participants)
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .where(
      and(
        inArray(s.participants.id, mentions),
        eq(s.participants.projectId, slice.projectId),
        eq(s.users.organisationId, slice.organisationId),
      ),
    );
  return rows.length !== new Set(mentions).size;
}

/** Rows → contract shape, author/closedBy names resolved in one query. */
async function withNames(db: Db, rows: CommentRow[]): Promise<SandboxComment[]> {
  const participantIds = [
    ...new Set(rows.flatMap((r) => [r.authorParticipantId, r.closedByParticipantId ?? []].flat())),
  ];
  const names = new Map(
    participantIds.length === 0
      ? []
      : (
          await db
            .select({ participantId: s.participants.id, name: s.users.name })
            .from(s.participants)
            .innerJoin(s.users, eq(s.participants.userId, s.users.id))
            .where(inArray(s.participants.id, participantIds))
        ).map((r) => [r.participantId, r.name] as const),
  );
  return rows.map((r) => ({
    id: r.id,
    sandboxDocumentId: r.sandboxDocumentId,
    parentCommentId: r.parentCommentId,
    author: { participantId: r.authorParticipantId, name: names.get(r.authorParticipantId) ?? '' },
    body: r.body,
    anchor: r.anchor,
    status: r.status,
    closedBy: r.closedByParticipantId
      ? { participantId: r.closedByParticipantId, name: names.get(r.closedByParticipantId) ?? '' }
      : null,
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    mentions: r.mentions,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
