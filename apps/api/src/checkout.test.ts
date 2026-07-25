// T-180 acceptance, against the live dev database: Freeze is a real check-out —
// it always locks the head (whether or not it opens an internal round), refuses
// every content-mutation path while locked, and has an audited standalone release
// (ADR-0032 addendum). The head lock is on the document, so it holds for any
// format. One mechanism, two triggers; released events audit both.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { ensureDefaultSandbox } from './sandbox';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t180';
let projectId: string;
let org: string;
let authorCookie: string;
let colleagueCookie: string;
let elevatedCookie: string;
let authorParticipantId: string;
let documentId: string;

async function makeUser(name: string, elevated = false) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId: org })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated })
    .returning();
  return { user: user!, participant: participant! };
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
const freeze = (cookie: string) =>
  app.request(`/sandbox-documents/${documentId}/freeze`, { method: 'POST', headers: asJson(cookie) });
const release = (cookie: string, reason?: string) =>
  app.request(`/sandbox-documents/${documentId}/release`, {
    method: 'POST',
    headers: asJson(cookie),
    body: JSON.stringify(reason !== undefined ? { reason } : {}),
  });
const patch = (cookie: string, content: string) =>
  app.request(`/sandbox-documents/${documentId}`, { method: 'PATCH', headers: asJson(cookie), body: JSON.stringify({ content }) });
const locked = async () => {
  const [row] = await db
    .select({ headLocked: s.sandboxDocuments.headLocked })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, documentId));
  return row!.headLocked;
};
const events = async (action: 'checked_out' | 'released') => {
  const rows = await db
    .select({ id: s.sandboxCheckoutEvents.id })
    .from(s.sandboxCheckoutEvents)
    .where(and(eq(s.sandboxCheckoutEvents.sandboxDocumentId, documentId), eq(s.sandboxCheckoutEvents.action, action)));
  return rows.length;
};

beforeAll(async () => {
  const [o] = await db.insert(s.organisations).values({ name: 't180 org' }).returning();
  org = o!.id;
  const [project] = await db.insert(s.projects).values({ name: 't180 project', ownerOrganisationId: org }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org, projectId, role: 'owner' });
  const author = await makeUser('t180-amy');
  authorParticipantId = author.participant.id;
  authorCookie = await session(author.user.email);
  colleagueCookie = await session((await makeUser('t180-cal')).user.email);
  elevatedCookie = await session((await makeUser('t180-eve', true)).user.email);
  const [doc] = await db
    .insert(s.sandboxDocuments)
    .values({
      projectId,
      organisationId: org,
      sandboxId: await ensureDefaultSandbox(db, projectId, org, authorParticipantId),
      title: 't180 draft',
      content: 'v1',
      createdByParticipantId: authorParticipantId,
    })
    .returning();
  documentId = doc!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('freeze locks the head, refuses edits, and releases (T-180)', () => {
  it('freeze without a reviewer still checks out — locks the head and audits it', async () => {
    const res = await freeze(authorCookie);
    expect(res.status).toBe(201); // a plain check-out, no round
    expect(await locked()).toBe(true);
    expect(await events('checked_out')).toBe(1);
  });

  it('refuses a content edit while checked out (409 head_locked)', async () => {
    const res = await patch(authorCookie, 'v2 while locked');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('head_locked');
  });

  it('refuses a second freeze while already checked out (409 already_checked_out)', async () => {
    const res = await freeze(authorCookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('already_checked_out');
  });

  it('a colleague who did not check it out cannot release it (403)', async () => {
    const res = await release(colleagueCookie);
    expect(res.status).toBe(403);
    expect(await locked()).toBe(true);
  });

  it('the participant who checked it out releases it — unlocks and audits', async () => {
    const res = await release(authorCookie, 'QA pass done');
    expect(res.status).toBe(200);
    expect(await locked()).toBe(false);
    expect(await events('released')).toBe(1);
  });

  it('edits flow again once released', async () => {
    const res = await patch(authorCookie, 'v2 after release');
    expect(res.status).toBe(200);
  });

  it('release on an unlocked document is a conflict (not_locked)', async () => {
    const res = await release(authorCookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail?: string }).detail).toBe('not_locked');
  });

  it('an elevated super-user can release a check-out that is not theirs', async () => {
    expect((await freeze(authorCookie)).status).toBe(201); // author checks out
    const res = await release(elevatedCookie);
    expect(res.status).toBe(200); // elevation overrides authorship
    expect(await locked()).toBe(false);
  });
});
