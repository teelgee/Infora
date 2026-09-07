// T-441 acceptance — rows and the acceptance flow, driven over HTTP as each
// party on a genuinely cross-organisation fixture (three firms on one project).
//
// **The cut that matters most is the draft cut, and it is tested BOTH WAYS**
// (the 2026-09-06 addendum, ruling 3): the entering organisation reads its own
// draft, and the project owner and the peer firm read nothing at all — driven
// as those parties, never inferred from the predicate.
//
// **The second is that the DATABASE refuses a rejection with no reason**, not
// only the route: the route's own validation is one line and could be edited
// away, and the constraint is the thing that makes the guarantee survive that.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AppRecord,
  AppRowRecord,
  AppRowResponse,
  AppTableRecord,
  ListAppRowsResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t441';

let projectId: string;
let ownerOrg: string;
let builderOrg: string;
let peerOrg: string;
let ownerCookie: string;
let builderCookie: string;
let peerCookie: string;

async function makeUser(name: string, organisationId: string, mayBuildApps: boolean, elevated: boolean) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: 'admin', mayBuildApps })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated })
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

const rows = async (cookie: string, tableId: string): Promise<AppRowRecord[]> =>
  ((await (await get(cookie, `/app-tables/${tableId}/rows`)).json()) as ListAppRowsResponse).items;

beforeAll(async () => {
  const orgs = await db
    .insert(s.organisations)
    .values([
      { name: `t441 client ${stamp}` },
      { name: `t441 builder ${stamp}` },
      { name: `t441 peer ${stamp}` },
    ])
    .returning();
  [ownerOrg, builderOrg, peerOrg] = orgs.map((o) => o.id) as [string, string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t441 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: builderOrg, projectId, role: 'member' },
    { organisationId: peerOrg, projectId, role: 'member' },
  ]);
  ownerCookie = await session((await makeUser('t441-rhoda', ownerOrg, true, true)).email);
  builderCookie = await session((await makeUser('t441-bella', builderOrg, true, true)).email);
  peerCookie = await session((await makeUser('t441-pia', peerOrg, true, true)).email);
});

afterAll(async () => {
  await pool.end();
});

/** A published app open to all three, with one table of the given shape. */
async function newTable(hasAcceptance: boolean): Promise<{ appId: string; tableId: string }> {
  const created = (await (
    await post(builderCookie, `/projects/${projectId}/apps`, {
      name: `returns ${hasAcceptance ? 'contractual' : 'plain'} ${stamp}-${Math.random()}`,
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
      hasAcceptance,
    })
  ).json()) as AppTableRecord;
  await post(builderCookie, `/apps/${created.id}/publish`);
  return { appId: created.id, tableId: table.id };
}

async function enter(cookie: string, tableId: string, values: unknown, submit: boolean) {
  const res = await post(cookie, `/app-tables/${tableId}/rows`, { values, submit });
  expect(res.status).toBe(201);
  return ((await res.json()) as AppRowResponse).row;
}

describe('a row is stamped with the organisation and the person that entered it', () => {
  it('takes the stamp from the session and never from the request', async () => {
    const { tableId } = await newTable(false);
    const row = await enter(builderCookie, tableId, { month: 'August 2026', landfill: 12.4 }, false);
    expect(row.organisationId).toBe(builderOrg);
    expect(row.enteredByName).toBe('t441-bella');
    expect(row.state).toBeNull(); // no acceptance step: the row never changes hands
  });

  it('refuses a column nobody declared, and a missing required figure', async () => {
    const { tableId } = await newTable(false);
    const strayColumn = await post(builderCookie, `/app-tables/${tableId}/rows`, {
      values: { month: 'August 2026', landfill: 1, secret: 'x' },
      submit: false,
    });
    expect(strayColumn.status).toBe(400);
    const missing = await post(builderCookie, `/app-tables/${tableId}/rows`, {
      values: { month: 'August 2026' },
      submit: false,
    });
    expect(missing.status).toBe(400);
  });
});

describe('the draft cut, BOTH ways (the addendum, ruling 3)', () => {
  it('the entering organisation reads its own draft; the project owner and the peer read nothing', async () => {
    const { tableId } = await newTable(true);
    const draft = await enter(builderCookie, tableId, { month: 'August 2026', landfill: 12.4 }, false);
    expect(draft.state).toBe('draft');

    // its own organisation, driven as itself
    expect((await rows(builderCookie, tableId)).map((r) => r.id)).toContain(draft.id);
    // the PROJECT OWNER — the dashboard says "no return yet", which is honest
    expect((await rows(ownerCookie, tableId)).map((r) => r.id)).not.toContain(draft.id);
    // and a peer firm on the same project
    expect((await rows(peerCookie, tableId)).map((r) => r.id)).not.toContain(draft.id);
    // naming the row directly is the same 404 the silence gives
    expect((await post(ownerCookie, `/app-rows/${draft.id}/decision`, { decision: 'accept' })).status)
      .toBe(404);

    // and from `submitted` onward the owner reads it
    await post(builderCookie, `/app-rows/${draft.id}/submission`);
    expect((await rows(ownerCookie, tableId)).map((r) => r.id)).toContain(draft.id);
    // the peer still reads nothing — it is neither the entering organisation
    // nor the project owner, and no share is open
    expect((await rows(peerCookie, tableId)).map((r) => r.id)).not.toContain(draft.id);
  });

  it('a table with no acceptance step has no draft to hide: the owner reads the row at once', async () => {
    const { tableId } = await newTable(false);
    const row = await enter(builderCookie, tableId, { month: 'July 2026', landfill: 9.8 }, false);
    expect((await rows(ownerCookie, tableId)).map((r) => r.id)).toContain(row.id);
  });
});

describe('the read predicate exactly as ruled, and a revoked share goes dark', () => {
  it('a peer firm reads a submitted row only while the owner’s share is open', async () => {
    const { tableId } = await newTable(true);
    const row = await enter(builderCookie, tableId, { month: 'June 2026', landfill: 11.2 }, true);
    expect((await rows(peerCookie, tableId)).map((r) => r.id)).not.toContain(row.id);

    const shared = (await (
      await post(ownerCookie, `/app-tables/${tableId}/shares`, { organisationId: peerOrg })
    ).json()) as AppTableRecord;
    expect((await rows(peerCookie, tableId)).map((r) => r.id)).toContain(row.id);

    await post(ownerCookie, `/app-tables/${tableId}/shares/${shared.shares[0]!.id}/revocation`);
    expect((await rows(peerCookie, tableId)).map((r) => r.id)).not.toContain(row.id);
  });

  it('a share never reaches the peer’s DRAFTS, only what has been submitted', async () => {
    const { tableId } = await newTable(true);
    const draft = await enter(builderCookie, tableId, { month: 'May 2026', landfill: 4.6 }, false);
    await post(ownerCookie, `/app-tables/${tableId}/shares`, { organisationId: peerOrg });
    expect((await rows(peerCookie, tableId)).map((r) => r.id)).not.toContain(draft.id);
  });
});

describe('accept and reject — and a rejection carries a reason', () => {
  it('accepting is the project owner’s act, stamped with the decider, and the submitter cannot do it', async () => {
    const { tableId } = await newTable(true);
    const row = await enter(builderCookie, tableId, { month: 'April 2026', landfill: 10.1 }, true);
    // the submitting organisation cannot accept its own return
    expect((await post(builderCookie, `/app-rows/${row.id}/decision`, { decision: 'accept' })).status)
      .toBe(404);
    const decided = (await (
      await post(ownerCookie, `/app-rows/${row.id}/decision`, { decision: 'accept' })
    ).json()) as AppRowResponse;
    expect(decided.row.state).toBe('accepted');
    expect(decided.row.decidedByName).toBe('t441-rhoda');
    expect(decided.row.decidedAt).not.toBeNull();
  });

  it('the route refuses a rejection with no reason, and the DATABASE refuses it too', async () => {
    const { tableId } = await newTable(true);
    const row = await enter(builderCookie, tableId, { month: 'March 2026', landfill: 8.2 }, true);
    const noReason = await post(ownerCookie, `/app-rows/${row.id}/decision`, { decision: 'reject' });
    expect(noReason.status).toBe(400);

    // and the guarantee does not rest on that line: going straight at the store
    // with the route removed from the picture is still refused. The decider
    // pair is filled in properly (review 2026-09-07: it used to be left null,
    // so a DIFFERENT constraint fired and this one was never actually proved)
    const [stored] = await db
      .select({ enteredBy: s.appRows.enteredByParticipantId })
      .from(s.appRows)
      .where(eq(s.appRows.id, row.id));
    const direct = await db
      .update(s.appRows)
      .set({ state: 'rejected', decidedByParticipantId: stored!.enteredBy, decidedAt: new Date() })
      .where(eq(s.appRows.id, row.id))
      .then(
        () => null,
        (e: unknown) => e as Error & { cause?: Error },
      );
    expect(`${direct?.message ?? ''} ${direct?.cause?.message ?? ''}`).toMatch(
      /app_rows_rejection_reason_iff_rejected/,
    );
  });

  it('the reason reaches the submitting organisation, on the row', async () => {
    const { tableId } = await newTable(true);
    const row = await enter(builderCookie, tableId, { month: 'February 2026', landfill: 4.6 }, true);
    await post(ownerCookie, `/app-rows/${row.id}/decision`, {
      decision: 'reject',
      reason: 'Landfill figure looks like a decimal slip. Please check and resubmit.',
    });
    const mine = (await rows(builderCookie, tableId)).find((r) => r.id === row.id)!;
    expect(mine.state).toBe('rejected');
    expect(mine.rejectionReason).toMatch(/decimal slip/);
    expect(mine.decidedByName).toBe('t441-rhoda');
  });
});

describe('acceptance is when a row becomes the owner’s record', () => {
  it('an accepted row cannot be edited, retired or deleted by the organisation that entered it', async () => {
    const { tableId } = await newTable(true);
    const row = await enter(builderCookie, tableId, { month: 'January 2026', landfill: 7.7 }, true);
    await post(ownerCookie, `/app-rows/${row.id}/decision`, { decision: 'accept' });

    expect((await patch(builderCookie, `/app-rows/${row.id}`, { values: { month: 'January 2026', landfill: 0.7 } })).status)
      .toBe(404);
    expect((await post(builderCookie, `/app-rows/${row.id}/retirement`)).status).toBe(404);
    // and the database says so too, with the route out of the picture
    const direct = await db
      .update(s.appRows)
      .set({ values: { month: 'January 2026', landfill: 0.7 } })
      .where(eq(s.appRows.id, row.id))
      .then(
        () => null,
        (e: unknown) => e as Error & { cause?: Error },
      );
    expect(`${direct?.message ?? ''} ${direct?.cause?.message ?? ''}`).toMatch(/is accepted/);
  });

  it('a correction is a NEW row: the accepted one is superseded and still shows', async () => {
    const { tableId } = await newTable(true);
    const row = await enter(builderCookie, tableId, { month: 'December 2025', landfill: 4.6 }, true);
    await post(ownerCookie, `/app-rows/${row.id}/decision`, { decision: 'accept' });
    const correction = (await (
      await post(builderCookie, `/app-rows/${row.id}/correction`, {
        values: { month: 'December 2025', landfill: 14.6 },
        submit: true,
      })
    ).json()) as AppRowResponse;
    expect(correction.row.supersedesRowId).toBe(row.id);

    const listed = await rows(builderCookie, tableId);
    const old = listed.find((r) => r.id === row.id)!;
    expect(old.state).toBe('superseded');
    expect(old.supersededByRowId).toBe(correction.row.id);
  });

  it('a REJECTED row keeps its state and its reason when corrected, and reads as superseded', async () => {
    // the deviation, asserted rather than left implicit: `rejection_reason` is
    // non-null iff the state is `rejected`, so flipping the row would erase the
    // reason ruling 4 exists to preserve
    const { tableId } = await newTable(true);
    const row = await enter(builderCookie, tableId, { month: 'November 2025', landfill: 4.6 }, true);
    await post(ownerCookie, `/app-rows/${row.id}/decision`, {
      decision: 'reject',
      reason: 'Decimal slip.',
    });
    await post(builderCookie, `/app-rows/${row.id}/correction`, {
      values: { month: 'November 2025', landfill: 14.6 },
      submit: true,
    });
    const old = (await rows(builderCookie, tableId)).find((r) => r.id === row.id)!;
    expect(old.state).toBe('rejected');
    expect(old.rejectionReason).toBe('Decimal slip.');
    expect(old.supersededByRowId).not.toBeNull();
  });
});

describe('a departed firm’s rows (ADR-0056 §7’s split)', () => {
  it('what was accepted stays readable; what never changed hands goes dark', async () => {
    // added in review 2026-09-07, with the wiring itself: only acceptance
    // changes hands, so when the entering firm leaves the project its
    // accepted rows remain the owner's record and its submitted ones do not
    const { tableId } = await newTable(true);
    const kept = await enter(builderCookie, tableId, { month: 'May 2026', landfill: 3.3 }, true);
    await post(ownerCookie, `/app-rows/${kept.id}/decision`, { decision: 'accept' });
    const pending = await enter(builderCookie, tableId, { month: 'June 2026', landfill: 5.5 }, true);

    // the builder firm leaves the project entirely
    const [membership] = await db
      .delete(s.memberships)
      .where(eq(s.memberships.organisationId, builderOrg))
      .returning();

    try {
      const listed = await rows(ownerCookie, tableId);
      expect(listed.map((r) => r.id)).toContain(kept.id);
      expect(listed.map((r) => r.id)).not.toContain(pending.id);
    } finally {
      // put the firm back for the tests that follow
      await db.insert(s.memberships).values({
        organisationId: builderOrg,
        projectId: membership!.projectId,
        role: membership!.role,
      });
    }
  });
});

describe('an edit before a decision keeps the prior version', () => {
  it('replaces the figures and keeps the old ones as a row of their own, out of the list', async () => {
    const { tableId } = await newTable(true);
    const row = await enter(builderCookie, tableId, { month: 'October 2025', landfill: 1.1 }, false);
    const edited = (await (
      await patch(builderCookie, `/app-rows/${row.id}`, {
        values: { month: 'October 2025', landfill: 2.2 },
      })
    ).json()) as AppRowResponse;
    expect(edited.row.values['landfill']).toBe(2.2);
    expect(edited.row.previousVersionId).not.toBeNull();

    // the archived version is kept in the store and is NOT a second row on
    // screen — it is history of the row above it
    const listed = await rows(builderCookie, tableId);
    expect(listed.filter((r) => r.appTableId === tableId && r.id === edited.row.previousVersionId)).toHaveLength(0);
    const [stored] = await db
      .select()
      .from(s.appRows)
      .where(eq(s.appRows.id, edited.row.previousVersionId!));
    expect((stored!.values as { landfill: number }).landfill).toBe(1.1);
  });

  it('retiring an unaccepted row is a retire, never a delete — the past insight still resolves', async () => {
    const { tableId } = await newTable(true);
    const row = await enter(builderCookie, tableId, { month: 'September 2025', landfill: 3.3 }, false);
    const retired = (await (await post(builderCookie, `/app-rows/${row.id}/retirement`)).json()) as AppRowResponse;
    expect(retired.row.retiredAt).not.toBeNull();
    const [stored] = await db.select().from(s.appRows).where(eq(s.appRows.id, row.id));
    expect(stored).toBeDefined(); // still there
  });
});
