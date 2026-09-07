// T-445 acceptance — the playbook, driven through HTTP as each party
// (ADR-0056 §10).
//
// **The fixture is a consultancy acting for two clients**, which is the whole
// scenario: Bella's firm builds an app inside Client A's project, keeps it as a
// template on its own workspace shelf, and deploys that template into Client
// B's project. The negatives are driven AS THE OTHER PARTY — the client whose
// project the app lives in, a peer consultancy inside the app's own scope, and
// a colleague in the building firm their organisation does not let build.
//
// The one assertion that matters most is the cheapest: after a save, the stored
// `playbooks` row is read back RAW and searched for anything a row could hide
// in. It is not enough that the response looks clean.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AppRecord,
  AppTableRecord,
  GetAppResponse,
  ListPlaybooksResponse,
  PlaybookResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t445';

let projectA: string; // the project the app is built in
let projectB: string; // a different client's project, the deployment target
let clientAOrg: string;
let clientBOrg: string;
let builderOrg: string; // the consultancy acting for both
let peerOrg: string; // a second consultancy on project A only

let clientACookie: string;
let builderCookie: string; // may build, on BOTH projects
let colleagueCookie: string; // same firm, may NOT build (§12's negative)
let peerCookie: string; // may build, its own firm, on project A
let strandedCookie: string; // may build, in the building firm, on NEITHER project

async function makeUser(
  name: string,
  organisationId: string,
  options: { mayBuildApps?: boolean; projects?: string[] } = {},
) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({
      name,
      email,
      organisationId,
      orgRole: 'admin',
      mayBuildApps: options.mayBuildApps ?? false,
    })
    .returning();
  await db
    .insert(s.userCredentials)
    .values({ userId: user!.id, passwordHash: hashPassword(password) });
  for (const projectId of options.projects ?? []) {
    await db.insert(s.participants).values({ userId: user!.id, projectId, elevated: true });
  }
  return { user: user!, email };
}

async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const get = (cookie: string, path: string) => app.request(path, { headers: { cookie } });
const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
const patch = (cookie: string, path: string, body: unknown) =>
  app.request(path, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  const orgs = await db
    .insert(s.organisations)
    .values([
      { name: `t445 client A ${stamp}` },
      { name: `t445 client B ${stamp}` },
      { name: `t445 builder ${stamp}` },
      { name: `t445 peer ${stamp}` },
    ])
    .returning();
  [clientAOrg, clientBOrg, builderOrg, peerOrg] = orgs.map((o) => o.id) as [
    string,
    string,
    string,
    string,
  ];

  const projects = await db
    .insert(s.projects)
    .values([
      { name: `t445 project A ${stamp}`, ownerOrganisationId: clientAOrg },
      { name: `t445 project B ${stamp}`, ownerOrganisationId: clientBOrg },
    ])
    .returning();
  projectA = projects[0]!.id;
  projectB = projects[1]!.id;
  await db.insert(s.memberships).values([
    { organisationId: clientAOrg, projectId: projectA, role: 'owner' },
    { organisationId: builderOrg, projectId: projectA, role: 'member' },
    { organisationId: peerOrg, projectId: projectA, role: 'member' },
    { organisationId: clientBOrg, projectId: projectB, role: 'owner' },
    { organisationId: builderOrg, projectId: projectB, role: 'member' },
  ]);

  const clientA = await makeUser('t445-cara', clientAOrg, {
    mayBuildApps: true,
    projects: [projectA],
  });
  const builder = await makeUser('t445-bella', builderOrg, {
    mayBuildApps: true,
    projects: [projectA, projectB],
  });
  const colleague = await makeUser('t445-colin', builderOrg, { projects: [projectA, projectB] });
  const peer = await makeUser('t445-pia', peerOrg, { mayBuildApps: true, projects: [projectA] });
  const stranded = await makeUser('t445-sasha', builderOrg, { mayBuildApps: true });

  clientACookie = await session(clientA.email);
  builderCookie = await session(builder.email);
  colleagueCookie = await session(colleague.email);
  peerCookie = await session(peer.email);
  strandedCookie = await session(stranded.email);
});

afterAll(async () => {
  await pool.end();
});

/** A screen in the closed grammar (T-442): a heading, the form a contractor
 * fills in, and the table of what this viewer may read. */
const SCREEN_SOURCE = JSON.stringify({
  version: 1,
  blocks: [
    { kind: 'heading', text: 'Monthly returns' },
    { kind: 'rowForm', columnKeys: ['month', 'landfill'], submitLabel: 'Submit the return' },
    {
      kind: 'rowTable',
      columnKeys: ['month', 'landfill'],
      showOrganisation: true,
      showState: true,
    },
  ],
});

/** A returns app in project A: two tables (one contractual, one a reference
 * lookup), one screen over the returns table, published. */
async function returnsApp(name: string): Promise<{ app: AppRecord; tables: AppTableRecord[] }> {
  const created = (await (
    await post(builderCookie, `/projects/${projectA}/apps`, {
      name,
      organisationIds: [clientAOrg, peerOrg],
      participantIds: [],
    })
  ).json()) as AppRecord;

  const returns = (await (
    await post(builderCookie, `/apps/${created.id}/tables`, {
      name: 'Monthly returns',
      columns: [
        { key: 'month', label: 'Month', type: 'text', required: true },
        { key: 'landfill', label: 'Waste to landfill (t)', type: 'number', required: true },
      ],
      kind: 'data',
      hasAcceptance: true,
    })
  ).json()) as AppTableRecord;

  const factors = (await (
    await post(builderCookie, `/apps/${created.id}/tables`, {
      name: 'Emission factors',
      columns: [
        { key: 'material', label: 'Material', type: 'text', required: true },
        { key: 'factor', label: 'kgCO2e per tonne', type: 'number', required: true },
      ],
      kind: 'reference',
      hasAcceptance: false,
    })
  ).json()) as AppTableRecord;

  const definition = {
    connections: [{ id: 'c1', system: 'arcgis', needs: 'the site boundary layer, read only' }],
    interfaces: [
      {
        id: 'screen-1',
        label: "The contractor's return",
        appTableId: returns.id,
        openToOrganisationIds: [peerOrg],
        source: SCREEN_SOURCE,
      },
    ],
    schedule: 'monthly',
    analysisPrompt: 'Summarise the landfill trend across the returns.',
    answeredQuestions: [`contractual-data:${returns.id}`, 'who-may-open:screen-1'],
  };
  const patched = await patch(builderCookie, `/apps/${created.id}/definition`, { definition });
  expect(patched.status).toBe(200);
  await post(builderCookie, `/apps/${created.id}/publish`, {});

  const fresh = (await (await get(builderCookie, `/apps/${created.id}`)).json()) as GetAppResponse;
  return { app: fresh.app, tables: [returns, factors] };
}

async function save(cookie: string, appId: string, name?: string) {
  return post(cookie, `/apps/${appId}/playbook`, name === undefined ? {} : { name });
}

describe('saving an app to the firm’s workspace as a playbook (ADR-0056 §10)', () => {
  it('keeps the shape — the definition and the table declarations — and not one row', async () => {
    const { app: built, tables } = await returnsApp(`returns ${stamp}`);

    // rows exist in the source app, entered by the building firm, so "no rows
    // travel" is a claim about a table that actually holds something
    const entered = await post(builderCookie, `/app-tables/${tables[0]!.id}/rows`, {
      values: { month: 'August 2026', landfill: 12.4 },
      submit: true,
    });
    expect(entered.status).toBe(201);
    // …and reference rows too, which is the case the owner's clarification cut
    await post(builderCookie, `/app-tables/${tables[1]!.id}/rows`, {
      values: { material: 'Mixed waste', factor: 587 },
      submit: false,
    });

    const res = await save(builderCookie, built.id, `Returns template ${stamp}`);
    expect(res.status).toBe(201);
    const { playbook } = (await res.json()) as PlaybookResponse;
    expect(playbook.version).toBe(1);
    expect(playbook.savedByName).toBe('t445-bella');
    expect(playbook.savedFromAppId).toBe(built.id);
    expect(playbook.suppliedByInfora).toBe(false);

    // the shape travelled: both tables, their columns, their kinds, and the
    // per-table acceptance choice
    expect(playbook.tableDeclarations.map((t) => t.name).sort()).toEqual([
      'Emission factors',
      'Monthly returns',
    ]);
    const returns = playbook.tableDeclarations.find((t) => t.name === 'Monthly returns')!;
    expect(returns.hasAcceptance).toBe(true);
    expect(returns.columns.map((c) => c.key)).toEqual(['month', 'landfill']);
    const factors = playbook.tableDeclarations.find((t) => t.name === 'Emission factors')!;
    expect(factors.kind).toBe('reference');
    expect(factors.hasAcceptance).toBe(false);

    // the steps travelled: schedule, analysis prompt, connection REQUIREMENT
    expect(playbook.definition.schedule).toBe('monthly');
    expect(playbook.definition.analysisPrompt).toContain('landfill trend');
    expect(playbook.definition.connections).toHaveLength(1);
    expect(playbook.definition.connections[0]!.system).toBe('arcgis');

    // the screen travelled by the table's NAME, and who-may-open did not travel
    expect(playbook.definition.interfaces).toHaveLength(1);
    expect(playbook.definition.interfaces[0]!.tableName).toBe('Monthly returns');
    expect(playbook.definition.interfaces[0]!.source).toContain('rowForm');
    expect(
      JSON.stringify(playbook.definition.interfaces),
    ).not.toContain(peerOrg);

    // 🔒 the stored row, read back RAW: no row of any origin, and nothing that
    // could be one. The response looking clean is not the assertion.
    const [stored] = await db
      .select()
      .from(s.playbooks)
      .where(eq(s.playbooks.id, playbook.id))
      .limit(1);
    const raw = JSON.stringify([stored!.definition, stored!.tableDeclarations]);
    expect(raw).not.toContain('August 2026');
    expect(raw).not.toContain('12.4');
    expect(raw).not.toContain('Mixed waste');
    expect(raw).not.toContain('587');
    expect(raw).not.toContain('"rows"');
    // and no id from the project it was saved in
    expect(raw).not.toContain(tables[0]!.id);
    expect(raw).not.toContain(tables[1]!.id);
    expect(raw).not.toContain(projectA);
  });

  it('refuses everybody but the app’s own firm’s builder', async () => {
    const { app: built } = await returnsApp(`refusals ${stamp}`);
    // the client whose project it lives in cannot take a copy of its
    // consultant's template
    expect((await save(clientACookie, built.id)).status).toBe(404);
    // nor can a peer consultancy inside the app's own scope
    expect((await save(peerCookie, built.id)).status).toBe(404);
    // nor a colleague in the building firm their organisation does not let build
    expect((await save(colleagueCookie, built.id)).status).toBe(404);
    // the builder may
    expect((await save(builderCookie, built.id, `Refusals template ${stamp}`)).status).toBe(201);
  });

  it('refuses an app with no tables — there is no shape to keep yet', async () => {
    const empty = (await (
      await post(builderCookie, `/projects/${projectA}/apps`, {
        name: `empty ${stamp}`,
        organisationIds: [],
        participantIds: [],
      })
    ).json()) as AppRecord;
    const res = await save(builderCookie, empty.id);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('nothing to keep');
  });

  it('refuses two tables sharing a name — a screen travels by its table’s name', async () => {
    const { app: built } = await returnsApp(`twinned ${stamp}`);
    await post(builderCookie, `/apps/${built.id}/tables`, {
      name: 'Monthly returns',
      columns: [{ key: 'month', label: 'Month', type: 'text', required: true }],
      kind: 'data',
      hasAcceptance: false,
    });
    const res = await save(builderCookie, built.id, `Twinned template ${stamp}`);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('share a name');
  });

  it('makes the next VERSION when the same app is saved again, not a second entry', async () => {
    const { app: built } = await returnsApp(`versioned ${stamp}`);
    const name = `Versioned template ${stamp}`;
    const first = ((await (await save(builderCookie, built.id, name)).json()) as PlaybookResponse)
      .playbook;
    const second = ((await (await save(builderCookie, built.id, name)).json()) as PlaybookResponse)
      .playbook;
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.id).not.toBe(first.id);

    const shelf = (await (
      await get(builderCookie, '/organisation/playbooks')
    ).json()) as ListPlaybooksResponse;
    const entries = shelf.items.filter((item) => item.name === name);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.version).toBe(2);
  });
});

describe('the workspace shelf is org-private (ADR-0056 §10)', () => {
  it('shows a firm its own templates and never another firm’s', async () => {
    const name = `Private template ${stamp}`;
    const { app: built } = await returnsApp(`private ${stamp}`);
    await save(builderCookie, built.id, name);

    const mine = (await (
      await get(builderCookie, '/organisation/playbooks')
    ).json()) as ListPlaybooksResponse;
    expect(mine.maySave).toBe(true);
    expect(mine.items.map((item) => item.name)).toContain(name);

    // the peer consultancy is on the same project and in the app's scope, and
    // sees nothing of it
    const theirs = (await (
      await get(peerCookie, '/organisation/playbooks')
    ).json()) as ListPlaybooksResponse;
    expect(theirs.items.map((item) => item.name)).not.toContain(name);
    // so does the client whose project the app was built in
    const clients = (await (
      await get(clientACookie, '/organisation/playbooks')
    ).json()) as ListPlaybooksResponse;
    expect(clients.items.map((item) => item.name)).not.toContain(name);
  });

  it('tells a person their firm does not let build that they may not save', async () => {
    const shelf = (await (
      await get(colleagueCookie, '/organisation/playbooks')
    ).json()) as ListPlaybooksResponse;
    expect(shelf.maySave).toBe(false);
    expect(shelf.items).toEqual([]);
  });

  it('names the source project only to somebody who is on it', async () => {
    const name = `Sourced template ${stamp}`;
    const { app: built } = await returnsApp(`sourced ${stamp}`);
    await save(builderCookie, built.id, name);

    const asBuilder = (await (
      await get(builderCookie, '/organisation/playbooks')
    ).json()) as ListPlaybooksResponse;
    const seen = asBuilder.items.find((item) => item.name === name)!;
    expect(seen.savedFromProjectName).toBe(`t445 project A ${stamp}`);
    expect(seen.savedFromAppName).toBe(`sourced ${stamp}`);

    // a colleague in the same firm with no seat on that project reads the
    // template and neither the client's name NOR the source app's — an app's
    // name routinely carries the client's, so it goes dark with the project
    // (widened in review 2026-09-07; ADR-0046's internal walls)
    const asStranded = (await (
      await get(strandedCookie, '/organisation/playbooks')
    ).json()) as ListPlaybooksResponse;
    const theirs = asStranded.items.find((item) => item.name === name)!;
    expect(theirs.savedFromProjectName).toBeNull();
    expect(theirs.savedFromAppName).toBeNull();
    expect(theirs.savedByName).not.toBeNull();
  });

  it('an app never published saves its working copy — the fallback the record promises', async () => {
    // added in review 2026-09-07: every other fixture publishes first, so the
    // publishedDefinition ?? definition branch was never exercised
    const created = (await (
      await post(builderCookie, `/projects/${projectA}/apps`, {
        name: `never published ${stamp}`,
        organisationIds: [],
        participantIds: [],
      })
    ).json()) as AppRecord;
    await post(builderCookie, `/apps/${created.id}/tables`, {
      name: 'Draft returns',
      columns: [{ key: 'month', label: 'Month', type: 'text', required: true }],
      kind: 'data',
      hasAcceptance: false,
    });
    const res = await save(builderCookie, created.id, `Unpublished template ${stamp}`);
    expect(res.status).toBe(201);
    const { playbook } = (await res.json()) as PlaybookResponse;
    expect(playbook.tableDeclarations.map((t) => t.name)).toEqual(['Draft returns']);
  });
});

describe('deploying a playbook into another project (ADR-0056 §10)', () => {
  it('makes an empty instance with the same steps, naming the version it came from', async () => {
    const { app: built, tables } = await returnsApp(`deployable ${stamp}`);
    await post(builderCookie, `/app-tables/${tables[0]!.id}/rows`, {
      values: { month: 'September 2026', landfill: 9.1 },
      submit: true,
    });
    const playbook = (
      (await (
        await save(builderCookie, built.id, `Deployable template ${stamp}`)
      ).json()) as PlaybookResponse
    ).playbook;

    const res = await post(builderCookie, `/projects/${projectB}/apps/deployments`, {
      playbookId: playbook.id,
      name: `Returns for client B ${stamp}`,
    });
    expect(res.status).toBe(201);
    const deployed = (await res.json()) as GetAppResponse;

    // a NEW instance, in the other project, unpublished, owned by the deployer
    expect(deployed.app.projectId).toBe(projectB);
    expect(deployed.app.id).not.toBe(built.id);
    expect(deployed.app.state).toBe('unpublished');
    expect(deployed.app.ownerName).toBe('t445-bella');
    expect(deployed.app.mayBuild).toBe(true);

    // the same steps
    expect(deployed.app.definition!.schedule).toBe('monthly');
    expect(deployed.app.definition!.analysisPrompt).toContain('landfill trend');
    expect(deployed.app.definition!.connections[0]!.system).toBe('arcgis');
    expect(deployed.tables.map((t) => t.name).sort()).toEqual([
      'Emission factors',
      'Monthly returns',
    ]);
    const returns = deployed.tables.find((t) => t.name === 'Monthly returns')!;
    expect(returns.hasAcceptance).toBe(true);
    expect(returns.columns.map((c) => c.key)).toEqual(['month', 'landfill']);
    expect(deployed.tables.find((t) => t.name === 'Emission factors')!.kind).toBe('reference');

    // the screen came back, re-attached to the table this deployment made
    const screen = deployed.app.definition!.interfaces[0]!;
    expect(screen.appTableId).toBe(returns.id);
    expect(screen.source).toContain('rowForm');
    // and who may open it is empty, to be answered again in THIS project
    expect(screen.openToOrganisationIds).toEqual([]);

    // every table is EMPTY — no row of any origin, reference rows included
    for (const table of deployed.tables) {
      const rows = await db.select().from(s.appRows).where(eq(s.appRows.appTableId, table.id));
      expect(rows).toEqual([]);
    }

    // it names the playbook and the version it came from, on the record the
    // app's own page reads as well as in the store
    expect(deployed.app.deployedFrom).toEqual({
      playbookId: playbook.id,
      playbookName: playbook.name,
      version: playbook.version,
    });
    const [stored] = await db.select().from(s.apps).where(eq(s.apps.id, deployed.app.id)).limit(1);
    expect(stored!.playbookId).toBe(playbook.id);
    expect(stored!.playbookVersion).toBe(playbook.version);

    // nothing inherited the source project's scope: the deploying firm alone
    expect(deployed.app.scope).toHaveLength(1);
    expect(deployed.app.scope[0]!.organisationId).toBe(builderOrg);
  });

  it('names the template to the deploying firm alone — the shelf is org-private even on the app it made', async () => {
    // added in review 2026-09-07, with the narrowing itself: deployedFrom used
    // to reach every firm the instance was later opened to, putting one firm's
    // private shelf material (and the words "your firm's template") in front
    // of its client
    const { app: built } = await returnsApp(`private shelf ${stamp}`);
    const { playbook } = (await (
      await save(builderCookie, built.id, `Private template ${stamp}`)
    ).json()) as PlaybookResponse;
    const deployed = (
      (await (
        await post(builderCookie, `/projects/${projectB}/apps/deployments`, {
          playbookId: playbook.id,
          name: `Opened to the client ${stamp}`,
        })
      ).json()) as GetAppResponse
    ).app;
    await post(builderCookie, `/apps/${deployed.id}/scope`, { organisationId: clientBOrg });
    await post(builderCookie, `/apps/${deployed.id}/publish`);

    const clientB = await makeUser(`t445-hana-${stamp}`, clientBOrg, { projects: [projectB] });
    const clientBCookie = await session(clientB.email);
    const asClient = (await (await get(clientBCookie, `/apps/${deployed.id}`)).json()) as GetAppResponse;
    expect(asClient.app.id).toBe(deployed.id); // the app itself opens
    expect(asClient.app.deployedFrom).toBeNull(); // the shelf does not travel
    const asBuilder = (await (await get(builderCookie, `/apps/${deployed.id}`)).json()) as GetAppResponse;
    expect(asBuilder.app.deployedFrom).not.toBeNull();
  });

  it('needs both the firm’s permission to build and a seat on the target project', async () => {
    const { app: built } = await returnsApp(`gated ${stamp}`);
    const playbook = (
      (await (await save(builderCookie, built.id, `Gated template ${stamp}`)).json()) as PlaybookResponse
    ).playbook;

    // a colleague on project B whose firm does not let them build
    expect(
      (
        await post(colleagueCookie, `/projects/${projectB}/apps/deployments`, {
          playbookId: playbook.id,
        })
      ).status,
    ).toBe(404);
    // a builder in the same firm with no seat on project B at all
    expect(
      (
        await post(strandedCookie, `/projects/${projectB}/apps/deployments`, {
          playbookId: playbook.id,
        })
      ).status,
    ).toBe(404);
    // the peer consultancy, which may build and is on project A, cannot deploy
    // another firm's template — it is not on their shelf
    expect(
      (
        await post(peerCookie, `/projects/${projectA}/apps/deployments`, {
          playbookId: playbook.id,
        })
      ).status,
    ).toBe(404);
  });

  it('has no live link: re-saving the playbook changes no deployed instance', async () => {
    const { app: built } = await returnsApp(`unlinked ${stamp}`);
    const name = `Unlinked template ${stamp}`;
    const first = (
      (await (await save(builderCookie, built.id, name)).json()) as PlaybookResponse
    ).playbook;

    const deployed = (await (
      await post(builderCookie, `/projects/${projectB}/apps/deployments`, { playbookId: first.id })
    ).json()) as GetAppResponse;
    const before = (await (
      await get(builderCookie, `/apps/${deployed.app.id}`)
    ).json()) as GetAppResponse;

    // the firm changes its template: a third table, a different schedule, and
    // a second save
    await post(builderCookie, `/apps/${built.id}/tables`, {
      name: 'Site register',
      columns: [{ key: 'site', label: 'Site', type: 'text', required: true }],
      kind: 'data',
      hasAcceptance: false,
    });
    await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        connections: [],
        interfaces: [],
        schedule: 'weekly',
        analysisPrompt: 'A different prompt entirely.',
        answeredQuestions: [],
      },
    });
    await post(builderCookie, `/apps/${built.id}/publish`, {});
    const second = (
      (await (await save(builderCookie, built.id, name)).json()) as PlaybookResponse
    ).playbook;
    expect(second.version).toBe(2);
    expect(second.tableDeclarations).toHaveLength(3);

    // …and the instance already deployed is exactly as it was
    const after = (await (
      await get(builderCookie, `/apps/${deployed.app.id}`)
    ).json()) as GetAppResponse;
    expect(after.tables.map((t) => t.name).sort()).toEqual(before.tables.map((t) => t.name).sort());
    expect(after.tables).toHaveLength(2);
    expect(after.app.definition!.schedule).toBe('monthly');
    expect(after.app.definition!.analysisPrompt).toContain('landfill trend');

    // the version it names is still the one it came from — version 1, whose row
    // was never touched, and the app's own page still says so
    expect(after.app.deployedFrom!.version).toBe(1);
    // the version it names is still the one it came from — version 1, whose row
    // was never touched
    const [stored] = await db.select().from(s.apps).where(eq(s.apps.id, deployed.app.id)).limit(1);
    expect(stored!.playbookId).toBe(first.id);
    expect(stored!.playbookVersion).toBe(1);
    const [original] = await db.select().from(s.playbooks).where(eq(s.playbooks.id, first.id)).limit(1);
    expect((original!.tableDeclarations as unknown[]).length).toBe(2);

    // and the reverse: building on the deployed instance changes no template
    await post(builderCookie, `/apps/${deployed.app.id}/tables`, {
      name: 'Only here',
      columns: [{ key: 'note', label: 'Note', type: 'text', required: false }],
      kind: 'data',
      hasAcceptance: false,
    });
    const [untouched] = await db
      .select()
      .from(s.playbooks)
      .where(eq(s.playbooks.id, second.id))
      .limit(1);
    expect((untouched!.tableDeclarations as Array<{ name: string }>).map((t) => t.name)).not.toContain(
      'Only here',
    );
  });
});

describe('the store refuses rows in a playbook, whatever a route does (migration 0067)', () => {
  it('raises on a `rows` key anywhere in either JSON column', async () => {
    const [participant] = await db
      .select({ id: s.participants.id })
      .from(s.participants)
      .innerJoin(s.users, eq(s.participants.userId, s.users.id))
      .where(eq(s.users.organisationId, builderOrg))
      .limit(1);
    // drizzle wraps the driver's error, so the trigger's own words are read
    // off the cause rather than the wrapper — asserting the exact sentence the
    // migration raises, not merely that something failed
    const refusal = async (values: Record<string, unknown>) => {
      try {
        await db.insert(s.playbooks).values(values as never);
        return null;
      } catch (error) {
        return String((error as { cause?: { message?: string } }).cause?.message ?? error);
      }
    };
    expect(
      await refusal({
        organisationId: builderOrg,
        name: `smuggled ${stamp}`,
        definition: { interfaces: [{ id: 'x', rows: [{ month: 'August 2026' }] }] },
        tableDeclarations: [],
        savedByParticipantId: participant!.id,
      }),
    ).toContain('never rows');
    expect(
      await refusal({
        organisationId: builderOrg,
        name: `smuggled again ${stamp}`,
        definition: {},
        tableDeclarations: [{ name: 'Emission factors', rows: [{ factor: 587 }] }],
        savedByParticipantId: participant!.id,
      }),
    ).toContain('never rows');
  });
});
