// T-448 acceptance — **the publish gate** (ADR-0056's third addendum, ruling 1).
//
// *In plain terms: the platform refuses to open an app to its people until the
// builder has answered, for every table, "does this hold contractual data?" and,
// for every screen, "who may open it?" — however the app was built.*
//
// The done-when, clause by clause, each driven over HTTP as a real party:
//
//   1. a publish with an unanswered TABLE question is refused 409, naming it —
//      driven as the builder through the ordinary acts;
//   2. the same for an unanswered SCREEN question, with a hand-built definition
//      PATCHed straight at the API, which is the route around every surface;
//   3. answering through the ordinary acts clears it;
//   4. an app with no tables and no screens still publishes (nothing was asked).
//
// The fixture is apps.test.ts's shape: three firms on one project.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AppRecord,
  AppTableRecord,
  GetAppResponse,
  PublishRefusedResponse,
} from '@infora/contracts';
import { EMPTY_APP_DEFINITION, serialiseAppScreen } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t448';

let projectId: string;
let ownerOrg: string;
let builderOrg: string;
let peerOrg: string;
let ownerCookie: string;
let builderCookie: string;
let peerCookie: string;

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
const send = (method: string, cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
const post = (cookie: string, path: string, body?: unknown) => send('POST', cookie, path, body);
const patch = (cookie: string, path: string, body?: unknown) => send('PATCH', cookie, path, body);

beforeAll(async () => {
  const orgs = await db
    .insert(s.organisations)
    .values([
      { name: `t448 client ${stamp}` },
      { name: `t448 builder ${stamp}` },
      { name: `t448 peer ${stamp}` },
    ])
    .returning();
  [ownerOrg, builderOrg, peerOrg] = orgs.map((o) => o.id) as [string, string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t448 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: builderOrg, projectId, role: 'member' },
    { organisationId: peerOrg, projectId, role: 'member' },
  ]);
  ownerCookie = await session(await makeUser('t448-rhoda', ownerOrg, true));
  builderCookie = await session(await makeUser('t448-bella', builderOrg, true));
  peerCookie = await session(await makeUser('t448-pia', peerOrg, true));
});

afterAll(async () => {
  await pool.end();
});

async function newApp(name: string): Promise<AppRecord> {
  const res = await post(builderCookie, `/projects/${projectId}/apps`, {
    name,
    organisationIds: [ownerOrg, peerOrg],
    participantIds: [],
  });
  expect(res.status).toBe(201);
  return (await res.json()) as AppRecord;
}

const COLUMNS = [
  { key: 'month', label: 'Month', type: 'text', required: true },
  { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
];

/** Declare a table WITHOUT saying whether it holds contractual data — the
 * body's default is false, and a default is not an answer. */
async function declareUnanswered(appId: string, name = 'Monthly returns'): Promise<AppTableRecord> {
  const res = await post(builderCookie, `/apps/${appId}/tables`, { name, columns: COLUMNS, kind: 'data' });
  expect(res.status).toBe(201);
  return (await res.json()) as AppTableRecord;
}

async function publishedDefinitionOf(appId: string) {
  const [row] = await db
    .select({ published: s.apps.publishedDefinition, version: s.apps.publishedVersion })
    .from(s.apps)
    .where(eq(s.apps.id, appId));
  return row!;
}

describe('the publish gate refuses while a required question stands', () => {
  it('publishes an app with no tables and no screens — nothing was asked', async () => {
    const built = await newApp(`t448 empty ${stamp}`);
    const res = await post(builderCookie, `/apps/${built.id}/publish`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as AppRecord).state).toBe('open');
  });

  it('refuses a table whose contractual-data question was never answered, naming it in words', async () => {
    const built = await newApp(`t448 table ${stamp}`);
    await declareUnanswered(built.id);
    const res = await post(builderCookie, `/apps/${built.id}/publish`);
    expect(res.status).toBe(409);
    const refused = (await res.json()) as PublishRefusedResponse;
    expect(refused.error).toBe('conflict');
    expect(refused.detail).toBe(
      'This app cannot be opened yet: one question still needs an answer — whether “Monthly returns” holds contractual data.',
    );
    expect(refused.questions.map((q) => q.kind)).toEqual(['contractual-data']);
    // and nothing was published
    expect((await publishedDefinitionOf(built.id)).published).toBeNull();
  });

  it('is cleared by answering through the ordinary act — setting the acceptance choice', async () => {
    const built = await newApp(`t448 cleared ${stamp}`);
    const table = await declareUnanswered(built.id);
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(409);
    // "no, it is working data" — a real answer, given in the act that sets it
    expect((await patch(builderCookie, `/app-tables/${table.id}`, { hasAcceptance: false })).status).toBe(200);
    const res = await post(builderCookie, `/apps/${built.id}/publish`);
    expect(res.status).toBe(200);
  });

  it('counts an explicit choice at declaration as the answer, and an insight table is never asked', async () => {
    const built = await newApp(`t448 explicit ${stamp}`);
    expect(
      (
        await post(builderCookie, `/apps/${built.id}/tables`, {
          name: 'Monthly returns',
          columns: COLUMNS,
          kind: 'data',
          hasAcceptance: false,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(builderCookie, `/apps/${built.id}/tables`, {
          name: 'Monthly insight',
          columns: COLUMNS,
          kind: 'insight',
        })
      ).status,
    ).toBe(201);
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(200);
  });

  it('refuses a hand-built definition PATCHed straight at the API, and clears when the answer is recorded', async () => {
    const built = await newApp(`t448 patched ${stamp}`);
    const table = (await (
      await post(builderCookie, `/apps/${built.id}/tables`, {
        name: 'Monthly returns',
        columns: COLUMNS,
        kind: 'data',
        hasAcceptance: true,
      })
    ).json()) as AppTableRecord;
    const screen = serialiseAppScreen({
      version: 1,
      blocks: [{ kind: 'rowTable', columnKeys: ['month'], showOrganisation: true, showState: true }],
    });
    // the whole definition, written by hand: two screens, neither question about
    // who may open them answered. The table's answer, recorded when it was
    // declared, SURVIVES this save — a stale list cannot un-answer a question
    // (review 2026-10-18) — so two questions stay open, not three
    const handBuilt = {
      ...EMPTY_APP_DEFINITION,
      interfaces: [
        { id: 'submit', label: 'Submit a return', appTableId: table.id, openToOrganisationIds: [], source: screen },
        {
          id: 'dashboard',
          label: 'Client dashboard',
          appTableId: table.id,
          openToOrganisationIds: [ownerOrg],
          source: screen,
        },
      ],
    };
    expect((await patch(builderCookie, `/apps/${built.id}/definition`, { definition: handBuilt })).status).toBe(200);
    const refused = await post(builderCookie, `/apps/${built.id}/publish`);
    expect(refused.status).toBe(409);
    const body = (await refused.json()) as PublishRefusedResponse;
    expect(body.detail).toBe(
      'This app cannot be opened yet: 2 questions still need an answer — who may open “Submit a return”; and who may open “Client dashboard”.',
    );
    // 🔒 a narrowed screen is NOT an answered one: `openToOrganisationIds` says
    // what was chosen, `answeredQuestions` says that somebody chose it
    expect(body.questions.map((q) => q.subjectName)).toEqual(['Submit a return', 'Client dashboard']);

    // answer one of the two — still refused, now naming only the one left
    await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        ...handBuilt,
        answeredQuestions: ['who-may-open:submit'],
      },
    });
    const still = (await (await post(builderCookie, `/apps/${built.id}/publish`)).json()) as PublishRefusedResponse;
    expect(still.detail).toBe(
      'This app cannot be opened yet: one question still needs an answer — who may open “Client dashboard”.',
    );

    await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        ...handBuilt,
        answeredQuestions: [`contractual-data:${table.id}`, 'who-may-open:submit', 'who-may-open:dashboard'],
      },
    });
    const opened = await post(builderCookie, `/apps/${built.id}/publish`);
    expect(opened.status).toBe(200);
    expect((await publishedDefinitionOf(built.id)).published).not.toBeNull();
  });

  it('refuses a REPUBLISH too, when a new screen arrives unanswered after the first opening', async () => {
    const built = await newApp(`t448 republish ${stamp}`);
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(200);
    const before = await publishedDefinitionOf(built.id);
    await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        ...EMPTY_APP_DEFINITION,
        interfaces: [{ id: 'late', label: 'A late screen', appTableId: null, openToOrganisationIds: [], source: null }],
      },
    });
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(409);
    // the people the app is open to keep the copy they had
    expect((await publishedDefinitionOf(built.id)).version).toBe(before.version);
  });

  it('does not ask about a retired table', async () => {
    const built = await newApp(`t448 retired ${stamp}`);
    const table = await declareUnanswered(built.id);
    await db.update(s.appTables).set({ retiredAt: new Date() }).where(eq(s.appTables.id, table.id));
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(200);
  });
});

describe('the gate’s state is shown to the builder before the click, in the same words', () => {
  it('rides the app record for a builder, and is null for everybody else', async () => {
    const built = await newApp(`t448 shown ${stamp}`);
    await declareUnanswered(built.id);
    const asBuilder = (await (await get(builderCookie, `/apps/${built.id}`)).json()) as GetAppResponse;
    expect(asBuilder.publishGate?.open).toBe(false);
    const refused = (await (await post(builderCookie, `/apps/${built.id}/publish`)).json()) as PublishRefusedResponse;
    // one computation: the words before the click are the words of the refusal
    expect(asBuilder.publishGate?.words).toBe(refused.detail);

    // open it (answering first), then read it as the client and as a peer
    const table = asBuilder.tables[0]!;
    await patch(builderCookie, `/app-tables/${table.id}`, { hasAcceptance: true });
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(200);
    for (const cookie of [ownerCookie, peerCookie]) {
      const body = (await (await get(cookie, `/apps/${built.id}`)).json()) as GetAppResponse;
      expect(body.publishGate).toBeNull();
    }
  });

  it('is not the client’s or a peer’s act to force: their publish is the same 404 as before', async () => {
    const built = await newApp(`t448 others ${stamp}`);
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(200);
    for (const cookie of [ownerCookie, peerCookie]) {
      expect((await post(cookie, `/apps/${built.id}/publish`)).status).toBe(404);
    }
  });
});
