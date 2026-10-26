// T-489 acceptance — **the owner's four rulings on apps** (ADR-0056's fifth
// addendum, 2026-10-25).
//
// *In plain terms: four things the acceptance walk found a returns app could
// not do, each proved here as the people who would meet it:*
//
//   1. a builder adds a column to a table that already has rows — by hand or
//      through the agent — and the app's people see it only from the next
//      publish; and a chart can be grouped by the organisation that entered each
//      row ("electricity by contractor");
//   2. (the dashboard's Accept and Reject are proved in the web render tests and
//      the e2e spec — they call the existing decision route this file also drives);
//   3. a contractor whose return was rejected finds it in their "waiting on you"
//      queue with the client's reason, and it leaves when they correct it;
//   4. a rejected return is never added up by the written analysis, and a return
//      still waiting for the client counts and is said to.
//
// Fresh organisations, project and apps per run; every row is looked up by the id
// this file created, never by title or name (the suite is repeatable on one seed).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type {
  AppRecord,
  AppRowResponse,
  AppRunRecord,
  AppTableRecord,
  GetWorkQueueResponse,
  ListAppRowsResponse,
  SayToBuilderResponse,
} from '@infora/contracts';
import { parseAppScreen, rowMonth } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { figuresAsText, figuresFor } from './app-insight';
import { rejectedRowSentence } from './app-rows';
import { addStandInScreen } from './app-test-support';
import { fakeBuilderAgent } from './fake-builder-agent';
import { fakeRouter } from './test-router';
import { parseXlsxSheets } from './xlsx';

const { db, pool } = createDb();

// the scripted model: the good builder agent, and for a run the figures it was
// shown are kept so a test can read exactly what the model was told
let lastFigures = '';
let lastInstruction = '';
const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter((system, prompt) => {
    const agent = fakeBuilderAgent(system, prompt);
    if (agent !== null) return agent;
    if (system.includes('about figures that have already been calculated')) {
      lastFigures = prompt;
      lastInstruction = system;
      return 'Two firms have returned.';
    }
    return 'unused';
  }),
});

const stamp = Date.now();
const password = 'pw-t489';

let projectId: string;
let clientOrg: string;
let orgA: string;
let orgB: string;
let clientCookie: string;
let builderACookie: string; // builds, and enters rows, for contractor A
let colleagueACookie: string; // same firm as A, may NOT build
let builderBCookie: string; // contractor B

async function makeUser(name: string, organisationId: string, mayBuildApps: boolean) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: 'admin', mayBuildApps })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId });
  return email;
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

beforeAll(async () => {
  const orgs = await db
    .insert(s.organisations)
    .values([
      { name: `t489 Client ${stamp}` },
      { name: `t489 Contractor A ${stamp}` },
      { name: `t489 Contractor B ${stamp}` },
    ])
    .returning();
  [clientOrg, orgA, orgB] = orgs.map((o) => o.id) as [string, string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t489 project ${stamp}`, ownerOrganisationId: clientOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: clientOrg, projectId, role: 'owner' },
    { organisationId: orgA, projectId, role: 'member' },
    { organisationId: orgB, projectId, role: 'member' },
  ]);
  clientCookie = await session(await makeUser('t489-cleo', clientOrg, true));
  builderACookie = await session(await makeUser('t489-alma', orgA, true));
  colleagueACookie = await session(await makeUser('t489-colm', orgA, false));
  builderBCookie = await session(await makeUser('t489-bryn', orgB, true));
});

afterAll(async () => {
  await pool.end();
});

/** A published returns app with an acceptance step and the insight table a run
 * writes into, built by contractor A and open to the client and contractor B. */
async function returnsApp(name: string): Promise<{ app: AppRecord; table: AppTableRecord }> {
  const created = (await (
    await post(builderACookie, `/projects/${projectId}/apps`, {
      name,
      organisationIds: [clientOrg, orgB],
      participantIds: [],
    })
  ).json()) as AppRecord;
  const table = (await (
    await post(builderACookie, `/apps/${created.id}/tables`, {
      name: 'Monthly returns',
      columns: [
        { key: 'month', label: 'Month', type: 'text', required: true },
        { key: 'energy', label: 'Energy used (kWh)', type: 'number', required: true },
      ],
      kind: 'data',
      hasAcceptance: true,
    })
  ).json()) as AppTableRecord;
  await post(builderACookie, `/apps/${created.id}/tables`, {
    name: 'Insights',
    columns: [{ key: 'x', label: 'x', type: 'text' }],
    kind: 'insight',
  });
  await addStandInScreen((path, init) => app.request(path, init), builderACookie, created.id);
  expect((await post(builderACookie, `/apps/${created.id}/publish`)).status).toBe(200);
  return { app: created, table };
}

const rowsOf = async (cookie: string, tableId: string) =>
  (await (await get(cookie, `/app-tables/${tableId}/rows`)).json()) as ListAppRowsResponse;
const enter = async (cookie: string, tableId: string, values: Record<string, unknown>, submit = true) =>
  ((await (await post(cookie, `/app-tables/${tableId}/rows`, { values, submit })).json()) as AppRowResponse).row;
const queueOf = async (cookie: string) =>
  ((await (await get(cookie, `/projects/${projectId}/work-queue`)).json()) as GetWorkQueueResponse).items;

// ════════════════════════════════════════════════════════════════════════════
// Ruling 1 — a column added to a table that already exists
// ════════════════════════════════════════════════════════════════════════════

describe('a builder adds a column to a table that already has rows (ruling 1)', () => {
  it('works out a key from the label, makes it optional, and stamps when it was added', async () => {
    const { table } = await returnsApp(`t489 add ${stamp}`);
    await enter(builderACookie, table.id, { month: 'October 2026', energy: 100 });

    const res = await post(builderACookie, `/app-tables/${table.id}/columns`, {
      label: 'Diesel used (litres)',
      type: 'number',
    });
    expect(res.status).toBe(201);
    const record = (await res.json()) as AppTableRecord;
    const added = record.columns.find((column) => column.key === 'diesel_used_litres')!;
    expect(added).toMatchObject({ label: 'Diesel used (litres)', type: 'number', required: false });
    expect(typeof added.addedAt).toBe('string');
    // the columns the table was declared with are untouched and carry no "added" time
    expect(record.columns.slice(0, 2).map((column) => column.addedAt)).toEqual([undefined, undefined]);
    // the rows already entered stay exactly as they were
    expect((await rowsOf(builderACookie, table.id)).items[0]!.values).toEqual({ month: 'October 2026', energy: 100 });
  });

  it('refuses in words: a key already used, a choice with no choices, and an insight table', async () => {
    const { app: built, table } = await returnsApp(`t489 refusals ${stamp}`);
    const taken = await post(builderACookie, `/app-tables/${table.id}/columns`, {
      key: 'energy',
      label: 'Energy again',
      type: 'number',
    });
    expect(taken.status).toBe(409);
    expect(((await taken.json()) as { detail: string }).detail).toContain('already has a column with the key');

    const noChoices = await post(builderACookie, `/app-tables/${table.id}/columns`, { label: 'Site', type: 'choice' });
    expect(noChoices.status).toBe(409);
    expect(((await noChoices.json()) as { detail: string }).detail).toContain('at least one choice');

    const insight = (await db.select().from(s.appTables).where(eq(s.appTables.appId, built.id))).find(
      (candidate) => candidate.kind === 'insight',
    )!;
    const refused = await post(builderACookie, `/app-tables/${insight.id}/columns`, { label: 'Extra', type: 'text' });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { detail: string }).detail).toContain('Infora fixes its columns');

    // a second column from the same label gets its own key rather than overwriting
    const first = (await (await post(builderACookie, `/app-tables/${table.id}/columns`, { label: 'Site', type: 'text' })).json()) as AppTableRecord;
    const second = (await (await post(builderACookie, `/app-tables/${table.id}/columns`, { label: 'Site', type: 'text' })).json()) as AppTableRecord;
    expect(first.columns.map((column) => column.key)).toContain('site');
    expect(second.columns.map((column) => column.key)).toContain('site_2');
  });

  it('is the builder’s alone: everyone else is answered as if the table were not there', async () => {
    const { table } = await returnsApp(`t489 builders only ${stamp}`);
    const body = { label: 'Diesel', type: 'number' };
    for (const cookie of [colleagueACookie, clientCookie, builderBCookie]) {
      expect((await post(cookie, `/app-tables/${table.id}/columns`, body)).status).toBe(404);
    }
    expect((await post(builderACookie, `/app-tables/00000000-0000-4000-8000-000000000000/columns`, body)).status).toBe(404);
    // and nothing was added
    const stored = (await db.select().from(s.appTables).where(eq(s.appTables.id, table.id)))[0]!;
    expect((stored.columns as unknown[]).length).toBe(2);
  });

  it('is seen by the app’s people only from the next publish — in the table, the form, the export and the run', async () => {
    const { app: built, table } = await returnsApp(`t489 publish ${stamp}`);
    await enter(builderACookie, table.id, { month: 'October 2026', energy: 100 });
    await post(builderACookie, `/app-tables/${table.id}/columns`, { label: 'Diesel used', type: 'number' });

    // the builder's working copy shows it at once…
    const asBuilder = await rowsOf(builderACookie, table.id);
    expect(asBuilder.table.columns.map((column) => column.key)).toContain('diesel_used');
    // …and the people using the app do not: not the colleague, not the client
    for (const cookie of [colleagueACookie, clientCookie]) {
      const seen = await rowsOf(cookie, table.id);
      expect(seen.table.columns.map((column) => column.key)).not.toContain('diesel_used');
      const opened = (await (await get(cookie, `/apps/${built.id}`)).json()) as { tables: AppTableRecord[] };
      expect(opened.tables.find((t) => t.id === table.id)!.columns.map((column) => column.key)).not.toContain('diesel_used');
    }

    // a value for it is refused like a column that was never declared — for a builder too
    for (const cookie of [colleagueACookie, builderACookie]) {
      const refused = await post(cookie, `/app-tables/${table.id}/rows`, { values: { month: 'Nov 2026', energy: 1, diesel_used: 5 }, submit: true });
      expect(refused.status).toBe(400);
      expect(((await refused.json()) as { detail: string }).detail).toContain('is not declared');
    }

    // the export and the run do not cover it
    const exported = await post(clientCookie, `/apps/${built.id}/exports`, { format: 'xlsx', appTableIds: [] });
    const sheets = parseXlsxSheets(Buffer.from(await exported.arrayBuffer()))!;
    expect(JSON.stringify(sheets)).not.toContain('Diesel used');

    // publish: everyone sees it, a value is accepted, the export and the run cover it
    expect((await post(builderACookie, `/apps/${built.id}/publish`)).status).toBe(200);
    for (const cookie of [colleagueACookie, clientCookie]) {
      expect((await rowsOf(cookie, table.id)).table.columns.map((column) => column.key)).toContain('diesel_used');
    }
    const row = await post(colleagueACookie, `/app-tables/${table.id}/rows`, { values: { month: 'Nov 2026', energy: 1, diesel_used: 5 }, submit: true });
    expect(row.status).toBe(201);
    const exportedAfter = await post(clientCookie, `/apps/${built.id}/exports`, { format: 'xlsx', appTableIds: [] });
    expect(JSON.stringify(parseXlsxSheets(Buffer.from(await exportedAfter.arrayBuffer()))!)).toContain('Diesel used');
    await post(clientCookie, `/apps/${built.id}/runs`, { trigger: 'manual' });
    expect(lastFigures).toContain('Diesel used');
  });

  it('a column added AFTER a publish waits for the next one, while the earlier ones stay', async () => {
    const { app: built, table } = await returnsApp(`t489 second publish ${stamp}`);
    await post(builderACookie, `/app-tables/${table.id}/columns`, { label: 'First extra', type: 'text' });
    await post(builderACookie, `/apps/${built.id}/publish`);
    await post(builderACookie, `/app-tables/${table.id}/columns`, { label: 'Second extra', type: 'text' });
    const keys = (await rowsOf(clientCookie, table.id)).table.columns.map((column) => column.key);
    expect(keys).toContain('first_extra');
    expect(keys).not.toContain('second_extra');
  });
});

describe('a template never mixes the published and working copies (ruling 1)', () => {
  const keysOf = async (appId: string) => {
    const saved = (await (await post(builderACookie, `/apps/${appId}/playbook`, { name: `t489 template ${appId}` })).json()) as {
      playbook: { tableDeclarations: Array<{ name: string; columns: Array<{ key: string; addedAt?: string }> }> };
    };
    return saved.playbook.tableDeclarations.find((table) => table.name === 'Monthly returns')!.columns;
  };

  it('saved from the published copy it carries only the columns that copy has, and none keeps its added-at time', async () => {
    const { app: built, table } = await returnsApp(`t489 template ${stamp}`);
    await post(builderACookie, `/app-tables/${table.id}/columns`, { label: 'Published extra', type: 'text' });
    await post(builderACookie, `/apps/${built.id}/publish`);
    await post(builderACookie, `/app-tables/${table.id}/columns`, { label: 'Working extra', type: 'text' });
    const columns = await keysOf(built.id);
    expect(columns.map((column) => column.key)).toEqual(['month', 'energy', 'published_extra']);
    expect(columns.every((column) => column.addedAt === undefined)).toBe(true);
  });

  it('an app nothing has been published of is saved as its working copy, every column included', async () => {
    const created = (await (
      await post(builderACookie, `/projects/${projectId}/apps`, { name: `t489 unpublished template ${stamp}`, organisationIds: [clientOrg], participantIds: [] })
    ).json()) as AppRecord;
    const table = (await (
      await post(builderACookie, `/apps/${created.id}/tables`, {
        name: 'Monthly returns',
        columns: [{ key: 'month', label: 'Month', type: 'text', required: true }],
        kind: 'data',
        hasAcceptance: false,
      })
    ).json()) as AppTableRecord;
    await post(builderACookie, `/app-tables/${table.id}/columns`, { label: 'Extra', type: 'text' });
    expect((await keysOf(created.id)).map((column) => column.key)).toEqual(['month', 'extra']);
  });
});

describe('the builder’s agent adds a column and groups a chart by organisation (ruling 1)', () => {
  const say = async (appId: string, text: string) => {
    const res = await post(builderACookie, `/apps/${appId}/builder/conversation`, { say: text });
    expect(res.status).toBe(200);
    return (await res.json()) as SayToBuilderResponse;
  };

  it('adds an optional column through the same function the panel route calls', async () => {
    const created = (await (
      await post(builderACookie, `/projects/${projectId}/apps`, { name: `t489 agent ${stamp}`, organisationIds: [clientOrg], participantIds: [] })
    ).json()) as AppRecord;
    await say(created.id, 'Build me a monthly returns app.');
    const res = await say(created.id, 'Please add a column called Diesel used (number).');
    expect(res.turns[1]!.acts.map((act) => act.kind)).toEqual(['addColumn']);
    expect(res.turns[1]!.acts[0]!.summary).toContain('Diesel used');
    const returns = res.app.tables.find((t) => t.name === 'Monthly returns')!;
    expect(returns.columns.find((column) => column.key === 'diesel_used')).toMatchObject({
      label: 'Diesel used',
      type: 'number',
      required: false,
    });
    expect(returns.columns.find((column) => column.key === 'diesel_used')!.addedAt).toBeDefined();
    // the people using the app (nobody has published) cannot see the table at all yet
    expect((await get(clientCookie, `/apps/${created.id}`)).status).toBe(404);
  });

  it('writes a chart “by contractor” grouped by the entering organisation, and the stored screen parses', async () => {
    const created = (await (
      await post(builderACookie, `/projects/${projectId}/apps`, { name: `t489 by contractor ${stamp}`, organisationIds: [clientOrg], participantIds: [] })
    ).json()) as AppRecord;
    const first = await say(created.id, 'Build me a monthly returns app.');
    const dashboard = first.app.app.definition!.interfaces.find((screen) => screen.label === 'Client dashboard')!;
    const res = await say(created.id, 'Please add a chart by contractor to the dashboard.');
    expect(res.turns[1]!.acts.map((act) => act.kind)).toEqual(['writeScreen']);
    const after = res.app.app.definition!.interfaces.find((screen) => screen.id === dashboard.id)!;
    const parsed = parseAppScreen(after.source, ['month', 'energy_kwh', 'waste_tonnes', 'water_m3']);
    expect(parsed).not.toBeNull();
    const chart = parsed!.blocks.find((block) => block.kind === 'barChart' && block.groupBy === 'organisation');
    expect(chart).toMatchObject({ groupBy: 'organisation', valueColumn: 'energy_kwh' });
    expect(chart).not.toHaveProperty('categoryColumn');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Ruling 3 — a rejected return reaches its contractor's “waiting on you”
// ════════════════════════════════════════════════════════════════════════════

describe('a rejected return reaches its contractor’s work queue (ruling 3)', () => {
  it('names the month, carries the client’s reason, lands one click from the form, and leaves once corrected', async () => {
    const { app: built, table } = await returnsApp(`t489 queue ${stamp}`);
    const entered = await enter(builderACookie, table.id, { month: 'October 2026', energy: 4600 });
    // nothing waiting while the return is merely submitted
    expect((await queueOf(builderACookie)).filter((item) => item.kind === 'correct_app_row' && item.href.includes(entered.id))).toEqual([]);

    expect(
      (await post(clientCookie, `/app-rows/${entered.id}/decision`, { decision: 'reject', reason: 'Looks like a decimal slip.' })).status,
    ).toBe(200);

    const mine = (await queueOf(builderACookie)).filter((item) => item.kind === 'correct_app_row' && item.href.includes(entered.id));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      label: 'Your October 2026 return was rejected — correct it',
      detail: 'Looks like a decimal slip.',
      href: `apps/${built.id}?table=${table.id}&correct=${entered.id}`,
    });
    // a colleague in the same firm may correct it too, so is told too
    expect((await queueOf(colleagueACookie)).filter((item) => item.href.includes(entered.id))).toHaveLength(1);

    // 🔒 the client who decided is not told it is waiting on them; and the OTHER
    // contractor, who may not read or correct this return, learns nothing of it
    expect((await queueOf(clientCookie)).filter((item) => item.kind === 'correct_app_row' && item.href.includes(entered.id))).toEqual([]);
    const otherFirm = JSON.stringify(await queueOf(builderBCookie));
    expect(otherFirm).not.toContain(entered.id);
    expect(otherFirm).not.toContain('decimal slip');

    // the item is the opened table's own Correct button, one click away: the row
    // it points at is the one the server says may be corrected
    expect((await rowsOf(builderACookie, table.id)).items.find((row) => row.id === entered.id)!.mayCorrect).toBe(true);

    // corrected (even as a draft) → gone from the queue
    const correction = await post(builderACookie, `/app-rows/${entered.id}/correction`, {
      values: { month: 'October 2026', energy: 460 },
      submit: false,
    });
    expect(correction.status).toBe(201);
    expect((await queueOf(builderACookie)).filter((item) => item.href.includes(entered.id))).toEqual([]);
  });

  it('is gone too when the return is withdrawn, and never lists a return that was accepted', async () => {
    const { table } = await returnsApp(`t489 queue gone ${stamp}`);
    const rejected = await enter(builderACookie, table.id, { month: 'November 2026', energy: 1 });
    const accepted = await enter(builderACookie, table.id, { month: 'December 2026', energy: 2 });
    await post(clientCookie, `/app-rows/${rejected.id}/decision`, { decision: 'reject', reason: 'Wrong site.' });
    await post(clientCookie, `/app-rows/${accepted.id}/decision`, { decision: 'accept' });
    const items = await queueOf(builderACookie);
    expect(items.filter((item) => item.href.includes(rejected.id))).toHaveLength(1);
    expect(items.filter((item) => item.href.includes(accepted.id))).toEqual([]);
    expect((await post(builderACookie, `/app-rows/${rejected.id}/retirement`)).status).toBe(200);
    expect((await queueOf(builderACookie)).filter((item) => item.href.includes(rejected.id))).toEqual([]);
  });

  it('says it in words when the table has no month: it names the table instead', () => {
    const columns = [{ key: 'site', label: 'Site', type: 'text' as const, required: false }];
    expect(rejectedRowSentence('Site diary', columns, { site: 'North gate' })).toBe(
      'A row you entered in “Site diary” was rejected — correct it',
    );
    const dated = [{ key: 'on', label: 'On', type: 'date' as const, required: false }];
    expect(rejectedRowSentence('Site diary', dated, { on: '2026-10-14' })).toBe('Your October 2026 return was rejected — correct it');
  });

  it('reads the month with the one shared helper, so the home page and the dashboard button agree', () => {
    const columns = [
      { key: 'site', label: 'Site', type: 'text' as const, required: false },
      { key: 'on', label: 'On', type: 'date' as const, required: false },
    ];
    expect(rowMonth(columns, { site: 'North gate', on: '2026-10-14' })?.label).toBe('October 2026');
    expect(rejectedRowSentence('Site diary', columns, { site: 'North gate', on: '2026-10-14' })).toContain('October 2026');
  });

  it('adds no notification: a rejection writes no notification to anyone in this file', async () => {
    const { table } = await returnsApp(`t489 no notification ${stamp}`);
    // counted for THIS file's own people only, so another suite writing a
    // notification at the same moment cannot fail it
    const mine = (
      await db
        .select({ id: s.participants.id })
        .from(s.participants)
        .innerJoin(s.users, eq(s.users.id, s.participants.userId))
        .where(inArray(s.users.organisationId, [clientOrg, orgA, orgB]))
    ).map((participant) => participant.id);
    const count = async () =>
      (await db.select().from(s.notifications).where(inArray(s.notifications.recipientParticipantId, mine))).length;
    const before = await count();
    const entered = await enter(builderACookie, table.id, { month: 'January 2027', energy: 3 });
    await post(clientCookie, `/app-rows/${entered.id}/decision`, { decision: 'reject', reason: 'No.' });
    expect(await count()).toBe(before);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Ruling 4 — rejected and replaced rows never count
// ════════════════════════════════════════════════════════════════════════════

describe('the written analysis leaves out rejected and replaced rows and says what is not yet accepted (ruling 4)', () => {
  const runAs = async (cookie: string, appId: string) =>
    ((await (await post(cookie, `/apps/${appId}/runs`, { trigger: 'manual' })).json()) as { run: AppRunRecord }).run;

  it('counts the accepted and the still-waiting, drops the rejected, and carries the not-yet-accepted count', async () => {
    const { app: built, table } = await returnsApp(`t489 counting ${stamp}`);
    const accepted = await enter(builderACookie, table.id, { month: 'October 2026', energy: 100 });
    const rejected = await enter(builderBCookie, table.id, { month: 'October 2026', energy: 999 });
    await enter(builderACookie, table.id, { month: 'November 2026', energy: 50 }); // submitted, awaiting
    await enter(builderBCookie, table.id, { month: 'November 2026', energy: 25 }); // submitted, awaiting
    await post(clientCookie, `/app-rows/${accepted.id}/decision`, { decision: 'accept' });
    await post(clientCookie, `/app-rows/${rejected.id}/decision`, { decision: 'reject', reason: 'Not credible.' });

    const run = await runAs(clientCookie, built.id);
    // three rows count: one accepted, two waiting; the rejected one does not
    expect(run.rowsCovered).toBe(3);
    expect(lastFigures).toContain('3 counted row(s) readable');
    expect(lastFigures).toContain('Includes 2 not yet accepted');
    // the rejected figure is in no total, month or organisation line
    expect(lastFigures).not.toContain('999');
    expect(lastFigures).toContain('total 175');
    // and the model is asked to say it, in plain words
    expect(lastInstruction).toContain('not yet accepted');
    expect(lastInstruction).toContain('includes 3 not yet accepted');
  });

  it('says nothing about “not yet accepted” when every counted row is accepted', async () => {
    const { app: built, table } = await returnsApp(`t489 all accepted ${stamp}`);
    const row = await enter(builderACookie, table.id, { month: 'October 2026', energy: 10 });
    await post(clientCookie, `/app-rows/${row.id}/decision`, { decision: 'accept' });
    await runAs(clientCookie, built.id);
    expect(lastFigures).not.toContain('not yet accepted');
  });

  it('a contractor’s own run counts its own waiting return and says so', async () => {
    const { app: built, table } = await returnsApp(`t489 own run ${stamp}`);
    await enter(builderACookie, table.id, { month: 'October 2026', energy: 10 });
    await enter(builderACookie, table.id, { month: 'November 2026', energy: 20 }, false); // a draft
    const run = await runAs(builderACookie, built.id);
    expect(run.rowsCovered).toBe(2);
    expect(lastFigures).toContain('Includes 2 not yet accepted');
  });
});

describe('the analysis says rejected rows are not counted only where there is an acceptance step to reject at', () => {
  const columns = [{ key: 'energy', label: 'Energy', type: 'number' as const, required: false }];
  it('names the rule for a table with an acceptance step, and stays silent for one without', () => {
    const text = (hasAcceptance: boolean) => figuresAsText([figuresFor({ name: 'T', columns, hasAcceptance, rows: [] })]);
    expect(text(true)).toContain('Rows the client rejected');
    expect(text(false)).not.toContain('rejected');
  });
});
