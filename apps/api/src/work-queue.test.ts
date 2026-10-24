// T-467 — the home's one aggregating read: a proposed reviewer is the owner
// super user's to confirm and nobody else's; once confirmed, the lead
// appointment is the appointee's to accept; every item's href is a screen
// inside the project; a saved view and a recent document ride the same read.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GetWorkQueueResponse, PlanRow } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });
const stamp = Date.now();
const password = 'pw-t467';
let projectId: string;
let ownerSuper: string;
let ownerSuperParticipant: string;
let producer: string;
let containerId: string;

async function makeUser(name: string, organisationId: string, elevated: boolean) {
  const [user] = await db.insert(s.users).values({ name, email: `${name}-${stamp}@test.local`, organisationId, orgRole: 'admin' }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId, elevated }).returning();
  const res = await app.request('/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${name}-${stamp}@test.local`, password }) });
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, participantId: participant!.id };
}
const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) });
const queue = async (cookie: string) => (await (await app.request(`/projects/${projectId}/work-queue`, { headers: { cookie } })).json()) as GetWorkQueueResponse;

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: `t467 owner ${stamp}` }).returning();
  const [prodOrg] = await db.insert(s.organisations).values({ name: `t467 producer ${stamp}` }).returning();
  const [project] = await db.insert(s.projects).values({ name: `t467 ${stamp}`, ownerOrganisationId: ownerOrg!.id }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg!.id, projectId, role: 'owner' },
    { organisationId: prodOrg!.id, projectId, role: 'member' },
  ]);
  const o = await makeUser('t467-owner', ownerOrg!.id, true);
  ownerSuper = o.cookie;
  ownerSuperParticipant = o.participantId;
  producer = (await makeUser('t467-prod', prodOrg!.id, true)).cookie;
  const created = await post(producer, `/projects/${projectId}/plan`, { documentReference: `T467-${stamp}`, title: 'Queued deliverable' });
  containerId = ((await created.json()) as PlanRow).containerId;
});

afterAll(async () => {
  await pool.end();
});

describe('the work queue (T-467)', () => {
  it('a proposed lead reviewer is the owner super user’s to confirm; once confirmed it is the appointee’s to accept', async () => {
    expect((await post(producer, `/containers/${containerId}/reviewers`, { participantId: ownerSuperParticipant, isLead: true })).status).toBe(201);
    const owners = await queue(ownerSuper);
    const confirm = owners.items.find((i) => i.kind === 'confirm_reviewer');
    expect(confirm?.label).toContain(`T467-${stamp}`);
    expect(confirm?.href).toBe(`review/${containerId}`);
    // the producer sees nothing to confirm: not theirs to do
    expect((await queue(producer)).items.some((i) => i.kind === 'confirm_reviewer')).toBe(false);
    // the appointee is owner-side, so acceptance is the confirmation (ADR-0033): the accept item is theirs now
    expect(owners.items.some((i) => i.kind === 'accept_appointment' && i.href === `review/${containerId}`)).toBe(true);
    // every href is a path inside the project
    for (const i of owners.items) expect(i.href).toMatch(/^(review|documents|editor)(\/|\?|$)/);
  });

  it('recent documents and saved views ride the same read, cut to the requester', async () => {
    await post(producer, `/projects/${projectId}/saved-views`, { register: 'plan', name: `Mine ${stamp}`, filter: { q: 'T467' } });
    const mine = await queue(producer);
    expect(mine.views.some((v) => v.name === `Mine ${stamp}` && v.mine)).toBe(true);
    // a private view is the maker's alone — the owner's read does not carry it
    expect((await queue(ownerSuper)).views.some((v) => v.name === `Mine ${stamp}`)).toBe(false);
    expect(Array.isArray(mine.recent)).toBe(true);
  });
});
