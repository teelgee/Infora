// T-487 acceptance — **the app builder works on first contact** (walk defects
// 1, 2 and 3, docs/walks/t446.md).
//
// *In plain terms: three things the acceptance walk found when the building
// agent met a real setup, each now proved against the SCRIPTED stand-in model
// (fake-builder-agent.ts), taught the exact shapes the walk saw:*
//
//   1. a refused model route is told apart from an unreachable model, in the
//      person's words and in the server's log;
//   2. an analysis table sent with no columns — which is what the agent is told
//      to do — is accepted instead of costing the person their whole answer,
//      and an answer that IS refused keeps the reply it was made from, for the
//      app's builders alone;
//   3. words followed by a bare structured answer are read as an answer, and
//      the agent's claim of a change the product refused is never shown.
//
// Fresh organisations, project and apps per run; every row is looked up by the
// ids this file created, never by title (the suite is repeatable on one seed).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AppRecord,
  BuildConversationResponse,
  GetAppResponse,
  SayToBuilderResponse,
} from '@infora/contracts';
import { INSIGHT_TABLE_COLUMNS } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { buildApp } from './app';
import { MAX_RAW_REPLY, parseBuilderAnswer } from './app-builder-agent';
import { addStandInScreen } from './app-test-support';
import { fakeBuilderAgent } from './fake-builder-agent';
import { FAKE_EMBED_DIMENSIONS, FAKE_EMBED_MODEL, fakeVector } from './test-router';

const { db, pool } = createDb();

// ── the scripted model: the GOOD agent by default, or the next answer replaced
let scripted: ((system: string, prompt: string) => string) | null = null;
const chat: ChatAdapter = {
  modelId: 'fake-chat',
  attributes: SELF_HOSTED_UK,
  chat: (req) => {
    const prompt = req.messages.map((m) => m.content).join('\n');
    const answer = scripted ?? ((system: string, p: string) => fakeBuilderAgent(system, p) ?? '');
    scripted = null;
    return Promise.resolve({
      text: answer(req.system ?? '', prompt),
      model: { id: 'fake-chat', version: 'fake-chat-1' },
      usage: { tokensPrompt: 500, tokensCompletion: 60 },
    });
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

// ── a router whose only chat route declares nothing: the tier refuses every call
const undeclared: ChatAdapter = {
  modelId: 'undeclared',
  // no `attributes`: nothing was declared about this route, so no tier admits it
  chat: () => Promise.reject(new Error('a refused route must never be called')),
};
const refusingApp = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: new Router(undeclared, embeddings),
});

const stamp = Date.now();
const password = 'pw-t487';

let projectId: string;
let ownerOrg: string;
let builderOrg: string;
let peerOrg: string;
let ownerCookie: string;
let builderCookie: string;
let colleagueCookie: string; // same firm as the builder, NOT allowed to build
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
const post = (cookie: string, path: string, body?: unknown, which = app) =>
  which.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

beforeAll(async () => {
  const orgs = await db
    .insert(s.organisations)
    .values([
      { name: `t487 Client ${stamp}` },
      { name: `t487 Builder ${stamp}` },
      { name: `t487 Peer ${stamp}` },
    ])
    .returning();
  [ownerOrg, builderOrg, peerOrg] = orgs.map((o) => o.id) as [string, string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t487 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: builderOrg, projectId, role: 'member' },
    { organisationId: peerOrg, projectId, role: 'member' },
  ]);
  ownerCookie = await session(await makeUser('t487-rhoda', ownerOrg, true));
  builderCookie = await session(await makeUser('t487-bella', builderOrg, true));
  colleagueCookie = await session(await makeUser('t487-colin', builderOrg, false));
  peerCookie = await session(await makeUser('t487-pia', peerOrg, true));
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

async function say(appId: string, text: string, which = app): Promise<SayToBuilderResponse> {
  const res = await post(builderCookie, `/apps/${appId}/builder/conversation`, { say: text }, which);
  expect(res.status).toBe(200);
  return (await res.json()) as SayToBuilderResponse;
}

const storedTurns = (appId: string) =>
  db.select().from(s.appBuildTurns).where(eq(s.appBuildTurns.appId, appId));

// ════════════════════════════════════════════════════════════════════════════
// Part 1 — a refused route is not an unreachable model
// ════════════════════════════════════════════════════════════════════════════

describe('a model route the security tier refuses (walk defect 1)', () => {
  it('is told apart from an unreachable model: the person is told why, and pointed at the page that explains it', async () => {
    const built = await newApp(`t487 tier ${stamp}`);
    const res = await say(built.id, 'Build me a monthly returns app.', refusingApp);
    const agent = res.turns[1]!;
    expect(agent.text).toContain('no model route on this setup meets its security tier');
    expect(agent.text).toContain('How the AI works here');
    expect(agent.text).toContain('nothing was changed');
    // the walk's complaint, exactly: it used to read "I could not be reached just now"
    expect(agent.text).not.toContain('could not be reached');
    expect(res.app.tables).toHaveLength(0);
    // what the person said is kept, as it is for any refused turn
    expect(res.turns[0]!.text).toBe('Build me a monthly returns app.');
  });

  it('logs the refusal with its reason — once, not once per click', async () => {
    // a router and an app of its own, so the one-time report has not already
    // been spent by the test above
    const lines: string[] = [];
    const fresh = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: new Router(undeclared, embeddings, undefined, {}, { warn: (line) => lines.push(line) }),
    });
    const built = await newApp(`t487 tier log ${stamp}`);
    await say(built.id, 'First try.', fresh);
    await say(built.id, 'Second try.', fresh);
    await say(built.id, 'Third try.', fresh);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('a model call was refused');
    expect(lines[0]).toContain('no route conforms to tier');
    // the reason names the settings that were never declared — and no key, no host
    for (const setting of ['MODEL_REGION', 'MODEL_RETENTION', 'MODEL_JURISDICTION', 'MODEL_ELIGIBILITY']) {
      expect(lines[0]).toContain(`${setting} is not set`);
    }
  });

  it('leaves every other failure as “could not be reached”', async () => {
    const built = await newApp(`t487 down ${stamp}`);
    const down = buildApp({
      db,
      sessionSecret: 'test-secret',
      router: new Router(
        { modelId: 'down', attributes: SELF_HOSTED_UK, chat: () => Promise.reject(new Error('provider down')) },
        embeddings,
      ),
    });
    const res = await say(built.id, 'Build me a monthly returns app.', down);
    expect(res.turns[1]!.text).toContain('I could not be reached just now, so nothing was changed.');
    expect(res.turns[1]!.text).not.toContain('security tier');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Part 2 — an analysis table with no columns, and the reply kept
// ════════════════════════════════════════════════════════════════════════════

describe('an analysis table sent with no columns (walk defect 2)', () => {
  it('is accepted: the table exists with Infora’s columns, and a wall answer in the same turn is recorded', async () => {
    const built = await newApp(`t487 insight ${stamp}`);
    const first = await say(built.id, 'Build me a monthly returns app.');
    const returns = first.app.tables.find((t) => t.name === 'Monthly returns')!;
    expect(first.app.tables.find((t) => t.name === 'Analysis notes')).toBeUndefined();

    // the agent is told Infora fixes an insight table's columns, so — as the
    // real model did in the walk — it declares one with NO `columns` at all,
    // in the same answer that records the person's replies to its questions
    const second = await say(
      built.id,
      `Yes — the returns are contractual. Everyone may open Submit a return; only t487 Client ${stamp} may open Client dashboard. I also want a place for the analysis.`,
    );
    const agent = second.turns[1]!;
    // not refused: the agent's own words stand, and nothing says it changed nothing
    expect(agent.text).not.toContain('so I changed nothing');
    expect(agent.text).toContain('Analysis notes');

    // the insight table exists, with the four columns Infora fixes
    const analysis = second.app.tables.find((t) => t.name === 'Analysis notes')!;
    expect(analysis.kind).toBe('insight');
    expect(analysis.columns.map((c) => c.key)).toEqual(INSIGHT_TABLE_COLUMNS.map((c) => c.key));
    expect(analysis.hasAcceptance).toBe(false);

    // and the person's own recorded answers, in the same turn, were NOT thrown away
    expect(agent.acts.map((a) => a.kind).sort()).toEqual(
      ['answerContractualData', 'answerWhoMayOpen', 'answerWhoMayOpen', 'declareTable'].sort(),
    );
    expect(second.app.tables.find((t) => t.id === returns.id)!.hasAcceptance).toBe(true);
    expect(second.app.publishGate?.open).toBe(true);
    // a thing that was accepted keeps no raw reply
    expect(agent.rawReply).toBeUndefined();
  });

  it('does not loosen a DATA table: with no columns it is still refused whole', async () => {
    const built = await newApp(`t487 data no columns ${stamp}`);
    scripted = () =>
      JSON.stringify({
        say: 'Added a returns table.',
        acts: [{ kind: 'declareTable', name: 'Returns', tableKind: 'data' }],
        asks: [],
        proposals: [],
      });
    const res = await say(built.id, 'A returns table.');
    expect(res.app.tables).toHaveLength(0);
    expect(res.turns[1]!.text).toContain('so I changed nothing');
  });
});

describe('a reply Infora refuses whole is kept for the app’s builders (walk defect 2)', () => {
  const INVALID = JSON.stringify({
    say: 'I have opened the app to everyone.',
    acts: [{ kind: 'publish' }],
    asks: [],
    proposals: [],
  });

  it('is stored, returned to a builder on the turn, and shown again when the conversation is read', async () => {
    const built = await newApp(`t487 raw ${stamp}`);
    scripted = () => INVALID;
    const res = await say(built.id, 'Open it to everyone.');
    const agent = res.turns[1]!;
    expect(agent.text).toContain('so I changed nothing');
    // what the model sent, exactly
    expect(agent.rawReply).toBe(INVALID);
    const read = (await (await get(builderCookie, `/apps/${built.id}/builder/conversation`)).json()) as BuildConversationResponse;
    expect(read.turns[1]!.rawReply).toBe(INVALID);
    // and it is in the table, on the agent's turn alone
    const rows = await storedTurns(built.id);
    expect(rows.find((r) => r.role === 'agent')!.rawReply).toBe(INVALID);
    expect(rows.find((r) => r.role === 'person')!.rawReply).toBeNull();
  });

  it('is never returned to anyone who may not build the app — they get the conversation refused, as before', async () => {
    const built = await newApp(`t487 raw private ${stamp}`);
    scripted = () => INVALID;
    await say(built.id, 'Open it to everyone.');
    // Open the app first. While it is unpublished only its builders can reach it
    // at all, so a 404 would come from reaching the app and say nothing about the
    // conversation's own check. Published, the client, the peer and a colleague
    // can all open the APP — and then the conversation (and its raw reply) must
    // still answer 404.
    await post(builderCookie, `/apps/${built.id}/tables`, {
      name: 'Returns',
      columns: [{ key: 'month', label: 'Month', type: 'text', required: true }],
      kind: 'data',
      hasAcceptance: false,
    });
    await addStandInScreen((path, init) => app.request(path, init), builderCookie, built.id);
    expect((await post(builderCookie, `/apps/${built.id}/publish`)).status).toBe(200);
    for (const cookie of [ownerCookie, peerCookie, colleagueCookie]) {
      expect((await get(cookie, `/apps/${built.id}`)).status).toBe(200);
    }
    for (const cookie of [ownerCookie, peerCookie, colleagueCookie]) {
      const res = await get(cookie, `/apps/${built.id}/builder/conversation`);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('publish');
      expect((await post(cookie, `/apps/${built.id}/builder/conversation`, { say: 'hello' })).status).toBe(404);
    }
    // and no field of the app record itself carries it
    const record = JSON.stringify(((await (await get(builderCookie, `/apps/${built.id}`)).json()) as GetAppResponse));
    expect(record).not.toContain(INVALID);
  });

  it('is kept only when the reply was refused: a used answer and a talk-only reply keep nothing', async () => {
    const built = await newApp(`t487 raw only ${stamp}`);
    await say(built.id, 'Build me a monthly returns app.'); // used
    scripted = () => 'Sure — I will think about that and come back to you.'; // talk only
    await say(built.id, 'Maybe later.');
    const rows = await storedTurns(built.id);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.rawReply === null)).toBe(true);
  });

  it('is capped at the first 20,000 characters', async () => {
    const built = await newApp(`t487 raw cap ${stamp}`);
    const huge = `{"say":"x","acts":[{"kind":"publish"}],"pad":"${'a'.repeat(30000)}"}`;
    scripted = () => huge;
    const res = await say(built.id, 'Open it.');
    expect(res.turns[1]!.rawReply).toHaveLength(MAX_RAW_REPLY);
    expect(res.turns[1]!.rawReply).toBe(huge.slice(0, MAX_RAW_REPLY));
  });

  it('survives a reply that carries a NUL character, which a text column cannot hold', async () => {
    const built = await newApp(`t487 raw nul ${stamp}`);
    scripted = () => '{"say":"a\u0000b","acts":[{"kind":"publish"}]}';
    const res = await say(built.id, 'Open it.');
    expect(res.turns[1]!.rawReply).toBe('{"say":"ab","acts":[{"kind":"publish"}]}');
  });

  it('is private by the database too: a person’s turn cannot carry one, it cannot be rewritten, and it goes with the app', async () => {
    const built = await newApp(`t487 raw db ${stamp}`);
    scripted = () => INVALID;
    await say(built.id, 'Open it.');
    const [agentTurn] = (await storedTurns(built.id)).filter((r) => r.role === 'agent');
    const [participant] = await db.select().from(s.participants).where(eq(s.participants.id, agentTurn!.spokenByParticipantId));
    await expect(
      db.insert(s.appBuildTurns).values({
        appId: built.id,
        role: 'person',
        spokenByParticipantId: participant!.id,
        text: 'I said this',
        rawReply: 'and this',
      }),
    ).rejects.toThrow();
    await expect(
      db.update(s.appBuildTurns).set({ rawReply: 'rewritten' }).where(eq(s.appBuildTurns.id, agentTurn!.id)),
    ).rejects.toThrow();
    await expect(
      db.insert(s.appBuildTurns).values({
        appId: built.id,
        role: 'agent',
        spokenByParticipantId: participant!.id,
        text: 'too long',
        rawReply: 'z'.repeat(20001),
      }),
    ).rejects.toThrow();

    // deleted with the app (the register's deletion path is the cascade; an app
    // with scope grants cannot itself be deleted — they refuse DELETE — so it is
    // proved on an app row written with no grants, exactly as T-449's suite does)
    const [bare] = await db
      .insert(s.apps)
      .values({
        projectId,
        name: `t487 bare ${stamp}`,
        ownerParticipantId: participant!.id,
        createdByParticipantId: participant!.id,
        definitionUpdatedByParticipantId: participant!.id,
        definition: {},
      })
      .returning();
    await db.insert(s.appBuildTurns).values({
      appId: bare!.id,
      role: 'agent',
      spokenByParticipantId: participant!.id,
      text: 'refused',
      rawReply: 'what the model sent',
    });
    await db.delete(s.apps).where(eq(s.apps.id, bare!.id));
    expect(await storedTurns(bare!.id)).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Part 3 — never a claim of a change that was not made
// ════════════════════════════════════════════════════════════════════════════

describe('reading the model’s reply (walk defect 3)', () => {
  const ANSWER = {
    say: 'I set it to weekly.',
    acts: [{ kind: 'setSchedule', schedule: 'weekly' }],
    asks: [],
    proposals: [],
  };
  const json = JSON.stringify(ANSWER);
  const answered = (text: string) => {
    const parsed = parseBuilderAnswer(text);
    return parsed.kind === 'answer' ? parsed.answer : parsed;
  };

  it('reads the whole reply, and a fenced block, as it always did', () => {
    expect(answered(json)).toEqual(ANSWER);
    expect(answered('```json\n' + json + '\n```')).toEqual(ANSWER);
    expect(answered('Here you go:\n```\n' + json + '\n```\nAnything else?')).toEqual(ANSWER);
  });

  it('reads words followed by a bare answer — the walk’s shot 19 — and drops the words', () => {
    expect(answered(`Good idea — I have put that chart on the dashboard for you.\n\n${json}`)).toEqual(ANSWER);
  });

  it('reads a bare answer followed by words', () => {
    expect(answered(`${json}\n\nLet me know if you would like anything else changed.`)).toEqual(ANSWER);
  });

  it('is not confused by a brace inside a string, or an escaped quote before one', () => {
    const tricky = { ...ANSWER, say: 'Use a {placeholder} and the \\"{\\" character } too.' };
    const text = `Sure. ${JSON.stringify(tricky)} Done.`;
    expect(answered(text)).toEqual(tricky);
  });

  it('takes the FIRST valid answer when there are two, and skips an object that is not an answer', () => {
    const second = { ...ANSWER, say: 'I set it to daily.', acts: [{ kind: 'setSchedule', schedule: 'daily' }] };
    expect(answered(`${json} and then ${JSON.stringify(second)}`)).toEqual(ANSWER);
    expect(answered(`For example {"a": 1} — and now ${json}`)).toEqual(ANSWER);
  });

  it('treats a reply with no JSON object in it as talk only', () => {
    expect(parseBuilderAnswer('I would suggest a table with a month column.')).toEqual({
      kind: 'talk',
      said: 'I would suggest a table with a month column.',
    });
    expect(parseBuilderAnswer('Unbalanced { brace and "quote')).toMatchObject({ kind: 'talk' });
    expect(parseBuilderAnswer('')).toMatchObject({ kind: 'talk' });
    expect(parseBuilderAnswer('[1, 2, 3]')).toMatchObject({ kind: 'talk' });
  });

  it('still refuses an object that is not a valid answer WHOLE — nothing of it performed', () => {
    expect(parseBuilderAnswer('{"say":"x","acts":[{"kind":"publish"}],"asks":[],"proposals":[]}')).toEqual({
      kind: 'refused',
    });
    expect(parseBuilderAnswer('Here: {"say":"x","extra":true}')).toEqual({ kind: 'refused' });
  });

  it('refuses WHOLE an invalid answer that has a valid one nested inside it — the nested one is never performed', () => {
    const inner = { say: 'Nested.', acts: [{ kind: 'setSchedule', schedule: 'daily' }], asks: [], proposals: [] };
    const outer = { say: 'Outer.', acts: [{ kind: 'publish' }], asks: [], proposals: [], extra: inner };
    expect(parseBuilderAnswer(JSON.stringify(outer))).toEqual({ kind: 'refused' });
    expect(parseBuilderAnswer('```json\n' + JSON.stringify(outer) + '\n```')).toEqual({ kind: 'refused' });
    // and a stray object in chatty prose that is not an answer refuses too (it is an attempt at one)
    expect(parseBuilderAnswer('Sure! Here is {"note": 1}.')).toEqual({ kind: 'refused' });
  });
});

describe('words then a bare answer, end to end (walk defect 3, shot 19)', () => {
  it('performs the act, and the stored message is the answer’s own words — no JSON, no leading prose', async () => {
    const built = await newApp(`t487 bare ${stamp}`);
    const first = await say(built.id, 'Build me a monthly returns app.');
    const dashboard = first.app.app.definition!.interfaces.find((i) => i.label === 'Client dashboard')!;

    const res = await say(built.id, 'Please add a chart by contractor to the dashboard.');
    const agent = res.turns[1]!;
    // the act was PERFORMED — the dashboard now carries the new chart
    const after = res.app.app.definition!.interfaces.find((i) => i.id === dashboard.id)!;
    expect(after.source).toContain('Energy used by month');
    expect(agent.acts.map((a) => a.kind)).toEqual(['writeScreen']);
    // and the message is words, never the structured answer shown as code
    expect(agent.text).not.toContain('{');
    expect(agent.text).not.toContain('}');
    expect(agent.text).not.toContain('"acts"');
    expect(agent.text.startsWith('I added an energy chart to “Client dashboard”.')).toBe(true);
    // the model's lead-in sentence is dropped: the answer's own say is the message
    expect(agent.text).not.toContain('Good idea');
    expect(agent.rawReply).toBeUndefined();
  });
});

describe('a reply with no structured answer at all (walk defect 3)', () => {
  it('is talk only, and the stored message leads with the product’s own line that nothing changed', async () => {
    const built = await newApp(`t487 talk ${stamp}`);
    scripted = () => 'I have added a Gantt chart and a risk register to your app. Done!';
    const res = await say(built.id, 'Add a Gantt chart.');
    const agent = res.turns[1]!;
    expect(agent.text.startsWith('Nothing in the app changed this turn.')).toBe(true);
    expect(agent.text).toContain('I have added a Gantt chart');
    expect(agent.acts).toEqual([]);
    expect(res.app.tables).toHaveLength(0);
    expect(agent.rawReply).toBeUndefined();
  });
});

describe('an act the product refused is never described as done (walk defect 3, shots 14 and 20)', () => {
  it('shows Infora’s own account instead of the model’s words, with the receipt, and every question still open', async () => {
    const built = await newApp(`t487 notes ${stamp}`);
    const first = await say(built.id, 'Build me a monthly returns app.');
    const returns = first.app.tables.find((t) => t.name === 'Monthly returns')!;
    const dashboard = first.app.app.definition!.interfaces.find((i) => i.label === 'Client dashboard')!;
    const CLAIM = 'I have added a Gantt screen for you and redrawn the dashboard.';

    scripted = () =>
      JSON.stringify({
        say: CLAIM,
        acts: [
          // refused: names a column the table does not have
          {
            kind: 'writeScreen',
            label: 'Gantt',
            table: 'Monthly returns',
            layout: { version: 1, blocks: [{ kind: 'total', columnKey: 'no_such_column', label: 'Total' }] },
          },
          // performed
          { kind: 'setSchedule', schedule: 'daily' },
        ],
        // a question the model asks in its own words — which would vanish with them
        asks: [{ kind: 'who-may-open', screen: 'Client dashboard' }],
        proposals: [],
      });
    const res = await say(built.id, 'Add a Gantt screen.');
    const agent = res.turns[1]!;

    // the claim is not shown anywhere
    expect(agent.text).not.toContain(CLAIM);
    expect(agent.text).not.toContain('Gantt screen for you');
    // Infora's account leads…
    expect(agent.text.startsWith('Not everything I tried was done.')).toBe(true);
    // …carries the note of what was not done…
    expect(agent.text).toContain('“Gantt” named a column “Monthly returns” does not have, so I did not write it.');
    // …and the question the model asked in its own words is still put, by Infora
    expect(agent.text).toContain('Before this app can be opened, I need you to answer:');
    expect(agent.text).toContain('Who may open “Client dashboard”?');
    expect(agent.text).toContain('Does “Monthly returns” hold contractual data?');
    // it stays recorded as asked, so a later answer to it is taken
    expect(agent.asked).toContain(`who-may-open:${dashboard.id}`);

    // the receipt of what WAS done is stored, and the act really happened
    expect(agent.acts.map((a) => a.kind)).toEqual(['setSchedule']);
    expect(res.app.app.definition!.schedule).toBe('daily');
    // and the screen that was refused does not exist
    expect(res.app.app.definition!.interfaces.map((i) => i.label)).not.toContain('Gantt');
    expect(returns.id).toBeTruthy();
  });

  it('shows the model’s own words, then any unasked questions, when every act was made', async () => {
    const built = await newApp(`t487 all done ${stamp}`);
    scripted = () =>
      JSON.stringify({
        say: 'Done — I added a register.',
        acts: [{ kind: 'declareTable', name: 'Register', tableKind: 'data', columns: [{ key: 'site', label: 'Site', type: 'text' }] }],
        asks: [],
        proposals: [],
      });
    const res = await say(built.id, 'A site register.');
    const text = res.turns[1]!.text;
    expect(text.startsWith('Done — I added a register.')).toBe(true);
    expect(text).not.toContain('Not everything I tried was done.');
    expect(text).toContain('Before this app can be opened, I need you to answer:');
  });
});
