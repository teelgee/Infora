// T-487 acceptance — **a corrected rejected return is "replaced"**, and the
// project owner is not told a draft correction exists (the 2026-10-25 recheck's
// new finding; ADR-0056 §2a and the first addendum's ruling 3).
//
// *In plain terms: when a contractor corrects a return the client rejected, the
// old return stays on record as rejected — its reason must survive — but it is
// no longer the figure that stands. A dashboard and the written analysis count
// the correction once. And while the contractor is still typing the correction
// (a draft), the client sees nothing of it: not the row, and not even that one
// has been started.*
//
// Fresh organisations, project and app per run; every row is looked up by the
// id this file created.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AppRecord,
  AppRowRecord,
  AppRowResponse,
  AppRunRecord,
  AppTableRecord,
  ListAppRowsResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { addStandInScreen } from './app-test-support';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
// the router echoes the FIGURES it was shown, so what a run covered can be read
// off the insight it wrote (the same device apps.test.ts uses)
const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter((system, prompt) =>
    system.includes('about figures that have already been calculated')
      ? `INSIGHT: ${/Table “.+?” — (\d+) current row\(s\) readable\./.exec(prompt)?.[1] ?? '?'} rows, total ${/total ([\d.]+),/.exec(prompt)?.[1] ?? 'none'}`
      : 'unused',
  ),
});

const stamp = Date.now();
const password = 'pw-t487b';

let projectId: string;
let ownerOrg: string;
let contractorOrg: string;
let ownerCookie: string;
let contractorCookie: string;

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
    .values([{ name: `t487 owner ${stamp}` }, { name: `t487 contractor ${stamp}` }])
    .returning();
  [ownerOrg, contractorOrg] = orgs.map((o) => o.id) as [string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t487 replacement project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: contractorOrg, projectId, role: 'member' },
  ]);
  ownerCookie = await session(await makeUser('t487-owen', ownerOrg, true));
  contractorCookie = await session(await makeUser('t487-carla', contractorOrg, true));
});

afterAll(async () => {
  await pool.end();
});

/** A published returns app with an acceptance step, and the insight table a run writes into. */
async function returnsApp(name: string): Promise<{ app: AppRecord; table: AppTableRecord }> {
  const created = (await (
    await post(contractorCookie, `/projects/${projectId}/apps`, {
      name,
      organisationIds: [ownerOrg],
      participantIds: [],
    })
  ).json()) as AppRecord;
  const table = (await (
    await post(contractorCookie, `/apps/${created.id}/tables`, {
      name: 'Monthly returns',
      columns: [
        { key: 'month', label: 'Month', type: 'text', required: true },
        { key: 'landfill', label: 'Waste to landfill (t)', type: 'number', required: true },
      ],
      kind: 'data',
      hasAcceptance: true,
    })
  ).json()) as AppTableRecord;
  await post(contractorCookie, `/apps/${created.id}/tables`, {
    name: 'Insights',
    columns: [{ key: 'x', label: 'x', type: 'text' }],
    kind: 'insight',
  });
  await addStandInScreen((path, init) => app.request(path, init), contractorCookie, created.id);
  expect((await post(contractorCookie, `/apps/${created.id}/publish`)).status).toBe(200);
  return { app: created, table };
}

const rowsOf = async (cookie: string, tableId: string) =>
  ((await (await get(cookie, `/app-tables/${tableId}/rows`)).json()) as ListAppRowsResponse).items;
const byId = (items: AppRowRecord[], id: string) => items.find((row) => row.id === id);

/** The scenario: the contractor submits; the client rejects, with a reason. */
async function rejectedReturn(tableId: string, landfill = 4.6) {
  const entered = (await (
    await post(contractorCookie, `/app-tables/${tableId}/rows`, {
      values: { month: 'October 2026', landfill },
      submit: true,
    })
  ).json()) as AppRowResponse;
  const rejected = await post(ownerCookie, `/app-rows/${entered.row.id}/decision`, {
    decision: 'reject',
    reason: 'Looks like a decimal slip.',
  });
  expect(rejected.status).toBe(200);
  return entered.row;
}

describe('the client is not told a draft correction exists', () => {
  it('shows the original with NO successor while the correction is a draft, and with it once it is submitted', async () => {
    const { table } = await returnsApp(`t487 draft wall ${stamp}`);
    const original = await rejectedReturn(table.id);

    const draft = (await (
      await post(contractorCookie, `/app-rows/${original.id}/correction`, {
        values: { month: 'October 2026', landfill: 14.6 },
        submit: false,
      })
    ).json()) as AppRowResponse;
    expect(draft.row.state).toBe('draft');
    expect(draft.row.supersedesRowId).toBe(original.id);

    // 🔒 the client reads the original as it stood: rejected, reason intact, and
    // no id that would reveal a correction has been started — nor the draft itself
    const asOwner = await rowsOf(ownerCookie, table.id);
    expect(byId(asOwner, original.id)).toMatchObject({
      state: 'rejected',
      rejectionReason: 'Looks like a decimal slip.',
      supersededByRowId: null,
    });
    expect(byId(asOwner, draft.row.id)).toBeUndefined();
    expect(JSON.stringify(asOwner)).not.toContain(draft.row.id);

    // the contractor sees its own draft correction throughout
    const asContractor = await rowsOf(contractorCookie, table.id);
    expect(byId(asContractor, original.id)!.supersededByRowId).toBe(draft.row.id);
    expect(byId(asContractor, draft.row.id)!.state).toBe('draft');

    // submitted, the correction is the client's to read, and the original now
    // says what replaced it
    expect((await post(contractorCookie, `/app-rows/${draft.row.id}/submission`)).status).toBe(200);
    const afterSubmission = await rowsOf(ownerCookie, table.id);
    expect(byId(afterSubmission, original.id)).toMatchObject({
      state: 'rejected',
      rejectionReason: 'Looks like a decimal slip.',
      supersededByRowId: draft.row.id,
    });
    expect(byId(afterSubmission, draft.row.id)!.state).toBe('submitted');
  });

  it('still refuses a SECOND correction of the same row by the organisation that entered it', async () => {
    const { table } = await returnsApp(`t487 second correction ${stamp}`);
    const original = await rejectedReturn(table.id);
    const asContractorBefore = byId(await rowsOf(contractorCookie, table.id), original.id)!;
    expect(asContractorBefore.mayCorrect).toBe(true);

    const first = await post(contractorCookie, `/app-rows/${original.id}/correction`, {
      values: { month: 'October 2026', landfill: 14.6 },
      submit: false,
    });
    expect(first.status).toBe(201);
    // the contractor can read its own draft, so the original is no longer correctable…
    expect(byId(await rowsOf(contractorCookie, table.id), original.id)!.mayCorrect).toBe(false);
    // …and a second attempt is the same 404 as any act the requester may not do
    const second = await post(contractorCookie, `/app-rows/${original.id}/correction`, {
      values: { month: 'October 2026', landfill: 99 },
      submit: false,
    });
    expect(second.status).toBe(404);
    // one correction exists, not two
    const stored = await db.select().from(s.appRows).where(eq(s.appRows.supersedesRowId, original.id));
    expect(stored).toHaveLength(1);
  });

  it('gives the project owner no correction id anywhere in its listing, and no way to act on the original', async () => {
    const { table } = await returnsApp(`t487 single row ${stamp}`);
    const original = await rejectedReturn(table.id);
    await post(contractorCookie, `/app-rows/${original.id}/correction`, {
      values: { month: 'October 2026', landfill: 14.6 },
      submit: false,
    });
    // the owner cannot act on a rejected row, so no single-row response could
    // carry the id either; the listing is the one place it learns of the row
    expect((await post(ownerCookie, `/app-rows/${original.id}/decision`, { decision: 'accept' })).status).toBe(404);
    const listing = await get(ownerCookie, `/app-tables/${table.id}/rows`);
    expect(await listing.text()).not.toContain('"supersededByRowId":"');
  });
});

describe('a run adds up the current rows: the correction, and not the rejected original it replaced', () => {
  const runAs = async (cookie: string, appId: string) =>
    ((await (await post(cookie, `/apps/${appId}/runs`, { trigger: 'manual' })).json()) as { run: AppRunRecord }).run;
  const insightOf = async (cookie: string, run: AppRunRecord) => {
    const insightTable = (
      await db.select().from(s.appTables).where(eq(s.appTables.appId, run.appId))
    ).find((table) => table.kind === 'insight')!;
    const items = await rowsOf(cookie, insightTable.id);
    return items.find((row) => row.id === run.insightRowId)!;
  };

  it('covers the original while the correction is a draft the client cannot read, then the correction alone once it is submitted', async () => {
    const { app: created, table } = await returnsApp(`t487 run ${stamp}`);
    const original = await rejectedReturn(table.id, 4.6);
    const draft = (await (
      await post(contractorCookie, `/app-rows/${original.id}/correction`, {
        values: { month: 'October 2026', landfill: 14.6 },
        submit: false,
      })
    ).json()) as AppRowResponse;

    // the client's run reads what the client may read: the rejected original,
    // which still counts (the ruling that stops that is T-489's, not this
    // ticket's), and nothing of the draft
    const before = await runAs(ownerCookie, created.id);
    expect(before.rowsCovered).toBe(1);
    expect((await insightOf(ownerCookie, before)).values['insight']).toBe('INSIGHT: 1 rows, total 4.6');

    // the contractor's own run reads its own rows: the draft correction, once
    const mine = await runAs(contractorCookie, created.id);
    expect(mine.rowsCovered).toBe(1);
    expect((await insightOf(contractorCookie, mine)).values['insight']).toBe('INSIGHT: 1 rows, total 14.6');

    // submitted, the correction is current and the original is not
    await post(contractorCookie, `/app-rows/${draft.row.id}/submission`);
    const after = await runAs(ownerCookie, created.id);
    expect(after.rowsCovered).toBe(1);
    expect((await insightOf(ownerCookie, after)).values['insight']).toBe('INSIGHT: 1 rows, total 14.6');
  });

  it('does not count a withdrawn row or a row an accepted correction superseded, either', async () => {
    const { app: created, table } = await returnsApp(`t487 run retired ${stamp}`);
    const enter = async (landfill: number, submit: boolean) =>
      ((await (await post(contractorCookie, `/app-tables/${table.id}/rows`, {
        values: { month: 'M', landfill },
        submit,
      })).json()) as AppRowResponse).row;
    const accepted = await enter(10, true);
    await post(ownerCookie, `/app-rows/${accepted.id}/decision`, { decision: 'accept' });
    await post(contractorCookie, `/app-rows/${accepted.id}/correction`, {
      values: { month: 'M', landfill: 11 },
      submit: true,
    });
    // a draft the contractor then withdraws (a submitted row is frozen, a draft is not)
    const withdrawn = await enter(1000, false);
    expect((await post(contractorCookie, `/app-rows/${withdrawn.id}/retirement`)).status).toBe(200);

    // the contractor reads all three rows; only the correction is current
    const listed = await rowsOf(contractorCookie, table.id);
    expect(byId(listed, accepted.id)!.state).toBe('superseded');
    expect(byId(listed, withdrawn.id)!.retiredAt).not.toBeNull();
    const run = await runAs(contractorCookie, created.id);
    expect(run.rowsCovered).toBe(1);
    expect((await insightOf(contractorCookie, run)).values['insight']).toBe('INSIGHT: 1 rows, total 11');
  });
});
