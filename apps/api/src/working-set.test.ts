// T-471 acceptance, against the live dev database: the working set.
//
// *In plain terms: a person may hand the AI some of their own drafts, taken from
// the working areas they are part of. This suite holds the four promises that
// make that safe — the picker's list only ever holds drafts the person is in the
// working area of; the server checks that again when a draft is pinned and when
// a run starts (and refuses in words, never silently drops); the run records
// what it was handed; and a reader who is not in a draft's working area sees
// the draft's title marked "not open to you", never the draft itself (T-482).*
//
// The world: one project, three firms, and sandboxes of every width —
//   open    (firm B, whole firm)         "B open draft"
//   narrow  (named user: bram only)      "B narrow draft"
//   team    (team: bram and bo)          "B team draft"
//   shared  (multi-org: firms B and C)   "Shared draft"
//   c-own   (firm C, whole firm)         "C private draft"
// and three people in firm B who stand in different places: bram (in all of B's),
// bo (the team), bea (only the whole-firm one).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { AttachedSource, GetWorkingAreaResponse, Run, GetRunPlanResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { purgeSandboxDocument } from './purge';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();

// the draft's prompt, captured, so the suite can read what the model was shown
let lastPrompt = '';
const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter((_system, prompt) => {
    lastPrompt = prompt;
    return 'Your open draft sets out the approach. [A1] The investigation found no exceedance.';
  }),
});

const stamp = Date.now();
const password = 'pw-t471';
let projectId: string;
let orgA: string;
let orgB: string;
let orgC: string;
let orgD: string;
const cookies: Record<string, string> = {};
const participants: Record<string, string> = {};
const docs: Record<string, string> = {};
const sandboxes: Record<string, string> = {};

async function makeUser(name: string, organisationId: string, inProject = projectId) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [p] = await db.insert(s.participants).values({ userId: user!.id, projectId: inProject }).returning();
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password }),
  });
  cookies[name] = res.headers.get('set-cookie')!.split(';')[0]!;
  participants[name] = p!.id;
}

const as = (who: string) => ({ cookie: cookies[who]!, 'content-type': 'application/json' });
const get = (who: string, path: string) => app.request(path, { headers: as(who) });
const post = (who: string, path: string, body?: unknown) =>
  app.request(path, { method: 'POST', headers: as(who), body: JSON.stringify(body ?? {}) });

async function makeSandbox(
  key: string,
  scope: 'multi_org' | 'single_org' | 'team' | 'named_user',
  owner: string,
  grants: Array<{ org?: string; person?: string }>,
  inProject = projectId,
) {
  const [sb] = await db
    .insert(s.sandboxes)
    .values({
      projectId: inProject,
      name: `${key} area ${stamp}`,
      scope,
      owningOrganisationId: owner,
      createdByParticipantId: participants['bram']!,
    })
    .returning();
  sandboxes[key] = sb!.id;
  for (const grant of grants) {
    await db.insert(s.sandboxScopeGrants).values({
      sandboxId: sb!.id,
      granteeType: grant.org !== undefined ? 'organisation' : 'participant',
      ...(grant.org !== undefined && { organisationId: grant.org }),
      ...(grant.person !== undefined && { participantId: participants[grant.person]! }),
      grantedByParticipantId: participants['bram']!,
    });
  }
  return sb!.id;
}

async function makeDoc(key: string, title: string, sandboxKey: string, org: string, by: string, content = `${title} — body text.`) {
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: org,
      sandboxId: sandboxes[sandboxKey]!,
      title,
      content,
      createdByParticipantId: participants[by]!,
    })
    .returning();
  docs[key] = doc!.id;
  return doc!.id;
}

beforeAll(async () => {
  const mk = async (name: string) => (await db.insert(s.organisations).values({ name: `t471 ${name} ${stamp}` }).returning())[0]!.id;
  orgA = await mk('A');
  orgB = await mk('B');
  orgC = await mk('C');
  orgD = await mk('D');
  const [project] = await db.insert(s.projects).values({ name: `t471 project ${stamp}`, ownerOrganisationId: orgA }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgA, projectId, role: 'owner' },
    { organisationId: orgB, projectId, role: 'member' },
    { organisationId: orgC, projectId, role: 'member' },
    // D is NOT a member of the project
  ]);
  await makeUser('bram', orgB);
  await makeUser('bo', orgB);
  await makeUser('bea', orgB);
  await makeUser('clio', orgC);
  await makeUser('dave', orgD);

  await makeSandbox('open', 'single_org', orgB, [{ org: orgB }]);
  await makeSandbox('narrow', 'named_user', orgB, [{ person: 'bram' }]);
  await makeSandbox('team', 'team', orgB, [{ person: 'bram' }, { person: 'bo' }]);
  await makeSandbox('shared', 'multi_org', orgA, [{ org: orgB }, { org: orgC }]);
  await makeSandbox('cown', 'single_org', orgC, [{ org: orgC }]);
  await makeSandbox('paging', 'single_org', orgB, [{ org: orgB }]);
  await makeSandbox('flip', 'named_user', orgB, [{ person: 'bram' }]);

  await makeDoc('open', 'B open draft', 'open', orgB, 'bram', 'The open draft proposes trial pits at 20 m centres.');
  await makeDoc('narrow', 'B narrow draft', 'narrow', orgB, 'bram', 'The narrow draft is confidential to bram.');
  await makeDoc('team', 'B team draft', 'team', orgB, 'bram');
  await makeDoc('shared', 'Shared draft', 'shared', orgC, 'clio');
  await makeDoc('cown', 'C private draft', 'cown', orgC, 'clio');
  await makeDoc('flip', 'B flip note', 'flip', orgB, 'bram');
  const deleted = await makeDoc('deleted', 'B deleted draft', 'open', orgB, 'bram');
  await db.update(s.sandboxDocuments).set({ deletedAt: new Date() }).where(eq(s.sandboxDocuments.id, deleted));
  for (let i = 1; i <= 55; i++) {
    await makeDoc(`p${i}`, `paging-note ${String(i).padStart(2, '0')}`, 'paging', orgB, 'bram');
  }

  // a sandbox in ANOTHER project that firm B holds a grant on: never listed here
  const [other] = await db.insert(s.projects).values({ name: `t471 other ${stamp}`, ownerOrganisationId: orgB }).returning();
  await db.insert(s.memberships).values({ organisationId: orgB, projectId: other!.id, role: 'owner' });
  const [otherParticipant] = await db.insert(s.participants).values({ userId: (await db.select().from(s.users).where(eq(s.users.email, `bram-${stamp}@test.local`)))[0]!.id, projectId: other!.id }).returning();
  const [otherSandbox] = await db
    .insert(s.sandboxes)
    .values({ projectId: other!.id, name: 'other project area', scope: 'single_org', owningOrganisationId: orgB, createdByParticipantId: otherParticipant!.id })
    .returning();
  await db.insert(s.sandboxScopeGrants).values({ sandboxId: otherSandbox!.id, granteeType: 'organisation', organisationId: orgB, grantedByParticipantId: otherParticipant!.id });
  await db.insert(s.sandboxDocuments).values({ projectId: other!.id, organisationId: orgB, sandboxId: otherSandbox!.id, title: 'Other project draft', content: 'x', createdByParticipantId: otherParticipant!.id });
});

afterAll(async () => {
  await pool.end();
});

const titles = async (who: string, q: string) => {
  const res = await get(who, `/projects/${projectId}/working-area?q=${encodeURIComponent(q)}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as GetWorkingAreaResponse).items.map((item) => item.title).sort();
};

describe('the working-area read — only drafts from working areas the reader is in', () => {
  it('lists, for each person, exactly the drafts in the working areas they hold a grant on', async () => {
    // bram: whole-firm, narrow, team, and the shared one
    expect(await titles('bram', 'draft')).toEqual(['B narrow draft', 'B open draft', 'B team draft', 'Shared draft']);
    // bo: the team, the whole-firm one and the shared one — not bram's narrow one
    expect(await titles('bo', 'draft')).toEqual(['B open draft', 'B team draft', 'Shared draft']);
    // bea: the whole-firm one and the shared one — a colleague in the same firm is NOT in a narrower area
    expect(await titles('bea', 'draft')).toEqual(['B open draft', 'Shared draft']);
    // clio (firm C): hers, and the shared one — never firm B's
    expect(await titles('clio', 'draft')).toEqual(['C private draft', 'Shared draft']);
  });

  it('a deleted draft, and a draft in another project, are never listed', async () => {
    expect(await titles('bram', 'deleted')).toEqual([]);
    expect(await titles('bram', 'Other project')).toEqual([]);
  });

  it('each row carries the name of the working area it sits in', async () => {
    const res = await get('bea', `/projects/${projectId}/working-area?q=${encodeURIComponent('Shared draft')}`);
    const body = (await res.json()) as GetWorkingAreaResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ title: 'Shared draft', sandboxId: sandboxes['shared'], sandboxName: `shared area ${stamp}` });
  });

  it('is searched by title, case-folded, as a literal (a typed % is not a wildcard)', async () => {
    expect(await titles('bram', 'NARROW')).toEqual(['B narrow draft']);
    expect(await titles('bram', '%')).toEqual([]);
    expect(await titles('bram', '_')).toEqual([]);
  });

  it('is paged at 50, with whether another page exists', async () => {
    const page = async (n: number) =>
      (await (await get('bea', `/projects/${projectId}/working-area?q=paging-note&page=${n}`)).json()) as GetWorkingAreaResponse;
    const one = await page(1);
    expect(one.items).toHaveLength(50);
    expect(one.pageSize).toBe(50);
    expect(one.hasMore).toBe(true);
    const two = await page(2);
    expect(two.items).toHaveLength(5);
    expect(two.hasMore).toBe(false);
    expect((await page(3)).items).toEqual([]);
    // no row repeats across pages
    const all = [...one.items, ...two.items].map((item) => item.id);
    expect(new Set(all).size).toBe(55);
  });

  it('someone who is not on the project gets nothing — the project does not exist to them', async () => {
    const res = await get('dave', `/projects/${projectId}/working-area`);
    expect(res.status).toBe(404);
    expect((await app.request(`/projects/${projectId}/working-area`)).status).toBe(401);
  });
});

async function conversation(who: string, sandboxDocumentId?: string) {
  const res = await post(who, `/projects/${projectId}/conversations`, {
    surface: 'web',
    ...(sandboxDocumentId !== undefined && { sandboxDocumentId }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { conversationId: string }).conversationId;
}
const pin = (who: string, conversationId: string, ref: string, label?: string) =>
  post(who, `/conversations/${conversationId}/attached-sources`, { kind: 'sandbox', ref, ...(label !== undefined && { label }) });

describe('pinning — checked against the document’s own working area, not stored as sent', () => {
  it('refuses, in words, a draft from a working area the person is not in — and the same answer for one that does not exist', async () => {
    const conv = await conversation('bea');
    const narrow = await pin('bea', conv, docs['narrow']!);
    expect(narrow.status).toBe(400);
    const words = ((await narrow.json()) as { detail: string }).detail;
    expect(words).toContain('not in a working area you are part of');
    // a colleague's narrower area, a firm that is not theirs, a deleted draft, a made-up id and nonsense all read the same
    for (const ref of [docs['cown']!, docs['deleted']!, '00000000-0000-4000-8000-000000000000', 'not-an-id']) {
      const res = await pin('bea', conv, ref);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { detail: string }).detail).toBe(words);
    }
    const list = await get('bea', `/conversations/${conv}/attached-sources`);
    expect(((await list.json()) as { items: AttachedSource[] }).items).toEqual([]);
  });

  it('accepts a reachable one, and files it under the document’s own title, not the body’s', async () => {
    const conv = await conversation('bram');
    const res = await pin('bram', conv, docs['narrow']!, 'something else entirely');
    expect(res.status).toBe(201);
    expect(((await res.json()) as AttachedSource).label).toBe('B narrow draft');
    // a shared working area's draft, made by another firm, is reachable by a grant
    const shared = await pin('bea', await conversation('bea'), docs['shared']!);
    expect(shared.status).toBe(201);
  });
});

describe('a run is refused — in words, naming the document — when a pinned draft is out of reach', () => {
  it('refuses before anything is spent, never silently dropping the draft', async () => {
    const conv = await conversation('bram');
    expect((await pin('bram', conv, docs['flip']!)).status).toBe(201);
    // the grant that put bram in that working area is closed
    await db
      .update(s.sandboxScopeGrants)
      .set({ removedAt: new Date() })
      .where(and(eq(s.sandboxScopeGrants.sandboxId, sandboxes['flip']!), eq(s.sandboxScopeGrants.participantId, participants['bram']!)));

    const own = await post('bram', `/conversations/${conv}/runs`, { request: 'what have we missed?' });
    expect(own.status).toBe(400);
    const detail = ((await own.json()) as { detail: string }).detail;
    expect(detail).toContain('"B flip note"');
    expect(detail).toContain('not in a working area you are part of');

    // a colleague who runs on the same conversation is refused without learning the title
    const colleague = await post('bea', `/conversations/${conv}/runs`, { request: 'what have we missed?' });
    expect(colleague.status).toBe(400);
    const colleagueWords = ((await colleague.json()) as { detail: string }).detail;
    expect(colleagueWords).toContain('a document a colleague pinned');
    expect(colleagueWords).not.toContain('B flip note');

    // no run was opened for either refusal
    const opened = await db.select().from(s.runs).where(eq(s.runs.conversationId, conv));
    expect(opened).toEqual([]);

    // unpinning it lets the question through: the refusal was about that draft and no other
    const pins = (await (await get('bram', `/conversations/${conv}/attached-sources`)).json()) as { items: AttachedSource[] };
    // bram can no longer open it either — the entry keeps its title but loses its id, and can still be unpinned by id
    expect(pins.items[0]).toMatchObject({ openToYou: false, ref: '' });
    expect(pins.items[0]!.label).toBeTruthy();
    expect((await post('bram', `/attached-sources/${pins.items[0]!.id}/unpin`)).status).toBe(200);
    const ok = await post('bram', `/conversations/${conv}/runs`, { request: 'what have we missed?' });
    expect(ok.status).toBe(201);
  });
});

describe('a run handed a working set — read as background, recorded, never cited', () => {
  it('shows the model the pinned drafts as user-supplied background, records them on the plan, and cites none', async () => {
    const conv = await conversation('bram');
    await pin('bram', conv, docs['open']!);
    await pin('bram', conv, docs['team']!);
    lastPrompt = '';
    const res = await post('bram', `/conversations/${conv}/runs`, { request: 'given my drafts, what have we missed?' });
    expect(res.status).toBe(201);
    const run = (await res.json()) as Run;

    // 1. the model was shown them, marked, after the sources and before the task
    expect(lastPrompt).toContain('Working set (supplied by the user as background they vouch for');
    expect(lastPrompt).toContain('[A1] (attached by the user — not a project source)');
    expect(lastPrompt).toContain('trial pits at 20 m centres');
    expect(lastPrompt.indexOf('Working set')).toBeLessThan(lastPrompt.indexOf('Task:'));

    // 2. the plan recorded id and label — never the text
    const [plan] = await db.select().from(s.plans).where(eq(s.plans.runId, run.id));
    expect(plan!.workingSet).toEqual(
      expect.arrayContaining([
        { sandboxDocumentId: docs['open'], label: 'B open draft' },
        { sandboxDocumentId: docs['team'], label: 'B team draft' },
      ]),
    );
    expect(JSON.stringify(plan!.workingSet)).not.toContain('trial pits');

    // 3. the run read carries it, for the label
    expect(run.workingSet).toHaveLength(2);

    // 4. nothing cites it: no citation, no source in any step, no [A1] left in the answer
    expect(run.citations).toEqual([]);
    expect(JSON.stringify(run.steps.map((step) => step.sourceSet))).not.toContain(docs['open']!);
    expect(run.response ?? '').not.toMatch(/\[A\d+\]/);

    // 5. the plan read carries the set too
    const planRead = (await (await get('bram', `/runs/${run.id}/plan`)).json()) as GetRunPlanResponse;
    expect(planRead.plan.workingSet).toHaveLength(2);
  });

  it('a run on a conversation with nothing pinned records none — and nothing is ever pinned for the person', async () => {
    const conv = await conversation('bram', docs['open']);
    const before = await db.select().from(s.attachedSources).where(eq(s.attachedSources.conversationId, conv));
    expect(before).toEqual([]);
    const res = await post('bram', `/conversations/${conv}/runs`, { request: 'tighten the first paragraph', sandboxDocumentId: docs['open'] });
    expect(res.status).toBe(201);
    const run = (await res.json()) as Run;
    // opening the editor on a draft, and drafting into it, pins nothing — not the draft itself
    expect(await db.select().from(s.attachedSources).where(eq(s.attachedSources.conversationId, conv))).toEqual([]);
    const [plan] = await db.select().from(s.plans).where(eq(s.plans.runId, run.id));
    expect(plan!.workingSet).toBeNull();
    expect(run.workingSet).toBeUndefined();
  });

  it('the editor’s runs are handed the document-bound conversation’s pins too', async () => {
    const conv = await conversation('bram', docs['open']);
    await pin('bram', conv, docs['team']!);
    lastPrompt = '';
    const res = await post('bram', `/conversations/${conv}/runs`, { request: 'use my team draft', sandboxDocumentId: docs['open'] });
    expect(res.status).toBe(201);
    expect(lastPrompt).toContain('B team draft');
    expect(((await res.json()) as Run).workingSet).toEqual([{ sandboxDocumentId: docs['team'], label: 'B team draft', openToYou: true }]);
  });
});

describe('the set is visible to the working area’s participants only — owner, a co-member, an outsider', () => {
  let threadConv: string;
  let hiddenConv: string;
  let runId: string;
  let hiddenRunId: string;

  beforeAll(async () => {
    // a document-bound thread on the whole-firm draft: bram pins three drafts
    // from three different working areas and asks
    threadConv = await conversation('bram', docs['open']);
    for (const key of ['open', 'team', 'narrow']) expect((await pin('bram', threadConv, docs[key]!)).status).toBe(201);
    const res = await post('bram', `/conversations/${threadConv}/runs`, { request: 'what have we missed?', sandboxDocumentId: docs['open'] });
    runId = ((await res.json()) as Run).id;

    // and a thread whose every pinned draft is in a working area bea is not in
    hiddenConv = await conversation('bram', docs['open']);
    for (const key of ['team', 'narrow']) expect((await pin('bram', hiddenConv, docs[key]!)).status).toBe(201);
    const hidden = await post('bram', `/conversations/${hiddenConv}/runs`, { request: 'what have we missed?', sandboxDocumentId: docs['open'] });
    hiddenRunId = ((await hidden.json()) as Run).id;
  });

  const threadSet = async (who: string, conv: string) => {
    const res = await get(who, `/conversations/${conv}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: Run[] };
    return { text: JSON.stringify(body), set: body.runs[0]?.workingSet };
  };
  const labelsOf = (set: Run['workingSet']) =>
    (set ?? []).map((entry) => (entry.openToYou ? entry.label : `${entry.label} (not open)`)).sort();

  it('the owner (in all three working areas) sees all three', async () => {
    const { set } = await threadSet('bram', threadConv);
    expect(labelsOf(set)).toEqual(['B narrow draft', 'B open draft', 'B team draft']);
    for (const entry of set ?? []) expect(entry.openToYou).toBe(true);
  });

  it('a co-member of the team working area opens the drafts in the areas they are in, and reads the title of the rest', async () => {
    const { set, text } = await threadSet('bo', threadConv);
    expect(labelsOf(set)).toEqual(['B narrow draft (not open)', 'B open draft', 'B team draft']);
    // the title is public; the id is not
    expect(text).not.toContain(docs['narrow']!);
  });

  it('a project member in none of the pinned working areas reads both titles, opens neither, and gets no id', async () => {
    const { set, text } = await threadSet('bea', hiddenConv);
    expect(labelsOf(set)).toEqual(['B narrow draft (not open)', 'B team draft (not open)']);
    for (const entry of set ?? []) expect(entry).not.toHaveProperty('sandboxDocumentId');
    expect(text).not.toContain(docs['team']!);
    expect(text).not.toContain(docs['narrow']!);
  });

  it('the run read and the plan read apply the same rule', async () => {
    const run = (await (await get('bea', `/runs/${runId}`)).json()) as Run;
    expect(labelsOf(run.workingSet)).toEqual(['B narrow draft (not open)', 'B open draft', 'B team draft (not open)']);
    const plan = (await (await get('bea', `/runs/${hiddenRunId}/plan`)).json()) as GetRunPlanResponse;
    expect(labelsOf(plan.plan.workingSet)).toEqual(['B narrow draft (not open)', 'B team draft (not open)']);
    expect(JSON.stringify(plan)).not.toContain(docs['narrow']!);
    // and the shared-thread read of the pins themselves
    const pins = (await (await get('bea', `/conversations/${hiddenConv}/attached-sources`)).json()) as { items: AttachedSource[] };
    expect(pins.items).toHaveLength(2);
    for (const item of pins.items) expect(item).toMatchObject({ openToYou: false, ref: '' });
    expect(pins.items.map((item) => item.label).sort()).toEqual(['B narrow draft', 'B team draft']);
    expect(JSON.stringify(pins)).not.toContain('pinnedBy');
    const own = (await (await get('bram', `/conversations/${hiddenConv}/attached-sources`)).json()) as { items: AttachedSource[] };
    expect(own.items.map((item) => item.label).sort()).toEqual(['B narrow draft', 'B team draft']);
  });

  it('a draft deleted for good keeps its title on the past run, marked removed, for every reader', async () => {
    const [orgRow] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, docs['narrow']!));
    // a thread of its own, so the purge does not disturb the other tests
    const conv = await conversation('bram', docs['open']);
    const [extraId] = [await makeDoc('purgeme', 'B purge-me draft', 'narrow', orgB, 'bram')];
    expect((await pin('bram', conv, extraId!)).status).toBe(201);
    expect((await pin('bram', conv, docs['team']!)).status).toBe(201);
    const made = await post('bram', `/conversations/${conv}/runs`, { request: 'a question', sandboxDocumentId: docs['open'] });
    const purgeRunId = ((await made.json()) as Run).id;
    const before = (await (await get('bram', `/runs/${purgeRunId}/plan`)).json()) as GetRunPlanResponse;
    expect(before.plan.workingSet).toContainEqual({ sandboxDocumentId: extraId, label: 'B purge-me draft', openToYou: true });

    const [admin] = await db.select().from(s.users).where(eq(s.users.organisationId, orgB)).limit(1);
    const result = await purgeSandboxDocument(db, { documentId: extraId!, projectId, organisationId: orgRow!.organisationId, userId: admin!.id });
    expect(result).not.toBeNull();

    for (const who of ['bram', 'bea']) {
      const plan = (await (await get(who, `/runs/${purgeRunId}/plan`)).json()) as GetRunPlanResponse;
      const gone = plan.plan.workingSet!.find((entry) => entry.label === 'B purge-me draft');
      expect(gone).toEqual({ label: 'B purge-me draft', openToYou: false, removed: true });
      const run = (await (await get(who, `/runs/${purgeRunId}`)).json()) as Run;
      expect(run.workingSet!.find((entry) => entry.label === 'B purge-me draft')).toMatchObject({ removed: true });
    }
    // the recorded plan itself is never rewritten
    const [stored] = await db.select().from(s.plans).where(eq(s.plans.runId, purgeRunId));
    expect(stored!.workingSet).toContainEqual({ sandboxDocumentId: extraId, label: 'B purge-me draft' });
  });

  it('another firm sees no run at all — the thread is the producing firm’s, and the set was never theirs', async () => {
    const thread = await get('clio', `/conversations/${threadConv}`);
    expect(thread.status).toBe(200);
    expect(((await thread.json()) as { runs: Run[] }).runs).toEqual([]);
    expect((await get('clio', `/runs/${runId}`)).status).toBe(404);
  });
});

describe('findings and the plan read apply the same per-reader rule (T-471 review)', () => {
  let runId: string;

  beforeAll(async () => {
    const conv = await conversation('bram', docs['open']);
    const res = await post('bram', `/conversations/${conv}/runs`, { request: 'a check', sandboxDocumentId: docs['open'] });
    runId = ((await res.json()) as Run).id;
    const anchor = { start: 0, end: 1, quote: 'x' };
    for (const key of ['narrow', 'team']) {
      await db.insert(s.findings).values({
        runId,
        sandboxDocumentId: docs['open']!,
        checkFamily: 'corpus_accuracy',
        input: 'attached',
        evidence: { input: 'attached', attachedSourceId: docs[key]!, excerpt: `${key === 'narrow' ? 'B narrow draft' : 'B team draft'}: secret body of ${key}` },
        anchor,
        defect: `contradicts the ${key} draft`,
        severity: 'advisory',
      });
    }
    // a checker plan step naming both attached drafts, as the checker's bound parameter does
    const [plan] = await db.select().from(s.plans).where(eq(s.plans.runId, runId));
    await db.insert(s.planSteps).values({
      planId: plan!.id,
      ordinal: 99,
      stage: 'analyse',
      inputs: { attached_document_ids: [docs['narrow'], docs['team']] },
      dependsOn: [],
    });
  });

  const findingsFor = async (who: string) => {
    const res = await get(who, `/sandbox-documents/${docs['open']}/findings`);
    expect(res.status).toBe(200);
    const text = await res.text();
    return { text, items: (JSON.parse(text) as { items: Array<{ defect: string; evidence: { excerpt?: string; label?: string; openToYou?: boolean; attachedSourceId?: string } }> }).items };
  };

  it('the owner of both working areas reads both excerpts', async () => {
    const { items } = await findingsFor('bram');
    expect(items.map((i) => i.evidence.excerpt).sort()).toEqual(['B narrow draft: secret body of narrow', 'B team draft: secret body of team']);
  });

  it('a team member reads the team excerpt only; the other finding stays, with its title, no quote and no id', async () => {
    const { items, text } = await findingsFor('bo');
    expect(items).toHaveLength(2);
    const narrow = items.find((i) => i.defect.includes('narrow'))!;
    expect(narrow.evidence).toEqual({ input: 'attached', label: expect.any(String), openToYou: false, excerpt: '' });
    expect(narrow.evidence.label).not.toBe('');
    expect(narrow.evidence).not.toHaveProperty('attachedSourceId');
    const team = items.find((i) => i.defect.includes('team'))!;
    expect(team.evidence.excerpt).toContain('secret body of team');
    expect(team.evidence.attachedSourceId).toBe(docs['team']);
    expect(text).not.toContain('secret body of narrow');
    expect(text).not.toContain(docs['narrow']!);
  });

  it('a member in neither reads the findings and the two titles, marked not open — but no excerpt and no id', async () => {
    const { items, text } = await findingsFor('bea');
    expect(items).toHaveLength(2);
    for (const item of items) expect(item.evidence).toMatchObject({ openToYou: false, excerpt: '' });
    expect(items.map((i) => i.evidence.label).sort()).toEqual(['B narrow draft', 'B team draft']);
    for (const item of items) expect(item.evidence).not.toHaveProperty('attachedSourceId');
    for (const secret of ['secret body', docs['narrow']!, docs['team']!]) {
      expect(text).not.toContain(secret);
    }
  });

  const attachedOf = (body: GetRunPlanResponse) =>
    body.plan.steps.find((step) => step.ordinal === 99)!.inputs['attached_document_ids'];

  it('the plan read shows an id only to a reader in its working area; the rest read "hidden", count kept', async () => {
    const read = async (who: string) => (await (await get(who, `/runs/${runId}/plan`)).json()) as GetRunPlanResponse;
    expect(attachedOf(await read('bram'))).toEqual([docs['narrow'], docs['team']]);
    expect(attachedOf(await read('bo'))).toEqual(['hidden', docs['team']]);
    expect(attachedOf(await read('bea'))).toEqual(['hidden', 'hidden']);
  });
});

describe('a file uploaded for a one-off check is read by the person who ran it, and nobody else (T-484 review)', () => {
  const handle = crypto.randomUUID();
  const quote = 'uploaded-file quote: the pile cap is 600 mm';

  beforeAll(async () => {
    const conv = await conversation('bram', docs['open']);
    const res = await post('bram', `/conversations/${conv}/runs`, { request: 'a check with an upload', sandboxDocumentId: docs['open'] });
    const uploadRunId = ((await res.json()) as Run).id;
    await db.insert(s.findings).values({
      runId: uploadRunId,
      sandboxDocumentId: docs['open']!,
      checkFamily: 'corpus_accuracy',
      input: 'attached',
      evidence: { input: 'attached', attachedSourceId: handle, excerpt: quote, label: 'pile-note.docx' },
      anchor: { start: 0, end: 1, quote: 'x' },
      defect: 'contradicts the uploaded pile note',
      severity: 'advisory',
    });
  });

  const mine = async (who: string) => {
    const res = await get(who, `/sandbox-documents/${docs['open']}/findings`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const items = (JSON.parse(text) as { items: Array<{ defect: string; evidence: Record<string, unknown> }> }).items;
    return { text, item: items.find((i) => i.defect === 'contradicts the uploaded pile note')! };
  };

  it('the uploader keeps the quoted text of their own file', async () => {
    const { item } = await mine('bram');
    expect(item.evidence['excerpt']).toBe(quote);
    expect(item.evidence['label']).toBe('pile-note.docx');
  });

  it('a colleague and an outsider see the finding, marked not open, with no quote and no handle', async () => {
    for (const who of ['bo', 'bea']) {
      const { item, text } = await mine(who);
      expect(item.evidence).toMatchObject({ input: 'attached', openToYou: false, excerpt: '' });
      expect(item.evidence).not.toHaveProperty('attachedSourceId');
      expect(text).not.toContain(quote);
      expect(text).not.toContain(handle);
    }
  });
});
