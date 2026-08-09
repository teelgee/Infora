// T-153 — sandboxes, the participant scope, folders, and the bind action
// (ADR-0036/0038). Sandbox access is grant-based, not just owning-org: a
// participant reaches a sandbox iff a live scope grant admits them
// (canAccessSandbox). Self-serve within one's own organisation; a cross-org
// (organisation) grant is owner-gated (ADR-0018). Bind is the one-way transition
// (the DB trigger enforces one-way; here we record the binding_event).
// Freeze / launch-review / promote already have endpoints (Slice A, cycle.ts).
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  bindDocumentBody,
  createFolderBody,
  createFolderStructureBody,
  createSandboxBody,
  grantSandboxScopeBody,
  moveDocumentBody,
  moveFolderBody,
  updateSandboxSettingsBody,
} from '@infora/contracts';
import type {
  ApiError,
  CreateFolderStructureResult,
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
  canCreateSandbox,
  type EntitledSlice,
  type SandboxScopeGrant,
} from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { projectScope, resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';
import { syncPlanLockedFolders, withinDeliverableFolder } from './plan-locked';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const conflict = (c: Context, detail?: string) =>
  c.json({ error: 'conflict', ...(detail && { detail }) } satisfies ApiError, 409);
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

// Every participant has a personal sandbox in the project (ADR-0036 refinement,
// T-186): server-provisioned, named_user scope, granted only to its owner.
// Idempotent — the partial unique index (created_by, is_personal) makes a
// concurrent double-create a no-op we swallow.
async function ensurePersonalSandbox(db: Db, slice: EntitledSlice): Promise<void> {
  const [existing] = await db
    .select({ id: s.sandboxes.id })
    .from(s.sandboxes)
    .where(
      and(
        eq(s.sandboxes.createdByParticipantId, slice.participantId),
        eq(s.sandboxes.isPersonal, true),
      ),
    )
    .limit(1);
  if (existing) return;
  try {
    const [sandbox] = await db
      .insert(s.sandboxes)
      .values({
        projectId: slice.projectId,
        name: 'Personal workspace',
        scope: 'named_user',
        owningOrganisationId: slice.organisationId,
        createdByParticipantId: slice.participantId,
        isPersonal: true,
      })
      .returning();
    await db.insert(s.sandboxScopeGrants).values({
      sandboxId: sandbox!.id,
      granteeType: 'participant',
      participantId: slice.participantId,
      grantedByParticipantId: slice.participantId,
    });
  } catch {
    // a concurrent request won the unique race — the personal sandbox now exists
  }
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
  planLocked: r.planLocked,
  canConfigure: canConfigureSandbox(slice, r),
  isPersonal: r.isPersonal,
});

const toFolder = (r: typeof s.sandboxFolders.$inferSelect): SandboxFolder => ({
  id: r.id,
  sandboxId: r.sandboxId,
  parentFolderId: r.parentFolderId,
  name: r.name,
  kind: r.kind,
  containerId: r.containerId,
});

export function sandboxRoutes2(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);

  // create a sandbox — a super-user act (ADR-0036 refinement, T-186): an ordinary
  // participant works in their personal sandbox and any they are admitted to;
  // a shared (cross-org) sandbox stays the owner-super's act (ADR-0018)
  app.post('/projects/:projectId/sandboxes', project, async (c) => {
    const slice = c.get('slice');
    const parsed = createSandboxBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    if (!canCreateSandbox(slice, parsed.data.scope)) return forbidden(c, 'super_user_only');
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
    // the wizard's initial access (T-187): admit whole organisations (validated to
    // be on the project; cross-org is already the owner-super's act via the scope
    // gate) and/or specific participants, at creation. Skips the owning org / the
    // creator (already granted) and de-dupes.
    const wantOrgs = [...new Set(parsed.data.organisationIds ?? [])].filter(
      (o) => o !== slice.organisationId,
    );
    if (wantOrgs.length) {
      const onProject = await deps.db
        .select({ organisationId: s.memberships.organisationId })
        .from(s.memberships)
        .where(and(eq(s.memberships.projectId, slice.projectId), inArray(s.memberships.organisationId, wantOrgs)));
      const valid = new Set(onProject.map((r) => r.organisationId));
      for (const organisationId of wantOrgs) {
        if (!valid.has(organisationId)) continue;
        await deps.db.insert(s.sandboxScopeGrants).values({
          sandboxId: sandbox!.id,
          granteeType: 'organisation',
          organisationId,
          grantedByParticipantId: slice.participantId,
        });
      }
    }
    const wantParticipants = [...new Set(parsed.data.participantIds ?? [])].filter(
      (p) => p !== slice.participantId,
    );
    if (wantParticipants.length) {
      const onProject = await deps.db
        .select({ id: s.participants.id })
        .from(s.participants)
        .where(and(eq(s.participants.projectId, slice.projectId), inArray(s.participants.id, wantParticipants)));
      const valid = new Set(onProject.map((r) => r.id));
      for (const participantId of wantParticipants) {
        if (!valid.has(participantId)) continue;
        await deps.db.insert(s.sandboxScopeGrants).values({
          sandboxId: sandbox!.id,
          granteeType: 'participant',
          participantId,
          grantedByParticipantId: slice.participantId,
        });
      }
    }
    return c.json(toSandbox(sandbox!, slice), 201);
  });

  // list the sandboxes the requester can access (grant-based)
  app.get('/projects/:projectId/sandboxes', project, async (c) => {
    const slice = c.get('slice');
    await ensurePersonalSandbox(deps.db, slice); // every participant has one (T-186)
    const rows = await deps.db
      .select()
      .from(s.sandboxes)
      .where(eq(s.sandboxes.projectId, slice.projectId));
    const items: Sandbox[] = [];
    for (const r of rows) {
      const grants = await liveGrants(deps.db, r.id);
      if (!canAccessSandbox(slice, grants)) continue;
      // the organisations admitted by a live org-grant — for the card's
      // owner/shared display (ADR-0036); participant-grant rungs add none
      const organisationIdsInScope = grants
        .filter((g) => g.granteeType === 'organisation' && g.organisationId)
        .map((g) => g.organisationId!);
      items.push({ ...toSandbox(r, slice), organisationIdsInScope });
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
        ...(parsed.data.planLocked !== undefined && { planLocked: parsed.data.planLocked }),
      })
      .where(eq(s.sandboxes.id, ctx.sandbox.id))
      .returning();
    // turning plan-locked on derives the tree from the plan as it stands
    // (T-365); turning it off deletes nothing — the derived folders remain
    if (parsed.data.planLocked === true) {
      await syncPlanLockedFolders(
        deps.db,
        updated!.projectId,
        updated!.owningOrganisationId,
        ctx.slice.participantId,
      );
    }
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
    return c.json({ items: rows.map(toFolder) } satisfies ListFoldersResponse);
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
    // plan-locked (T-365): the derived levels are system-owned — for EVERYONE,
    // super users included; hand-made folders live only inside a deliverable's
    // working folder, where the member toggle above already had its say
    if (ctx.sandbox.planLocked && !(await withinDeliverableFolder(deps.db, parsed.data.parentFolderId ?? null))) {
      return forbidden(c, 'plan_locked_structure');
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
    return c.json(toFolder(folder!), 201);
  });

  // create-folder-structure (ADR-0040, T-182): a super-user lays out a whole
  // nested tree at once. A super-user act — canConfigureSandbox, the same gate as
  // settings; laying out the structure for the team is exactly what the toggle
  // then holds ordinary members within.
  app.post('/sandboxes/:sandboxId/folder-structure', async (c) => {
    const ctx = await resolveSandbox(deps.db, c.get('user'), c.req.param('sandboxId'));
    if (!ctx) return notFound(c);
    if (!canConfigureSandbox(ctx.slice, ctx.sandbox)) return forbidden(c, 'super_user_only');
    // in plan-locked mode the plan IS the structure — the builder has nothing
    // to lay out at the system-owned levels (T-365; the free modes keep it)
    if (ctx.sandbox.planLocked) return conflict(c, 'plan_locked');
    const parsed = createFolderStructureBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    // guard against an unbounded tree — a builder mistake, not a real structure
    const total = (function count(nodes: typeof parsed.data.nodes): number {
      return nodes.reduce((n, node) => n + 1 + (node.children ? count(node.children) : 0), 0);
    })(parsed.data.nodes);
    if (total > 200) return invalid(c);
    // a starting parent, if given, must belong to this sandbox
    if (parsed.data.parentFolderId) {
      const [parent] = await deps.db
        .select({ sandboxId: s.sandboxFolders.sandboxId })
        .from(s.sandboxFolders)
        .where(eq(s.sandboxFolders.id, parsed.data.parentFolderId))
        .limit(1);
      if (!parent || parent.sandboxId !== ctx.sandbox.id) return invalid(c);
    }
    let created = 0;
    await deps.db.transaction(async (tx) => {
      const insertTree = async (nodes: typeof parsed.data.nodes, parentId: string | null) => {
        for (const node of nodes) {
          const [folder] = await tx
            .insert(s.sandboxFolders)
            .values({
              sandboxId: ctx.sandbox.id,
              parentFolderId: parentId,
              name: node.name,
              createdByParticipantId: ctx.slice.participantId,
            })
            .returning({ id: s.sandboxFolders.id });
          created += 1;
          if (node.children?.length) await insertTree(node.children, folder!.id);
        }
      };
      await insertTree(parsed.data.nodes, parsed.data.parentFolderId ?? null);
    });
    return c.json({ ok: true, created } satisfies CreateFolderStructureResult, 201);
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
    // a derived folder is the plan's, not a person's — it neither moves nor
    // nests anywhere else (T-365); renames come from the row, moves from nobody
    if (folder.kind !== 'manual') return forbidden(c, 'system_folder');
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
    // in plan-locked mode a hand-made folder lives inside a deliverable's
    // working folder — moving one to the system-owned levels is refused
    if (ctx.sandbox.planLocked && !(await withinDeliverableFolder(deps.db, parsed.data.parentFolderId ?? null))) {
      return forbidden(c, 'plan_locked_structure');
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
    // the container must be a planned library row of the producer's own org —
    // and LIVE: a withdrawn (or superseded/rejected) row is off the plan and
    // takes no new draft (T-366 review; restore first if it was a mistake)
    if (
      !container ||
      container.projectId !== doc.projectId ||
      container.scope !== 'library' ||
      container.producingOrganisationId !== slice.organisationId ||
      container.state !== 'live'
    ) {
      return invalid(c);
    }
    // one bound working draft per deliverable (T-366 review): a second draft
    // binding to the same row would give the container two "the" drafts. The
    // bin counts — a deleted bound draft still owns the row until purged, so
    // restore can never collide.
    const [existingDraft] = await deps.db
      .select({ id: s.sandboxDocuments.id })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.containerId, container.id))
      .limit(1);
    if (existingDraft) return conflict(c, 'already_bound');
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
