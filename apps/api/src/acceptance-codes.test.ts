// T-390 acceptance, against the live dev database — the acceptance-code scheme's
// write path (ADR-0003 as amended 2026-08-27), which did not exist at all: a
// pilot firm could not represent its own coding scheme, independently of
// anything AI.
//
// Three properties this suite exists to hold. The BLAST RADIUS is a promise
// about the next query, so it must count the deliverables retrieval would
// actually exclude and not the rounds that mention the code. RETIRE AND REPLACE
// must bite on the properties that say what a code MEANT, and must not bite on
// `grounds`, which is a live policy the ADR gives the owner explicitly. And
// every write must leave an AUDIT ROW carrying the reason, because the change is
// silent from the answer end.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListAcceptanceCodesResponse } from '@infora/contracts';
import { asc, eq } from 'drizzle-orm';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t390';
let projectId: string;
let ownerOrg: string;
let ownerCookie: string;
let plainOwnerCookie: string;
let memberCookie: string;
let ownerParticipantId: string;

async function makeUser(name: string, organisationId: string, elevated = false) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated })
    .returning();
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password }),
  });
  return { participantId: participant!.id, cookie: res.headers.get('set-cookie')!.split(';')[0]! };
}

const asJson = (cookie: string) => ({ cookie, 'content-type': 'application/json' });
const codes = async (cookie: string) => {
  const res = await app.request(`/projects/${projectId}/acceptance-codes`, { headers: { cookie } });
  return ((await res.json()) as ListAcceptanceCodesResponse).items;
};
const find = async (code: string) => (await codes(ownerCookie)).find((c) => c.code === code)!;

/** A published deliverable admitted under `codeId` — the blast radius's unit. */
async function admittedDeliverable(reference: string, codeId: string) {
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: ownerOrg,
      documentReference: reference,
      inLibrary: true,
      state: 'live',
    })
    .returning();
  const [version] = await db
    .insert(s.versions)
    .values({ containerId: container!.id, versionReference: 'C01', content: 'x', isCurrent: true })
    .returning();
  const [cycle] = await db
    .insert(s.reviewCycles)
    .values({ containerId: container!.id, state: 'accepted' })
    .returning();
  await db.insert(s.rounds).values({
    cycleId: cycle!.id,
    number: 1,
    versionId: version!.id,
    state: 'issued',
    deliverableCodeId: codeId,
  });
  return container!.id;
}

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t390 owner ${stamp}` }).returning();
  const [member] = await db.insert(s.organisations).values({ name: `t390 member ${stamp}` }).returning();
  ownerOrg = org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t390 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: member!.id, projectId, role: 'member' },
  ]);
  const owner = await makeUser('t390-orla', ownerOrg, true);
  ownerParticipantId = owner.participantId;
  ownerCookie = owner.cookie;
  plainOwnerCookie = (await makeUser('t390-oscar', ownerOrg)).cookie;
  memberCookie = (await makeUser('t390-mira', member!.id, true)).cookie;

  // the project's scheme, as a real one is: copied at creation
  await db.insert(s.acceptanceCodes).values([
    { projectId, code: 'A1', description: 'Published — authorized and accepted', isAccepting: true, isContractual: true, grounds: true, sortOrder: 1 },
    { projectId, code: 'S3', description: 'Shared — suitable for review and comment', sortOrder: 2 },
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe('the acceptance-code editor (T-390)', () => {
  it('is the owner organisation’s super user and nobody else’s', async () => {
    const body = JSON.stringify({ code: 'A9', description: 'nope', reason: 'testing' });
    for (const cookie of [memberCookie, plainOwnerCookie]) {
      const res = await app.request(`/projects/${projectId}/acceptance-codes`, {
        method: 'POST',
        headers: asJson(cookie),
        body,
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { detail: string }).detail).toBe('owner_super_user_required');
    }
    // the scheme is the owner ORGANISATION's, per project (ADR-0003) — a member
    // organisation's super user holds nothing here however elevated they are
    expect((await codes(memberCookie)).some((c) => c.code === 'A9')).toBe(false);
  });

  it('counts the blast radius as deliverables retrieval would exclude, not rounds', async () => {
    const a1 = await find('A1');
    expect(a1.liveDeliverables).toBe(0);
    await admittedDeliverable(`T390-ONE-${stamp}`, a1.id);
    await admittedDeliverable(`T390-TWO-${stamp}`, a1.id);
    expect((await find('A1')).liveDeliverables).toBe(2);

    // a WITHDRAWN deliverable was admitted under A1 and is already out of the
    // AI's reach: counting it would make the sentence on screen — "this will
    // exclude N deliverables from AI answers" — describe a set that is not the
    // one the next query returns
    const gone = await admittedDeliverable(`T390-GONE-${stamp}`, a1.id);
    await db.update(s.containers).set({ state: 'withdrawn' }).where(eq(s.containers.id, gone));
    expect((await find('A1')).liveDeliverables).toBe(2);
  });

  it('refuses to redefine what a used code MEANT, and allows the grounding policy', async () => {
    const a1 = await find('A1');
    expect(a1.everUsed).toBe(true);

    for (const field of ['isAccepting', 'isContractual'] as const) {
      const res = await app.request(`/acceptance-codes/${a1.id}`, {
        method: 'PATCH',
        headers: asJson(ownerCookie),
        body: JSON.stringify({ [field]: false, reason: 'trying it on' }),
      });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { detail: string }).detail).toBe(
        'code_in_use_retire_and_replace',
      );
    }

    // `grounds` is not a claim about what happened under this code — it is a
    // policy about the next query, and ADR-0003 gives it to the owner
    const ok = await app.request(`/acceptance-codes/${a1.id}`, {
      method: 'PATCH',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ grounds: false, reason: 'A1 is design-stage only on this scheme' }),
    });
    expect(ok.status).toBe(200);
    expect((await find('A1')).grounds).toBe(false);

    // and the label, because the state underneath is fixed and everything
    // downstream keys on what happened rather than on what we call it
    const renamed = await app.request(`/acceptance-codes/${a1.id}`, {
      method: 'PATCH',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ description: 'Published — approved', reason: 'this client says approve' }),
    });
    expect(renamed.status).toBe(200);
    expect((await find('A1')).description).toBe('Published — approved');
  });

  it('records every change like a rails change, with its reason', async () => {
    const a1 = await find('A1');
    const rows = await db
      .select()
      .from(s.acceptanceCodeChanges)
      .where(eq(s.acceptanceCodeChanges.acceptanceCodeId, a1.id))
      .orderBy(asc(s.acceptanceCodeChanges.changedAt));
    expect(rows.map((r) => r.field)).toEqual(['grounds', 'description']);
    expect(rows[0]).toMatchObject({
      changedByParticipantId: ownerParticipantId,
      previousValue: 'true',
      newValue: 'false',
      reason: 'A1 is design-stage only on this scheme',
    });
    // append-only by trigger (T-008): the people who hold this screen are
    // exactly the people who would want to tidy a change away
    await expect(
      db.delete(s.acceptanceCodeChanges).where(eq(s.acceptanceCodeChanges.id, rows[0]!.id)),
    ).rejects.toThrow();
  });

  it('adds a code, and a new code grounds nothing until the owner says so', async () => {
    const res = await app.request(`/projects/${projectId}/acceptance-codes`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({
        code: 'A4',
        description: 'Published — accepted as suitable for construction',
        isAccepting: true,
        isContractual: true,
        grounds: false,
        reason: 'the information standard defines A4 for this scheme',
      }),
    });
    expect(res.status).toBe(201);
    const a4 = await find('A4');
    // the standard refuses to fix what a published code means, so nothing about
    // the letter can tell us whether it grounds
    expect(a4.grounds).toBe(false);
    expect(a4.everUsed).toBe(false);
    const [created] = await db
      .select()
      .from(s.acceptanceCodeChanges)
      .where(eq(s.acceptanceCodeChanges.acceptanceCodeId, a4.id));
    expect(created).toMatchObject({ field: 'created', newValue: 'A4' });

    // a duplicate among the LIVE set is refused; retiring frees the letter,
    // which is the other half of retire-and-replace
    const dup = await app.request(`/projects/${projectId}/acceptance-codes`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ code: 'A4', description: 'again', reason: 'x' }),
    });
    expect(dup.status).toBe(409);

    const retired = await app.request(`/acceptance-codes/${a4.id}`, {
      method: 'PATCH',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ retired: true, reason: 'wrong meaning' }),
    });
    expect(retired.status).toBe(200);
    expect((await find('A4')).retiredAt).not.toBeNull();
    const reused = await app.request(`/projects/${projectId}/acceptance-codes`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ code: 'A4', description: 'the replacement', reason: 'replacing it' }),
    });
    expect(reused.status).toBe(201);
  });

  it('writes nothing, and audits nothing, when nothing moved', async () => {
    const s3 = await find('S3');
    const before = await db
      .select()
      .from(s.acceptanceCodeChanges)
      .where(eq(s.acceptanceCodeChanges.acceptanceCodeId, s3.id));
    const res = await app.request(`/acceptance-codes/${s3.id}`, {
      method: 'PATCH',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ grounds: s3.grounds, description: s3.description, reason: 'no-op' }),
    });
    expect(res.status).toBe(200);
    // an audit trail padded with no-ops is one nobody reads
    const after = await db
      .select()
      .from(s.acceptanceCodeChanges)
      .where(eq(s.acceptanceCodeChanges.acceptanceCodeId, s3.id));
    expect(after.length).toBe(before.length);
  });
});
