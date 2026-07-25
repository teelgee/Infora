// T-153 — sandboxes, the participant scope, folders, and the bind action
// (ADR-0036/0038). Sandbox access is grant-based, not just owning-org: a
// participant reaches a sandbox iff a live scope grant admits them
// (canAccessSandbox). Self-serve within one's own organisation; a cross-org
// (organisation) grant is owner-gated (ADR-0018). Bind is the one-way transition
// (the DB trigger enforces one-way; here we record the binding_event).
// Freeze / launch-review / promote already have endpoints (Slice A, cycle.ts).
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  bindDocumentBody,
  createFolderBody,
  createSandboxBody,
  grantSandboxScopeBody,
  moveDocumentBody,
  moveFolderBody,
  updateSandboxSettingsBody,
} from '@infora/contracts';
import type {
  ApiError,
  GetSandboxResponse,
  ListFoldersResponse,
  ListSandboxesResponse,
  Sandbox,
  SandboxFolder,
  SandboxScopeGrantView,
} from '@infora/contracts';
import {
  canAccessSandbox,
  canConfigureSandbox,
  type EntitledSlice,
  type SandboxScopeGrant,
} from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const conflict = (c: Context) => c.json({ error: 'conflict' } satisfies ApiError, 409);
const forbidden = (c: Context, detail?: string) =>
  c.json({ error: 'forbidden', ...(detail && { detail }) } satisfies ApiError, 403);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

async function liveGrants(db: Db, sandboxId: string): Promise<SandboxScopeGrant[]> {
  const rows = await db
    .select()
    .from(s.sandboxScopeGrants)
    .where(and(eq(s.sandboxScopeGrants.sandboxId, sandboxId), isNull(s.sandboxScopeGrants.removedAt)));
  return rows.map((r) => ({
    granteeType: r.granteeType,
    organisationId: r.organisationId,
    participantId: r.participantId,
    removedAt: r.removedAt,
  }));
}

// Resolve a sandbox to its accessing slice: project scope, then the grant-based
// participant-private check (ADR-0036). Null is deny — indistinguishable from
// nonexistence.
async function resolveSandbox(
  db: Db,
  user: UserRow,
  sandboxId: string,
): Promise<{ slice: EntitledSlice; sandbox: typeof s.sandboxes.$inferSelect } | null> {
  if (!isUuid(sandboxId)) return null;
  const [sandbox] = await db.select().from(s.sandboxes).where(eq(s.sandboxes.id, sandboxId)).limit(1);
  if (!sandbox) return null;
  const slice = await resolveSlice(db, user, sandbox.projectId);
  if (!slice) return null;
  const grants = await liveGrants(db, sandboxId);
  if (!canAccessSandbox(slice, grants)) return null;
  return { slice, sandbox };
}

const toView = (r: typeof s.sandboxScopeGrants.$inferSelect): SandboxScopeGrantView => ({
  id: r.id,
  granteeType: r.granteeType,
  organisationId: r.organisationId,
  participantId: r.participantId,
});
const toSandbox = (r: typeof s.sandboxes.$inferSelect, slice: EntitledSlice): Sandbox => ({
  id: r.id,
  projectId: r.projectId,
  name: r.name,
  scope: r.scope,
  owningOrganisationId: r.owningOrganisationId,
  allowMemberFolderCreate: r.allowMemberFolderCreate,
  canConfigure: canConfigureSandbox(slice, r),
});

export function sandboxRoutes2(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  // create a sandbox — self-serve within own org; multi_org is owner-gated
  app.post('/projects/:projectId/sandboxes', project, async (c) => {
    const slice = c.get('slice');
    const parsed = createSandboxBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    if (parsed.data.scope === 'multi_org' && slice.membershipRole !== 'owner') return notFound(c);
    const [sandbox] = await deps.db
      .insert(s.sandboxes)
      .values({
        projectId: slice.projectId,
        name: parsed.data.name,
        scope: parsed.data.scope,
        owningOrganisationId: slice.organisationId,
        createdByParticipantId: slice.participantId,
      })
      .returning();
    // auto-grant the creator in: an org grant for org-scoped sandboxes, a
    // participant grant for the team / named-user rungs
    if (parsed.data.scope === 'single_org' || parsed.data.scope === 'multi_org') {
      await deps.db.insert(s.sandboxScopeGrants).values({
        sandboxId: sandbox!.id,
        granteeType: 'organisation',
        organisationId: slice.organisationId,
        grantedByParticipantId: slice.participantId,
      });
    } else {
      await deps.db.insert(s.sandboxScopeGrants).values({
        sandboxId: sandbox!.id,
        granteeType: 'participant',
        participantId: slice.participantId,
        grantedByParticipantId: slice.participantId,
      });
    }
    return c.json(toSandbox(sandbox!, slice), 201);
  });

  // list the sandboxes the requester can access (grant-based)
  app.get('/projects/:projectId/sandboxes', project, async (c) => {
    const slice = c.get('slice');
    const rows = await deps.db
      .select()
      .from(s.sandboxes)
      .where(eq(s.sandboxes.projectId, slice.projectId));
    const items: Sandbox[] = [];
    for (const r of rows) {
      if (canAccessSandbox(slice, await liveGrants(deps.db, r.id))) items.push(toSandbox(r, slice));
    }
    return c.json({ items } satisfies ListSandboxesResponse);
  });

  app.get('/sandboxes/:sandboxId', async (c) => {
    const ctx = await resolveSandbox(deps.db, c.get('user'), c.req.param('sandboxId'));
    if (!ctx) return notFound(c);
    const grants = await deps.db
      .select()
      .from(s.sandboxScopeGrants)
      .where(and(eq(s.sandboxScopeGrants.sandboxId, ctx.sandbox.id), isNull(s.sandboxScopeGrants.removedAt)));
    const body: GetSandboxResponse = { ...toSandbox(ctx.sandbox, ctx.slice), grants: grants.map(toView) };
    return c.json(body);
  });

  // configure a sandbox's settings (ADR-0040, T-181) — a super-user act: the
  // owning org's super-user, or the project owner-super (canConfigureSandbox)
  app.patch('/sandboxes/:sandboxId/settings', async (c) => {
    const ctx = await resolveSandbox(deps.db, c.get('user'), c.req.param('sandboxId'));
    if (!ctx) return notFound(c);
    if (!canConfigureSandbox(ctx.slice, ctx.sandbox)) return forbidden(c, 'super_user_only');
    const parsed = updateSandboxSettingsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const [updated] = await deps.db
      .update(s.sandboxes)
      .set({
        ...(parsed.data.allowMemberFolderCreate !== undefined && {
          allowMemberFolderCreate: parsed.data.allowMemberFolderCreate,
        }),
      })
      .where(eq(s.sandboxes.id, ctx.sandbox.id))
      .returning();
    return c.json(toSandbox(updated!, ctx.slice));
  });

  // widen the scope. A cross-organisation grant (an org other than the owning
  // org) is owner-gated (ADR-0018); own-org and participant grants are self-serve
  app.post('/sandboxes/:sandboxId/scope-grants', async (c) => {
    const ctx = await resolveSandbox(deps.db, c.get('user'), c.req.param('sandboxId'));
    if (!ctx) return notFound(c);
    const parsed = grantSandboxScopeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const crossOrg =
      parsed.data.organisationId !== undefined &&
      parsed.data.organisationId !== ctx.sandbox.owningOrganisationId;
    if (crossOrg && ctx.slice.membershipRole !== 'owner') return notFound(c);
    // only the owning organisation (or the owner) administers the scope
    if (ctx.slice.membershipRole !== 'owner' && ctx.slice.organisationId !== ctx.sandbox.owningOrganisationId) {
      return notFound(c);
    }
    try {
      const [grant] = await deps.db
        .insert(s.sandboxScopeGrants)
        .values({
          sandboxId: ctx.sandbox.id,
          granteeType: parsed.data.organisationId ? 'organisation' : 'participant',
          organisationId: parsed.data.organisationId ?? null,
          participantId: parsed.data.participantId ?? null,
          grantedByParticipantId: ctx.slice.participantId,
        })
        .returning();
      return c.json(toView(grant!), 201);
    } catch {
      return conflict(c); // a live grant for that grantee already exists
    }
  });

  app.post('/sandbox-scope-grants/:grantId/revocation', async (c) => {
    const grantId = c.req.param('grantId');
    if (!isUuid(grantId)) return notFound(c);
    const [grant] = await deps.db
      .select()
      .from(s.sandboxScopeGrants)
      .where(eq(s.sandboxScopeGrants.id, grantId))
      .limit(1);
    if (!grant || grant.removedAt) return notFound(c);
    const ctx = await resolveSandbox(deps.db, c.get('user'), grant.sandboxId);
    if (!ctx) return notFound(c);
    if (ctx.slice.membershipRole !== 'owner' && ctx.slice.organisationId !== ctx.sandbox.owningOrganisationId) {
      return notFound(c);
    }
    await deps.db
      .update(s.sandboxScopeGrants)
      .set({ removedAt: new Date() })
      .where(eq(s.sandboxScopeGrants.id, grantId));
    return c.json({ ok: true });
  });

  // folders — anyone in the sandbox scope may organise the view
  app.get('/sandboxes/:sandboxId/folders', async (c) => {
    const ctx = await resolveSandbox(deps.db, c.get('user'), c.req.param('sandboxId'));
    if (!ctx) return notFound(c);
    const rows = await deps.db
      .select()
      .from(s.sandboxFolders)
      .where(eq(s.sandboxFolders.sandboxId, ctx.sandbox.id));
    const items: SandboxFolder[] = rows.map((r) => ({
      id: r.id,
      sandboxId: r.sandboxId,
      parentFolderId: r.parentFolderId,
      name: r.name,
    }));
    return c.json({ items } satisfies ListFoldersResponse);
  });

  app.post('/sandboxes/:sandboxId/folders', async (c) => {
    const ctx = await resolveSandbox(deps.db, c.get('user'), c.req.param('sandboxId'));
    if (!ctx) return notFound(c);
    // the per-sandbox setting: when member folder creation is off, only a
    // super-user of the sandbox may add folders — ordinary members work within
    // the structure the super-user laid out (ADR-0040, T-181)
    if (!ctx.sandbox.allowMemberFolderCreate && !canConfigureSandbox(ctx.slice, ctx.sandbox)) {
      return forbidden(c, 'member_folder_create_disabled');
    }
    const parsed = createFolderBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    // a parent folder, if given, must belong to this sandbox
    if (parsed.data.parentFolderId) {
      const [parent] = await deps.db
        .select({ sandboxId: s.sandboxFolders.sandboxId })
        .from(s.sandboxFolders)
        .where(eq(s.sandboxFolders.id, parsed.data.parentFolderId))
        .limit(1);
      if (!parent || parent.sandboxId !== ctx.sandbox.id) return invalid(c);
    }
    const [folder] = await deps.db
      .insert(s.sandboxFolders)
      .values({
        sandboxId: ctx.sandbox.id,
        parentFolderId: parsed.data.parentFolderId ?? null,
        name: parsed.data.name,
        createdByParticipantId: ctx.slice.participantId,
      })
      .returning();
    const body: SandboxFolder = {
      id: folder!.id,
      sandboxId: folder!.sandboxId,
      parentFolderId: folder!.parentFolderId,
      name: folder!.name,
    };
    return c.json(body, 201);
  });

  app.post('/folders/:folderId/move', async (c) => {
    const folderId = c.req.param('folderId');
    if (!isUuid(folderId)) return notFound(c);
    const [folder] = await deps.db
      .select()
      .from(s.sandboxFolders)
      .where(eq(s.sandboxFolders.id, folderId))
      .limit(1);
    if (!folder) return notFound(c);
    const ctx = await resolveSandbox(deps.db, c.get('user'), folder.sandboxId);
    if (!ctx) return notFound(c);
    const parsed = moveFolderBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    if (parsed.data.parentFolderId) {
      if (parsed.data.parentFolderId === folderId) return invalid(c); // no self-parent
      const [parent] = await deps.db
        .select({ sandboxId: s.sandboxFolders.sandboxId })
        .from(s.sandboxFolders)
        .where(eq(s.sandboxFolders.id, parsed.data.parentFolderId))
        .limit(1);
      if (!parent || parent.sandboxId !== folder.sandboxId) return invalid(c);
    }
    await deps.db
      .update(s.sandboxFolders)
      .set({ parentFolderId: parsed.data.parentFolderId })
      .where(eq(s.sandboxFolders.id, folderId));
    return c.json({ ok: true });
  });

  // move a document into a folder (or the root) of its own sandbox
  app.post('/sandbox-documents/:documentId/move', async (c) => {
    const documentId = c.req.param('documentId');
    if (!isUuid(documentId)) return notFound(c);
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, documentId))
      .limit(1);
    if (!doc) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), doc.projectId);
    // the document is organisation-private in the skeleton (ADR-0018)
    if (!slice || slice.organisationId !== doc.organisationId) return notFound(c);
    const parsed = moveDocumentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    if (parsed.data.folderId) {
      const [folder] = await deps.db
        .select({ sandboxId: s.sandboxFolders.sandboxId })
        .from(s.sandboxFolders)
        .where(eq(s.sandboxFolders.id, parsed.data.folderId))
        .limit(1);
      // the target folder must be in the document's own sandbox
      if (!folder || folder.sandboxId !== doc.sandboxId) return invalid(c);
    }
    await deps.db
      .update(s.sandboxDocuments)
      .set({ folderId: parsed.data.folderId })
      .where(eq(s.sandboxDocuments.id, documentId));
    return c.json({ ok: true });
  });

  // bind a working document to a planned container (ADR-0038) — one-way; the
  // producing side binds its own document to its own plan row
  app.post('/sandbox-documents/:documentId/binding', async (c) => {
    const documentId = c.req.param('documentId');
    if (!isUuid(documentId)) return notFound(c);
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, documentId))
      .limit(1);
    if (!doc) return notFound(c);
    const slice = await resolveSlice(deps.db, c.get('user'), doc.projectId);
    if (!slice || slice.organisationId !== doc.organisationId) return notFound(c);
    if (doc.containerId) return conflict(c); // already bound — binding is one-way
    const parsed = bindDocumentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const [container] = await deps.db
      .select()
      .from(s.containers)
      .where(eq(s.containers.id, parsed.data.containerId))
      .limit(1);
    // the container must be a planned library row of the producer's own org
    if (
      !container ||
      container.projectId !== doc.projectId ||
      container.scope !== 'library' ||
      container.producingOrganisationId !== slice.organisationId
    ) {
      return invalid(c);
    }
    await deps.db.transaction(async (tx) => {
      await tx
        .update(s.sandboxDocuments)
        .set({ containerId: container.id })
        .where(eq(s.sandboxDocuments.id, documentId));
      await tx.insert(s.bindingEvents).values({
        sandboxDocumentId: documentId,
        containerId: container.id,
        boundByParticipantId: slice.participantId,
      });
    });
    return c.json({ ok: true, containerId: container.id });
  });

  return app;
}
