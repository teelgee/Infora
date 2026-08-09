// T-360 (S3) acceptance — the org-standard plan columns: per (organisation,
// project) on the Membership row, set by that org's super user, read by every
// member of the org through the plan read, and never leaking across orgs.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GetPlanResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t360';
let projectId: string;
let ownerSuperCookie: string;
let consultSuperCookie: string;
let consultMemberCookie: string;

async function makeUser(name: string, organisationId: string, elevated = false) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId, elevated });
  return user!;
}
async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}
const asJson = (cookie: string) => ({ cookie, 'content-type': 'application/json' });

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: 't360 owner' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't360 consult' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't360 project', ownerOrganisationId: oA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
  ]);
  ownerSuperCookie = await session((await makeUser('t360-oona', oA!.id, true)).email);
  consultSuperCookie = await session((await makeUser('t360-beth', oB!.id, true)).email);
  consultMemberCookie = await session((await makeUser('t360-mona', oB!.id)).email);
});

afterAll(async () => {
  await pool.end();
});

const putColumns = (cookie: string, columns: string[] | null) =>
  app.request(`/projects/${projectId}/plan/columns`, {
    method: 'PUT',
    headers: asJson(cookie),
    body: JSON.stringify({ columns }),
  });
const readPlan = async (cookie: string): Promise<GetPlanResponse> =>
  (await (await app.request(`/projects/${projectId}/plan`, { headers: { cookie } })).json()) as GetPlanResponse;

describe('org-standard plan columns (T-360, S3)', () => {
  it('defaults to null, is set by the org super user, and binds every member of that org — with no personal override path', async () => {
    expect((await readPlan(consultMemberCookie)).planColumns).toBeNull();

    // the default Infora scheme is live on this project — discipline + suitability are real fields
    const set = await putColumns(consultSuperCookie, ['discipline', 'suitability']);
    expect(set.status).toBe(200);

    // the ordinary member sees the org standard on the plan read; there is no
    // per-user store anywhere for this — the membership row is the only home
    expect((await readPlan(consultMemberCookie)).planColumns).toEqual(['discipline', 'suitability']);
    expect((await readPlan(consultSuperCookie)).planColumns).toEqual(['discipline', 'suitability']);
  });

  it('is per organisation: the owner org reads its own setting, not the consultancy\'s', async () => {
    expect((await readPlan(ownerSuperCookie)).planColumns).toBeNull();
    await putColumns(ownerSuperCookie, ['discipline']);
    expect((await readPlan(ownerSuperCookie)).planColumns).toEqual(['discipline']);
    expect((await readPlan(consultMemberCookie)).planColumns).toEqual(['discipline', 'suitability']);
  });

  it('refuses an ordinary member, an unknown or role field key, and resets to default on null', async () => {
    const denied = await putColumns(consultMemberCookie, ['discipline']);
    expect(denied.status).toBe(403);

    const unknown = await putColumns(consultSuperCookie, ['not_a_field']);
    expect(unknown.status).toBe(400);
    const role = await putColumns(consultSuperCookie, ['authors']);
    expect(role.status).toBe(400);

    const reset = await putColumns(consultSuperCookie, null);
    expect(reset.status).toBe(200);
    expect((await readPlan(consultMemberCookie)).planColumns).toBeNull();
  });
});

describe('column-set hygiene (T-360 review findings)', () => {
  it('refuses duplicate keys and normalises an empty selection to null', async () => {
    const dup = await putColumns(consultSuperCookie, ['discipline', 'discipline']);
    expect(dup.status).toBe(400);

    await putColumns(consultSuperCookie, ['discipline']);
    const empty = await putColumns(consultSuperCookie, []);
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as { columns: string[] | null }).columns).toBeNull();
    expect((await readPlan(consultMemberCookie)).planColumns).toBeNull();
  });
});
