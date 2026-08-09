// T-362 (S5, ADR-0033 addendum 2026-08-09) acceptance — row-edit delegation
// follows lead authorship: the row's live lead author edits title, metadata and
// the authoring team, and proposes reviewers (never confirming); excluded and
// still super-user acts: withdraw, lead-author reassignment, the document
// owner. An ordinary producing-org member holds nothing ("another member
// cannot"), which also tightens the previously ungated author-grant path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AppointmentGrant, PlanRow, ReviewerGrant } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t362';
let projectId: string;
let rowId: string;
let superCookie: string;
let leadCookie: string;
let memberCookie: string;
let leadParticipantId: string;
let memberParticipantId: string;
let thirdParticipantId: string;
let leadGrantId: string;

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
  const [oA] = await db.insert(s.organisations).values({ name: 't362 owner' }).returning();
  const [oB] = await db.insert(s.organisations).values({ name: 't362 consult' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't362 project', ownerOrganisationId: oA!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: oA!.id, projectId, role: 'owner' },
    { organisationId: oB!.id, projectId, role: 'member' },
  ]);
  const superUser = await makeUser('t362-sana', oB!.id, true);
  const leadUser = await makeUser('t362-lena', oB!.id, false); // ordinary member, will be lead author
  const memberUser = await makeUser('t362-mona', oB!.id, false);
  const thirdUser = await makeUser('t362-tara', oB!.id, false);
  leadParticipantId = leadUser.participant.id;
  memberParticipantId = memberUser.participant.id;
  thirdParticipantId = thirdUser.participant.id;
  superCookie = await session(superUser.user.email);
  leadCookie = await session(leadUser.user.email);
  memberCookie = await session(memberUser.user.email);

  const created = await app.request(`/projects/${projectId}/plan`, {
    method: 'POST',
    headers: asJson(superCookie),
    body: JSON.stringify({ documentReference: `T362-${stamp}`, title: 'Delegated deliverable' }),
  });
  rowId = ((await created.json()) as PlanRow).containerId;
  const lead = await app.request(`/containers/${rowId}/authors`, {
    method: 'POST',
    headers: asJson(superCookie),
    body: JSON.stringify({ participantId: leadParticipantId, isLead: true }),
  });
  leadGrantId = ((await lead.json()) as AppointmentGrant).id;
});

afterAll(async () => {
  await pool.end();
});

describe('the delegation (T-362)', () => {
  it('the live lead author edits title and metadata; an ordinary member cannot', async () => {
    const renamed = await app.request(`/containers/${rowId}/title`, {
      method: 'PATCH',
      headers: asJson(leadCookie),
      body: JSON.stringify({ title: 'Renamed by the lead author' }),
    });
    expect(renamed.status).toBe(200);

    const meta = await app.request(`/containers/${rowId}`, {
      method: 'PATCH',
      headers: asJson(leadCookie),
      body: JSON.stringify({ metadata: { classification: 'method statement' } }),
    });
    expect(meta.status).toBe(200);

    const byMember = await app.request(`/containers/${rowId}/title`, {
      method: 'PATCH',
      headers: asJson(memberCookie),
      body: JSON.stringify({ title: 'Not allowed' }),
    });
    expect(byMember.status).toBe(403);
  });

  it('the lead author manages other authors, but lead reassignment stays the super user\'s act', async () => {
    const added = await app.request(`/containers/${rowId}/authors`, {
      method: 'POST',
      headers: asJson(leadCookie),
      body: JSON.stringify({ participantId: memberParticipantId }),
    });
    expect(added.status).toBe(201);
    const grant = (await added.json()) as AppointmentGrant;

    // crowning a lead is refused for the lead author
    const crown = await app.request(`/containers/${rowId}/authors`, {
      method: 'POST',
      headers: asJson(leadCookie),
      body: JSON.stringify({ participantId: thirdParticipantId, isLead: true }),
    });
    expect(crown.status).toBe(403);
    expect(((await crown.json()) as { detail: string }).detail).toBe('super_user_required');

    // removing a plain author is delegated; removing the LEAD row is not
    const removePlain = await app.request(`/authors/${grant.id}/revocation`, {
      method: 'POST',
      headers: asJson(leadCookie),
    });
    expect(removePlain.status).toBe(200);
    const removeLead = await app.request(`/authors/${leadGrantId}/revocation`, {
      method: 'POST',
      headers: asJson(leadCookie),
    });
    expect(removeLead.status).toBe(403);

    // an ordinary member cannot add authors at all (the S5 tightening)
    const byMember = await app.request(`/containers/${rowId}/authors`, {
      method: 'POST',
      headers: asJson(memberCookie),
      body: JSON.stringify({ participantId: thirdParticipantId }),
    });
    expect(byMember.status).toBe(403);
  });

  it('the lead author proposes reviewers — non-confirming — and an ordinary member cannot; withdraw stays elevated', async () => {
    const proposed = await app.request(`/containers/${rowId}/reviewers`, {
      method: 'POST',
      headers: asJson(leadCookie),
      body: JSON.stringify({ participantId: thirdParticipantId }),
    });
    expect(proposed.status).toBe(201);
    expect(((await proposed.json()) as ReviewerGrant).confirmedAt).toBeNull(); // proposal only

    const byMember = await app.request(`/containers/${rowId}/reviewers`, {
      method: 'POST',
      headers: asJson(memberCookie),
      body: JSON.stringify({ participantId: memberParticipantId }),
    });
    expect(byMember.status).toBe(403);

    // withdraw is not in the delegation — the elevated tier holds (T-301 guard)
    const withdraw = await app.request(`/containers/${rowId}/withdrawal`, {
      method: 'POST',
      headers: asJson(leadCookie),
      body: JSON.stringify({ reason: 'not mine to fire' }),
    });
    expect(withdraw.status).toBe(403);
    expect(((await withdraw.json()) as { detail: string }).detail).toBe('super_user_required');

    // nor is the document owner
    const docOwner = await app.request(`/containers/${rowId}/document-owner`, {
      method: 'PATCH',
      headers: asJson(leadCookie),
      body: JSON.stringify({ participantId: leadParticipantId }),
    });
    expect(docOwner.status).toBe(403);
  });

  it('the delegation dies with the grant: a revoked lead author is refused', async () => {
    await db
      .update(s.deliverableAuthors)
      .set({ revokedAt: new Date() })
      .where(eq(s.deliverableAuthors.id, leadGrantId));
    const afterRevoke = await app.request(`/containers/${rowId}/title`, {
      method: 'PATCH',
      headers: asJson(leadCookie),
      body: JSON.stringify({ title: 'No longer mine' }),
    });
    expect(afterRevoke.status).toBe(403);
  });
});
