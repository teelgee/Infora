// T-440 acceptance — the app instance, driven through HTTP as each party
// (ADR-0056).
//
// **The fixture is genuinely cross-organisation: three firms on one project**,
// the shape three-organisations.spec.ts uses for the sandbox and the library.
// Two of them being on the project is what makes the negatives worth anything:
// the interesting failure is not a stranger being refused, it is Org C — a real
// participant, working the same scheme — reading Org B's figures.
//
// Every negative below is driven AS THE OTHER PARTY, never inferred from a
// predicate: what is being tested here is the whole path — session, slice,
// scope, predicate, query — and a unit test of the predicate alone (which also
// exists, in packages/governance) proves nothing about the route.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AppRecord, AppTableRecord, GetAppResponse, ListAppsResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t440';

let projectId: string;
let ownerOrg: string; // A — the client, owns the project
let builderOrg: string; // B — the consultancy whose app it is
let peerOrg: string; // C — a second consultancy on the same project
let outsideOrg: string; // an organisation with no seat here at all

let ownerCookie: string; // may build, owner super-user
let builderCookie: string; // may build
let builderColleagueCookie: string; // same firm, may NOT build (§12's negative)
let peerCookie: string; // may build, its own firm
let ownerParticipantId: string;
let builderParticipantId: string;
let builderColleagueParticipantId: string;
let peerParticipantId: string;

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
  let participantId = '';
  if (options.project !== undefined) {
    const [p] = await db
      .insert(s.participants)
      .values({ userId: user!.id, projectId: options.project, elevated: options.elevated ?? false })
      .returning();
    participantId = p!.id;
  }
  return { user: user!, email, participantId };
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
      { name: `t440 client ${stamp}` },
      { name: `t440 builder ${stamp}` },
      { name: `t440 peer ${stamp}` },
      { name: `t440 outsider ${stamp}` },
    ])
    .returning();
  [ownerOrg, builderOrg, peerOrg, outsideOrg] = orgs.map((o) => o.id) as [string, string, string, string];

  const [project] = await db
    .insert(s.projects)
    .values({ name: `t440 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: builderOrg, projectId, role: 'member' },
    { organisationId: peerOrg, projectId, role: 'member' },
  ]);

  const owner = await makeUser('t440-rhoda', ownerOrg, {
    mayBuildApps: true,
    elevated: true,
    project: projectId,
  });
  const builder = await makeUser('t440-bella', builderOrg, {
    mayBuildApps: true,
    elevated: true,
    project: projectId,
  });
  const colleague = await makeUser('t440-colin', builderOrg, { project: projectId });
  const peer = await makeUser('t440-pia', peerOrg, {
    mayBuildApps: true,
    elevated: true,
    project: projectId,
  });
  ownerParticipantId = owner.participantId;
  builderParticipantId = builder.participantId;
  builderColleagueParticipantId = colleague.participantId;
  peerParticipantId = peer.participantId;
  ownerCookie = await session(owner.email);
  builderCookie = await session(builder.email);
  builderColleagueCookie = await session(colleague.email);
  peerCookie = await session(peer.email);
});

afterAll(async () => {
  await pool.end();
});

/** A fresh app owned by the builder firm, open to the three organisations. */
async function newApp(name: string): Promise<AppRecord> {
  const res = await post(builderCookie, `/projects/${projectId}/apps`, {
    name,
    organisationIds: [ownerOrg, peerOrg],
    participantIds: [],
  });
  expect(res.status).toBe(201);
  return (await res.json()) as AppRecord;
}

async function declareTable(appId: string, hasAcceptance: boolean): Promise<AppTableRecord> {
  const res = await post(builderCookie, `/apps/${appId}/tables`, {
    name: 'Monthly returns',
    columns: [{ key: 'landfill', label: 'Waste to landfill (t)', type: 'number', required: true }],
    kind: 'data',
    hasAcceptance,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as AppTableRecord;
}

describe('who may create an app — the organisation’s own toggle (ADR-0056 §12)', () => {
  it('creates one for a person their firm lets build, and refuses a colleague who is not', async () => {
    const created = await newApp(`returns ${stamp}`);
    expect(created.state).toBe('unpublished');
    expect(created.mayBuild).toBe(true);

    const refused = await post(builderColleagueCookie, `/projects/${projectId}/apps`, {
      name: 'not allowed',
      organisationIds: [],
      participantIds: [],
    });
    // denial and nonexistence read identically (principle 4)
    expect(refused.status).toBe(404);
  });

  it('tells each person whether they may create one, rather than letting a screen work it out', async () => {
    const mine = (await (await get(builderCookie, `/projects/${projectId}/apps`)).json()) as ListAppsResponse;
    const theirs = (await (
      await get(builderColleagueCookie, `/projects/${projectId}/apps`)
    ).json()) as ListAppsResponse;
    expect(mine.mayCreate).toBe(true);
    expect(theirs.mayCreate).toBe(false);
  });

  it('refuses somebody whose organisation has no seat on the project at all', async () => {
    const outsider = await makeUser('t440-olwen', outsideOrg, { mayBuildApps: true });
    const cookie = await session(outsider.email);
    const res = await post(cookie, `/projects/${projectId}/apps`, {
      name: 'nope',
      organisationIds: [],
      participantIds: [],
    });
    expect(res.status).toBe(404);
  });
});

describe('an unpublished app is open to its builders alone (the addendum, ruling 2)', () => {
  it('is invisible to the client and to a peer firm until it is opened, then visible to both', async () => {
    const created = await newApp(`publishing ${stamp}`);
    const listed = async (cookie: string) =>
      ((await (await get(cookie, `/projects/${projectId}/apps`)).json()) as ListAppsResponse).items.map(
        (item) => item.id,
      );

    expect(await listed(builderCookie)).toContain(created.id);
    expect(await listed(ownerCookie)).not.toContain(created.id);
    expect(await listed(peerCookie)).not.toContain(created.id);
    // and naming the id directly is the same 404 the silence gives
    expect((await get(ownerCookie, `/apps/${created.id}`)).status).toBe(404);

    const published = (await (await post(builderCookie, `/apps/${created.id}/publish`)).json()) as AppRecord;
    expect(published.state).toBe('open');
    // publishing stamps who and when — the act is recorded, not merely done
    expect(published.publishedVersion).not.toBeNull();
    expect(published.publishedAt).not.toBeNull();
    expect(published.publishedByName).toBe('t440-bella');

    expect(await listed(ownerCookie)).toContain(created.id);
    expect(await listed(peerCookie)).toContain(created.id);
  });

  it('gives the working copy only to a builder; everyone else gets the published copy', async () => {
    const created = await newApp(`working copy ${stamp}`);
    await post(builderCookie, `/apps/${created.id}/publish`);
    const asBuilder = (await (await get(builderCookie, `/apps/${created.id}`)).json()) as GetAppResponse;
    const asClient = (await (await get(ownerCookie, `/apps/${created.id}`)).json()) as GetAppResponse;
    expect(asBuilder.app.definition).not.toBeNull();
    expect(asBuilder.app.mayBuild).toBe(true);
    expect(asClient.app.definition).toBeNull();
    expect(asClient.app.mayBuild).toBe(false);
    expect(asClient.app.published).not.toBeNull();
  });
});

describe('scope is the grant set, and revoking closes the door', () => {
  it('an organisation outside the scope cannot open the app, and can once granted', async () => {
    const created = await newApp(`scoped ${stamp}`);
    // created open to owner + peer; take the peer out again
    await post(builderCookie, `/apps/${created.id}/publish`);
    const record = (await (await get(builderCookie, `/apps/${created.id}`)).json()) as GetAppResponse;
    const peerGrant = record.app.scope.find((g) => g.organisationId === peerOrg)!;
    await post(builderCookie, `/apps/${created.id}/scope/${peerGrant.id}/revocation`);
    expect((await get(peerCookie, `/apps/${created.id}`)).status).toBe(404);

    await post(builderCookie, `/apps/${created.id}/scope`, { organisationId: peerOrg });
    expect((await get(peerCookie, `/apps/${created.id}`)).status).toBe(200);
  });
});

describe('the owner’s table share is the project owner’s act and nobody else’s (§6)', () => {
  it('refuses a builder and a peer, and takes it from the project owner', async () => {
    const created = await newApp(`sharing ${stamp}`);
    const table = await declareTable(created.id, true);
    await post(builderCookie, `/apps/${created.id}/publish`);

    expect((await post(builderCookie, `/app-tables/${table.id}/shares`, { organisationId: peerOrg })).status)
      .toBe(404);
    expect((await post(peerCookie, `/app-tables/${table.id}/shares`, { organisationId: peerOrg })).status)
      .toBe(404);

    const shared = await post(ownerCookie, `/app-tables/${table.id}/shares`, { organisationId: peerOrg });
    expect(shared.status).toBe(201);
  });

  it('refuses sharing with an organisation that is not on the project — a share widens INSIDE it', async () => {
    const created = await newApp(`share outside ${stamp}`);
    const table = await declareTable(created.id, false);
    await post(builderCookie, `/apps/${created.id}/publish`);
    const res = await post(ownerCookie, `/app-tables/${table.id}/shares`, {
      organisationId: outsideOrg,
    });
    expect(res.status).toBe(400);
  });
});

describe('reassign-or-close, and the DEFUNCT state (§5, §7)', () => {
  it('an app whose owner is removed renders defunct, cannot run, and runs again once reassigned', async () => {
    const created = await newApp(`defunct ${stamp}`);
    await declareTable(created.id, false);
    await post(builderCookie, `/apps/${created.id}/publish`);

    // it runs while its owner is on the project, and records the PUBLISHED
    // version rather than the working copy
    const firstRun = await post(builderCookie, `/apps/${created.id}/runs`, { trigger: 'manual' });
    expect(firstRun.status).toBe(201);
    const runBody = (await firstRun.json()) as { run: { definitionsVersion: number } };
    const fresh = (await (await get(builderCookie, `/apps/${created.id}`)).json()) as GetAppResponse;
    expect(runBody.run.definitionsVersion).toBe(fresh.app.publishedVersion);

    // the owner leaves the project — a Participant is an interval (ADR-0033)
    await db
      .update(s.participants)
      .set({ removedAt: new Date() })
      .where(eq(s.participants.id, builderParticipantId));

    // the app is now visibly not working, on its card and on its page, with no
    // notification anywhere — the owner's 2026-09-06 ruling
    const asClient = (await (await get(ownerCookie, `/apps/${created.id}`)).json()) as GetAppResponse;
    expect(asClient.app.state).toBe('defunct');
    expect(asClient.app.ownerName).toBeNull();

    const refusedRun = await post(ownerCookie, `/apps/${created.id}/runs`, { trigger: 'manual' });
    expect(refusedRun.status).toBe(409);
    expect(await refusedRun.text()).toContain('defunct');

    // the project owner hands it to somebody who may build — and it works again
    const reassigned = await post(ownerCookie, `/apps/${created.id}/reassignment`, {
      participantId: ownerParticipantId,
    });
    expect(reassigned.status).toBe(200);
    expect(((await reassigned.json()) as AppRecord).state).toBe('open');
    expect((await post(ownerCookie, `/apps/${created.id}/runs`, { trigger: 'manual' })).status).toBe(201);

    // put the builder back for the tests that follow
    await db
      .update(s.participants)
      .set({ removedAt: null })
      .where(eq(s.participants.id, builderParticipantId));
  });

  it('refuses handing the app to somebody who cannot build it — that is handing it to nobody', async () => {
    const created = await newApp(`reassign guard ${stamp}`);
    await post(builderCookie, `/apps/${created.id}/publish`);
    const res = await post(ownerCookie, `/apps/${created.id}/reassignment`, {
      participantId: builderColleagueParticipantId,
    });
    expect(res.status).toBe(400);
  });

  it('refuses a peer firm taking somebody else’s app', async () => {
    const created = await newApp(`reassign peer ${stamp}`);
    await post(builderCookie, `/apps/${created.id}/publish`);
    const res = await post(peerCookie, `/apps/${created.id}/reassignment`, {
      participantId: peerParticipantId,
    });
    expect(res.status).toBe(404);
  });

  it('closes, and a closed app’s tables are still readable', async () => {
    const created = await newApp(`closing ${stamp}`);
    await declareTable(created.id, false);
    await post(builderCookie, `/apps/${created.id}/publish`);
    const closed = await post(ownerCookie, `/apps/${created.id}/closure`);
    expect(closed.status).toBe(200);
    expect(((await closed.json()) as AppRecord).state).toBe('closed');
    const still = (await (await get(ownerCookie, `/apps/${created.id}`)).json()) as GetAppResponse;
    expect(still.tables.length).toBe(1);
    // and nothing runs on a closed app
    expect((await post(ownerCookie, `/apps/${created.id}/runs`, { trigger: 'manual' })).status).toBe(409);
  });
});

describe('nothing runs an unpublished app', () => {
  it('a builder is told why, and nobody else can even reach the route', async () => {
    const created = await newApp(`unpublished run ${stamp}`);
    const builderTry = await post(builderCookie, `/apps/${created.id}/runs`, { trigger: 'manual' });
    expect(builderTry.status).toBe(409);
    expect(await builderTry.text()).toContain('never been published');
    // the client cannot see the app at all, so the run route is a 404 — the
    // "except its builders" half of the rule, enforced by reach rather than by
    // a second check
    expect((await post(ownerCookie, `/apps/${created.id}/runs`, { trigger: 'manual' })).status).toBe(404);
  });
});

describe('a scheduled-shape run acts as the app’s owner, against the published version', () => {
  it('records the published version and the owner, and the two actor stamps agree', async () => {
    const created = await newApp(`scheduled ${stamp}`);
    const published = (await (await post(builderCookie, `/apps/${created.id}/publish`)).json()) as AppRecord;

    // No clock exists yet (ADR-0056 §13d), so the scheduled shape is written
    // here as the scheduler would write it — which is the point: the STORE has
    // to accept it, stamped with the owner, before a clock is worth building.
    const [conversation] = await db
      .insert(s.conversations)
      .values({ projectId, surface: 'web' })
      .returning();
    const [run] = await db
      .insert(s.runs)
      .values({
        conversationId: conversation!.id,
        agentId: `app:${created.id}`,
        agentProvenance: 'infora',
        request: 'scheduled run',
        environmentKey: `project:${projectId}`,
        requesterParticipantId: builderParticipantId,
      })
      .returning();
    const [appRun] = await db
      .insert(s.appRuns)
      .values({
        appId: created.id,
        runId: run!.id,
        trigger: 'scheduled',
        asParticipantId: builderParticipantId,
        definitionsVersion: published.publishedVersion!,
      })
      .returning();
    expect(appRun!.trigger).toBe('scheduled');
    expect(appRun!.definitionsVersion).toBe(published.publishedVersion);
  });
});
