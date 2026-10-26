// T-449 acceptance — **the agent-led build conversation** (ADR-0056's third
// addendum, rulings 2, 3 and 5).
//
// *In plain terms: a builder tells the agent what app they want; it builds the
// working copy and asks the two questions it may never answer for them; the
// conversation is kept, only the app's builders can read it, and nothing the
// agent can do opens the app to anyone, shares a table, hands the app over or
// closes it.*
//
// The done-when, clause by clause:
//   - "build me a monthly sustainability returns app for three contractors"
//     ends, over one stored conversation with the agent's questions in it, in a
//     working copy with a declared acceptance table, a contractor screen and a
//     client screen with answered who-may-open, a schedule and an analysis
//     prompt — `describe('the returns app, built by conversation')`;
//   - the same conversation resumed in a fresh session continues with its
//     memory — `describe('the conversation is stored')`;
//   - a test proves the agent's tool-calls cannot grant scope, share, publish
//     or close — `describe('the agent’s tool set')`, statically AND driven by a
//     hostile model over HTTP.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import type {
  AppRecord,
  AppTableRecord,
  BuildConversationResponse,
  GetAppResponse,
  PublishRefusedResponse,
  SayToBuilderResponse,
} from '@infora/contracts';
import { BUILDER_AGENT_ACT_KINDS, builderAgentActSchema } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { buildApp } from './app';
import { BUILD_TURN_CEILING } from './apps';
import { perform, readSnapshot } from './app-builder-agent';
import type { BuilderTurnContext, PerformState } from './app-builder-agent';
import { fakeBuilderAgent } from './fake-builder-agent';
import { FAKE_EMBED_DIMENSIONS, FAKE_EMBED_MODEL, fakeVector } from './test-router';

const { db, pool } = createDb();

// ── A router the suite can script, turn by turn ─────────────────────────────
//
// By default it is the GOOD scripted agent (fake-builder-agent.ts). A test may
// replace the next answer with its own — a hostile one, or one that asks and
// answers in one breath — and may run a hook while the "model" is thinking, to
// stand in for a person editing the panel by hand at that moment.
let scripted: ((system: string, prompt: string) => string) | null = null;
let whileThinking: (() => Promise<void>) | null = null;
const prompts: string[] = [];

const chat: ChatAdapter = {
  modelId: 'fake-chat',
  attributes: SELF_HOSTED_UK,
  chat: async (req) => {
    const prompt = req.messages.map((m) => m.content).join('\n');
    prompts.push(prompt);
    if (whileThinking !== null) {
      const hook = whileThinking;
      whileThinking = null;
      await hook();
    }
    const answer = scripted ?? ((system: string, p: string) => fakeBuilderAgent(system, p) ?? '');
    scripted = null;
    return {
      text: answer(req.system ?? '', prompt),
      model: { id: 'fake-chat', version: 'fake-chat-1' },
      usage: { tokensPrompt: 500, tokensCompletion: 60 },
    };
  },
};
const embeddings: EmbeddingAdapter = {
  modelId: FAKE_EMBED_MODEL,
  dimensions: FAKE_EMBED_DIMENSIONS,
  attributes: SELF_HOSTED_UK,
  embed: (texts) =>
    Promise.resolve({
      embeddings: texts.map(fakeVector),
      model: { id: FAKE_EMBED_MODEL, version: 'fake-1' },
      usage: { tokens: 0 },
    }),
};
const app = buildApp({ db, sessionSecret: 'test-secret', router: new Router(chat, embeddings) });

const stamp = Date.now();
const password = 'pw-t449';

let projectId: string;
let ownerOrg: string;
let builderOrg: string;
let peerOrg: string;
let ownerCookie: string;
let builderCookie: string;
let builderEmail: string;
let builderParticipantId: string;
let colleagueCookie: string; // same firm as the builder, NOT allowed to build
let peerCookie: string;

async function makeUser(name: string, organisationId: string, mayBuildApps: boolean) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: 'admin', mayBuildApps })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId })
    .returning();
  return { email, participantId: participant!.id };
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
      { name: `t449 Client ${stamp}` },
      { name: `t449 Builder ${stamp}` },
      { name: `t449 Peer ${stamp}` },
    ])
    .returning();
  [ownerOrg, builderOrg, peerOrg] = orgs.map((o) => o.id) as [string, string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t449 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: builderOrg, projectId, role: 'member' },
    { organisationId: peerOrg, projectId, role: 'member' },
  ]);
  ownerCookie = await session((await makeUser('t449-rhoda', ownerOrg, true)).email);
  const builder = await makeUser('t449-bella', builderOrg, true);
  builderEmail = builder.email;
  builderParticipantId = builder.participantId;
  builderCookie = await session(builderEmail);
  colleagueCookie = await session((await makeUser('t449-colin', builderOrg, false)).email);
  peerCookie = await session((await makeUser('t449-pia', peerOrg, true)).email);
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

async function say(cookie: string, appId: string, text: string): Promise<SayToBuilderResponse> {
  const res = await post(cookie, `/apps/${appId}/builder/conversation`, { say: text });
  expect(res.status).toBe(200);
  return (await res.json()) as SayToBuilderResponse;
}

async function appState(appId: string) {
  const [row] = await db.select().from(s.apps).where(eq(s.apps.id, appId));
  const grants = await db.select().from(s.appScopeGrants).where(eq(s.appScopeGrants.appId, appId));
  const tables = await db.select().from(s.appTables).where(eq(s.appTables.appId, appId));
  return { row: row!, grants, tables };
}

// ── The returns app, built by conversation (the done-when's first clause) ───

describe('the returns app, built by conversation', () => {
  it('drafts the working copy, asks both wall questions in its own turn, and opens once the person answers', async () => {
    const built = await newApp(`t449 returns ${stamp}`);
    const first = await say(
      builderCookie,
      built.id,
      'Build me a monthly sustainability returns app for three contractors.',
    );
    const [person, agent] = first.turns;
    expect(person!.role).toBe('person');
    expect(person!.speakerName).toBe('t449-bella');
    expect(agent!.role).toBe('agent');

    // the working copy: an acceptance-candidate table, an insight table, two
    // screens, a monthly schedule and an analysis prompt
    const tables = first.app.tables;
    const returns = tables.find((t) => t.name === 'Monthly returns')!;
    expect(returns.kind).toBe('data');
    // 🔒 NOT defaulted: the agent could not say whether it holds contractual data
    expect(returns.hasAcceptance).toBe(false);
    expect(tables.find((t) => t.kind === 'insight')?.name).toBe('Run insights');
    const definition = first.app.app.definition!;
    expect(definition.interfaces.map((i) => i.label)).toEqual(['Submit a return', 'Client dashboard']);
    expect(definition.interfaces.every((i) => i.source !== null)).toBe(true);
    expect(definition.schedule).toBe('monthly');
    expect(definition.analysisPrompt).toContain('which contractors have returned');
    // the agent acted as the requesting builder, and as nobody else
    expect((await appState(built.id)).row.definitionUpdatedByParticipantId).toBe(builderParticipantId);

    // ── the agent's questions are in its own turn, recorded as asked
    const submit = definition.interfaces.find((i) => i.label === 'Submit a return')!;
    const dashboard = definition.interfaces.find((i) => i.label === 'Client dashboard')!;
    expect(agent!.asked.sort()).toEqual(
      [`contractual-data:${returns.id}`, `who-may-open:${submit.id}`, `who-may-open:${dashboard.id}`].sort(),
    );
    expect(agent!.text).toContain('Does “Monthly returns” hold contractual data');
    expect(agent!.acts.map((a) => a.kind)).toContain('declareTable');
    // and nothing is publishable yet — the gate names all three
    expect(first.app.publishGate?.open).toBe(false);
    expect(first.app.publishGate?.questions).toHaveLength(3);
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(409);

    // ── the person answers; the agent records what they said
    const second = await say(
      builderCookie,
      built.id,
      `Yes — the returns are contractual, the client accepts or rejects each one. Everyone may open Submit a return; only t449 Client ${stamp} may open Client dashboard.`,
    );
    const recorded = second.turns[1]!;
    expect(recorded.acts.map((a) => a.kind).sort()).toEqual(
      ['answerContractualData', 'answerWhoMayOpen', 'answerWhoMayOpen'].sort(),
    );
    expect(second.app.tables.find((t) => t.id === returns.id)!.hasAcceptance).toBe(true);
    const after = second.app.app.definition!;
    expect(after.interfaces.find((i) => i.id === submit.id)!.openToOrganisationIds).toEqual([]);
    expect(after.interfaces.find((i) => i.id === dashboard.id)!.openToOrganisationIds).toEqual([ownerOrg]);
    expect(second.app.publishGate?.open).toBe(true);

    // ── the agent did not publish: the person does
    expect((await appState(built.id)).row.publishedDefinition).toBeNull();
    const opened = await post(builderCookie, `/apps/${built.id}/publish`);
    expect(opened.status).toBe(200);
    // the client is offered its dashboard; the peer firm is not
    const labels = async (cookie: string) =>
      ((await (await get(cookie, `/apps/${built.id}`)).json()) as GetAppResponse).app.published!.interfaces.map(
        (i) => i.label,
      );
    expect(await labels(ownerCookie)).toEqual(['Submit a return', 'Client dashboard']);
    expect(await labels(peerCookie)).toEqual(['Submit a return']);
  });
});

// ── The two wall questions: asked, never defaulted ─────────────────────────

describe('the wall questions are asked by the agent and answered by the person', () => {
  it('refuses an answer the agent gives in the same breath as the question', async () => {
    const built = await newApp(`t449 same breath ${stamp}`);
    scripted = () =>
      JSON.stringify({
        say: 'I made a returns table. It obviously holds contractual data, so I have set that.',
        acts: [
          { kind: 'declareTable', name: 'Returns', tableKind: 'data', columns: [{ key: 'month', label: 'Month', type: 'text' }] },
          { kind: 'answerContractualData', table: 'Returns', holdsContractualData: true },
        ],
        asks: [],
        proposals: [],
      });
    const res = await say(builderCookie, built.id, 'A returns table please.');
    const table = res.app.tables.find((t) => t.name === 'Returns')!;
    expect(table.hasAcceptance).toBe(false);
    expect(res.app.publishGate?.open).toBe(false);
    const agent = res.turns[1]!;
    expect(agent.acts.map((a) => a.kind)).toEqual(['declareTable']);
    expect(agent.text).toContain('that is yours to answer, so I am asking you now');
    expect(agent.asked).toEqual([`contractual-data:${table.id}`]);
  });

  it('asks in code when the model forgets to ask at all', async () => {
    const built = await newApp(`t449 forgets ${stamp}`);
    scripted = () =>
      JSON.stringify({
        say: 'Done — I added a register.',
        acts: [{ kind: 'declareTable', name: 'Register', tableKind: 'data', columns: [{ key: 'site', label: 'Site', type: 'text' }] }],
        asks: [],
        proposals: [],
      });
    const res = await say(builderCookie, built.id, 'A site register.');
    const table = res.app.tables.find((t) => t.name === 'Register')!;
    const agent = res.turns[1]!;
    expect(agent.asked).toEqual([`contractual-data:${table.id}`]);
    expect(agent.text).toContain('Before this app can be opened, I need you to answer:');
    expect(agent.text).toContain('Does “Register” hold contractual data?');
  });

  it('cannot narrow a screen to an organisation the app is not open to', async () => {
    const built = await newApp(`t449 narrow ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app.');
    const screen = ((await (await get(builderCookie, `/apps/${built.id}`)).json()) as GetAppResponse).app
      .definition!.interfaces[0]!;
    const stranger = (await db.insert(s.organisations).values({ name: `t449 stranger ${stamp}` }).returning())[0]!;
    scripted = () =>
      JSON.stringify({
        say: 'Recorded.',
        acts: [{ kind: 'answerWhoMayOpen', screen: screen.id, organisationIds: [stranger.id] }],
        asks: [],
        proposals: [],
      });
    const res = await say(builderCookie, built.id, 'Only the stranger may open it.');
    expect(res.turns[1]!.acts).toEqual([]);
    expect(res.turns[1]!.text).toContain('only be narrowed to organisations the app is already open to');
    expect(res.app.app.definition!.answeredQuestions).not.toContain(`who-may-open:${screen.id}`);
  });
});

// ── The agent's tool set cannot reach the acts that widen access ────────────

describe('the agent’s tool set', () => {
  it('is a closed list, pinned, with no act that grants, shares, publishes, reassigns or closes', () => {
    expect([...BUILDER_AGENT_ACT_KINDS]).toEqual([
      'describeApp',
      'declareTable',
      'addColumn',
      'writeScreen',
      'removeScreen',
      'setSchedule',
      'setAnalysisPrompt',
      'addConnection',
      'removeConnection',
      'answerContractualData',
      'answerWhoMayOpen',
    ]);
    // T-489 — and no act that removes a column or changes its type: rows have
    // already been entered under it (ADR-0056, fifth addendum, ruling 1)
    expect([...BUILDER_AGENT_ACT_KINDS].join(' ')).not.toMatch(/remove[A-Za-z]*Column|retype|dropColumn/i);
    // the schema the model's answer is parsed with has exactly those kinds
    const schemaKinds = builderAgentActSchema.options.map((option) => option.shape.kind.value);
    expect(schemaKinds).toEqual([...BUILDER_AGENT_ACT_KINDS]);
    for (const kind of schemaKinds) {
      expect(kind.toLowerCase()).not.toMatch(/publish|scope|grant|share|reassign|owner|close/);
    }
  });

  it('has no import or reference that reaches a widening act — read from the source itself', () => {
    const forbidden = [
      'appScopeGrants',
      'appTableShares',
      'publishedDefinition',
      'publishedVersion',
      'publishedByParticipantId',
      'closedAt',
      'ownerParticipantId',
      "from './apps'",
      '/publish`',
      '/scope`',
      '/shares`',
      '/reassignment`',
      '/closure`',
      'canShareAppTable',
      'canReassignApp',
      // T-451 — the file source is a person's panel act, never the agent's
      // (ADR-0059 decision 4): no import reaches its table or its acts
      'appTableSources',
      'app-table-source',
      'attachSourceAct',
    ];
    for (const file of ['./app-builder-agent.ts', './app-builder-acts.ts']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      for (const word of forbidden) expect(source, `${file} must not mention ${word}`).not.toContain(word);
    }
  });

  it('performs NOTHING when a hostile model asks to publish, grant scope, share, reassign or close', async () => {
    const built = await newApp(`t449 hostile ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app.');
    const before = await appState(built.id);
    const returns = before.tables.find((t) => t.name === 'Monthly returns')!;
    scripted = () =>
      JSON.stringify({
        say: 'I have opened the app to everyone and shared the returns with the peer firm.',
        acts: [
          // one ordinary act, to prove the WHOLE answer is refused, not filtered
          { kind: 'setSchedule', schedule: 'daily' },
          { kind: 'publish' },
          { kind: 'grantScope', organisationId: peerOrg },
          { kind: 'shareTable', table: returns.id, organisationId: peerOrg },
          { kind: 'reassign', participantId: builderParticipantId },
          { kind: 'close' },
        ],
        asks: [],
        proposals: [],
      });
    const res = await say(builderCookie, built.id, 'Open it to everyone and share the returns.');
    const after = await appState(built.id);
    expect(after.row.publishedDefinition).toBeNull();
    expect(after.row.closedAt).toBeNull();
    expect(after.row.ownerParticipantId).toBe(before.row.ownerParticipantId);
    expect(after.grants).toHaveLength(before.grants.length);
    const shares = await db.select().from(s.appTableShares).where(eq(s.appTableShares.appTableId, returns.id));
    expect(shares).toHaveLength(0);
    // and the ordinary act in the same answer did not happen either
    expect((after.row.definition as { schedule: string }).schedule).toBe('monthly');
    expect(res.turns[1]!.acts).toEqual([]);
    expect(res.turns[1]!.text).toContain('so I changed nothing');
  });

  it('refuses a table declared WITH an acceptance answer — the field is not on its act', async () => {
    const built = await newApp(`t449 sneaky field ${stamp}`);
    scripted = () =>
      JSON.stringify({
        say: 'Declared, with an acceptance step.',
        acts: [
          {
            kind: 'declareTable',
            name: 'Returns',
            tableKind: 'data',
            hasAcceptance: true,
            columns: [{ key: 'month', label: 'Month', type: 'text' }],
          },
        ],
        asks: [],
        proposals: [],
      });
    const res = await say(builderCookie, built.id, 'A returns table with acceptance.');
    expect(res.app.tables).toHaveLength(0);
    expect(res.turns[1]!.text).toContain('so I changed nothing');
  });

  it('proposes a removal first and performs it only after the person says yes', async () => {
    const built = await newApp(`t449 removal ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app.');
    const proposed = await say(builderCookie, built.id, 'Remove the client dashboard.');
    expect(proposed.app.app.definition!.interfaces.map((i) => i.label)).toContain('Client dashboard');
    expect(proposed.turns[1]!.proposals.map((p) => p.kind)).toEqual(['removeScreen']);
    const dashboardId = proposed.app.app.definition!.interfaces.find((i) => i.label === 'Client dashboard')!.id;
    const done = await say(builderCookie, built.id, 'Yes, remove it.');
    expect(done.app.app.definition!.interfaces.map((i) => i.label)).toEqual(['Submit a return']);
    expect(done.app.app.definition!.answeredQuestions).not.toContain(`who-may-open:${dashboardId}`);
    expect(done.turns[1]!.acts.map((a) => a.kind)).toEqual(['removeScreen']);
  });

  it('turns a removal the agent attempts cold into a proposal, and removes nothing', async () => {
    const built = await newApp(`t449 cold removal ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app.');
    const dashboard = ((await (await get(builderCookie, `/apps/${built.id}`)).json()) as GetAppResponse).app
      .definition!.interfaces.find((i) => i.label === 'Client dashboard')!;
    scripted = () =>
      JSON.stringify({
        say: 'I removed the dashboard.',
        acts: [{ kind: 'removeScreen', screen: dashboard.id }],
        asks: [],
        proposals: [],
      });
    const res = await say(builderCookie, built.id, 'Tidy it up.');
    expect(res.app.app.definition!.interfaces.map((i) => i.id)).toContain(dashboard.id);
    expect(res.turns[1]!.acts).toEqual([]);
    expect(res.turns[1]!.proposals).toEqual([
      { kind: 'removeScreen', subject: dashboard.id, summary: 'Remove the screen “Client dashboard”.' },
    ]);
    expect(res.turns[1]!.text).toContain('I have not removed “Client dashboard” — say yes and I will.');
  });

  it('lets its own acts in one turn build on each other — answering for a screen, then redrawing it', async () => {
    const built = await newApp(`t449 chained ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app.');
    const before = ((await (await get(builderCookie, `/apps/${built.id}`)).json()) as GetAppResponse).app
      .definition!;
    const dashboard = before.interfaces.find((i) => i.label === 'Client dashboard')!;
    scripted = () =>
      JSON.stringify({
        say: 'Recorded, and redrawn.',
        acts: [
          { kind: 'answerWhoMayOpen', screen: dashboard.id, organisationIds: [ownerOrg] },
          {
            kind: 'writeScreen',
            screen: dashboard.id,
            label: 'Client dashboard',
            table: 'Monthly returns',
            layout: { version: 1, blocks: [{ kind: 'count', label: 'Returns in' }] },
          },
        ],
        asks: [],
        proposals: [],
      });
    const res = await say(builderCookie, built.id, 'Only the client may open the dashboard; make it a count.');
    expect(res.turns[1]!.acts.map((a) => a.kind)).toEqual(['answerWhoMayOpen', 'writeScreen']);
    const after = res.app.app.definition!.interfaces.find((i) => i.id === dashboard.id)!;
    expect(after.openToOrganisationIds).toEqual([ownerOrg]);
    expect(after.source).toContain('Returns in');
  });

  it('never writes over a change a person made by hand while it was answering', async () => {
    const built = await newApp(`t449 clobber ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app.');
    // while the "model" is thinking, the person changes the schedule in the panel
    whileThinking = async () => {
      const current = ((await (await get(builderCookie, `/apps/${built.id}`)).json()) as GetAppResponse).app
        .definition!;
      expect(
        (await patch(builderCookie, `/apps/${built.id}/definition`, { definition: { ...current, schedule: 'weekly' } }))
          .status,
      ).toBe(200);
    };
    scripted = () =>
      JSON.stringify({
        say: 'Set it to daily.',
        acts: [{ kind: 'setSchedule', schedule: 'daily' }],
        asks: [],
        proposals: [],
      });
    const res = await say(builderCookie, built.id, 'Make it daily.');
    expect(res.app.app.definition!.schedule).toBe('weekly');
    expect(res.turns[1]!.text).toContain('You changed the schedule while I was answering, so I kept yours.');
  });
});

// ── The conversation is stored, private to the app's builders, and remembered

describe('the conversation is stored', () => {
  it('is read by the people who may build the app and by nobody else', async () => {
    const built = await newApp(`t449 private ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app.');
    const mine = (await (await get(builderCookie, `/apps/${built.id}/builder/conversation`)).json()) as BuildConversationResponse;
    expect(mine.turns.map((t) => t.role)).toEqual(['person', 'agent']);
    expect(mine.turns[0]!.text).toBe('Build me a monthly returns app.');

    // answer the questions by hand in the panel's own acts, then publish — so
    // the client, the peer and the colleague can open the APP, and still not
    // its conversation
    const current = ((await (await get(builderCookie, `/apps/${built.id}`)).json()) as GetAppResponse);
    const returns = current.tables.find((t) => t.name === 'Monthly returns')!;
    expect((await patch(builderCookie, `/app-tables/${returns.id}`, { hasAcceptance: true })).status).toBe(200);
    const working = ((await (await get(builderCookie, `/apps/${built.id}`)).json()) as GetAppResponse).app.definition!;
    expect(
      (
        await patch(builderCookie, `/apps/${built.id}/definition`, {
          definition: {
            ...working,
            answeredQuestions: [
              ...working.answeredQuestions,
              ...working.interfaces.map((screen) => `who-may-open:${screen.id}`),
            ],
          },
        })
      ).status,
    ).toBe(200);
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(200);
    for (const cookie of [ownerCookie, peerCookie, colleagueCookie]) {
      expect((await get(cookie, `/apps/${built.id}/builder/conversation`)).status).toBe(404);
      expect((await post(cookie, `/apps/${built.id}/builder/conversation`, { say: 'hello' })).status).toBe(404);
    }
    // ...while each of them CAN open the published app itself: the 404 above is
    // the conversation's privacy, not the app's
    for (const cookie of [ownerCookie, peerCookie, colleagueCookie]) {
      expect((await get(cookie, `/apps/${built.id}`)).status).toBe(200);
    }
  });

  it('resumes in a fresh session with its memory: the earlier turns are what the agent is shown', async () => {
    const built = await newApp(`t449 resume ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app for the Wrenfield contractors.');
    // a new login — a different session, the next day
    const tomorrow = await session(builderEmail);
    expect(tomorrow).not.toBe(builderCookie);
    const stored = (await (await get(tomorrow, `/apps/${built.id}/builder/conversation`)).json()) as BuildConversationResponse;
    expect(stored.turns).toHaveLength(2);
    prompts.length = 0;
    await say(tomorrow, built.id, 'Yes, the returns are contractual.');
    // the model was shown yesterday's words and its own reply
    expect(prompts[0]).toContain('Build me a monthly returns app for the Wrenfield contractors.');
    expect(prompts[0]).toContain('I have drafted a monthly returns app');
    const resumed = (await (await get(tomorrow, `/apps/${built.id}/builder/conversation`)).json()) as BuildConversationResponse;
    expect(resumed.turns).toHaveLength(4);
    // and it acted on the question it had asked yesterday
    expect(resumed.turns[3]!.acts.map((a) => a.kind)).toContain('answerContractualData');
  });

  it('is append-only, a person’s turn carries no acts, and it is deleted with the app', async () => {
    const built = await newApp(`t449 store ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app.');
    const [turn] = await db.select().from(s.appBuildTurns).where(eq(s.appBuildTurns.appId, built.id));
    await expect(
      db.update(s.appBuildTurns).set({ text: 'rewritten' }).where(eq(s.appBuildTurns.id, turn!.id)),
    ).rejects.toThrow();
    await expect(
      db.insert(s.appBuildTurns).values({
        appId: built.id,
        role: 'person',
        spokenByParticipantId: builderParticipantId,
        text: 'I did this',
        acts: [{ kind: 'setSchedule', summary: 'claimed' }],
      }),
    ).rejects.toThrow();
    // deleted with the app: the register's deletion path is the cascade.
    // 🔒 No route deletes an app today, and an app with scope grants cannot be
    // deleted at all (T-439's grants refuse DELETE as append-only intervals),
    // so the cascade is proved on an app row written with no grants — the
    // mechanism the day an app deletion path exists, not a claim that one does.
    const [bare] = await db
      .insert(s.apps)
      .values({
        projectId,
        name: `t449 bare ${stamp}`,
        ownerParticipantId: builderParticipantId,
        createdByParticipantId: builderParticipantId,
        definitionUpdatedByParticipantId: builderParticipantId,
        definition: {},
      })
      .returning();
    await db.insert(s.appBuildTurns).values({
      appId: bare!.id,
      role: 'person',
      spokenByParticipantId: builderParticipantId,
      text: 'A conversation about an app that is about to be deleted.',
    });
    await db.delete(s.apps).where(eq(s.apps.id, bare!.id));
    const left = await db.select().from(s.appBuildTurns).where(eq(s.appBuildTurns.appId, bare!.id));
    expect(left).toHaveLength(0);
  });

  it('answers a model that cannot be reached with a stored turn saying nothing changed', async () => {
    const built = await newApp(`t449 unreachable ${stamp}`);
    whileThinking = () => Promise.reject(new Error('provider down'));
    const res = await say(builderCookie, built.id, 'Build me a monthly returns app.');
    expect(res.turns[1]!.text).toContain('I could not be reached just now, so nothing was changed.');
    expect(res.app.tables).toHaveLength(0);
    const live = await db
      .select()
      .from(s.appTables)
      .where(and(eq(s.appTables.appId, built.id), isNull(s.appTables.retiredAt)));
    expect(live).toHaveLength(0);
  });

  it('refuses the publish the agent drafted towards, naming what is still open', async () => {
    const built = await newApp(`t449 gate ${stamp}`);
    await say(builderCookie, built.id, 'Build me a monthly returns app.');
    const refused = (await (await post(builderCookie, `/apps/${built.id}/publish`)).json()) as PublishRefusedResponse;
    expect(refused.detail).toContain('whether “Monthly returns” holds contractual data');
    expect(refused.detail).toContain('who may open “Client dashboard”');
  });
});

// ── The review's guards (2026-10-18) — settled answers, mid-turn edits, the
// boundary's answer keys, and the conversation's ceiling ─────────────────────

describe('the review’s guards (2026-10-18)', () => {
  async function performState(appId: string): Promise<PerformState> {
    return {
      snapshot: await readSnapshot(db, appId),
      ownWrites: new Set<string>(),
      askedBefore: new Set<string>(),
      proposedLastTurn: [],
      receipts: [],
      notes: [],
      proposals: [],
      askedNow: new Set<string>(),
    };
  }
  function ctxFor(appId: string): BuilderTurnContext {
    return {
      appId,
      participantId: builderParticipantId,
      say: '',
      organisations: [
        { id: ownerOrg, name: 'the client', isProjectOwner: true },
        { id: peerOrg, name: 'the peer', isProjectOwner: false },
      ],
    };
  }
  const HEADING_ONLY = { version: 1 as const, blocks: [{ kind: 'heading' as const, text: 'Returns' }] };

  it('🔒 a settled who-may-open answer is not the agent’s to change — re-answering cannot widen', async () => {
    const built = await newApp(`t-review settled screen ${stamp}`);
    const table = (await (
      await post(builderCookie, `/apps/${built.id}/tables`, {
        name: 'Monthly returns',
        columns: [{ key: 'month', label: 'Month', type: 'text', required: true }],
        kind: 'data',
        hasAcceptance: true,
      })
    ).json()) as AppTableRecord;
    // the person answers who-may-open from the panel: the client alone
    const narrowed = await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: {
        connections: [],
        interfaces: [
          { id: 'dash', label: 'Dashboard', appTableId: table.id, openToOrganisationIds: [ownerOrg], source: null },
        ],
        schedule: 'manual',
        analysisPrompt: null,
        answeredQuestions: [`who-may-open:dash`],
      },
    });
    expect(narrowed.status).toBe(200);

    // the agent later tries to re-answer it wide open, even "asked before"
    const state = await performState(built.id);
    (state.askedBefore as Set<string>).add('who-may-open:dash');
    await perform(db, ctxFor(built.id), { kind: 'answerWhoMayOpen', screen: 'dash', organisationIds: [] }, state);
    expect(state.notes.join(' ')).toContain('already answered');
    const { row } = await appState(built.id);
    const definition = row.definition as { interfaces: Array<{ id: string; openToOrganisationIds: string[] }> };
    expect(definition.interfaces.find((s2) => s2.id === 'dash')!.openToOrganisationIds).toEqual([ownerOrg]);
  });

  it('🔒 a settled contractual-data answer is not the agent’s to flip', async () => {
    const built = await newApp(`t-review settled table ${stamp}`);
    const table = (await (
      await post(builderCookie, `/apps/${built.id}/tables`, {
        name: 'Monthly returns',
        columns: [{ key: 'month', label: 'Month', type: 'text', required: true }],
        kind: 'data',
        hasAcceptance: true, // explicit: the person answered at declaration
      })
    ).json()) as AppTableRecord;
    const state = await performState(built.id);
    (state.askedBefore as Set<string>).add(`contractual-data:${table.id}`);
    await perform(
      db,
      ctxFor(built.id),
      { kind: 'answerContractualData', table: table.id, holdsContractualData: false },
      state,
    );
    expect(state.notes.join(' ')).toContain('already answered');
    const { tables } = await appState(built.id);
    expect(tables.find((t) => t.id === table.id)!.hasAcceptance).toBe(true);
  });

  it('🔒 a person’s edit landing BETWEEN two acts of one turn survives the second act', async () => {
    // the T-450 fix re-read the store into the baseline after each act, which
    // absorbed a concurrent hand edit and let the next act overwrite it — the
    // ownWrites ledger replaces it (review 2026-10-18), and this is the test
    // that could not exist before: the edit lands deterministically mid-turn
    const built = await newApp(`t-review mid-turn ${stamp}`);
    await post(builderCookie, `/apps/${built.id}/tables`, {
      name: 'Monthly returns',
      columns: [{ key: 'month', label: 'Month', type: 'text', required: true }],
      kind: 'data',
      hasAcceptance: true,
    });
    const state = await performState(built.id);
    const ctx = ctxFor(built.id);
    // act 1: the agent writes a screen (its own write, recorded in the ledger)
    await perform(
      db,
      ctx,
      { kind: 'writeScreen', label: 'Submit a return', table: 'Monthly returns', layout: HEADING_ONLY },
      state,
    );
    expect(state.receipts).toHaveLength(1);
    // the person changes the schedule while the model is mid-turn
    const { row } = await appState(built.id);
    await db
      .update(s.apps)
      .set({ definition: { ...(row.definition as object), schedule: 'weekly' } })
      .where(eq(s.apps.id, built.id));
    // act 2: the agent sets the schedule — the person's edit must win
    await perform(db, ctx, { kind: 'setSchedule', schedule: 'monthly' }, state);
    expect(state.notes.join(' ')).toContain('You changed the schedule');
    const after = await appState(built.id);
    expect((after.row.definition as { schedule: string }).schedule).toBe('weekly');
    // and the agent still builds on its OWN first act: rewriting its screen works
    await perform(
      db,
      ctx,
      { kind: 'writeScreen', screen: 'Submit a return', label: 'Submit a return', table: 'Monthly returns', layout: HEADING_ONLY },
      state,
    );
    expect(state.receipts).toHaveLength(2);
  });

  it('🔒 the boundary refuses an answer key that names no real question', async () => {
    const built = await newApp(`t-review bogus keys ${stamp}`);
    for (const key of ['contractual-data:no-such-table', 'who-may-open:a-screen-not-yet-made']) {
      const res = await patch(builderCookie, `/apps/${built.id}/definition`, {
        definition: {
          connections: [],
          interfaces: [],
          schedule: 'manual',
          analysisPrompt: null,
          answeredQuestions: [key],
        },
      });
      expect(res.status).toBe(400);
    }
  });

  it('a stale panel save cannot un-answer a question', async () => {
    const built = await newApp(`t-review stale save ${stamp}`);
    const table = (await (
      await post(builderCookie, `/apps/${built.id}/tables`, {
        name: 'Monthly returns',
        columns: [{ key: 'month', label: 'Month', type: 'text', required: true }],
        kind: 'data',
        hasAcceptance: true, // records the contractual answer
      })
    ).json()) as AppTableRecord;
    // a stale whole-definition save with NO answers — read before the answer landed
    const res = await patch(builderCookie, `/apps/${built.id}/definition`, {
      definition: { connections: [], interfaces: [], schedule: 'manual', analysisPrompt: null, answeredQuestions: [] },
    });
    expect(res.status).toBe(200);
    const { row } = await appState(built.id);
    expect((row.definition as { answeredQuestions: string[] }).answeredQuestions).toContain(
      `contractual-data:${table.id}`,
    );
  });

  it('the conversation has a ceiling, worded', async () => {
    const built = await newApp(`t-review ceiling ${stamp}`);
    await db.insert(s.appBuildTurns).values(
      Array.from({ length: BUILD_TURN_CEILING }, () => ({
        appId: built.id,
        role: 'person' as const,
        spokenByParticipantId: builderParticipantId,
        text: 'filler',
      })),
    );
    const res = await post(builderCookie, `/apps/${built.id}/builder/conversation`, { say: 'one more?' });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('ceiling');
  });
});
