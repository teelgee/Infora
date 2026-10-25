// T-051 — sandbox documents: create, list, open. The sandbox is the
// uncontrolled working area (draft-location decision): one implicit private
// project sandbox per organisation (ADR-0018), so every read here is scoped
// to the requester's organisation by construction — there is no parameter.
// Manual editing (PATCH) stays with T-082.
import { Hono } from 'hono';
import { and, asc, count, desc, eq, exists, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  createSandboxDocumentBody,
  internalRoundOf,
  patchSandboxDocumentBody,
  patchSandboxMetadataBody,
  renameSandboxDocumentBody,
  restoreSandboxVersionBody,
  WORKING_AREA_PAGE_SIZE,
  workingAreaQuery,
} from '@infora/contracts';
import type {
  ApiError,
  GetSandboxActivityResponse,
  GetWorkingAreaResponse,
  PresenceEntry,
  SandboxDocumentActivity,
  SandboxDocumentVersion,
  ListSandboxDocumentsResponse,
  ListPresenceResponse,
  ListSandboxHistoryResponse,
  InternalRound,
  ListSuggestionsResponse,
  SandboxDocument,
} from '@infora/contracts';
import { canAccessSandbox } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { readDocumentSuggestions } from '@infora/orchestration';
import { projectScope, resourceHomes, resourceScope } from './requester';
import { releaseLapsedEngineLock } from './engine-lock';
import { listWorkingArea } from './working-set';
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

// T-486 (h) — WHICH single-organisation area is "the default" is a rule, not
// whatever the database happens to read first. The pick used to be a bare
// `LIMIT 1` with no ORDER BY, and `sandboxes` has no index on these columns, so
// Postgres answered in heap order — the order the rows physically sit in the
// table — and that is not creation order: an UPDATE writes a row's new version
// at a new place, and space freed by earlier updates is reused by later inserts,
// so a row made last can sit first. (Seen on the e2e database: Calder & Hale's
// seeded working area, the OLDEST, sat at slot 38 while two areas made minutes
// later sat at slots 4 and 5, so the old query answered with an area an e2e spec
// had made.) Both happen constantly under a full parallel test run.
// An organisation with more than one single-organisation area on a project
// (it may make as many as it likes) therefore got a different "default" from
// one request to the next: an upload or a new draft with no area named could be
// filed into any of them, and a folder of one area could be accepted as the
// default's. The rule now: the organisation's OLDEST single-organisation area
// on the project among those that still hold a LIVE grant for the organisation
// (an area whose organisation grant was revoked admits nobody, so filing into
// it would hide the person's own new document from them). None qualifies: make
// one, as before. Ties on the clock break on the id, so the answer is total.
//
// Not fixed here, deliberately: two simultaneous FIRST requests can each make a
// default. With the ordering that is harmless — the older of the two wins from
// then on — and stopping it would need a unique index (a migration).
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
        exists(
          db
            .select({ one: sql`1` })
            .from(s.sandboxScopeGrants)
            .where(
              and(
                eq(s.sandboxScopeGrants.sandboxId, s.sandboxes.id),
                eq(s.sandboxScopeGrants.granteeType, 'organisation'),
                eq(s.sandboxScopeGrants.organisationId, organisationId),
                isNull(s.sandboxScopeGrants.removedAt),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(s.sandboxes.createdAt), asc(s.sandboxes.id))
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

// T-477 — the ONE admission check for a named sandbox (ADR-0036): it exists on
// this project and the requester is let in over its LIVE scope grants. Null is
// deny, indistinguishable from nonexistence — the create below and the upload
// both answer 404 on it, so a person cannot probe for a sandbox they are not in.
export async function admittedSandbox(
  db: Db,
  slice: Parameters<typeof canAccessSandbox>[0],
  sandboxId: string,
): Promise<typeof s.sandboxes.$inferSelect | null> {
  const [sandbox] = await db.select().from(s.sandboxes).where(eq(s.sandboxes.id, sandboxId)).limit(1);
  if (!sandbox) return null;
  const grants = await db
    .select()
    .from(s.sandboxScopeGrants)
    .where(and(eq(s.sandboxScopeGrants.sandboxId, sandbox.id), isNull(s.sandboxScopeGrants.removedAt)));
  if (sandbox.projectId !== slice.projectId || !canAccessSandbox(slice, grants)) return null;
  return sandbox;
}

/** True when the folder exists and belongs to that sandbox. */
export async function folderInSandbox(db: Db, folderId: string, sandboxId: string): Promise<boolean> {
  const [folder] = await db
    .select({ sandboxId: s.sandboxFolders.sandboxId })
    .from(s.sandboxFolders)
    .where(eq(s.sandboxFolders.id, folderId))
    .limit(1);
  return folder?.sandboxId === sandboxId;
}

function presenceEntry(participantId: string, name: string): PresenceEntry {
  return {
    participantId,
    name,
    initials: name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join(''),
  };
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
      const sandbox = await admittedSandbox(deps.db, slice, body.data.sandboxId);
      if (!sandbox) return c.json({ error: 'not_found' } satisfies ApiError, 404);
      sandboxId = sandbox.id;
    } else {
      sandboxId = await ensureDefaultSandbox(deps.db, slice.projectId, slice.organisationId, slice.participantId);
    }
    // T-477 (review) — a folder must belong to the resolved sandbox; a missing or
    // foreign one is the plain 404 (it used to reach the foreign key as a 500)
    if (body.data.folderId && !(await folderInSandbox(deps.db, body.data.folderId, sandboxId))) {
      return c.json({ error: 'not_found' } satisfies ApiError, 404);
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
    // T-486 — the latest internal QA round per document, for the row's badge
    // (so it reads "In internal QA P01" like the editor's, not "Frozen v0.x"):
    // ONE batched read over every freeze container above — each one's latest
    // cycle and that cycle's latest round (DISTINCT ON the container, newest
    // cycle then highest round number first) — and the same `internalRoundOf`
    // rule the editor applies to the cycle it loads. No new access question: these
    // are the requester organisation's own documents' own freeze series.
    const roundRows = freezeRows.length
      ? await deps.db
          .selectDistinctOn([s.reviewCycles.containerId], {
            containerId: s.reviewCycles.containerId,
            cycleState: s.reviewCycles.state,
            roundState: s.rounds.state,
            versionReference: s.versions.versionReference,
          })
          .from(s.reviewCycles)
          .innerJoin(s.rounds, eq(s.rounds.cycleId, s.reviewCycles.id))
          .innerJoin(s.versions, eq(s.rounds.versionId, s.versions.id))
          .where(inArray(s.reviewCycles.containerId, freezeRows.map((r) => r.id)))
          .orderBy(asc(s.reviewCycles.containerId), desc(s.reviewCycles.launchedAt), desc(s.rounds.number))
      : [];
    const roundByFreeze = new Map<string, InternalRound>();
    for (const r of roundRows) {
      const round = internalRoundOf({
        state: r.cycleState,
        rounds: [{ state: r.roundState, versionReference: r.versionReference }],
      });
      if (round !== null) roundByFreeze.set(r.containerId, round);
    }
    return c.json({
      items: rows.map((r) => {
        const freezeId = freezeByDoc.get(r.id) ?? null;
        return toSandboxDocument(
          r,
          countByDoc.get(r.id) ?? 0,
          freezeId,
          freezeId === null ? undefined : roundByFreeze.get(freezeId),
        );
      }),
    } satisfies ListSandboxDocumentsResponse);
  });

  // T-477 — what the sandbox screen draws on each row, in ONE read: who else has
  // the document open now, and whether a teammate has saved since the requester
  // last had it open. Over exactly the set the list above returns (the
  // requester organisation's own live documents), so it can confirm nothing the
  // list does not. Derived on every read; nothing is stored for the dot.
  //
  // The dot's rule: the document's latest working version was saved by someone
  // else AND the requester either has never had the document open (no presence
  // row) or last had it open before that version was saved. Opening the editor
  // heartbeats, which moves the requester's last-seen past the version and
  // clears the dot. A document only the requester has ever saved never has one.
  app.get('/projects/:projectId/sandbox-documents/activity', project, async (c) => {
    const slice = c.get('slice');
    const docs = await deps.db
      .select({ id: s.sandboxDocuments.id })
      .from(s.sandboxDocuments)
      .where(
        and(
          eq(s.sandboxDocuments.projectId, slice.projectId),
          eq(s.sandboxDocuments.organisationId, slice.organisationId),
          isNull(s.sandboxDocuments.deletedAt),
        ),
      );
    const ids = docs.map((d) => d.id);
    if (ids.length === 0) return c.json({ items: [] } satisfies GetSandboxActivityResponse);
    const latest = await deps.db
      .selectDistinctOn([s.sandboxDocumentVersions.sandboxDocumentId], {
        sandboxDocumentId: s.sandboxDocumentVersions.sandboxDocumentId,
        by: s.sandboxDocumentVersions.createdByParticipantId,
        at: s.sandboxDocumentVersions.createdAt,
      })
      .from(s.sandboxDocumentVersions)
      .where(inArray(s.sandboxDocumentVersions.sandboxDocumentId, ids))
      .orderBy(s.sandboxDocumentVersions.sandboxDocumentId, desc(s.sandboxDocumentVersions.createdAt));
    const presence = await deps.db
      .select({
        sandboxDocumentId: s.documentPresence.sandboxDocumentId,
        participantId: s.documentPresence.participantId,
        lastSeenAt: s.documentPresence.lastSeenAt,
        name: s.users.name,
        recent: sql<boolean>`${s.documentPresence.lastSeenAt} > now() - interval '30 seconds'`,
      })
      .from(s.documentPresence)
      .innerJoin(s.participants, eq(s.documentPresence.participantId, s.participants.id))
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(
        and(
          inArray(s.documentPresence.sandboxDocumentId, ids),
          or(
            eq(s.documentPresence.participantId, slice.participantId),
            sql`${s.documentPresence.lastSeenAt} > now() - interval '30 seconds'`,
          ),
        ),
      );
    const latestByDoc = new Map(latest.map((r) => [r.sandboxDocumentId, r]));
    const mineByDoc = new Map<string, Date>();
    const othersByDoc = new Map<string, PresenceEntry[]>();
    for (const r of presence) {
      if (r.participantId === slice.participantId) {
        mineByDoc.set(r.sandboxDocumentId, r.lastSeenAt);
      } else if (r.recent) {
        const list = othersByDoc.get(r.sandboxDocumentId) ?? [];
        list.push(presenceEntry(r.participantId, r.name));
        othersByDoc.set(r.sandboxDocumentId, list);
      }
    }
    const items = ids.map((docId): SandboxDocumentActivity => {
      const last = latestByDoc.get(docId);
      const seen = mineByDoc.get(docId);
      return {
        sandboxDocumentId: docId,
        present: othersByDoc.get(docId) ?? [],
        changedSinceYouLooked:
          last !== undefined && last.by !== slice.participantId && (seen === undefined || last.at > seen),
      };
    });
    return c.json({ items } satisfies GetSandboxActivityResponse);
  });

  // T-471 — the documents a person may PIN: every live document in a working
  // area they are in, whoever owns it. `sandbox-documents` above is "my
  // organisation's own" and stays so (the sandbox screen is built on that); this
  // read follows the sandbox's own grants instead (ADR-0036), so a shared
  // working area's drafts are here and a sandbox the person holds no grant on is
  // never selected. Searched by title, paged at 50.
  app.get('/projects/:projectId/working-area', project, async (c) => {
    const query = workingAreaQuery.safeParse({
      q: c.req.query('q'),
      page: c.req.query('page'),
    });
    if (!query.success) return c.json({ error: 'invalid', detail: 'q and page' } satisfies ApiError, 400);
    const { items, hasMore } = await listWorkingArea(deps.db, c.get('slice'), query.data);
    return c.json({
      items,
      page: query.data.page,
      pageSize: WORKING_AREA_PAGE_SIZE,
      hasMore,
      q: query.data.q && query.data.q !== '' ? query.data.q : null,
    } satisfies GetWorkingAreaResponse);
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
    const items = rows.map((r) => presenceEntry(r.participantId, r.name));
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
    // T-477 — which working versions were frozen. No stored link exists between
    // an ambient version and the freeze-series version it became (a freeze
    // copies the head and writes nothing to the ambient history), so it is
    // derived: a freeze copies the head, and the head is the content of the
    // latest working version at that moment — so a frozen version belongs to the
    // latest working version saved at or before it with identical content.
    // Compared by checksum, so no document body travels. A freeze whose head
    // matches no working version (a document created with text and never saved)
    // marks nothing rather than guessing.
    //
    // T-486 (d) — for an UPLOADED or PDF document the text is not enough: every
    // working version of an uploaded .docx has the text '', so the text matched
    // them all and the choice was by time alone. But both sides also carry the
    // FILE: a working version keeps the `file_ref` it was (migration 0070), and
    // the frozen copy's native rendition points at the file the head held when it
    // was taken. Where they agree that match is exact and wins; time stays only as
    // the tie-break among working versions holding the same file (a restore writes
    // a new version holding an older file again — the latest one is the head), and
    // as the fallback where there is no file to read (an authored document, a
    // version from before migration 0070, a rendition not yet made). The case time
    // alone got wrong: a freeze reads the document and then opens its transaction,
    // and a file that lands in that gap is saved before the freeze's own clock
    // without being what the freeze copied.
    const frozenBy = new Map<string, NonNullable<SandboxDocumentVersion['frozen']>>();
    const [freezeContainer] = await deps.db
      .select({ id: s.containers.id })
      .from(s.containers)
      .where(and(eq(s.containers.sandboxDocumentId, c.req.param('id')), eq(s.containers.scope, 'sandbox')))
      .limit(1);
    //
    // `issuedForReview` reads the reference: only a freeze that opens an internal
    // round writes a P reference into the freeze series (cycle.ts, the freeze
    // route); a plain check-out writes the working v0.x. If another path ever
    // writes a P reference, this reading must change with it.
    // Cost: one md5 per working version created at or before the latest freeze
    // (later ones cannot belong to any freeze) plus one per frozen version.
    if (freezeContainer && rows.length > 0) {
      const frozenVersions = await deps.db
        .select({
          id: s.versions.id,
          versionReference: s.versions.versionReference,
          createdAt: s.versions.createdAt,
          sum: sql<string>`md5(${s.versions.content})`,
        })
        .from(s.versions)
        .where(eq(s.versions.containerId, freezeContainer.id))
        .orderBy(asc(s.versions.createdAt));
      const latestFreeze = frozenVersions.at(-1)?.createdAt;
      const sums = latestFreeze
        ? await deps.db
            .select({
              id: s.sandboxDocumentVersions.id,
              sum: sql<string>`md5(${s.sandboxDocumentVersions.content})`,
              fileRef: s.sandboxDocumentVersions.fileRef,
            })
            .from(s.sandboxDocumentVersions)
            .where(
              and(
                eq(s.sandboxDocumentVersions.sandboxDocumentId, c.req.param('id')),
                sql`${s.sandboxDocumentVersions.createdAt} <= ${latestFreeze}`,
              ),
            )
        : [];
      const sumById = new Map(sums.map((r) => [r.id, r.sum]));
      const fileById = new Map(sums.map((r) => [r.id, r.fileRef]));
      // the file each frozen copy held, where its native rendition has been made —
      // one batched read for the whole series
      const heldFile = new Map(
        (frozenVersions.length > 0
          ? await deps.db
              .select({ versionId: s.renditions.versionId, ref: s.renditions.contentRef })
              .from(s.renditions)
              .where(and(inArray(s.renditions.versionId, frozenVersions.map((f) => f.id)), eq(s.renditions.kind, 'native')))
          : []
        ).map((r) => [r.versionId, r.ref]),
      );
      for (const f of frozenVersions) {
        // rows are newest first, so the first match is the latest at or before the freeze
        const file = heldFile.get(f.id);
        const byFile = file === undefined ? undefined : rows.find((r) => r.createdAt <= f.createdAt && fileById.get(r.id) === file);
        const owner = byFile ?? rows.find((r) => r.createdAt <= f.createdAt && sumById.get(r.id) === f.sum);
        if (!owner) continue;
        const marks = frozenBy.get(owner.id) ?? [];
        marks.push({
          frozenAs: f.versionReference,
          issuedForReview: f.versionReference.startsWith('P'),
          frozenAt: f.createdAt.toISOString(),
        });
        frozenBy.set(owner.id, marks);
      }
    }
    const items = rows.map((r, i) => ({
      id: r.id,
      sandboxDocumentId: r.sandboxDocumentId,
      versionReference: `v0.${rows.length - i}`,
      createdBy: { participantId: r.participantId, name: r.name },
      createdAt: r.createdAt.toISOString(),
      ...(frozenBy.has(r.id) && { frozen: frozenBy.get(r.id)! }),
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
    // (review 2026-10-18) a version from the document's UPLOADED era does not
    // restore onto a document since converted to authored: it would overwrite
    // the preserved original file and blank the authored text in one act
    const [docNow] = await deps.db
      .select({ origin: s.sandboxDocuments.origin })
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    if (docNow?.origin === 'authored' && snapshot.fileRef !== null) {
      return c.json(
        { error: 'conflict', detail: 'that version is from before this document was converted to the editor - restoring it would undo the conversion' } satisfies ApiError,
        409,
      );
    }
    const [row] = await deps.db
      .update(s.sandboxDocuments)
      // T-453 — a revision that kept its file (migration 0070) restores the
      // FILE, which is the canonical half of an uploaded document; before
      // 0070 restoring an upload copied back only its empty text
      .set({ content: snapshot.content, ...(snapshot.fileRef && { fileRef: snapshot.fileRef }), updatedAt: sql`now()` })
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .returning();
    await deps.db.insert(s.sandboxDocumentVersions).values({
      sandboxDocumentId: row!.id,
      content: row!.content,
      fileRef: snapshot.fileRef,
      createdByParticipantId: c.get('slice').participantId,
    });
    // T-456 — the restore answers with the working revision it just became, so
    // the screen can say "restored v0.1 as v0.5" rather than guess
    const [n] = await deps.db
      .select({ n: count() })
      .from(s.sandboxDocumentVersions)
      .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, row!.id));
    return c.json(toSandboxDocument(row!, Number(n?.n ?? 0)));
  });

  // T-128 — safe lifecycle (the ProjectWise A1 fold-in): soft-delete with
  // self-service restore; recovery is never a helpdesk ticket.
  app.delete('/sandbox-documents/:id', documentScope, async (c) => {
    // T-453 — a lapsed editing-engine lock is released before it can refuse
    await releaseLapsedEngineLock(deps.db, c.req.param('id'));
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
  internalRound?: InternalRound,
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
    // T-486: the latest internal round's state, on the list read only
    ...(internalRound !== undefined && { internalRound }),
    updatedAt: row.updatedAt.toISOString(),
  };
}
