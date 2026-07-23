// T-154 — the attached-source working set (ADR-0022 refined). Pin one or several
// sources (sandbox / upload / web) to a Conversation and list/unpin them; the set
// persists across the conversation's runs as an interval. Access follows the
// conversation: a document-bound (multiplayer) conversation is gated on the
// document's sandbox scope (ADR-0039); otherwise the project slice. Attached
// sources never join a corpus and never ground — they live beside the run record.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { pinAttachedSourceBody } from '@infora/contracts';
import type { ApiError, AttachedSource, ListAttachedSourcesResponse } from '@infora/contracts';
import { canAccessSandbox } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

export function attachedSourceRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  // resolve a conversation to the requester's slice, gating a multiplayer
  // (document-bound) conversation on the document's sandbox scope
  async function resolveConversation(user: UserRow, conversationId: string) {
    if (!isUuid(conversationId)) return null;
    const [conv] = await deps.db
      .select()
      .from(s.conversations)
      .where(eq(s.conversations.id, conversationId))
      .limit(1);
    if (!conv) return null;
    const slice = await resolveSlice(deps.db, user, conv.projectId);
    if (!slice) return null;
    if (conv.sandboxDocumentId) {
      const [doc] = await deps.db
        .select()
        .from(s.sandboxDocuments)
        .where(eq(s.sandboxDocuments.id, conv.sandboxDocumentId))
        .limit(1);
      if (!doc) return null;
      if (doc.sandboxId) {
        const grants = await deps.db
          .select()
          .from(s.sandboxScopeGrants)
          .where(and(eq(s.sandboxScopeGrants.sandboxId, doc.sandboxId), isNull(s.sandboxScopeGrants.removedAt)));
        if (!canAccessSandbox(slice, grants.map((g) => ({ granteeType: g.granteeType, organisationId: g.organisationId, participantId: g.participantId, removedAt: g.removedAt })))) {
          return null;
        }
      } else if (doc.organisationId !== slice.organisationId) {
        return null; // org-private fallback while sandbox_id is unwired
      }
    }
    return { slice, conv };
  }

  app.get('/conversations/:conversationId/attached-sources', async (c) => {
    const ctx = await resolveConversation(c.get('user'), c.req.param('conversationId'));
    if (!ctx) return notFound(c);
    const rows = await deps.db
      .select()
      .from(s.attachedSources)
      .where(and(eq(s.attachedSources.conversationId, ctx.conv.id), isNull(s.attachedSources.removedAt)))
      .orderBy(desc(s.attachedSources.pinnedAt));
    const items: AttachedSource[] = rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      kind: r.kind,
      ref: r.ref,
      label: r.label,
    }));
    return c.json({ items } satisfies ListAttachedSourcesResponse);
  });

  app.post('/conversations/:conversationId/attached-sources', async (c) => {
    const ctx = await resolveConversation(c.get('user'), c.req.param('conversationId'));
    if (!ctx) return notFound(c);
    const parsed = pinAttachedSourceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const [row] = await deps.db
      .insert(s.attachedSources)
      .values({
        conversationId: ctx.conv.id,
        kind: parsed.data.kind,
        ref: parsed.data.ref,
        label: parsed.data.label ?? null,
        pinnedByParticipantId: ctx.slice.participantId,
      })
      .returning();
    const body: AttachedSource = {
      id: row!.id,
      conversationId: row!.conversationId,
      kind: row!.kind,
      ref: row!.ref,
      label: row!.label,
    };
    return c.json(body, 201);
  });

  app.post('/attached-sources/:sourceId/unpin', async (c) => {
    const sourceId = c.req.param('sourceId');
    if (!isUuid(sourceId)) return notFound(c);
    const [source] = await deps.db
      .select()
      .from(s.attachedSources)
      .where(eq(s.attachedSources.id, sourceId))
      .limit(1);
    if (!source || source.removedAt) return notFound(c);
    const ctx = await resolveConversation(c.get('user'), source.conversationId);
    if (!ctx) return notFound(c);
    await deps.db
      .update(s.attachedSources)
      .set({ removedAt: new Date() })
      .where(eq(s.attachedSources.id, sourceId));
    return c.json({ ok: true });
  });

  return app;
}
