// T-315 acceptance — session revocation wired to the org admin's remove-user.
//
// T-251 built `revokeUserSessions` and called it from nothing, because which
// act should fire it is a decision rather than a mechanism. The property under
// test is that decision, and it is an ASYMMETRY, so both directions are
// asserted here and the negative is the one that matters most:
//
//   * removing a PARTICIPANT ends one project engagement and touches no
//     session — signing a consultant out of every project because one client's
//     work ended would be a bug wearing a control's clothes;
//   * removing a USER from the organisation ends every live session, and
//     closes every Participant the person held, because ADR-0033 staffs a
//     Participant *from* the organisation's seat.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import type { ListOrgUsersResponse, RemoveOrgUserResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t315';

let projectId: string;
let memberOrg: string;
let otherOrg: string;

let adminId: string;
let adminCookie: string;
let adminParticipantId: string;

// the leaver: an ordinary member of the same organisation, on the project,
// holding a live author grant — the shape a real departure has
let leaverId: string;
let leaverEmail: string;
let leaverParticipantId: string;
let leaverAuthorGrantId: string;

// the colleague whose PARTICIPANT is removed: the negative case's subject
let colleagueId: string;
let colleagueParticipantId: string;
let colleagueCookie: string;

let otherOrgUserId: string;
let plainCookie: string; // a non-admin of the member org

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

async function login(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(204);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const me = (cookie: string) => app.request('/me', { headers: { cookie } });

beforeAll(async () => {
  const [owner] = await db.insert(s.organisations).values({ name: `t315 owner ${stamp}` }).returning();
  const [member] = await db.insert(s.organisations).values({ name: `t315 member ${stamp}` }).returning();
  const [other] = await db.insert(s.organisations).values({ name: `t315 other ${stamp}` }).returning();
  memberOrg = member!.id;
  otherOrg = other!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t315 project ${stamp}`, ownerOrganisationId: owner!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: owner!.id, projectId, role: 'owner', state: 'active' },
    { organisationId: memberOrg, projectId, role: 'member', state: 'active' },
  ]);

  const admin = await makeUser('t315-ada', memberOrg, { admin: true, participant: true });
  adminId = admin.user.id;
  adminParticipantId = admin.participant!.id;
  adminCookie = await login(admin.user.email);

  const leaver = await makeUser('t315-leo', memberOrg, { participant: true });
  leaverId = leaver.user.id;
  leaverEmail = leaver.user.email;
  leaverParticipantId = leaver.participant!.id;

  const colleague = await makeUser('t315-cleo', memberOrg, { participant: true });
  colleagueId = colleague.user.id;
  colleagueParticipantId = colleague.participant!.id;
  colleagueCookie = await login(colleague.user.email);

  const plain = await makeUser('t315-pat', memberOrg, { participant: true });
  plainCookie = await login(plain.user.email);

  const [otherUser] = await db
    .insert(s.users)
    .values({ name: 't315-oona', email: `t315-oona-${stamp}@test.local`, organisationId: otherOrg })
    .returning();
  otherOrgUserId = otherUser!.id;

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: memberOrg,
      documentReference: `T315-DEL-${stamp}`,
      inLibrary: false,
    })
    .returning();
  const [grant] = await db
    .insert(s.deliverableAuthors)
    .values({
      containerId: container!.id,
      participantId: leaverParticipantId,
      grantedByParticipantId: adminParticipantId,
    })
    .returning();
  leaverAuthorGrantId = grant!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('removing a Participant is a PROJECT act', () => {
  it('closes the interval and leaves every session of that user alive', async () => {
    // two live sessions, so "all of them survived" is a real assertion
    const second = await login(`t315-cleo-${stamp}@test.local`);
    expect((await me(colleagueCookie)).status).toBe(200);

    const res = await app.request(`/projects/${projectId}/participants/${colleagueParticipantId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(s.participants)
      .where(eq(s.participants.id, colleagueParticipantId));
    expect(row!.removedAt).not.toBeNull();

    // the point of the whole ticket: the account is untouched
    expect((await me(colleagueCookie)).status).toBe(200);
    expect((await me(second)).status).toBe(200);
    const live = await db
      .select({ id: s.sessions.id })
      .from(s.sessions)
      .where(and(eq(s.sessions.userId, colleagueId), isNull(s.sessions.revokedAt)));
    expect(live.length).toBe(2);
    const [user] = await db.select().from(s.users).where(eq(s.users.id, colleagueId));
    expect(user!.removedAt).toBeNull();
  });
});

describe('removing a User from the organisation is an ACCOUNT act', () => {
  it('refuses the requester who is not an org admin', async () => {
    const res = await app.request(`/organisation/users/${leaverId}`, {
      method: 'DELETE',
      headers: { cookie: plainCookie },
    });
    expect(res.status).toBe(404);
  });

  it("refuses another organisation's user as absence, not refusal", async () => {
    const res = await app.request(`/organisation/users/${otherOrgUserId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(s.users).where(eq(s.users.id, otherOrgUserId));
    expect(row!.removedAt).toBeNull();
  });

  it('refuses an admin removing themselves — the one removal nobody can undo', async () => {
    const res = await app.request(`/organisation/users/${adminId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('cannot_remove_self');
  });

  it('ends every live session, closes the participations, and revokes their grants', async () => {
    const first = await login(leaverEmail);
    const second = await login(leaverEmail);
    expect((await me(first)).status).toBe(200);

    const res = await app.request(`/organisation/users/${leaverId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RemoveOrgUserResponse;
    expect(body.sessionsEnded).toBe(2);
    expect(body.participationsClosed).toBe(1);

    // the cookies are correctly signed and valid-looking, and they are dead
    expect((await me(first)).status).toBe(401);
    expect((await me(second)).status).toBe(401);
    const revoked = await db
      .select({ reason: s.sessions.revokedReason })
      .from(s.sessions)
      .where(eq(s.sessions.userId, leaverId));
    expect(revoked.every((r) => r.reason === 'revoked')).toBe(true);

    const [participant] = await db
      .select()
      .from(s.participants)
      .where(eq(s.participants.id, leaverParticipantId));
    expect(participant!.removedAt).not.toBeNull();
    const [grant] = await db
      .select()
      .from(s.deliverableAuthors)
      .where(eq(s.deliverableAuthors.id, leaverAuthorGrantId));
    expect(grant!.revokedAt).not.toBeNull();
  });

  it('answers "when did they lose access, and who ended it"', async () => {
    const [row] = await db.select().from(s.users).where(eq(s.users.id, leaverId));
    expect(row!.removedAt).not.toBeNull();
    expect(row!.removedByUserId).toBe(adminId);
    // currency by state, not deletion: the name still resolves for attribution
    expect(row!.name).toBe('t315-leo');
  });

  it('will not let a removed account log back in, and does not say why', async () => {
    const res = await app.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: leaverEmail, password }),
    });
    expect(res.status).toBe(401);
    // the same answer an unknown email gets — no account-probing oracle
    expect(((await res.json()) as { error?: string }).error).toBe('unauthenticated');
  });

  it('drops them from the enrol picker and refuses re-enrolment', async () => {
    const listed = (await (
      await app.request('/organisation/users', { headers: { cookie: adminCookie } })
    ).json()) as ListOrgUsersResponse;
    expect(listed.items.some((u) => u.userId === leaverId)).toBe(false);

    const res = await app.request(`/projects/${projectId}/participants`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ userId: leaverId }),
    });
    expect(res.status).toBe(404);
  });

  it('is idempotent in the only sense that matters — a second removal is absence', async () => {
    const res = await app.request(`/organisation/users/${leaverId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expect(res.status).toBe(404);
  });
});
