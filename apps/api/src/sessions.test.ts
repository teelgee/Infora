// T-251 acceptance — revocable server-side sessions (finding F4, half one).
//
// The property under test is the one a signed cookie cannot have: THE SERVER
// CAN END A SESSION. Every case below therefore holds a valid, correctly signed
// cookie and checks that it stops working anyway — which is exactly what the
// skeleton's cookie could not do, because a signed cookie is valid because it
// verifies.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { DEFAULT_SESSION_POLICY, revokeUserSessions, sweepExpiredSessions } from './sessions';

const { db, pool } = createDb();
const stamp = Date.now();
const password = 'pw-t251';
const email = `t251-${stamp}@test.local`;

const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });
// a deployment that wants very short clocks gets them: both are configuration
const impatient = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter(),
  sessionPolicy: { absoluteHours: 1, idleMinutes: 0.0005 }, // ~30ms idle
});

let userId: string;

async function login(on = app): Promise<string> {
  const res = await on.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(204);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const me = (cookie: string, on = app) => on.request('/me', { headers: { cookie } });

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t251 org ${stamp}` }).returning();
  const [user] = await db
    .insert(s.users)
    .values({ name: 't251 user', email, organisationId: org!.id })
    .returning();
  userId = user!.id;
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
});

afterAll(async () => {
  await pool.end();
});

describe('T-251 — a session is a row, and a row can be revoked', () => {
  it('the cookie carries an opaque token, not the user id', async () => {
    // The change the whole ticket rests on. A cookie holding a user id is a
    // bearer assertion of identity that stays true until the signature
    // expires; a cookie holding a token is a pointer to a row the server owns.
    const cookie = await login();
    expect(cookie).not.toContain(userId);

    const [session] = await db
      .select()
      .from(s.sessions)
      .where(eq(s.sessions.userId, userId))
      .limit(1);
    expect(session).toBeDefined();
    expect(session!.id).toHaveLength(64); // 256 bits, hex
    expect(session!.revokedAt).toBeNull();
  });

  it('a live session resolves; a REVOKED one does not, holding the same valid cookie', async () => {
    const cookie = await login();
    expect((await me(cookie)).status).toBe(200);

    const ended = await revokeUserSessions(db, userId);
    expect(ended).toBeGreaterThan(0);

    // the cookie is unchanged and still verifies — and it is now worthless.
    // This single assertion is the entire point of the ticket.
    expect((await me(cookie)).status).toBe(401);
  });

  it('signing out ends the session on the SERVER, so a copied cookie dies with it', async () => {
    const cookie = await login();
    // the copy an attacker would have taken: byte-identical, taken before
    const copy = cookie;

    expect(
      (await app.request('/auth/session', { method: 'DELETE', headers: { cookie } })).status,
    ).toBe(204);

    // before T-251, deleting the cookie ended nothing the server knew about,
    // and this copy kept working
    expect((await me(copy)).status).toBe(401);
  });

  it('records WHY a session ended, and never deletes the row', async () => {
    const cookie = await login();
    const token = cookie.split('=')[1]!.split('.')[0]!;
    await app.request('/auth/session', { method: 'DELETE', headers: { cookie } });

    const rows = await db.select().from(s.sessions).where(eq(s.sessions.userId, userId));
    const signedOut = rows.filter((row) => row.revokedReason === 'signed_out');
    expect(signedOut.length).toBeGreaterThan(0);
    // currency by state: the row survives, because a session that ended is
    // evidence of a login that happened
    expect(rows.some((row) => row.id.startsWith(token.slice(0, 8)))).toBe(true);
  });

  it('the idle clock ends a session that was walked away from', async () => {
    const cookie = await login(impatient);
    expect((await me(cookie, impatient)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await me(cookie, impatient)).status).toBe(401);

    // and the expiry is WRITTEN DOWN when noticed, not merely computed — a
    // session that quietly stops working would leave a row still claiming to
    // be live, and "is this session live" would have two answers
    const rows = await db.select().from(s.sessions).where(eq(s.sessions.userId, userId));
    expect(rows.some((row) => row.revokedReason === 'expired_idle')).toBe(true);
  });

  it('the absolute lifetime is never extended by activity — the two clocks differ', async () => {
    const cookie = await login();
    const token = cookie.split('=')[1]!.split('.')[0]!;
    const before = (await db.select().from(s.sessions).where(eq(s.sessions.id, token)))[0]!;

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await me(cookie)).status).toBe(200);

    const after = (await db.select().from(s.sessions).where(eq(s.sessions.id, token)))[0]!;
    // the idle clock slid…
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(before.lastSeenAt.getTime());
    // …and the absolute one did not. A session that slid forward on every use
    // would have no absolute bound at all, which is the property being bought.
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it('an unsigned or forged token is refused before the database is touched', async () => {
    // signature first: a token that was never minted here does not get a
    // lookup, let alone a session
    expect((await me('infora_session=deadbeef')).status).toBe(401);
    expect((await me('infora_session=')).status).toBe(401);
    expect((await app.request('/me')).status).toBe(401);
  });

  it('every ending answers the same 401 — the client is never told which', async () => {
    const revoked = await login();
    await revokeUserSessions(db, userId);
    const forged = 'infora_session=notatoken';

    const [a, b] = await Promise.all([me(revoked), me(forged)]);
    expect(a.status).toBe(b.status);
    // "this session was revoked" would distinguish a real session from a
    // forged one, which is the same leak principle 4 closes everywhere else
    expect(await a.json()).toEqual(await b.json());
  });

  it('the sweep closes out sessions abandoned rather than signed out', async () => {
    await login(impatient);
    await new Promise((resolve) => setTimeout(resolve, 60));

    // scoped to this suite's own user: an unscoped time-based sweep on the
    // shared dev database signs every parallel suite out, which is how the
    // scope parameter came to exist
    const swept = await sweepExpiredSessions(db, { absoluteHours: 1, idleMinutes: 0.0005 }, userId);
    expect(swept).toBeGreaterThan(0);
    // without this, an abandoned session keeps revoked_at IS NULL for ever and
    // "how many live sessions are there" — the question an incident asks —
    // answers wrongly
    const live = (await db.select().from(s.sessions).where(eq(s.sessions.userId, userId))).filter(
      (row) => row.revokedAt === null,
    );
    expect(live).toHaveLength(0);
  });

  it('the default posture is bounded, where the skeleton was not', () => {
    // the skeleton's cookie carried no expiry at all, so a cookie captured once
    // was good for ever. Any bound is the improvement; these are the defaults a
    // deployment overrides rather than the numbers the security session will set.
    expect(DEFAULT_SESSION_POLICY.absoluteHours).toBeGreaterThan(0);
    expect(DEFAULT_SESSION_POLICY.idleMinutes).toBeGreaterThan(0);
  });
});
