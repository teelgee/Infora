// T-350 — the container's transmittal & acknowledgement history read, and the
// ADR-0035-addendum three-way distribution cut, asserted per viewer: the
// owner sees every recipient organisation and its acknowledgement state; a
// receiving organisation only its own rows; the producing organisation sees
// that issues occurred with the recipient list withheld. The fixture writes
// the record rows directly (this is a read endpoint; the write paths carry
// their own tests in cycle.test.ts and the T-137 suite).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListContainerTransmittalsResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t350';
let projectId: string;
let containerId: string;
let ownerCookie: string;
let producerCookie: string;
let receiverCookie: string;
let outsiderCookie: string;
let ownerParticipantId: string;
let producerParticipantId: string;
let receiverParticipantId: string;
let receiverOrg: string;
let secondReceiverOrg: string;

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

const history = async (cookie: string) => {
  const res = await app.request(`/containers/${containerId}/transmittals`, { headers: { cookie } });
  return { status: res.status, body: res.status === 200 ? ((await res.json()) as ListContainerTransmittalsResponse) : null };
};

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: 't350 owner' }).returning();
  const [producerOrg] = await db.insert(s.organisations).values({ name: 't350 producer' }).returning();
  const [rOrg] = await db.insert(s.organisations).values({ name: 't350 receiver' }).returning();
  const [r2Org] = await db.insert(s.organisations).values({ name: 't350 second receiver' }).returning();
  const [outsiderOrg] = await db.insert(s.organisations).values({ name: 't350 outsider' }).returning();
  receiverOrg = rOrg!.id;
  secondReceiverOrg = r2Org!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: 't350 project', ownerOrganisationId: ownerOrg!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg!.id, projectId, role: 'owner' },
    { organisationId: producerOrg!.id, projectId, role: 'member' },
    { organisationId: rOrg!.id, projectId, role: 'member' },
    { organisationId: r2Org!.id, projectId, role: 'member' },
    { organisationId: outsiderOrg!.id, projectId, role: 'member' },
  ]);

  const owner = await makeUser('t350-owen', ownerOrg!.id);
  const producer = await makeUser('t350-paula', producerOrg!.id);
  const receiver = await makeUser('t350-rhea', rOrg!.id);
  const outsider = await makeUser('t350-otis', outsiderOrg!.id);
  ownerParticipantId = owner.participant.id;
  producerParticipantId = producer.participant.id;
  receiverParticipantId = receiver.participant.id;
  ownerCookie = await session(owner.user.email);
  producerCookie = await session(producer.user.email);
  receiverCookie = await session(receiver.user.email);
  outsiderCookie = await session(outsider.user.email);

  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: producerOrg!.id,
      documentReference: `T350-DEL-${stamp}`,
      inLibrary: true,
    })
    .returning();
  containerId = container!.id;
  const [version] = await db
    .insert(s.versions)
    .values({ containerId, versionReference: 'P01', content: 'the deliverable', isCurrent: true })
    .returning();

  // the review record: round 1, submitted then acknowledged open by the owner
  const [cycle] = await db.insert(s.reviewCycles).values({ containerId }).returning();
  const [round] = await db
    .insert(s.rounds)
    .values({
      cycleId: cycle!.id,
      number: 1,
      versionId: version!.id,
      state: 'issued',
      acknowledgedByParticipantId: ownerParticipantId,
      acknowledgedAt: new Date(),
    })
    .returning();
  await db.insert(s.transmittals).values([
    // the submission (ADR-0051 gate cleared above)
    { roundId: round!.id, direction: 'return', senderParticipantId: producerParticipantId, recipients: [] },
    // the lead reviewer's issue back to the authors
    { roundId: round!.id, direction: 'issue', senderParticipantId: ownerParticipantId, recipients: [] },
  ]);

  // the distribution: issued to two organisations; one has acknowledged
  await db.insert(s.deliverableShares).values([
    { containerId, organisationId: receiverOrg, grantedByParticipantId: ownerParticipantId },
    { containerId, organisationId: secondReceiverOrg, grantedByParticipantId: ownerParticipantId },
  ]);
  await db.insert(s.transmittals).values({
    kind: 'non_review',
    containerId,
    versionId: version!.id,
    senderParticipantId: ownerParticipantId,
    recipientOrganisationIds: [receiverOrg, secondReceiverOrg],
    purposeCode: 'For information',
  });
  await db.insert(s.deliverableAcknowledgements).values({
    containerId,
    versionId: version!.id,
    organisationId: receiverOrg,
    acknowledgedByParticipantId: receiverParticipantId,
  });
});

afterAll(async () => {
  await pool.end();
});

describe('the transmittal history and the three-way distribution cut (T-350, ADR-0035 addendum)', () => {
  it('the owner sees every recipient organisation and its acknowledgement state', async () => {
    const { status, body } = await history(ownerCookie);
    expect(status).toBe(200);
    const issue = body!.items.find((r) => r.kind === 'non_review')!;
    expect(issue.recipientsWithheld).toBe(false);
    expect(issue.recipientOrganisations).toHaveLength(2);
    const acked = issue.recipientOrganisations.find((o) => o.organisationId === receiverOrg)!;
    expect(acked.acknowledged?.by.participantId).toBe(receiverParticipantId);
    const waiting = issue.recipientOrganisations.find((o) => o.organisationId === secondReceiverOrg)!;
    expect(waiting.acknowledged).toBeNull();
    // the review rows carry the ADR-0051 submission acknowledgement
    const submission = body!.items.find((r) => r.kind === 'review' && r.direction === 'return')!;
    expect(submission.submissionAcknowledged?.by.participantId).toBe(ownerParticipantId);
    expect(submission.roundNumber).toBe(1);
  });

  it('the producing organisation sees that the issue occurred, recipients withheld', async () => {
    const { status, body } = await history(producerCookie);
    expect(status).toBe(200);
    const issue = body!.items.find((r) => r.kind === 'non_review')!;
    expect(issue.recipientsWithheld).toBe(true);
    expect(issue.recipientOrganisations).toHaveLength(0);
    // its own review record stays fully visible
    expect(body!.items.filter((r) => r.kind === 'review')).toHaveLength(2);
  });

  it('a receiving organisation sees only its own row — never the other recipient', async () => {
    const { status, body } = await history(receiverCookie);
    expect(status).toBe(200);
    const issue = body!.items.find((r) => r.kind === 'non_review')!;
    expect(issue.recipientsWithheld).toBe(false);
    expect(issue.recipientOrganisations).toHaveLength(1);
    expect(issue.recipientOrganisations[0]!.organisationId).toBe(receiverOrg);
  });

  it('an organisation with a seat but no share is answered 404 — the wall, silent', async () => {
    const { status } = await history(outsiderCookie);
    expect(status).toBe(404);
  });
});
