// T-352 — the ADR-0033 addendum: a live confirmed LEAD reviewer manages the
// review group. Proposal is non-confirming unless owner-side (confirmation is
// where ADR-0015's share-first bites); revocation narrows access and is
// always wall-safe. A non-lead reviewer holds neither power.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ReviewerGrant } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t352';
let projectId: string;
let containerId: string;
let leadCookie: string; // rhea — reviewer-org confirmed LEAD reviewer
let nonLeadCookie: string; // sam — reviewer-org confirmed non-lead reviewer
let ninaParticipantId: string; // proposable roster member
let samGrantId: string;

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
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
  const [ownerOrg] = await db.insert(s.organisations).values({ name: 't352 owner' }).returning();
  const [producerOrg] = await db.insert(s.organisations).values({ name: 't352 producer' }).returning();
  const [reviewerOrg] = await db.insert(s.organisations).values({ name: 't352 reviewers' }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't352 project', ownerOrganisationId: ownerOrg!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg!.id, projectId, role: 'owner' },
    { organisationId: producerOrg!.id, projectId, role: 'member' },
    { organisationId: reviewerOrg!.id, projectId, role: 'member' },
  ]);

  const lead = await makeUser('t352-rhea', reviewerOrg!.id);
  const nonLead = await makeUser('t352-sam', reviewerOrg!.id);
  const nina = await makeUser('t352-nina', reviewerOrg!.id);
  ninaParticipantId = nina.participant.id;
  leadCookie = await session(lead.user.email);
  nonLeadCookie = await session(nonLead.user.email);

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: producerOrg!.id,
      documentReference: `T352-DEL-${stamp}`,
      inLibrary: false,
    })
    .returning();
  containerId = container!.id;
  // the reviewer org can see the deliverable (share) and staffs the group
  await db.insert(s.deliverableShares).values({
    containerId,
    organisationId: reviewerOrg!.id,
    grantedByParticipantId: lead.participant.id,
  });
  await db.insert(s.deliverableReviewers).values([
    {
      containerId,
      participantId: lead.participant.id,
      isLead: true,
      grantedByParticipantId: lead.participant.id,
      confirmedByParticipantId: lead.participant.id,
      confirmedAt: new Date(),
    },
    {
      containerId,
      participantId: nonLead.participant.id,
      grantedByParticipantId: lead.participant.id,
      confirmedByParticipantId: lead.participant.id,
      confirmedAt: new Date(),
    },
  ]);
  const grants = await db.select().from(s.deliverableReviewers);
  samGrantId = grants.find((g) => g.participantId === nonLead.participant.id && g.containerId === containerId)!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('the lead reviewer manages the group (T-352, ADR-0033 addendum)', () => {
  it('a non-lead reviewer may not propose', async () => {
    const res = await app.request(`/containers/${containerId}/reviewers`, {
      method: 'POST',
      headers: asJson(nonLeadCookie),
      body: JSON.stringify({ participantId: ninaParticipantId }),
    });
    expect(res.status).toBe(404); // the wall's silent no
  });

  it('the lead proposes — non-confirming, because the lead is not owner-side', async () => {
    const res = await app.request(`/containers/${containerId}/reviewers`, {
      method: 'POST',
      headers: asJson(leadCookie),
      body: JSON.stringify({ participantId: ninaParticipantId }),
    });
    expect(res.status).toBe(201);
    const grant = (await res.json()) as ReviewerGrant;
    expect(grant.confirmedAt).toBeNull(); // proposed — confers nothing

    // and may retract the proposal
    const revoked = await app.request(`/reviewers/${grant.id}/revocation`, {
      method: 'POST',
      headers: asJson(leadCookie),
    });
    expect(revoked.status).toBe(200);
    expect(((await revoked.json()) as ReviewerGrant).revokedAt).not.toBeNull();
  });

  it('the lead revokes a confirmed reviewer — narrowing is wall-safe', async () => {
    const res = await app.request(`/reviewers/${samGrantId}/revocation`, {
      method: 'POST',
      headers: asJson(leadCookie),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as ReviewerGrant).revokedAt).not.toBeNull();
  });
});
