// T-488 acceptance — **finishing the app builder** (the walk's remaining defects,
// docs/walks/t446.md), the parts that need the real routes and a database:
//
//   (10) "Close the app" and "Give it to…" are offered only to people the
//        server would let do it;
//   (12) a file can be downloaded from a working area, through the access check
//        that opening the document runs;
//   (14) the agent never tells a person their spreadsheet link waits for
//        deployment — only outside-system connections do;
//   (22) the product's list of open questions is the one list, shown once;
//   (9)  a run's analysis is handed per-month and per-organisation figures, and
//        is stored ending on a whole sentence.
//
// Fresh organisations, project and apps per run; every row is looked up by the id
// this file created, never by title (the suite is repeatable on one seed).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AppRecord,
  AppRowResponse,
  AppRunRecord,
  AppTableRecord,
  GetAppResponse,
  ListAppRowsResponse,
  SayToBuilderResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter, EmbeddingAdapter } from '@infora/model';
import { buildApp } from './app';
import { CONVERSATION_SYSTEM } from './app-builder-agent';
import { addStandInScreen } from './app-test-support';
import { fakeBuilderAgent } from './fake-builder-agent';
import { getBlob } from './renditions';
import { FAKE_EMBED_DIMENSIONS, FAKE_EMBED_MODEL, fakeVector } from './test-router';
import { docx } from './test-docx';

const { db, pool } = createDb();

// ── the scripted model: the builder's GOOD agent by default (or the next answer
// replaced), and a capturing stand-in for the analysis sentence
let scripted: ((system: string, prompt: string) => string) | null = null;
const insightPrompts: string[] = [];
let insightReply = 'Waste fell in September.';
const chat: ChatAdapter = {
  modelId: 'fake-chat',
  attributes: SELF_HOSTED_UK,
  chat: (req) => {
    const system = req.system ?? '';
    const prompt = req.messages.map((m) => m.content).join('\n');
    let text: string;
    if (system.includes('about figures that have already been calculated')) {
      insightPrompts.push(prompt);
      text = insightReply;
    } else {
      const answer = scripted ?? ((sys: string, p: string) => fakeBuilderAgent(sys, p) ?? '');
      scripted = null;
      text = answer(system, prompt);
    }
    return Promise.resolve({
      text,
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

const stamp = Date.now();
const password = 'pw-t488';

let projectId: string;
let ownerOrg: string;
let builderOrg: string;
let peerOrg: string;
let ownerCookie: string; // the project owner's super user
let ownerColleagueCookie: string; // the project owner's firm, not elevated
let builderCookie: string; // builds, elevated: the app's owner
let colleagueCookie: string; // same firm as the builder, not elevated, may not build
let peerCookie: string; // a third firm, elevated

async function makeUser(
  name: string,
  organisationId: string,
  options: { mayBuildApps: boolean; elevated: boolean },
) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: 'admin', mayBuildApps: options.mayBuildApps })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId, elevated: options.elevated });
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
    .values([{ name: `t488 Client ${stamp}` }, { name: `t488 Builder ${stamp}` }, { name: `t488 Peer ${stamp}` }])
    .returning();
  [ownerOrg, builderOrg, peerOrg] = orgs.map((o) => o.id) as [string, string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t488 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: builderOrg, projectId, role: 'member' },
    { organisationId: peerOrg, projectId, role: 'member' },
  ]);
  ownerCookie = await session(await makeUser('t488-rhoda', ownerOrg, { mayBuildApps: true, elevated: true }));
  ownerColleagueCookie = await session(await makeUser('t488-olga', ownerOrg, { mayBuildApps: false, elevated: false }));
  builderCookie = await session(await makeUser('t488-bella', builderOrg, { mayBuildApps: true, elevated: true }));
  colleagueCookie = await session(await makeUser('t488-colin', builderOrg, { mayBuildApps: false, elevated: false }));
  peerCookie = await session(await makeUser('t488-pia', peerOrg, { mayBuildApps: true, elevated: true }));
});

afterAll(async () => {
  await pool.end();
});

/** A published app of the builder's, open to all three firms, with a returns table
 * (acceptance step) and the insight table a run writes into. */
async function publishedApp(name: string): Promise<{ app: AppRecord; table: AppTableRecord }> {
  const created = (await (
    await post(builderCookie, `/projects/${projectId}/apps`, {
      name,
      organisationIds: [ownerOrg, peerOrg],
      participantIds: [],
    })
  ).json()) as AppRecord;
  const table = (await (
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
  await post(builderCookie, `/apps/${created.id}/tables`, {
    name: 'Insights',
    columns: [{ key: 'x', label: 'x', type: 'text' }],
    kind: 'insight',
  });
  await addStandInScreen((path, init) => app.request(path, init), builderCookie, created.id);
  expect((await post(builderCookie, `/apps/${created.id}/publish`)).status).toBe(200);
  return { app: created, table };
}

const recordFor = async (cookie: string, appId: string) =>
  ((await (await get(cookie, `/apps/${appId}`)).json()) as GetAppResponse).app;

// ════════════════════════════════════════════════════════════════════════════
// (10) Close / Give it to — only for the people the server would let do it
// ════════════════════════════════════════════════════════════════════════════

describe('“Close the app” and “Give it to…” follow the server’s own check (defect 10)', () => {
  it('the owner’s firm and the building firm’s super user may; a colleague, the client’s other people and a peer firm may not', async () => {
    const { app: built } = await publishedApp(`t488 ownership ${stamp}`);
    const flags = async (cookie: string) => {
      const record = await recordFor(cookie, built.id);
      return [record.mayClose, record.mayReassign];
    };
    expect(await flags(builderCookie)).toEqual([true, true]);
    expect(await flags(ownerCookie)).toEqual([true, true]);
    // not elevated, though in the building firm / the client's firm: no buttons
    expect(await flags(colleagueCookie)).toEqual([false, false]);
    expect(await flags(ownerColleagueCookie)).toEqual([false, false]);
    // elevated, but a third firm that the app is merely open to
    expect(await flags(peerCookie)).toEqual([false, false]);
  });

  it('and the routes still refuse them — the flag is the route’s own answer, not a second rule', async () => {
    const { app: built } = await publishedApp(`t488 refusals ${stamp}`);
    for (const cookie of [colleagueCookie, ownerColleagueCookie, peerCookie]) {
      expect((await post(cookie, `/apps/${built.id}/closure`)).status).toBe(404);
      expect(
        (await post(cookie, `/apps/${built.id}/reassignment`, { participantId: '00000000-0000-4000-8000-000000000000' })).status,
      ).toBe(404);
    }
    // nothing closed, and the people who may close still can
    expect((await recordFor(builderCookie, built.id)).state).toBe('open');
    const closed = await post(builderCookie, `/apps/${built.id}/closure`);
    expect(closed.status).toBe(200);
    const after = (await closed.json()) as AppRecord;
    // a closed app has nothing left to close or hand over
    expect([after.state, after.mayClose, after.mayReassign]).toEqual(['closed', false, false]);
    expect((await recordFor(ownerCookie, built.id)).mayClose).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (12) Download a file from a working area
// ════════════════════════════════════════════════════════════════════════════

describe('a file can be downloaded from a working area (defect 12)', () => {
  async function upload(cookie: string, name: string, bytes: Buffer): Promise<string> {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(bytes)], name));
    const res = await app.request(`/projects/${projectId}/sandbox-uploads`, { method: 'POST', headers: { cookie }, body: form });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  it('the person who may open the document gets its bytes under its own name, as an attachment', async () => {
    const bytes = docx(['The Wrenfield cost report.']);
    const id = await upload(builderCookie, `t488 cost report ${stamp}.docx`, bytes);
    const res = await get(builderCookie, `/sandbox-documents/${id}/file`);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
    const disposition = res.headers.get('content-disposition')!;
    expect(disposition).toContain('attachment');
    expect(disposition).toContain(`filename="t488 cost report ${stamp}.docx"`);
    expect(res.headers.get('content-type')).toContain('wordprocessingml');
  });

  it('is exactly as open as the document itself: another firm, a stranger and a signed-out caller are all told it does not exist', async () => {
    const id = await upload(builderCookie, `t488 private ${stamp}.docx`, docx(['Only the building firm’s.']));
    const people: Array<[string, string | null]> = [
      ['the client', ownerCookie],
      ['a peer firm', peerCookie],
      ['a colleague in the same firm', colleagueCookie],
      ['nobody signed in', null],
    ];
    for (const [who, cookie] of people) {
      const headers = cookie === null ? {} : { cookie };
      const opened = await app.request(`/sandbox-documents/${id}`, { headers });
      const file = await app.request(`/sandbox-documents/${id}/file`, { headers });
      // whatever the open check says, the download says the same
      expect([who, file.status]).toEqual([who, opened.status]);
    }
    expect((await get(ownerCookie, `/sandbox-documents/${id}/file`)).status).toBe(404);
    expect((await get(peerCookie, `/sandbox-documents/${id}/file`)).status).toBe(404);
    expect((await app.request(`/sandbox-documents/${id}/file`)).status).toBe(401);
    // and the 404 carries nothing about the document
    const refused = await get(ownerCookie, `/sandbox-documents/${id}/file`);
    expect(await refused.text()).not.toContain('private');
  });

  it('a document written in Infora has no file of its own, and a made-up id is a plain 404', async () => {
    const created = await post(builderCookie, `/projects/${projectId}/sandbox-documents`, { title: `t488 written ${stamp}` });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { id: string }).id;
    expect((await get(builderCookie, `/sandbox-documents/${id}/file`)).status).toBe(404);
    expect((await get(builderCookie, '/sandbox-documents/00000000-0000-4000-8000-000000000000/file')).status).toBe(404);
  });

  it('after the file is replaced, the download is the CURRENT file', async () => {
    const id = await upload(builderCookie, `t488 replaced ${stamp}.docx`, docx(['First.']));
    const second = docx(['Second.']);
    const form = new FormData();
    form.append('file', new File([new Uint8Array(second)], 'whatever.docx'));
    expect((await app.request(`/sandbox-documents/${id}/file`, { method: 'POST', headers: { cookie: builderCookie }, body: form })).status).toBe(200);
    const [row] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, id));
    expect(getBlob(row!.fileRef!)!.equals(second)).toBe(true);
    const res = await get(builderCookie, `/sandbox-documents/${id}/file`);
    expect(Buffer.from(await res.arrayBuffer()).equals(second)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (14) The agent does not say a spreadsheet waits for deployment
// ════════════════════════════════════════════════════════════════════════════

describe('a spreadsheet works now; only outside-system connections wait (defect 14)', () => {
  it('the instruction’s sentences about spreadsheets never say “deployed”, and say it works now', () => {
    const lines = CONVERSATION_SYSTEM.split('\n');
    const aboutSpreadsheets = lines.filter((line) => /spreadsheet/i.test(line));
    expect(aboutSpreadsheets.length).toBeGreaterThan(0);
    for (const line of aboutSpreadsheets) expect(line).not.toMatch(/deploy/i);
    expect(aboutSpreadsheets.join(' ')).toContain('This works now');
  });

  it('the instruction says the waiting is for connections to outside systems alone', () => {
    const waiting = CONVERSATION_SYSTEM.split('\n').filter((line) => /deploy/i.test(line));
    expect(waiting.length).toBeGreaterThan(0);
    for (const line of waiting) {
      expect(line).toContain('OUTSIDE Infora');
      expect(line).not.toMatch(/spreadsheet/i);
    }
  });

  it('the receipt for a described connection says that connection waits — and nothing about spreadsheets', async () => {
    const created = (await (
      await post(builderCookie, `/projects/${projectId}/apps`, { name: `t488 connection ${stamp}`, organisationIds: [], participantIds: [] })
    ).json()) as AppRecord;
    scripted = () =>
      JSON.stringify({
        say: 'I have noted that.',
        acts: [{ kind: 'addConnection', system: 'ArcGIS', needs: 'the site boundary layer, read only' }],
        asks: [],
        proposals: [],
      });
    const res = await post(builderCookie, `/apps/${created.id}/builder/conversation`, { say: 'We will need ArcGIS later.' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SayToBuilderResponse;
    const receipt = body.turns[1]!.acts.find((act) => act.kind === 'addConnection')!;
    expect(JSON.stringify(receipt)).toContain('a connection to an outside system can only be made once Infora is deployed');
    expect(JSON.stringify(receipt)).not.toMatch(/spreadsheet/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (22) One list of open questions
// ════════════════════════════════════════════════════════════════════════════

describe('the product’s list of open questions is the one list, shown once (defect 22)', () => {
  const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
  const LEAD = 'Before this app can be opened, I need you to answer:';

  it('the scripted good agent’s first turn shows each of its three questions exactly once, under one lead line', async () => {
    const created = (await (
      await post(builderCookie, `/projects/${projectId}/apps`, { name: `t488 questions ${stamp}`, organisationIds: [ownerOrg], participantIds: [] })
    ).json()) as AppRecord;
    const res = await post(builderCookie, `/apps/${created.id}/builder/conversation`, { say: 'Build me a monthly returns app.' });
    const text = ((await res.json()) as SayToBuilderResponse).turns[1]!.text;
    expect(occurrences(text, LEAD)).toBe(1);
    expect(occurrences(text, 'Does “Monthly returns” hold contractual data?')).toBe(1);
    expect(occurrences(text, 'Who may open “Submit a return”?')).toBe(1);
    expect(occurrences(text, 'Who may open “Client dashboard”?')).toBe(1);
  });

  it('a turn with two open questions lists both once; the next turn lists them again — all that are open, not only the unasked', async () => {
    const created = (await (
      await post(builderCookie, `/projects/${projectId}/apps`, { name: `t488 two questions ${stamp}`, organisationIds: [], participantIds: [] })
    ).json()) as AppRecord;
    const column = [{ key: 'item', label: 'Item', type: 'text', required: true }];
    scripted = () =>
      JSON.stringify({
        say: 'I drafted two tables.',
        acts: [
          { kind: 'declareTable', name: 'Alpha register', tableKind: 'data', columns: column },
          { kind: 'declareTable', name: 'Beta register', tableKind: 'data', columns: column },
        ],
        asks: [
          { kind: 'contractual-data', table: 'Alpha register' },
          { kind: 'contractual-data', table: 'Beta register' },
        ],
        proposals: [],
      });
    const first = (await (await post(builderCookie, `/apps/${created.id}/builder/conversation`, { say: 'Two registers please.' })).json()) as SayToBuilderResponse;
    const firstText = first.turns[1]!.text;
    expect(occurrences(firstText, LEAD)).toBe(1);
    expect(occurrences(firstText, 'Does “Alpha register” hold contractual data?')).toBe(1);
    expect(occurrences(firstText, 'Does “Beta register” hold contractual data?')).toBe(1);
    expect(first.turns[1]!.asked).toHaveLength(2); // what was put to the person is still recorded

    // the person answers neither; the next turn is the model saying something else
    scripted = () => JSON.stringify({ say: 'Anything else you would like?', acts: [], asks: [], proposals: [] });
    const second = (await (await post(builderCookie, `/apps/${created.id}/builder/conversation`, { say: 'Not yet.' })).json()) as SayToBuilderResponse;
    const secondText = second.turns[1]!.text;
    expect(occurrences(secondText, LEAD)).toBe(1);
    expect(occurrences(secondText, 'Does “Alpha register” hold contractual data?')).toBe(1);
    expect(occurrences(secondText, 'Does “Beta register” hold contractual data?')).toBe(1);

    // answering one removes just that one from the list
    scripted = () =>
      JSON.stringify({
        say: 'Recorded.',
        acts: [{ kind: 'answerContractualData', table: 'Alpha register', holdsContractualData: false }],
        asks: [],
        proposals: [],
      });
    const third = (await (await post(builderCookie, `/apps/${created.id}/builder/conversation`, { say: 'Alpha is working data.' })).json()) as SayToBuilderResponse;
    expect(third.turns[1]!.text).not.toContain('Does “Alpha register” hold contractual data?');
    expect(occurrences(third.turns[1]!.text, 'Does “Beta register” hold contractual data?')).toBe(1);
  });

  it('tells the model to put its questions in “asks” and not restate them in “say”', () => {
    expect(CONVERSATION_SYSTEM).toContain('do NOT restate them in "say"');
    expect(CONVERSATION_SYSTEM).toContain('(those go in "asks", not here)');
    expect(CONVERSATION_SYSTEM).not.toContain('Ask them in "say" too');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (9) The analysis: per month, per organisation, never cut mid-word
// ════════════════════════════════════════════════════════════════════════════

describe('a run hands the model per-month and per-organisation figures, and stores a whole sentence (defect 9)', () => {
  it('the prompt carries both blocks over the rows the run covers — current rows only — and a long reply is stored ending on a sentence', async () => {
    const { app: built, table } = await publishedApp(`t488 analysis ${stamp}`);
    const enter = async (cookie: string, month: string, landfill: number) =>
      ((await (await post(cookie, `/app-tables/${table.id}/rows`, { values: { month, landfill }, submit: true })).json()) as AppRowResponse).row;
    await enter(builderCookie, 'August 2026', 10);
    const slip = await enter(builderCookie, 'September 2026', 4.6);
    await enter(peerCookie, 'August 2026', 7);
    // the client rejects the slip and the builder corrects it: the original must not be counted again
    expect((await post(ownerCookie, `/app-rows/${slip.id}/decision`, { decision: 'reject', reason: 'Decimal slip.' })).status).toBe(200);
    expect((await post(builderCookie, `/app-rows/${slip.id}/correction`, { values: { month: 'September 2026', landfill: 14.6 }, submit: true })).status).toBe(201);

    insightPrompts.length = 0;
    insightReply = `${'Waste to landfill was steady across the scheme. '.repeat(40)}And then it began to`;
    const run = ((await (await post(ownerCookie, `/apps/${built.id}/runs`, { trigger: 'manual' })).json()) as { run: AppRunRecord }).run;
    expect(run.insightRowId).not.toBeNull();

    expect(insightPrompts).toHaveLength(1);
    const prompt = insightPrompts[0]!;
    expect(prompt).toContain('PER ORGANISATION');
    expect(prompt).toContain(`t488 Builder ${stamp}: 2 row(s) — Waste to landfill (t) total 24.6`);
    expect(prompt).toContain(`t488 Peer ${stamp}: 1 row(s) — Waste to landfill (t) total 7`);
    expect(prompt).toContain('PER MONTH');
    expect(prompt).toContain('August 2026: 2 row(s) — Waste to landfill (t) total 17');
    expect(prompt).toContain('September 2026: 1 row(s) — Waste to landfill (t) total 14.6');
    expect(prompt.indexOf('August 2026:')).toBeLessThan(prompt.indexOf('September 2026:'));
    // the rejected original (4.6) is not in anything the model was shown
    expect(prompt).not.toMatch(/(?<![\d.])4\.6(?!\d)/);

    const insightTable = (await db.select().from(s.appTables).where(eq(s.appTables.appId, built.id))).find((t) => t.kind === 'insight')!;
    const rows = ((await (await get(ownerCookie, `/app-tables/${insightTable.id}/rows`)).json()) as ListAppRowsResponse).items;
    const stored = String(rows.find((row) => row.id === run.insightRowId)!.values['insight']);
    expect(stored.endsWith('scheme.')).toBe(true);
    expect(stored).not.toContain('And then');
    expect(stored.length).toBeLessThanOrEqual(1500);
    insightReply = 'Waste fell in September.';
  });

  it('a run by a contractor firm is shown that firm’s figures only — the other firm’s name and totals are not in its prompt', async () => {
    const { app: built, table } = await publishedApp(`t488 own analysis ${stamp}`);
    const enter = async (cookie: string, landfill: number) =>
      post(cookie, `/app-tables/${table.id}/rows`, { values: { month: 'August 2026', landfill }, submit: true });
    expect((await enter(builderCookie, 10)).status).toBe(201);
    expect((await enter(peerCookie, 7777)).status).toBe(201);

    insightPrompts.length = 0;
    insightReply = 'Waste was steady.';
    const run = ((await (await post(builderCookie, `/apps/${built.id}/runs`, { trigger: 'manual' })).json()) as { run: AppRunRecord }).run;
    expect(run.rowsCovered).toBe(1);
    const prompt = insightPrompts[0]!;
    expect(prompt).toContain(`t488 Builder ${stamp}: 1 row(s)`);
    expect(prompt).not.toContain(`t488 Peer ${stamp}`);
    expect(prompt).not.toContain('7777');
    expect(prompt).not.toContain(`t488 Client ${stamp}`);
    expect(prompt).toContain('PER MONTH');
    insightReply = 'Waste fell in September.';
  });
});
