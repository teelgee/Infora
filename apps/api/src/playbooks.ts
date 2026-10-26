// T-445 — **playbooks: save to the workspace, deploy as a copy** (ADR-0056 §10).
//
// *In plain terms: a firm that has built an app it likes can keep it as a
// template on its own shelf, and put a copy of that template into the next
// project. What is kept is the shape — the steps, the screens, the tables'
// names and columns and whether each needs signing off. Not one row of anybody's
// data is kept, whoever typed it. Deploying makes a brand-new app with the same
// steps and empty tables, and the two never speak again: changing the template
// afterwards changes nothing already running, and building on a deployed app
// changes nothing on the shelf.*
//
// 🔒 **NO ROWS TRAVEL, AND THAT IS TRUE THREE TIMES OVER.** The owner's
// clarification of 2026-09-06 — *"by reference tables i meant the database
// structure for an app, not the content from within it"* — replaced an earlier
// softening that would have let a firm's own reference rows ride along. So:
// **(1)** nothing in this file reads `app_rows`, at all, on either path;
// **(2)** what a table contributes is `{name, columns, kind, hasAcceptance}`,
// and `PlaybookTableDeclaration` has nowhere a row could sit; **(3)** the
// database refuses a `rows` key anywhere in either JSON column
// (`playbooks_carry_no_rows`, migration 0067) — the guard that survives this
// file being rewritten by somebody who has not read it.
//
// 🔒 **NO LIVE LINK, AND IT IS STRUCTURAL RATHER THAN POLICED.** Saving again
// writes a NEW `playbooks` row with the next version number; a playbook row is
// never updated after it is written. So a deployed instance's `playbook_id`
// points at a row that cannot change, and there is no shared record for either
// side to edit. A firm must not be able to alter what runs inside a client's
// project without anybody there seeing it, and the way that is guaranteed here
// is that there is nothing to alter.
//
// 🔒 **A DEPLOYED INSTANCE IS AN ORDINARY APP.** It is made by
// `createAppInstance` in `app-instance.ts`, the same function
// `POST /projects/:projectId/apps` calls — same owner, creator and definition
// stamps, same starting scope, same rules. Deploying is not a second way to get
// an app with different properties; it is the ordinary way, with the definition
// already filled in.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { deployPlaybookBody, parseAppScreen, publishedColumnsOf, saveAppAsPlaybookBody } from '@infora/contracts';
import type {
  ApiError,
  AppColumn,
  AppDefinition,
  AppInterface,
  GetAppResponse,
  ListPlaybooksResponse,
  PlaybookDefinition,
  PlaybookRecord,
  PlaybookResponse,
  PlaybookTableDeclaration,
} from '@infora/contracts';
import { canBuildApp, canDeployPlaybook } from '@infora/governance';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { buildFacts, loadApp, publishGateFor, reachApp, recordOf, tableRecords } from './apps';
import { createAppInstance } from './app-instance';
import { resolveSlice } from './requester';
import type { AppEnv, UserRow } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const invalid = (c: Context) => c.json({ error: 'invalid' } satisfies ApiError, 400);
const conflict = (c: Context, detail: string) =>
  c.json({ error: 'conflict', detail } satisfies ApiError, 409);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

// ── What travels, and what is left behind ──────────────────────────────────

/**
 * The definition, stripped of everything that belonged to the project it was
 * saved from — the two substitutions `PlaybookInterface` exists to make.
 *
 * A screen keeps the **name** of the table it was over instead of its id, and
 * loses `openToOrganisationIds` entirely. Everything else travels: the
 * schedule, the analysis prompt, the connection requirements and the screens
 * themselves are the hard work of defining the steps, which is the whole of
 * what the owner said a playbook is for.
 */
function travellingDefinition(
  definition: AppDefinition,
  tables: ReadonlyArray<{ id: string; name: string }>,
): PlaybookDefinition {
  const nameById = new Map(tables.map((table) => [table.id, table.name]));
  return {
    connections: definition.connections,
    schedule: definition.schedule,
    analysisPrompt: definition.analysisPrompt,
    interfaces: definition.interfaces.map((screen) => ({
      id: screen.id,
      label: screen.label,
      tableName: screen.appTableId === null ? null : (nameById.get(screen.appTableId) ?? null),
      source: screen.source,
    })),
  };
}

// ── Reading the shelf ──────────────────────────────────────────────────────

type LoadedPlaybook = {
  row: typeof s.playbooks.$inferSelect;
  savedByName: string;
  savedFromAppName: string | null;
  savedFromProjectId: string | null;
};

/** The firm's own templates PLUS Infora's supplied ones (§11), and never
 * another firm's — the whole of what org-private means here. */
async function loadShelf(db: Db, organisationId: string): Promise<LoadedPlaybook[]> {
  const rows = await db
    .select({
      playbook: s.playbooks,
      savedByName: s.users.name,
      savedFromAppName: s.apps.name,
      savedFromProjectId: s.apps.projectId,
    })
    .from(s.playbooks)
    .innerJoin(s.participants, eq(s.playbooks.savedByParticipantId, s.participants.id))
    .innerJoin(s.users, eq(s.participants.userId, s.users.id))
    .leftJoin(s.apps, eq(s.playbooks.savedFromAppId, s.apps.id))
    .where(
      or(eq(s.playbooks.organisationId, organisationId), eq(s.playbooks.suppliedByInfora, true)),
    )
    .orderBy(asc(s.playbooks.name), desc(s.playbooks.version));
  return rows.map((row) => ({
    row: row.playbook,
    savedByName: row.savedByName,
    savedFromAppName: row.savedFromAppName,
    savedFromProjectId: row.savedFromProjectId,
  }));
}

/**
 * T-488 — the ONE condition under which a requester may be told what the source
 * app's words were (its name, and now the template's description): they are on
 * the project it was saved from. Used by the shelf record and by deploy.
 * A template with no source project at all (one Infora supplies) has no client's
 * words to withhold.
 */
async function onSourceProjectOf(db: Db, user: UserRow, savedFromProjectId: string | null): Promise<boolean> {
  if (savedFromProjectId === null) return false;
  return (await resolveSlice(db, user, savedFromProjectId)) !== null;
}

/**
 * The record, for one requester.
 *
 * `savedFromProjectName` — and, since the review of 2026-09-07,
 * `savedFromAppName` with it — is resolved through the requester's OWN
 * entitlement to that project and is null when they have none. A firm's
 * builders share this shelf, and a firm may hold an internal wall over a pair
 * of clients (ADR-0046): a shelf that named every template's client to every
 * builder would be a small leak through a control that exists to prevent
 * exactly that — and an app's NAME routinely carries the client's, which is
 * why withholding the project's name alone was porous. The template's own
 * name and who saved it always show; those are the firm's words, not the
 * client's.
 */
async function playbookRecord(
  db: Db,
  user: UserRow,
  loaded: LoadedPlaybook,
): Promise<PlaybookRecord> {
  let savedFromProjectName: string | null = null;
  const onSourceProject = await onSourceProjectOf(db, user, loaded.savedFromProjectId);
  if (onSourceProject) {
    const [project] = await db
      .select({ name: s.projects.name })
      .from(s.projects)
      .where(eq(s.projects.id, loaded.savedFromProjectId!))
      .limit(1);
    savedFromProjectName = project?.name ?? null;
  }
  return {
    id: loaded.row.id,
    organisationId: loaded.row.organisationId,
    name: loaded.row.name,
    // T-488 — the description is the source app's own words and may name its
    // client, so it is withheld exactly as `savedFromAppName` is (ADR-0046); a
    // template with no source project (Infora's own) has none to withhold
    description: onSourceProject || loaded.savedFromProjectId === null ? loaded.row.description : null,
    version: loaded.row.version,
    definition: loaded.row.definition as PlaybookDefinition,
    tableDeclarations: loaded.row.tableDeclarations as PlaybookTableDeclaration[],
    savedByName: loaded.savedByName,
    savedAt: loaded.row.savedAt.toISOString(),
    savedFromAppId: loaded.row.savedFromAppId,
    savedFromAppName: onSourceProject ? loaded.savedFromAppName : null,
    savedFromProjectName,
    suppliedByInfora: loaded.row.suppliedByInfora,
    retiredAt: loaded.row.retiredAt?.toISOString() ?? null,
  };
}

export function playbookRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  // ── The workspace's playbook shelf ──────────────────────────────────────
  //
  // **No project, like the rulebook shelf beside it** — org context is
  // portable, and a playbook scoped to a project would be a narrower thing
  // wearing the same name (drawer 9's own reason for having no `project_id`).
  //
  // **The shelf shows the latest version of each name.** Earlier versions are
  // kept, because deployed instances name them; they are not shelf entries,
  // because a shelf of near-duplicates is what versioning exists to prevent.
  //
  // 🔒 The gate is §12's per-person toggle — the population that can do
  // anything with a template, since saving one and deploying one both need it.
  // A person their firm does not let build apps is told so, and gets nothing.
  app.get('/organisation/playbooks', async (c) => {
    const user = c.get('user');
    if (!user.mayBuildApps) {
      return c.json({ items: [], maySave: false } satisfies ListPlaybooksResponse);
    }
    const shelf = await loadShelf(deps.db, user.organisationId);
    const latest = new Map<string, LoadedPlaybook>();
    for (const entry of shelf) {
      if (entry.row.retiredAt !== null) continue;
      const key = `${entry.row.organisationId}:${entry.row.name}`;
      const held = latest.get(key);
      if (held === undefined || entry.row.version > held.row.version) latest.set(key, entry);
    }
    const items: PlaybookRecord[] = [];
    for (const entry of latest.values()) items.push(await playbookRecord(deps.db, user, entry));
    items.sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ items, maySave: true } satisfies ListPlaybooksResponse);
  });

  // ── Save this app to the firm's workspace as a playbook (§10) ────────────
  //
  // 🔒 **WHO MAY SAVE IS `canBuildApp` AND NOTHING WIDER.** The person saving
  // must be somebody their own firm lets build (§12), and it must be their
  // firm's app. The client whose project the app lives in cannot take a copy of
  // its consultant's template, and neither can a peer consultancy inside the
  // app's scope: what a playbook holds is the firm's judgement about how the
  // work is shaped, and that is the firm's own material.
  app.post('/apps/:appId/playbook', async (c) => {
    const user = c.get('user');
    const reached = await reachApp(deps.db, user, c.req.param('appId'));
    if (!reached) return notFound(c);
    const { app: loaded, slice } = reached;
    if (!canBuildApp(slice, user.mayBuildApps, buildFacts(loaded, slice))) return notFound(c);
    const parsed = saveAppAsPlaybookBody.safeParse((await c.req.json().catch(() => null)) ?? {});
    if (!parsed.success) return invalid(c);

    // 🔒 the declarations, and only the declarations. `app_rows` is not read on
    // this path — there is no query for it anywhere in this file.
    const tables = await deps.db
      .select({
        id: s.appTables.id,
        name: s.appTables.name,
        columns: s.appTables.columns,
        kind: s.appTables.kind,
        hasAcceptance: s.appTables.hasAcceptance,
      })
      .from(s.appTables)
      .where(and(eq(s.appTables.appId, loaded.row.id), isNull(s.appTables.retiredAt)))
      .orderBy(asc(s.appTables.name));
    if (tables.length === 0) {
      return conflict(c, 'there is nothing to keep yet: an app with no tables has no shape to save');
    }
    // **A table's NAME is what a screen travels by**, so two live tables sharing
    // one is a template whose screens could be re-attached to the wrong table on
    // deployment. `app_tables` does not forbid it (a name is a label, not a key),
    // so the save refuses rather than the deployment guessing — refusing here is
    // the one place a person can still fix it.
    if (new Set(tables.map((table) => table.name)).size !== tables.length) {
      return conflict(
        c,
        'two of this app’s tables share a name, and a template’s screens travel by table name — rename one before keeping it',
      );
    }

    // **The PUBLISHED copy is what travels, falling back to the working copy
    // when nothing has been published.** A playbook is *the finished definition
    // of its steps* (§10's own words); half-edited work in progress is not what
    // a colleague deploying it next month is asking for.
    const source = (loaded.row.publishedDefinition ?? loaded.row.definition) as AppDefinition;
    const declarations: PlaybookTableDeclaration[] = tables.map((table) => ({
      name: table.name,
      // T-489 — a template carries the columns as a table is declared, not the
      // time one was added to a table somebody else's app already had
      // — and when the template comes from the PUBLISHED copy, only the columns
      // that copy has, so a template never mixes the two copies
      columns: (loaded.row.publishedDefinition === null
        ? (table.columns as AppColumn[])
        : publishedColumnsOf(table.columns as AppColumn[], loaded.row.publishedAt?.toISOString() ?? null)
      ).map((column) => {
        const carried = { ...column };
        delete carried.addedAt;
        return carried;
      }),
      kind: table.kind,
      hasAcceptance: table.hasAcceptance,
    }));

    const name = (parsed.data.name ?? loaded.row.name).trim();
    if (name === '') return invalid(c);
    // **saving again under the same name is the next VERSION** — one entry per
    // template on the shelf, rather than a pile of near-duplicates
    const [highest] = await deps.db
      .select({ version: s.playbooks.version })
      .from(s.playbooks)
      .where(and(eq(s.playbooks.organisationId, user.organisationId), eq(s.playbooks.name, name)))
      .orderBy(desc(s.playbooks.version))
      .limit(1);
    const written = await deps.db
      .insert(s.playbooks)
      .values({
        organisationId: user.organisationId,
        name,
        // T-488 — the app's own description travels with the template
        description: loaded.row.description,
        version: (highest?.version ?? 0) + 1,
        definition: travellingDefinition(source, tables),
        tableDeclarations: declarations,
        savedByParticipantId: slice.participantId,
        savedFromAppId: loaded.row.id,
      })
      .returning()
      .then(
        (rows) => rows[0],
        // two saves of one name at the same moment race for the same version
        // number and the unique index refuses the loser — a worded conflict,
        // not a bare 500 (review 2026-09-07)
        () => null,
      );
    if (written === null || written === undefined) {
      return conflict(c, 'this template was being saved twice at once — try again');
    }

    const [entry] = (await loadShelf(deps.db, user.organisationId)).filter(
      (row) => row.row.id === written.id,
    );
    return c.json(
      { playbook: await playbookRecord(deps.db, user, entry!) } satisfies PlaybookResponse,
      201,
    );
  });

  // ── Deploy a playbook into a project as a new instance (§10) ─────────────
  //
  // 🔒 **THE DEPLOYER NEEDS BOTH:** their firm's permission to build (§12) and
  // a live seat on the project they are deploying into. The second is the
  // ordinary entitlement question, answered by `resolveSlice` and never
  // restated here.
  //
  // **What the new instance starts as:** unpublished, owned by the deployer,
  // open to the deploying firm alone. Nothing about the source project's scope
  // travels, because an organisation id from another project is another
  // project's fact; widening is a deliberate act taken afterwards, in front of
  // somebody who knows who is on THIS project.
  app.post('/projects/:projectId/apps/deployments', async (c) => {
    const user = c.get('user');
    const projectId = c.req.param('projectId');
    const slice = await resolveSlice(deps.db, user, projectId);
    if (!slice) return notFound(c);
    const parsed = deployPlaybookBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c);
    if (!isUuid(parsed.data.playbookId)) return notFound(c);
    const [playbook] = await deps.db
      .select()
      .from(s.playbooks)
      .where(eq(s.playbooks.id, parsed.data.playbookId))
      .limit(1);
    if (!playbook) return notFound(c);
    if (!canDeployPlaybook(slice, user.mayBuildApps, playbook)) return notFound(c);

    const declarations = playbook.tableDeclarations as PlaybookTableDeclaration[];
    if (declarations.length === 0) {
      return conflict(c, 'this playbook declares no tables, so there is nothing to deploy');
    }
    const saved = playbook.definition as PlaybookDefinition;

    // the instance first, through the SAME path a from-scratch app takes. Its
    // definition is filled in below, once the tables it points at exist.
    // the same guard the save route has: a whitespace name trims to nothing
    // (review 2026-09-07)
    // T-488 — "nothing sent" falls back to the template's description only for a
    // requester who may be told it (`onSourceProjectOf`, the shelf's own condition)
    const [sourceApp] =
      playbook.savedFromAppId === null
        ? []
        : await deps.db
            .select({ projectId: s.apps.projectId })
            .from(s.apps)
            .where(eq(s.apps.id, playbook.savedFromAppId))
            .limit(1);
    const deployFallback =
      playbook.savedFromAppId === null || (await onSourceProjectOf(deps.db, user, sourceApp?.projectId ?? null))
        ? playbook.description
        : null;
    const deployName = (parsed.data.name ?? playbook.name).trim();
    if (deployName === '') return invalid(c);
    const appId = await createAppInstance(deps.db, {
      projectId,
      slice,
      name: deployName,
      // T-488 — what was submitted wins (an empty box clears it); sent nothing,
      // the deployed copy carries the template's own description
      description:
        parsed.data.description === undefined
          ? deployFallback
          : parsed.data.description.trim() === ''
            ? null
            : parsed.data.description.trim(),
      // nothing inherits the source project's scope: `createAppInstance` grants
      // the deploying firm's own organisation, and nothing else is passed
      organisationIds: [],
      participantIds: [],
      playbookId: playbook.id,
      playbookVersion: playbook.version,
    });

    // the tables, declared EMPTY — the deploying firm loads its own lookup rows
    // into the fresh instance afterwards (§10, the owner's cleaner wall rule)
    const created = await deps.db
      .insert(s.appTables)
      .values(
        declarations.map((declaration) => ({
          appId,
          name: declaration.name,
          columns: declaration.columns,
          kind: declaration.kind,
          hasAcceptance: declaration.hasAcceptance,
        })),
      )
      .returning({ id: s.appTables.id, name: s.appTables.name, columns: s.appTables.columns });
    const idByName = new Map(created.map((table) => [table.name, table.id]));
    const keysById = new Map(
      created.map((table) => [table.id, (table.columns as AppColumn[]).map((column) => column.key)]),
    );

    // Each screen is re-attached to the table recreated under the name it was
    // saved with, and **who may open it starts empty** — narrowing is a
    // decision about organisations on THIS project, so it is asked again.
    //
    // A screen whose table did not travel, or which does not parse against the
    // columns that did, arrives WITHOUT its source rather than stopping the
    // deployment: the same check `PATCH /definition` makes, with the app kept
    // and the screen left for its builder to draw again. A stored screen that
    // fails at render is the one outcome neither route allows.
    const interfaces: AppInterface[] = saved.interfaces.map((screen) => {
      const appTableId = screen.tableName === null ? null : (idByName.get(screen.tableName) ?? null);
      const keys = appTableId === null ? [] : (keysById.get(appTableId) ?? []);
      const usable =
        screen.source !== null && appTableId !== null && parseAppScreen(screen.source, keys) !== null;
      return {
        id: screen.id,
        label: screen.label,
        appTableId,
        openToOrganisationIds: [],
        source: usable ? screen.source : null,
      };
    });
    // the acceptance answers travel with the declarations, so those questions
    // stay answered against the tables this deployment just made — for the
    // kinds the question is ASKED of (an insight table is never asked, so it
    // is not marked answered — review 2026-09-07); who-may-open does not
    // travel at all, so the builder is asked it again here (§2b)
    const asked = new Set(
      declarations.filter((d) => d.kind !== 'insight').map((d) => d.name),
    );
    const definition: AppDefinition = {
      connections: saved.connections,
      interfaces,
      schedule: saved.schedule,
      analysisPrompt: saved.analysisPrompt,
      answeredQuestions: created
        .filter((table) => asked.has(table.name))
        .map((table) => `contractual-data:${table.id}`),
    };
    // stamped exactly as PATCH /definition stamps an edit (review 2026-09-07:
    // this write previously bumped nothing and named nobody)
    await deps.db
      .update(s.apps)
      .set({
        definition,
        definitionVersion: sql`${s.apps.definitionVersion} + 1`,
        definitionUpdatedByParticipantId: slice.participantId,
        definitionUpdatedAt: sql`now()`,
      })
      .where(eq(s.apps.id, appId));

    const fresh = await loadApp(deps.db, appId);
    return c.json(
      {
        app: await recordOf(deps.db, fresh!, slice, user.mayBuildApps),
        tables: await tableRecords(deps.db, appId, slice, fresh!.projectOwnerOrganisationId, true),
        // T-448 — the deployer may build what it just deployed, so it is told
        // what the gate still needs (who may open each screen, asked again here)
        publishGate: await publishGateFor(deps.db, fresh!.row),
      } satisfies GetAppResponse,
      201,
    );
  });

  return app;
}
