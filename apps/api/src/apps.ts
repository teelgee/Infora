// T-440 — the app instance: create, scope, own, share, close (ADR-0056).
//
// *In plain terms: an app appears in a project's Tools section, someone owns
// it, the right people can open it, and the project owner can share one of its
// tables with another firm or hand the app to one of their own people.*
//
// 🔒 **THE ROW PREDICATE IS IN `@infora/governance` AND IS CALLED FROM HERE.**
// It is not restated in this file, not restated in a screen, and not restated
// in the code an app's builder generates. ADR-0056's research found that every
// app-builder incident it read came from access rules written into the app
// rather than enforced by the platform, so the one thing this file must never
// become is a second place where "who may see this row" is decided.
//
// 🔒 **DEFUNCT IS DERIVED, NEVER STORED.** An app whose owner has left the
// project is *visibly not working* on its card and its interfaces, with no
// notification — the owner's 2026-09-06 ruling, which declined the proposed
// `app-needs-an-owner` event and left ADR-0049 untouched. The state is computed
// from the owner's Participant interval on every read, because a stored flag
// would be a cache of an access fact and would go stale the first time somebody
// was removed by a path that forgot to update it.
//
// **What this file deliberately does NOT do.** It does not export a file
// (`app-exports.ts`, T-444), it does not run the app or write an insight
// (`app-runs.ts`, T-443) and it does not save or deploy a playbook (T-445). It
// proposes screens through the builder's agent and stores what a builder saves;
// the drawing of them is `apps/web/src/screens/app-screen.tsx`.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  createAppBody,
  declareAppTableBody,
  grantAppScopeBody,
  patchAppDefinitionBody,
  reassignAppBody,
  setAppBuilderBody,
  sayToBuilderBody,
  setAppTableAcceptanceBody,
  shareAppTableBody,
  writeAppScreenBody,
} from '@infora/contracts';
import type {
  ApiError,
  AppColumn,
  AppDefinition,
  AppRecord,
  AppScopeGrant as AppScopeGrantDto,
  AppState,
  AppSummary,
  AppTableRecord,
  AppTableShare,
  BuildConversationResponse,
  GetAppResponse,
  ListAppsResponse,
  PublishRefusedResponse,
  SayToBuilderResponse,
  WriteAppScreenResponse,
} from '@infora/contracts';
import {
  canBuildApp,
  canOpenApp,
  canReassignApp,
  canShareAppTable,
  withinAppScope,
} from '@infora/governance';
import type { EntitledSlice } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import type { Router } from '@infora/model';
import { readConversation, runBuilderTurn, writeAppScreen } from './app-builder-agent';
import {
  declareTableAct,
  publishGateFor,
  setTableAcceptanceAct,
  writeDefinitionAct,
} from './app-builder-acts';
import { createAppInstance } from './app-instance';
import { resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);

/** (review 2026-10-18) the most turns one app's build conversation may hold. */
export const BUILD_TURN_CEILING = 500;
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

// ── Loading an app, once, with everything the predicates need ───────────────

type LoadedApp = {
  row: typeof s.apps.$inferSelect;
  /** the organisation of the owner participant — the firm whose app it is */
  ownerOrganisationId: string;
  ownerName: string;
  /** is that Participant interval still open (ADR-0033)? `false` is DEFUNCT */
  ownerIsLive: boolean;
  publishedByName: string | null;
  projectOwnerOrganisationId: string;
  grants: Array<typeof s.appScopeGrants.$inferSelect>;
};

async function loadApp(db: Db, appId: string): Promise<LoadedApp | null> {
  if (!isUuid(appId)) return null;
  const [row] = await db
    .select({
      app: s.apps,
      ownerOrganisationId: s.users.organisationId,
      ownerName: s.users.name,
      ownerRemovedAt: s.participants.removedAt,
      projectOwnerOrganisationId: s.projects.ownerOrganisationId,
    })
    .from(s.apps)
    .innerJoin(s.participants, eq(s.apps.ownerParticipantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .innerJoin(s.projects, eq(s.apps.projectId, s.projects.id))
    .where(eq(s.apps.id, appId))
    .limit(1);
  if (!row) return null;
  const grants = await db
    .select()
    .from(s.appScopeGrants)
    .where(eq(s.appScopeGrants.appId, appId));
  let publishedByName: string | null = null;
  if (row.app.publishedByParticipantId !== null) {
    const [publisher] = await db
      .select({ name: s.users.name })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.participants.id, row.app.publishedByParticipantId))
      .limit(1);
    publishedByName = publisher?.name ?? null;
  }
  return {
    row: row.app,
    ownerOrganisationId: row.ownerOrganisationId,
    ownerName: row.ownerName,
    ownerIsLive: row.ownerRemovedAt === null,
    publishedByName,
    projectOwnerOrganisationId: row.projectOwnerOrganisationId,
    grants,
  };
}

/** The facts every governance predicate about an app is judged on, assembled
 * once per request from a loaded app and a slice. */
export function buildFacts(app: LoadedApp, slice: EntitledSlice) {
  return {
    ownerOrganisationId: app.ownerOrganisationId,
    ownerIsLive: app.ownerIsLive,
    closed: app.row.closedAt !== null,
    published: app.row.publishedDefinition !== null,
    withinScope: withinAppScope(slice, app.grants),
  };
}

/**
 * The four states a card and an interface render (ADR-0056 §5, §7, §11).
 * DERIVED, in this order, because each answer makes the next irrelevant: a
 * closed app's owner does not matter, and a defunct app's publication does not.
 */
export function appState(app: LoadedApp): AppState {
  if (app.row.closedAt !== null) return 'closed';
  if (!app.ownerIsLive) return 'defunct';
  if (app.row.publishedDefinition === null) return 'unpublished';
  return 'open';
}

function summaryOf(app: LoadedApp): AppSummary {
  return {
    id: app.row.id,
    projectId: app.row.projectId,
    name: app.row.name,
    description: app.row.description,
    state: appState(app),
    // an ownerless app names nobody: the whole content of `defunct`
    ownerName: app.ownerIsLive ? app.ownerName : null,
    ownerParticipantId: app.row.ownerParticipantId,
    publishedVersion: app.row.publishedVersion,
    publishedAt: app.row.publishedAt?.toISOString() ?? null,
    publishedByName: app.publishedByName,
    createdAt: app.row.createdAt.toISOString(),
  };
}

async function scopeDto(db: Db, app: LoadedApp): Promise<AppScopeGrantDto[]> {
  const organisationIds = app.grants.flatMap((g) => (g.organisationId ? [g.organisationId] : []));
  const participantIds = app.grants.flatMap((g) => (g.participantId ? [g.participantId] : []));
  const organisations =
    organisationIds.length === 0
      ? []
      : await db
          .select({ id: s.organisations.id, name: s.organisations.name })
          .from(s.organisations)
          .where(inArray(s.organisations.id, organisationIds));
  const people =
    participantIds.length === 0
      ? []
      : await db
          .select({ id: s.participants.id, name: s.users.name })
          .from(s.participants)
          .innerJoin(s.users, eq(s.participants.userId, s.users.id))
          .where(inArray(s.participants.id, participantIds));
  const orgName = new Map(organisations.map((o) => [o.id, o.name]));
  const personName = new Map(people.map((p) => [p.id, p.name]));
  return app.grants.map((g) => ({
    id: g.id,
    granteeType: g.granteeType,
    organisationId: g.organisationId,
    organisationName: g.organisationId ? (orgName.get(g.organisationId) ?? null) : null,
    participantId: g.participantId,
    participantName: g.participantId ? (personName.get(g.participantId) ?? null) : null,
    grantedAt: g.grantedAt.toISOString(),
    revokedAt: g.revokedAt?.toISOString() ?? null,
  }));
}

/**
 * T-442 — the published screens THIS requester may open.
 *
 * 🔒 **ASSEMBLED HERE, NEVER FILTERED ON THE SCREEN** (T-269's rule). An
 * interface's `openToOrganisationIds` NARROWS who is offered it; a surface that
 * worked the narrowing out for itself would be a second place deciding what a
 * person may reach, and the first disagreement between the copies is a screen
 * offered to somebody the API then refuses. So a screen this requester may not
 * open is ABSENT from what they receive, and there is nothing on the client to
 * get wrong.
 *
 * It narrows and cannot widen: an empty list means everyone the app is open to,
 * and a non-empty one is intersected with the scope the caller already passed
 * and then, row by row, with `canReadAppRow`. An interface naming an
 * organisation the app's scope excludes admits nobody new, because being
 * offered a screen is not what lets anyone read a row.
 */
function openableInterfaces(definition: AppDefinition, slice: EntitledSlice): AppDefinition {
  return {
    ...definition,
    interfaces: definition.interfaces.filter(
      (screen) =>
        screen.openToOrganisationIds.length === 0 ||
        screen.openToOrganisationIds.includes(slice.organisationId),
    ),
  };
}

/**
 * The record, for one requester. **The working copy goes only to a builder**
 * (ruling 2): everyone else gets the published copy, so a form nobody has
 * opened yet cannot be read out of the API by the people it is being built for.
 */
export async function recordOf(
  db: Db,
  app: LoadedApp,
  slice: EntitledSlice,
  mayBuildApps: boolean,
): Promise<AppRecord> {
  const facts = buildFacts(app, slice);
  const mayBuild = canBuildApp(slice, mayBuildApps, facts);
  const published = (app.row.publishedDefinition as AppDefinition | null) ?? null;
  // T-445 — what it was deployed from, named by version. There is no live link:
  // the row this points at is never updated, so the name and the number stay
  // what they were on the day it was deployed (ADR-0056 §10). **The deploying
  // firm's own eyes only** (narrowed in review 2026-09-07): the shelf is
  // org-private, so its template's name is not put in front of the client and
  // the peer firms the instance is later opened to.
  let deployedFrom: AppRecord['deployedFrom'] = null;
  const ownEyes = slice.organisationId === facts.ownerOrganisationId;
  if (ownEyes && app.row.playbookId !== null && app.row.playbookVersion !== null) {
    const [playbook] = await db
      .select({ name: s.playbooks.name })
      .from(s.playbooks)
      .where(eq(s.playbooks.id, app.row.playbookId))
      .limit(1);
    if (playbook) {
      deployedFrom = {
        playbookId: app.row.playbookId,
        playbookName: playbook.name,
        version: app.row.playbookVersion,
      };
    }
  }
  return {
    ...summaryOf(app),
    deployedFrom,
    definition: mayBuild ? (app.row.definition as AppDefinition) : null,
    definitionVersion: app.row.definitionVersion,
    published: published === null ? null : openableInterfaces(published, slice),
    scope: await scopeDto(db, app),
    mayBuild,
    isProjectOwner: slice.organisationId === app.projectOwnerOrganisationId,
  };
}

/** Live shares per table, which the row predicate needs and the table record
 * shows. Only the project owner and the organisation shared with are told a
 * share exists — a rival firm learning that a table was shared with somebody
 * learns something about the project it was never given. */
export async function sharesFor(
  db: Db,
  appTableIds: string[],
  slice: EntitledSlice,
  projectOwnerOrganisationId: string,
): Promise<Map<string, AppTableShare[]>> {
  const out = new Map<string, AppTableShare[]>();
  if (appTableIds.length === 0) return out;
  const rows = await db
    .select({
      share: s.appTableShares,
      organisationName: s.organisations.name,
    })
    .from(s.appTableShares)
    .innerJoin(s.organisations, eq(s.appTableShares.organisationId, s.organisations.id))
    .where(inArray(s.appTableShares.appTableId, appTableIds));
  for (const row of rows) {
    const visible =
      slice.organisationId === projectOwnerOrganisationId ||
      slice.organisationId === row.share.organisationId;
    if (!visible) continue;
    const list = out.get(row.share.appTableId) ?? [];
    list.push({
      id: row.share.id,
      appTableId: row.share.appTableId,
      organisationId: row.share.organisationId,
      organisationName: row.organisationName,
      grantedAt: row.share.grantedAt.toISOString(),
      revokedAt: row.share.revokedAt?.toISOString() ?? null,
    });
    out.set(row.share.appTableId, list);
  }
  return out;
}

/** Every organisation with a LIVE share of this table — the third branch of the
 * row predicate, and the only shape of it that reaches governance. */
export async function liveShareOrganisationIds(db: Db, appTableId: string): Promise<string[]> {
  const rows = await db
    .select({ organisationId: s.appTableShares.organisationId })
    .from(s.appTableShares)
    .where(and(eq(s.appTableShares.appTableId, appTableId), isNull(s.appTableShares.revokedAt)));
  return rows.map((r) => r.organisationId);
}

export async function tableRecords(
  db: Db,
  appId: string,
  slice: EntitledSlice,
  projectOwnerOrganisationId: string,
): Promise<AppTableRecord[]> {
  const rows = await db
    .select()
    .from(s.appTables)
    .where(eq(s.appTables.appId, appId))
    .orderBy(asc(s.appTables.name));
  const shares = await sharesFor(
    db,
    rows.map((r) => r.id),
    slice,
    projectOwnerOrganisationId,
  );
  return rows.map((row) => ({
    id: row.id,
    appId: row.appId,
    name: row.name,
    columns: row.columns as AppTableRecord['columns'],
    kind: row.kind,
    hasAcceptance: row.hasAcceptance,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    shares: shares.get(row.id) ?? [],
  }));
}

// T-448/T-449 — the gate and the answer-recording act live in
// `app-builder-acts.ts` beside the other working-copy acts the agent shares;
// re-exported here for the routes that already import them from this file.
export { publishGateFor, recordAnsweredQuestion } from './app-builder-acts';

/** Resolve (requester, app) → the loaded app, the slice, and whether the
 * requester may open it at all. Deny is null, and null is 404 — denial and
 * nonexistence read identically (principle 4). */
async function reachApp(
  db: Db,
  user: UserRow,
  appId: string,
): Promise<{ app: LoadedApp; slice: EntitledSlice } | null> {
  const app = await loadApp(db, appId);
  if (!app) return null;
  const slice = await resolveSlice(db, user, app.row.projectId);
  if (!slice) return null;
  if (!canOpenApp(slice, user.mayBuildApps, buildFacts(app, slice))) return null;
  return { app, slice };
}

export function appRoutes(deps: { db: Db; router: Router }) {
  const app = new Hono<AppEnv>();

  // ── The org admin's per-person toggle (ADR-0056 §12) ──────────────────────
  //
  // Claude's mechanism for the ADR's ruled policy: the record fixed WHO decides
  // (each organisation, about its own people) and left the control to the
  // build. An admin may only ever reach their own organisation's people, which
  // is what makes "its own people" true rather than merely intended.
  app.patch('/organisation/users/:userId/app-building', async (c) => {
    const requester = c.get('user');
    if (requester.orgRole !== 'admin') return notFound(c);
    const userId = c.req.param('userId');
    if (!isUuid(userId)) return notFound(c);
    const parsed = setAppBuilderBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const [target] = await deps.db
      .select()
      .from(s.users)
      .where(and(eq(s.users.id, userId), eq(s.users.organisationId, requester.organisationId)))
      .limit(1);
    if (!target || target.removedAt !== null) return notFound(c);
    await deps.db
      .update(s.users)
      .set({ mayBuildApps: parsed.data.mayBuildApps })
      .where(eq(s.users.id, userId));
    return c.json({
      userId,
      name: target.name,
      email: target.email,
      orgRole: target.orgRole,
      mayBuildApps: parsed.data.mayBuildApps,
    });
  });

  // ── The project's apps ────────────────────────────────────────────────────
  //
  // 🔒 ASSEMBLED, NOT FILTERED — T-269's rule, the same one the Tools list
  // follows: an app the requester cannot open is ABSENT from this list, never
  // present-and-disabled. A defunct app is a different case and IS listed: it
  // is an app they can open, which is broken, and saying so is the ruling.
  app.get('/projects/:projectId/apps', async (c) => {
    const user = c.get('user');
    const projectId = c.req.param('projectId');
    const slice = await resolveSlice(deps.db, user, projectId);
    if (!slice) return notFound(c);
    const rows = await deps.db
      .select({ id: s.apps.id })
      .from(s.apps)
      .where(eq(s.apps.projectId, projectId))
      .orderBy(desc(s.apps.createdAt));
    const items: AppSummary[] = [];
    for (const { id } of rows) {
      const loaded = await loadApp(deps.db, id);
      if (!loaded) continue;
      if (!canOpenApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) continue;
      items.push(summaryOf(loaded));
    }
    return c.json({ items, mayCreate: user.mayBuildApps } satisfies ListAppsResponse);
  });

  // Create. The initial scope rides the creation for T-187's reason: an app
  // that exists for a moment with no scope is an app whose first read has no
  // answer. The creator's own organisation is always granted — an app nobody
  // can open, including the person who just made it, is a bug and not a strict
  // default.
  app.post('/projects/:projectId/apps', async (c) => {
    const user = c.get('user');
    const projectId = c.req.param('projectId');
    const slice = await resolveSlice(deps.db, user, projectId);
    if (!slice) return notFound(c);
    if (!user.mayBuildApps) return notFound(c);
    const parsed = createAppBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);

    // T-445 — the ONE path that makes an app instance, shared with the playbook
    // deployment so that a deployed app is an ordinary app: same stamps, same
    // starting scope, same rules, with no second copy of how one is created.
    const createdId = await createAppInstance(deps.db, {
      projectId,
      slice,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      organisationIds: parsed.data.organisationIds,
      participantIds: parsed.data.participantIds,
    });

    const loaded = await loadApp(deps.db, createdId);
    return c.json(await recordOf(deps.db, loaded!, slice, user.mayBuildApps), 201);
  });

  app.get('/apps/:appId', async (c) => {
    const reached = await reachApp(deps.db, c.get('user'), c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    const record = await recordOf(deps.db, loaded, slice, c.get('user').mayBuildApps);
    return c.json({
      app: record,
      tables: await tableRecords(deps.db, loaded.row.id, slice, loaded.projectOwnerOrganisationId),
      // T-448 — the gate's own answer, to the people who may build the app and
      // nobody else (the questions name the working copy's screens)
      publishGate: record.mayBuild ? await publishGateFor(deps.db, loaded.row) : null,
    } satisfies GetAppResponse);
  });

  // ── The working copy, and the act of publishing ───────────────────────────

  app.patch('/apps/:appId/definition', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    const parsed = patchAppDefinitionBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    // T-449 — the one act, shared with the builder's agent: the shape and the
    // column references are checked there, and the edit is stamped there
    const written = await writeDefinitionAct(deps.db, {
      appId: loaded.row.id,
      participantId: slice.participantId,
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.definition !== undefined && {
        definition: parsed.data.definition as AppDefinition,
      }),
    });
    if (written === 'invalid') return invalid(c);
    const fresh = await loadApp(deps.db, loaded.row.id);
    return c.json(await recordOf(deps.db, fresh!, slice, user.mayBuildApps));
  });

  /**
   * "Check and open" — the seventh step, and the act of publishing (the
   * 2026-09-06 addendum, ruling 2). Copy working → published, stamp who and
   * when. There is no body: what is published is always the working copy as it
   * stands, so there is nothing for a caller to send and nothing for a caller
   * to get wrong.
   *
   * 🔒 **T-448 — REFUSED WHILE A REQUIRED QUESTION STANDS UNANSWERED** (ADR-0056's
   * third addendum, ruling 1). The questions are computed here, from the store,
   * on every attempt: whatever built the working copy — the building screen,
   * the agent, or somebody PATCHing a definition straight at the API — meets
   * the same refusal, worded, naming each question. Nothing a caller sends can
   * open the gate; only an answer recorded on the working copy can.
   */
  app.post('/apps/:appId/publish', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    const gate = await publishGateFor(deps.db, loaded.row);
    if (!gate.open) {
      return c.json(
        { error: 'conflict', detail: gate.words, questions: gate.questions } satisfies PublishRefusedResponse,
        409,
      );
    }
    await deps.db
      .update(s.apps)
      .set({
        publishedDefinition: loaded.row.definition,
        publishedVersion: loaded.row.definitionVersion,
        publishedByParticipantId: slice.participantId,
        publishedAt: sql`now()`,
      })
      .where(eq(s.apps.id, loaded.row.id));
    const fresh = await loadApp(deps.db, loaded.row.id);
    return c.json(await recordOf(deps.db, fresh!, slice, user.mayBuildApps));
  });

  // ── The single-screen writer (T-442) ──────────────────────────────────────
  //
  // Gated by `canBuildApp` — a tool of the person building the app. It
  // PROPOSES: what comes back is saved through `PATCH /definition` like any
  // other change, so a screen it wrote and a screen a person typed travel the
  // same road and meet the same validation. The panel's "draw this screen" uses
  // it; the conversation (below) writes screens through its own closed acts.
  // *(T-450 — the stepped pane's `POST /builder/ask` is gone with the steps: the
  // stored conversation replaced it.)*

  app.post('/apps/:appId/builder/screen', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    const parsed = writeAppScreenBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    const [table] = await deps.db
      .select()
      .from(s.appTables)
      .where(and(eq(s.appTables.id, parsed.data.appTableId), eq(s.appTables.appId, loaded.row.id)))
      .limit(1);
    // a screen over a table belonging to some other app is not a screen of this
    // app: the id is scoped to the app the requester reached, never taken bare
    if (!table) return notFound(c);
    const answer = await writeAppScreen(deps.router, {
      appName: loaded.row.name,
      purpose: parsed.data.purpose,
      current: parsed.data.current,
      table: {
        tableName: table.name,
        columns: table.columns as AppTableRecord['columns'],
        hasAcceptance: table.hasAcceptance,
      },
    });
    return c.json(answer satisfies WriteAppScreenResponse);
  });

  // ── T-449: the build conversation (ADR-0056's third addendum, rulings 2, 3, 5)
  //
  // 🔒 **READ AND SPOKEN TO BY THE PEOPLE WHO MAY BUILD THE APP, AND NOBODY
  // ELSE.** The conversation is working material — the working copy's own
  // standing — and it holds what named people said (personal-data.md, "The
  // app builder's conversation"). So both routes are `canBuildApp`, and
  // everybody else, the project owner and the app's own users included, gets
  // the same 404 as for an app that does not exist.
  //
  // The agent acts AS THE REQUESTER: the turn runs with their participant and
  // stamps every act with it. What it may do is `runBuilderTurn`'s closed list,
  // and none of the routes below this block — scope, shares, publish,
  // reassignment, closure — is reachable from it.

  app.get('/apps/:appId/builder/conversation', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    return c.json({
      turns: await readConversation(deps.db, loaded.row.id),
    } satisfies BuildConversationResponse);
  });

  app.post('/apps/:appId/builder/conversation', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    const parsed = sayToBuilderBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    // (review 2026-10-18) a conversation has a ceiling: every person turn is
    // also a model call and two stored rows, and nothing else bounds them. A
    // thousand turns is not a build conversation going well.
    const [turnCount] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(s.appBuildTurns)
      .where(eq(s.appBuildTurns.appId, loaded.row.id));
    if ((turnCount?.count ?? 0) >= BUILD_TURN_CEILING) {
      return c.json(
        {
          error: 'conflict',
          detail: 'this build conversation has reached its ceiling - the panel still edits everything directly',
        } satisfies ApiError,
        409,
      );
    }
    // the organisations a screen may be narrowed to: those the app is open to
    const scope = await scopeDto(deps.db, loaded);
    const organisations = scope
      .filter((grant) => grant.revokedAt === null && grant.organisationId !== null)
      .map((grant) => ({
        id: grant.organisationId!,
        name: grant.organisationName ?? 'An organisation',
        isProjectOwner: grant.organisationId === loaded.projectOwnerOrganisationId,
      }));
    const { person, agent } = await runBuilderTurn(deps, {
      appId: loaded.row.id,
      participantId: slice.participantId,
      say: parsed.data.say,
      organisations,
    });
    const fresh = await loadApp(deps.db, loaded.row.id);
    const record = await recordOf(deps.db, fresh!, slice, user.mayBuildApps);
    return c.json({
      turns: [person, agent],
      app: {
        app: record,
        tables: await tableRecords(deps.db, fresh!.row.id, slice, fresh!.projectOwnerOrganisationId),
        publishGate: await publishGateFor(deps.db, fresh!.row),
      },
    } satisfies SayToBuilderResponse);
  });

  // ── The participant scope, live-mutable (ADR-0036) ────────────────────────

  app.post('/apps/:appId/scope', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    const parsed = grantAppScopeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    await deps.db
      .insert(s.appScopeGrants)
      .values({
        appId: loaded.row.id,
        granteeType: parsed.data.organisationId !== undefined ? 'organisation' : 'participant',
        organisationId: parsed.data.organisationId ?? null,
        participantId: parsed.data.participantId ?? null,
        grantedByParticipantId: slice.participantId,
      })
      .onConflictDoNothing();
    const fresh = await loadApp(deps.db, loaded.row.id);
    return c.json(await recordOf(deps.db, fresh!, slice, user.mayBuildApps));
  });

  // Revoking CLOSES the interval; the row survives, because "who could see this
  // and when" is an audit answer and a deleted grant answers nothing.
  app.post('/apps/:appId/scope/:grantId/revocation', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    const grantId = c.req.param('grantId');
    if (!isUuid(grantId)) return notFound(c);
    await deps.db
      .update(s.appScopeGrants)
      .set({ revokedAt: sql`now()`, revokedByParticipantId: slice.participantId })
      .where(
        and(
          eq(s.appScopeGrants.id, grantId),
          eq(s.appScopeGrants.appId, loaded.row.id),
          isNull(s.appScopeGrants.revokedAt),
        ),
      );
    const fresh = await loadApp(deps.db, loaded.row.id);
    return c.json(await recordOf(deps.db, fresh!, slice, user.mayBuildApps));
  });

  // ── Declared tables (ADR-0056 §2, §2a) ────────────────────────────────────

  app.post('/apps/:appId/tables', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    const raw: unknown = await c.req.json().catch(() => null);
    const parsed = declareAppTableBody.safeParse(raw);
    if (!parsed.success) return invalid(c);
    // T-448 — **an explicit choice is an answer; a default is not.** The body
    // defaults `hasAcceptance` to false, and "false because nobody said" must
    // not count as "no, it is working data" — the third addendum's whole point
    // is that the wall questions are never defaulted. So the act is told
    // whether the caller actually SENT the choice.
    const said = typeof raw === 'object' && raw !== null && 'hasAcceptance' in raw;
    // T-449 — the one act, shared with the builder's agent (whose own act has
    // no acceptance field at all, so a table it declares is always asked)
    const created = await declareTableAct(deps.db, {
      appId: loaded.row.id,
      participantId: slice.participantId,
      name: parsed.data.name,
      columns: parsed.data.columns as AppColumn[],
      kind: parsed.data.kind,
      hasAcceptance: said ? parsed.data.hasAcceptance : undefined,
    });
    const [record] = await tableRecords(
      deps.db,
      loaded.row.id,
      slice,
      loaded.projectOwnerOrganisationId,
    ).then((all) => all.filter((t) => t.id === created.id));
    return c.json(record, 201);
  });

  /**
   * T-442 — answering the agent's first required question about a table that
   * was declared before anybody asked it (ADR-0056 §2b).
   *
   * 🔒 **ONLY WHILE THE TABLE IS EMPTY.** Whether a table holds contractual
   * data is what decides whether its rows change hands on acceptance (§2a).
   * Flipping it under rows that already exist would retrospectively turn a
   * contractor's own figures into the project owner's record, or take a record
   * back out of the owner's hands — neither of which anybody agreed to. So the
   * answer is a declaration-time choice, and this route is the one narrow way
   * to correct it before there is anything to be wrong about.
   */
  app.patch('/app-tables/:appTableId', async (c) => {
    const user = c.get('user');
    const appTableId = c.req.param('appTableId');
    if (!isUuid(appTableId)) return notFound(c);
    const [table] = await deps.db
      .select()
      .from(s.appTables)
      .where(eq(s.appTables.id, appTableId))
      .limit(1);
    if (!table) return notFound(c);
    // (review 2026-09-07) a retired table is not edited — same answer as absence
    if (table.retiredAt !== null) return notFound(c);
    // T-443 — an insight table has no acceptance step to set: a run writes it,
    // nobody submits it, and a submission state on it would never move
    if (table.kind === 'insight') return notFound(c);
    const reached = await reachApp(deps.db, user, table.appId);
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    const parsed = setAppTableAcceptanceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    // T-449 — the one act, shared with the agent recording a person's answer;
    // it refuses under existing rows and records the answer for the gate (T-448)
    const set = await setTableAcceptanceAct(deps.db, {
      appId: table.appId,
      participantId: slice.participantId,
      appTableId,
      hasAcceptance: parsed.data.hasAcceptance,
    });
    if (set === 'not_found') return notFound(c);
    if (set === 'conflict') {
      return c.json(
        {
          error: 'conflict',
          detail: 'this table already holds rows, and whether a row changes hands cannot be decided after it exists',
        } satisfies ApiError,
        409,
      );
    }
    const [record] = await tableRecords(
      deps.db,
      table.appId,
      slice,
      loaded.projectOwnerOrganisationId,
    ).then((all) => all.filter((t) => t.id === appTableId));
    return c.json(record);
  });

  // ── The owner's share of a table (ADR-0056 §6) ────────────────────────────
  //
  // The project owner's act, audited and revocable, and it never reaches a
  // third organisation: what is granted is one table to one named organisation,
  // and the row predicate reads exactly the live rows.
  app.post('/app-tables/:appTableId/shares', async (c) => {
    const user = c.get('user');
    const appTableId = c.req.param('appTableId');
    if (!isUuid(appTableId)) return notFound(c);
    const [table] = await deps.db
      .select()
      .from(s.appTables)
      .where(eq(s.appTables.id, appTableId))
      .limit(1);
    if (!table) return notFound(c);
    const reached = await reachApp(deps.db, user, table.appId);
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canShareAppTable(slice)) return notFound(c);
    const parsed = shareAppTableBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    // an organisation that is not on the project cannot be shared with: the
    // share widens a read INSIDE the project, never outside it
    const [membership] = await deps.db
      .select()
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.organisationId, parsed.data.organisationId),
          eq(s.memberships.projectId, loaded.row.projectId),
          eq(s.memberships.state, 'active'),
        ),
      )
      .limit(1);
    if (!membership) return invalid(c);
    await deps.db
      .insert(s.appTableShares)
      .values({
        appTableId,
        organisationId: parsed.data.organisationId,
        grantedByParticipantId: slice.participantId,
      })
      .onConflictDoNothing();
    const [record] = await tableRecords(
      deps.db,
      table.appId,
      slice,
      loaded.projectOwnerOrganisationId,
    ).then((all) => all.filter((t) => t.id === appTableId));
    return c.json(record, 201);
  });

  app.post('/app-tables/:appTableId/shares/:shareId/revocation', async (c) => {
    const user = c.get('user');
    const appTableId = c.req.param('appTableId');
    const shareId = c.req.param('shareId');
    if (!isUuid(appTableId) || !isUuid(shareId)) return notFound(c);
    const [table] = await deps.db
      .select()
      .from(s.appTables)
      .where(eq(s.appTables.id, appTableId))
      .limit(1);
    if (!table) return notFound(c);
    const reached = await reachApp(deps.db, user, table.appId);
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canShareAppTable(slice)) return notFound(c);
    await deps.db
      .update(s.appTableShares)
      .set({ revokedAt: sql`now()`, revokedByParticipantId: slice.participantId })
      .where(
        and(
          eq(s.appTableShares.id, shareId),
          eq(s.appTableShares.appTableId, appTableId),
          isNull(s.appTableShares.revokedAt),
        ),
      );
    const [record] = await tableRecords(
      deps.db,
      table.appId,
      slice,
      loaded.projectOwnerOrganisationId,
    ).then((all) => all.filter((t) => t.id === appTableId));
    return c.json(record);
  });

  // ── Reassign or close (ADR-0056 §5, §7) ───────────────────────────────────
  //
  // The ownerless app is DEFUNCT until one of these two happens. There is no
  // notification: the owner declined the proposed event on 2026-09-06 and chose
  // a broken thing that says so on its face over a message in a tray.
  app.post('/apps/:appId/reassignment', async (c) => {
    const user = c.get('user');
    // deliberately NOT `reachApp`: a defunct app must stay reachable by the
    // people who can fix it, and an unpublished defunct app has no builder who
    // can currently build it — so the gate here is `canReassignApp` alone.
    const loaded = await loadApp(deps.db, c.req.param('appId'));
    if (!loaded) return notFound(c);
    const slice = await resolveSlice(deps.db, user, loaded.row.projectId);
    if (!slice) return notFound(c);
    if (!canReassignApp(slice, { ownerOrganisationId: loaded.ownerOrganisationId })) {
      return notFound(c);
    }
    if (loaded.row.closedAt !== null) return invalid(c);
    const parsed = reassignAppBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    // the new owner must be a LIVE participant on this project and must be
    // allowed to build: handing an app to somebody who cannot build it is
    // handing it to nobody
    const [candidate] = await deps.db
      .select({ participant: s.participants, mayBuildApps: s.users.mayBuildApps })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(
        and(
          eq(s.participants.id, parsed.data.participantId),
          eq(s.participants.projectId, loaded.row.projectId),
          isNull(s.participants.removedAt),
        ),
      )
      .limit(1);
    if (!candidate || !candidate.mayBuildApps) return invalid(c);
    // (review, 2026-09-07) — the recipient stays within ADR-0056 §7's letter
    // plus the disclosed reading: the app remains its firm's, or moves to the
    // project owner's own people. As first built ANY entitled participant
    // could receive it, which would let an app change firms across the wall
    // in one click — wider than anything ruled; flagged for the owner.
    const [recipientOrg] = await deps.db
      .select({ organisationId: s.users.organisationId })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.participants.id, parsed.data.participantId))
      .limit(1);
    if (
      recipientOrg!.organisationId !== loaded.ownerOrganisationId &&
      recipientOrg!.organisationId !== loaded.projectOwnerOrganisationId &&
      recipientOrg!.organisationId !== slice.organisationId
    ) {
      return c.json(
        { error: 'invalid', detail: 'an app is reassigned within its own firm or to the project owner\u2019s people' } satisfies ApiError,
        400,
      );
    }
    await deps.db
      .update(s.apps)
      .set({ ownerParticipantId: parsed.data.participantId })
      .where(eq(s.apps.id, loaded.row.id));
    const fresh = await loadApp(deps.db, loaded.row.id);
    return c.json(await recordOf(deps.db, fresh!, slice, user.mayBuildApps));
  });

  app.post('/apps/:appId/closure', async (c) => {
    const user = c.get('user');
    const loaded = await loadApp(deps.db, c.req.param('appId'));
    if (!loaded) return notFound(c);
    const slice = await resolveSlice(deps.db, user, loaded.row.projectId);
    if (!slice) return notFound(c);
    if (!canReassignApp(slice, { ownerOrganisationId: loaded.ownerOrganisationId })) {
      return notFound(c);
    }
    if (loaded.row.closedAt !== null) return invalid(c);
    await deps.db
      .update(s.apps)
      // currency by state: a closed app keeps its tables readable (§7)
      .set({ closedAt: sql`now()`, closedByParticipantId: slice.participantId })
      .where(eq(s.apps.id, loaded.row.id));
    const fresh = await loadApp(deps.db, loaded.row.id);
    return c.json(await recordOf(deps.db, fresh!, slice, user.mayBuildApps));
  });

  return app;
}

export { loadApp, reachApp };
export type { LoadedApp };
