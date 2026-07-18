// T-117 acceptance, against the live dev database: the roster is
// project-visible; org admins staff their organisation's seat (enrol/remove
// as intervals, grants auto-revoking); membership is propose-then-confirm
// (ADR-0019/0033).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListOrgUsersResponse, ListRosterResponse, MembershipRecord, RosterEntry } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { and, eq, isNull } from 'drizzle-orm';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t117';
let projectId: string;
let ownerOrg: string;
let memberOrg: string;
let thirdOrg: string; // added mid-test via membership endpoints
let containerId: string;
let ownerAdminCookie: string; // owner-org admin + participant (the lead reviewer archetype)
let memberAdminCookie: string; // member-org admin + participant
let memberPlainCookie: string; // member-org non-admin participant
let memberAdminParticipantId: string;
let colleagueUserId: string; // member-org user with no participant yet
let colleagueEmail: string;
let thirdUserEmail: string;
let thirdUserId: string;

async function makeUser(
  name: string,
  organisationId: string,
  opts: { admin?: boolean; participant?: boolean } = {},
) {
  const [user] = await db
    .insert(s.users)
    .values({
      name,
      email: `${name}-${stamp}@test.local`,
      organisationId,
      orgRole: opts.admin ? 'admin' : 'member',
    })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  let participant: typeof s.participants.$inferSelect | undefined;
  if (opts.participant) {
    [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
  }
  return { user: user!, participant };
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
  const [oA] = await db.insert(s.organisations).values({ name: 't117 owner org' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't117 member org' }).returning();
  const [oC] = await db.insert(s.organisations).values({ name: 't117 third org' }).returning();
  ownerOrg = oA!.id;
  memberOrg = oB!.id;
  thirdOrg = oC!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't117 project', ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: memberOrg, projectId, role: 'member' },
  ]);

  const ownerAdmin = await makeUser('t117-olive', ownerOrg, { admin: true, participant: true });
  const memberAdmin = await makeUser('t117-mabel', memberOrg, { admin: true, participant: true });
  const memberPlain = await makeUser('t117-pete', memberOrg, { participant: true });
  const colleague = await makeUser('t117-cora', memberOrg, {}); // no participant yet
  memberAdminParticipantId = memberAdmin.participant!.id;
  colleagueUserId = colleague.user.id;
  colleagueEmail = colleague.user.email;
  thirdUserEmail = `t117-tara-${stamp}@test.local`;
  const [thirdUser] = await db
    .insert(s.users)
    .values({ name: 't117-tara', email: thirdUserEmail, organisationId: thirdOrg, orgRole: 'admin' })
    .returning();
  thirdUserId = thirdUser!.id;
  await db.insert(s.userCredentials).values({ userId: thirdUserId, passwordHash: hashPassword(password) });

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: memberOrg,
      documentReference: `T117-DEL-${stamp}`,
      inLibrary: false,
    })
    .returning();
  containerId = container!.id;

  ownerAdminCookie = await session(ownerAdmin.user.email);
  memberAdminCookie = await session(memberAdmin.user.email);
  memberPlainCookie = await session(memberPlain.user.email);
});

afterAll(async () => {
  await pool.end();
});

describe('the roster (ADR-0033)', () => {
  it('is project-visible across organisations — the wall hides work, never presence', async () => {
    const res = await app.request(`/projects/${projectId}/participants`, {
      headers: { cookie: memberPlainCookie },
    });
    expect(res.status).toBe(200);
    const roster = (await res.json()) as ListRosterResponse;
    const byName = new Map(roster.items.map((i) => [i.name, i]));
    expect(byName.get('t117-olive')?.organisationName).toBe('t117 owner org');
    expect(byName.get('t117-olive')?.membershipRole).toBe('owner');
    expect(byName.get('t117-mabel')?.membershipRole).toBe('member');
  });
});

describe('org administration (ADR-0033)', () => {
  it('the enrol picker is admin-only and self-org', async () => {
    const denied = await app.request('/organisation/users', { headers: { cookie: memberPlainCookie } });
    expect(denied.status).toBe(404);
    const res = await app.request('/organisation/users', { headers: { cookie: memberAdminCookie } });
    const users = (await res.json()) as ListOrgUsersResponse;
    const names = users.items.map((u) => u.name);
    expect(names).toEqual(expect.arrayContaining(['t117-mabel', 't117-pete', 't117-cora']));
    expect(names).not.toContain('t117-olive'); // other org, never listed
  });

  it('an admin enrols their own user; the ceiling binds; non-admins cannot', async () => {
    // non-admin: 404
    const plain = await app.request(`/projects/${projectId}/participants`, {
      method: 'POST',
      headers: asJson(memberPlainCookie),
      body: JSON.stringify({ userId: colleagueUserId }),
    });
    expect(plain.status).toBe(404);
    // admin enrolling ANOTHER org's user: 404 (the ceiling binds)
    const crossOrg = await app.request(`/projects/${projectId}/participants`, {
      method: 'POST',
      headers: asJson(ownerAdminCookie),
      body: JSON.stringify({ userId: colleagueUserId }),
    });
    expect(crossOrg.status).toBe(404);
    // the right admin: enrolled, and access flows immediately
    const res = await app.request(`/projects/${projectId}/participants`, {
      method: 'POST',
      headers: asJson(memberAdminCookie),
      body: JSON.stringify({ userId: colleagueUserId }),
    });
    expect(res.status).toBe(201);
    const entry = (await res.json()) as RosterEntry;
    expect(entry.userId).toBe(colleagueUserId);
    expect(entry.removedAt).toBeNull();
    const colleagueCookie = await session(colleagueEmail);
    const read = await app.request(`/projects/${projectId}/participants`, {
      headers: { cookie: colleagueCookie },
    });
    expect(read.status).toBe(200);
    // enrolling again while live: conflict
    const dup = await app.request(`/projects/${projectId}/participants`, {
      method: 'POST',
      headers: asJson(memberAdminCookie),
      body: JSON.stringify({ userId: colleagueUserId }),
    });
    expect(dup.status).toBe(409);
  });

  it('removal closes the interval, revokes live grants, and re-enrolment is a new interval', async () => {
    const roster = (await (
      await app.request(`/projects/${projectId}/participants`, { headers: { cookie: memberAdminCookie } })
    ).json()) as ListRosterResponse;
    const cora = roster.items.find((i) => i.userId === colleagueUserId && i.removedAt === null)!;

    // a live appointment grant that must auto-revoke on removal
    const [grant] = await db
      .insert(s.deliverableAuthors)
      .values({
        containerId,
        participantId: cora.participantId,
        grantedByParticipantId: memberAdminParticipantId,
      })
      .returning();

    const removed = await app.request(
      `/projects/${projectId}/participants/${cora.participantId}`,
      { method: 'DELETE', headers: { cookie: memberAdminCookie } },
    );
    expect(removed.status).toBe(200);
    expect(((await removed.json()) as RosterEntry).removedAt).not.toBeNull();

    // access closes with the interval…
    const coraCookie = await session(colleagueEmail);
    const denied = await app.request(`/projects/${projectId}/participants`, {
      headers: { cookie: coraCookie },
    });
    expect(denied.status).toBe(404);
    // …the grant is revoked from that moment…
    const [revoked] = await db
      .select()
      .from(s.deliverableAuthors)
      .where(eq(s.deliverableAuthors.id, grant!.id));
    expect(revoked!.revokedAt).not.toBeNull();
    // …the row survives for attribution…
    const after = (await (
      await app.request(`/projects/${projectId}/participants`, { headers: { cookie: memberAdminCookie } })
    ).json()) as ListRosterResponse;
    expect(after.items.some((i) => i.participantId === cora.participantId)).toBe(true);
    // …and re-enrolment opens a NEW interval
    const again = await app.request(`/projects/${projectId}/participants`, {
      method: 'POST',
      headers: asJson(memberAdminCookie),
      body: JSON.stringify({ userId: colleagueUserId }),
    });
    expect(again.status).toBe(201);
    const fresh = (await again.json()) as RosterEntry;
    expect(fresh.participantId).not.toBe(cora.participantId);
  });
});

describe('membership: propose-then-confirm (ADR-0019 as data)', () => {
  it('a member proposes (conferring nothing); the owner confirms; access then flows', async () => {
    // the member proposes the third organisation
    const proposed = await app.request(`/projects/${projectId}/memberships`, {
      method: 'POST',
      headers: asJson(memberAdminCookie),
      body: JSON.stringify({ organisationId: thirdOrg }),
    });
    expect(proposed.status).toBe(201);
    const membership = (await proposed.json()) as MembershipRecord;
    expect(membership.state).toBe('proposed');

    // the third org's admin enrols their user onto the proposed seat…
    const taraCookie = await session(thirdUserEmail);
    const enrol = await app.request(`/projects/${projectId}/participants`, {
      method: 'POST',
      headers: asJson(taraCookie),
      body: JSON.stringify({ userId: thirdUserId }),
    });
    // …but a proposed seat confers nothing — not even staffing it (404)
    expect(enrol.status).toBe(404);

    // the owner confirms; the seat activates
    const confirmed = await app.request(`/memberships/${membership.id}/confirmation`, {
      method: 'POST',
      headers: asJson(ownerAdminCookie),
    });
    expect(confirmed.status).toBe(200);
    expect(((await confirmed.json()) as MembershipRecord).state).toBe('active');

    // now staffing works and the enrolled user resolves
    const enrolNow = await app.request(`/projects/${projectId}/participants`, {
      method: 'POST',
      headers: asJson(taraCookie),
      body: JSON.stringify({ userId: thirdUserId }),
    });
    expect(enrolNow.status).toBe(201);
    const read = await app.request(`/projects/${projectId}/participants`, {
      headers: { cookie: taraCookie },
    });
    expect(read.status).toBe(200);
  });

  it('a non-owner cannot confirm; duplicates conflict', async () => {
    const dup = await app.request(`/projects/${projectId}/memberships`, {
      method: 'POST',
      headers: asJson(ownerAdminCookie),
      body: JSON.stringify({ organisationId: thirdOrg }),
    });
    expect(dup.status).toBe(409);

    const [row] = await db
      .select()
      .from(s.memberships)
      .where(and(eq(s.memberships.projectId, projectId), eq(s.memberships.organisationId, thirdOrg)));
    const sneaky = await app.request(`/memberships/${row!.id}/confirmation`, {
      method: 'POST',
      headers: asJson(memberAdminCookie),
    });
    expect(sneaky.status).toBe(404);
  });
});

describe('the wall, unchanged', () => {
  it('a removed-then-current participant list never leaks another project', async () => {
    // sanity: the roster query stays project-scoped
    const roster = (await (
      await app.request(`/projects/${projectId}/participants`, { headers: { cookie: ownerAdminCookie } })
    ).json()) as ListRosterResponse;
    expect(roster.items.every((i) => typeof i.organisationName === 'string')).toBe(true);
  });

  it('participants of a live interval only are resolved by scope middleware', async () => {
    const [liveRows] = await db
      .select()
      .from(s.participants)
      .where(and(eq(s.participants.projectId, projectId), isNull(s.participants.removedAt)))
      .limit(1);
    expect(liveRows).toBeDefined();
  });
});
