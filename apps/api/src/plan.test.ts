// T-118/T-119 acceptance, against the live dev database: per-organisation
// plans on one substrate (TIDP rows, owner MIDP consolidation), appointments
// as interval grants with reviewer propose-then-confirm (ADR-0008/0017/0033).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GetPlanResponse, PlanRow, ReviewerGrant } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t118';
let projectId: string;
let ownerOrg: string;
let consultOrg: string;
let otherOrg: string; // a second member org — must never see consultOrg's plan
let ownerCookie: string;
let consultCookie: string;
let otherCookie: string;
let ownerParticipantId: string;
let consultParticipantId: string;
let consultColleagueParticipantId: string;

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

beforeAll(async () => {
  const [oA] = await db.insert(s.organisations).values({ name: 't118 owner org' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't118 consult org' }).returning();
  const [oC] = await db.insert(s.organisations).values({ name: 't118 other org' }).returning();
  ownerOrg = oA!.id;
  consultOrg = oB!.id;
  otherOrg = oC!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't118 project', ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: consultOrg, projectId, role: 'member' },
    { organisationId: otherOrg, projectId, role: 'member' },
  ]);
  const owner = await makeUser('t118-oona', ownerOrg, true); // owner super-user
  const consult = await makeUser('t118-carl', consultOrg, true); // guest super-user: edits its TIDP
  const colleague = await makeUser('t118-cleo', consultOrg);
  const other = await makeUser('t118-omar', otherOrg);
  ownerParticipantId = owner.participant.id;
  consultParticipantId = consult.participant.id;
  consultColleagueParticipantId = colleague.participant.id;
  ownerCookie = await session(owner.user.email);
  consultCookie = await session(consult.user.email);
  otherCookie = await session(other.user.email);
});

afterAll(async () => {
  await pool.end();
});

let rowId: string; // the created plan row's container

describe('the per-organisation plan (ADR-0033)', () => {
  it('a member creates its own TIDP row: container + planned work item', async () => {
    const res = await app.request(`/projects/${projectId}/plan`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({
        documentReference: `T118-EIA-${stamp}`,
        title: 'Ecology chapter',
        metadata: { discipline: 'ecology' },
      }),
    });
    expect(res.status).toBe(201);
    const row = (await res.json()) as PlanRow;
    rowId = row.containerId;
    expect(row.producingOrganisationName).toBe('t118 consult org');
    expect(row.workItem?.status).toBe('planned'); // event-driven from here (ADR-0032)
    expect(row.currentVersion).toBeNull();
    expect(row.metadata).toEqual({ discipline: 'ecology' });
  });

  it('a duplicate reference conflicts', async () => {
    const res = await app.request(`/projects/${projectId}/plan`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({ documentReference: `T118-EIA-${stamp}`, title: 'dup' }),
    });
    expect(res.status).toBe(409);
  });

  it('the plan read is access-decided: own rows for a member, all for the owner, nothing across members', async () => {
    const mine = (await (
      await app.request(`/projects/${projectId}/plan`, { headers: { cookie: consultCookie } })
    ).json()) as GetPlanResponse;
    expect(mine.items.some((i) => i.containerId === rowId)).toBe(true);

    const owners = (await (
      await app.request(`/projects/${projectId}/plan`, { headers: { cookie: ownerCookie } })
    ).json()) as GetPlanResponse;
    expect(owners.items.some((i) => i.containerId === rowId)).toBe(true); // the MIDP sees all

    const others = (await (
      await app.request(`/projects/${projectId}/plan`, { headers: { cookie: otherCookie } })
    ).json()) as GetPlanResponse;
    expect(others.items.some((i) => i.containerId === rowId)).toBe(false); // the wall
  });

  it('metadata is a producing-organisation act — even the owner is denied', async () => {
    const byOwner = await app.request(`/containers/${rowId}`, {
      method: 'PATCH',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ metadata: { discipline: 'drainage' } }),
    });
    expect(byOwner.status).toBe(404);
    const byProducer = await app.request(`/containers/${rowId}`, {
      method: 'PATCH',
      headers: asJson(consultCookie),
      body: JSON.stringify({ metadata: { discipline: 'drainage' } }),
    });
    expect(byProducer.status).toBe(200);
    expect(((await byProducer.json()) as PlanRow).metadata).toEqual({ discipline: 'drainage' });
  });
});

describe('appointments (ADR-0017/0033)', () => {
  it('the producing side writes its author set; one live lead is schema-held', async () => {
    const lead = await app.request(`/containers/${rowId}/authors`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({ participantId: consultParticipantId, isLead: true }),
    });
    expect(lead.status).toBe(201);
    const second = await app.request(`/containers/${rowId}/authors`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({ participantId: consultColleagueParticipantId, isLead: true }),
    });
    expect(second.status).toBe(409); // a second live lead conflicts
    const plain = await app.request(`/containers/${rowId}/authors`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({ participantId: consultColleagueParticipantId }),
    });
    expect(plain.status).toBe(201);
    // the owner cannot touch the producing side's set (ADR-0017)
    const byOwner = await app.request(`/containers/${rowId}/authors`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ participantId: ownerParticipantId }),
    });
    expect(byOwner.status).toBe(404);
  });

  it('a producer-proposed reviewer confers nothing until the owner confirms', async () => {
    const proposed = await app.request(`/containers/${rowId}/reviewers`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({ participantId: ownerParticipantId, isLead: true }),
    });
    expect(proposed.status).toBe(201);
    const grant = (await proposed.json()) as ReviewerGrant;
    expect(grant.confirmedAt).toBeNull(); // proposed — no access

    // only the owner confirms; the proposer cannot self-confirm
    const sneaky = await app.request(`/reviewers/${grant.id}/confirmation`, {
      method: 'POST',
      headers: asJson(consultCookie),
    });
    expect(sneaky.status).toBe(404);
    const confirmed = await app.request(`/reviewers/${grant.id}/confirmation`, {
      method: 'POST',
      headers: asJson(ownerCookie),
    });
    expect(confirmed.status).toBe(200);
    expect(((await confirmed.json()) as ReviewerGrant).confirmedAt).not.toBeNull();
  });

  it('confirmation demands the share first (ADR-0015 bites): 409 share_required, then flows', async () => {
    // propose a reviewer from the OTHER member org — they cannot see the deliverable
    const roster = (await (
      await app.request(`/projects/${projectId}/participants`, { headers: { cookie: consultCookie } })
    ).json()) as { items: Array<{ participantId: string; name: string }> };
    const omar = roster.items.find((i) => i.name === 't118-omar')!;
    const proposed = await app.request(`/containers/${rowId}/reviewers`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({ participantId: omar.participantId }),
    });
    expect(proposed.status).toBe(201);
    const grant = (await proposed.json()) as ReviewerGrant;

    const blocked = await app.request(`/reviewers/${grant.id}/confirmation`, {
      method: 'POST',
      headers: asJson(ownerCookie),
    });
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { detail?: string }).detail).toBe('share_required');

    // the owner shares the deliverable with omar's organisation, then confirms
    const share = await app.request(`/containers/${rowId}/shares`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ organisationId: otherOrg }),
    });
    expect(share.status).toBe(201);
    const confirmed = await app.request(`/reviewers/${grant.id}/confirmation`, {
      method: 'POST',
      headers: asJson(ownerCookie),
    });
    expect(confirmed.status).toBe(200);

    // sharing is owner-only; a member's attempt is silent 404
    const sneakyShare = await app.request(`/containers/${rowId}/shares`, {
      method: 'POST',
      headers: asJson(consultCookie),
      body: JSON.stringify({ organisationId: otherOrg }),
    });
    expect(sneakyShare.status).toBe(404);
  });

  it('an owner-made reviewer grant is auto-confirmed; revocation closes the interval', async () => {
    const res = await app.request(`/containers/${rowId}/reviewers`, {
      method: 'POST',
      headers: asJson(ownerCookie),
      body: JSON.stringify({ participantId: ownerParticipantId }),
    });
    expect(res.status).toBe(201);
    const grant = (await res.json()) as ReviewerGrant;
    expect(grant.confirmedAt).not.toBeNull();

    const revoked = await app.request(`/reviewers/${grant.id}/revocation`, {
      method: 'POST',
      headers: asJson(ownerCookie),
    });
    expect(revoked.status).toBe(200);
    expect(((await revoked.json()) as ReviewerGrant).revokedAt).not.toBeNull();
  });
});
