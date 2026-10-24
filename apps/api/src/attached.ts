// T-154 — the attached-source working set (ADR-0022 refined). Pin one or several
// sources (sandbox / upload / web) to a Conversation and list/unpin them; the set
// persists across the conversation's runs as an interval. Access follows the
// conversation: a document-bound (multiplayer) conversation is gated on the
// document's sandbox scope (ADR-0039); otherwise the project slice. Attached
// sources never join a corpus and never ground — they live beside the run record.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { pinAttachedSourceBody } from '@infora/contracts';
import type { ApiError, AttachedSource, ListAttachedSourcesResponse } from '@infora/contracts';
import { canAccessSandbox } from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { deliverableVisibleSql as deliverableVisible } from '@infora/knowledge';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { admittingCodes, contextStateOf } from './context-state';
import { resolveSlice } from './requester';
import { checkReach, unreachableRefusal } from './working-set';
import type { AppEnv, UserRow } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

/**
 * T-391 — THE MARKER on a library pin: what the document is, and why it is out
 * of the AI's ordinary reach.
 *
 * Pinning an out-of-context document is legal and deliberate (ADR-0022). What
 * separates that from dangerous use is the reader knowing WHY it is out —
 * *"withdrawn — the survey it rests on has been retracted"* reads differently
 * from a bare *"withdrawn"*, and differently again from *"superseded"*. The
 * reason's visibility follows the container (ADR-0013 §4), so anyone who could
 * pin it could already read it, and no new visibility rule is introduced here.
 *
 * Resolved through the SAME `contextStateOf` derivation the plan and the
 * library reads use, so the badge on a pinned source and the badge on the
 * deliverable itself cannot say different things.
 */
async function libraryMarkers(
  db: Db,
  slice: EntitledSlice,
  containerIds: string[],
): Promise<Map<string, NonNullable<AttachedSource['document']>>> {
  const markers = new Map<string, NonNullable<AttachedSource['document']>>();
  const ids = containerIds.filter((id) => isUuid(id));
  if (ids.length === 0) return markers;
  // the wall, in SQL: a pin whose container the requester can no longer see
  // resolves to nothing rather than leaking a reference through its own badge
  const rows = await db
    .select({
      id: s.containers.id,
      documentReference: s.containers.documentReference,
      inLibrary: s.containers.inLibrary,
      state: s.containers.state,
      withdrawnReason: s.containers.withdrawnReason,
    })
    .from(s.containers)
    .where(and(inArray(s.containers.id, ids), deliverableVisible(slice)));
  const codes = await admittingCodes(db, rows.map((r) => r.id));
  for (const row of rows) {
    markers.set(row.id, {
      containerId: row.id,
      documentReference: row.documentReference ?? '',
      contextState: contextStateOf(row, codes.get(row.id)),
      // a reason is only a WITHDRAWAL reason once the withdrawal is in force —
      // while it is merely proposed the container is still live and the field
      // carries the proposal instead (T-384)
      withdrawnReason: row.state === 'withdrawn' ? row.withdrawnReason : null,
    });
  }
  return markers;
}

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
    const markers = await libraryMarkers(
      deps.db,
      ctx.slice,
      rows.filter((r) => r.kind === 'library').map((r) => r.ref),
    );
    // T-471 — a `sandbox` pin is shown to a reader only if THEY are in the
    // working area its document sits in. Anyone else on the thread gets the
    // TITLE it was pinned with and a blank ref — the title is public, the id is
    // withheld (the owner's ruling closing Q-057, ADR-0022). `pinnedBy` is not
    // sent. Checked per document, through the sandbox's own grants.
    const { reachable } = await checkReach(
      deps.db,
      ctx.slice,
      rows.filter((r) => r.kind === 'sandbox').map((r) => r.ref),
    );
    const mayShow = new Set(reachable.map((doc) => doc.id as string));
    const items: AttachedSource[] = rows.map((r) =>
      r.kind === 'sandbox' && !mayShow.has(r.ref)
        ? { id: r.id, conversationId: r.conversationId, kind: r.kind, ref: '', label: r.label, openToYou: false, document: null }
        : {
            id: r.id,
            conversationId: r.conversationId,
            kind: r.kind,
            ref: r.ref,
            label: r.label,
            document: r.kind === 'library' ? (markers.get(r.ref) ?? null) : null,
          },
    );
    return c.json({ items } satisfies ListAttachedSourcesResponse);
  });

  app.post('/conversations/:conversationId/attached-sources', async (c) => {
    const ctx = await resolveConversation(c.get('user'), c.req.param('conversationId'));
    if (!ctx) return notFound(c);
    const parsed = pinAttachedSourceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    // T-391 — a library pin names a real container the requester may see, and
    // is refused otherwise. The other kinds keep their free `ref` (a URL, a
    // file reference), which is what makes this check specific rather than a
    // new rule for everything.
    let marker: AttachedSource['document'] = null;
    if (parsed.data.kind === 'library') {
      marker = (await libraryMarkers(deps.db, ctx.slice, [parsed.data.ref])).get(parsed.data.ref) ?? null;
      if (!marker) return notFound(c);
    }
    // T-471 — and a `sandbox` pin names a document in a working area the
    // requester is part of, checked here through the sandbox's own grants. It
    // was not checked at all before this ticket: the ref was stored as sent. The
    // label is the document's own title, taken from the store rather than from
    // the body, so what a thread shows is what the document is called.
    let label = parsed.data.label ?? null;
    if (parsed.data.kind === 'sandbox') {
      const { reachable } = await checkReach(deps.db, ctx.slice, [parsed.data.ref]);
      const doc = reachable[0];
      if (doc === undefined) {
        return c.json(
          { error: 'invalid', detail: unreachableRefusal(['That document']) } satisfies ApiError,
          400,
        );
      }
      label = doc.title;
    }
    const [row] = await deps.db
      .insert(s.attachedSources)
      .values({
        conversationId: ctx.conv.id,
        kind: parsed.data.kind,
        ref: parsed.data.ref,
        label,
        pinnedByParticipantId: ctx.slice.participantId,
      })
      .returning();
    const body: AttachedSource = {
      id: row!.id,
      conversationId: row!.conversationId,
      kind: row!.kind,
      ref: row!.ref,
      label: row!.label,
      document: marker,
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
