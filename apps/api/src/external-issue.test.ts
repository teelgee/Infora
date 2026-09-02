// T-431 acceptance — external issue (ADR-0055) over HTTP against the live dev
// database. Four properties carry the ticket, and each is asserted from both
// sides where it has two:
//
//   1. a link reaches EXACTLY ONE VERSION and nothing else — not the library,
//      not the project, and not a later revision of the same document;
//   2. an expired link refuses, and refuses identically to a made-up one;
//   3. a rival organisation on the same project reads another firm's external
//      issues no more easily than it reads their non-review distribution list;
//   4. the transmittal log answers "who was this issued to" in the one place it
//      already answers it for the other two kinds, and the row it adds carries
//      no round and no direction — the CHECK, not a convention.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type {
  ExternalDocumentResponse,
  ExternalIssue,
  GetExternalIssueSettingsResponse,
  ListContainerTransmittalsResponse,
  ListExternalIssuesResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t431';
let ownerOrgId: string;
let producerOrgId: string;
let rivalOrgId: string;
let projectId: string;
let containerId: string;
let v1Id: string;
let ownerSuperSession: string;
let ownerPlainSession: string;
let producerSuperSession: string;
let rivalSession: string;
let ownerSuperParticipantId: string;
let rivalParticipantId: string;

async function makeUser(name: string, organisationId: string, elevated: boolean) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId, orgRole: 'member' })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated })
    .returning();
  return { userId: user!.id, participantId: participant!.id };
}

async function session(name: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}-${stamp}@test.local`, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
const patch = (cookie: string, path: string, body: unknown) =>
  app.request(path, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = (cookie: string, path: string) => app.request(path, { headers: { cookie } });

const issueBody = {
  recipientName: 'Mrs A Patel',
  recipientEmail: 'a.patel@example.com',
  reason: 'Statutory consultation response',
  message: 'The alignment drawing referred to in our letter of the 3rd.',
};

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: `t431 owner ${stamp}` }).returning();
  const [producerOrg] = await db.insert(s.organisations).values({ name: `t431 producer ${stamp}` }).returning();
  const [rivalOrg] = await db.insert(s.organisations).values({ name: `t431 rival ${stamp}` }).returning();
  ownerOrgId = ownerOrg!.id;
  producerOrgId = producerOrg!.id;
  rivalOrgId = rivalOrg!.id;
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t431 project ${stamp}`, ownerOrganisationId: ownerOrgId })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrgId, projectId, role: 'owner' },
    { organisationId: producerOrgId, projectId, role: 'member' },
    { organisationId: rivalOrgId, projectId, role: 'member' },
  ]);

  const ownerSuper = await makeUser('t431-owner-super', ownerOrgId, true);
  ownerSuperParticipantId = ownerSuper.participantId;
  await makeUser('t431-owner-plain', ownerOrgId, false);
  await makeUser('t431-producer-super', producerOrgId, true);
  const rival = await makeUser('t431-rival', rivalOrgId, true);
  rivalParticipantId = rival.participantId;

  [ownerSuperSession, ownerPlainSession, producerSuperSession, rivalSession] = await Promise.all([
    session('t431-owner-super'),
    session('t431-owner-plain'),
    session('t431-producer-super'),
    session('t431-rival'),
  ]);

  // a promoted deliverable produced by the CONSULTANT, so "the producing
  // organisation" and "the project owner" are genuinely different parties
  const [container] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: producerOrgId,
      documentReference: `T431-EX-${stamp}`,
      inLibrary: true,
    })
    .returning();
  containerId = container!.id;
  const [v1] = await db
    .insert(s.versions)
    .values({ containerId, versionReference: 'P01', content: 'the issued revision', isCurrent: true })
    .returning();
  v1Id = v1!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('T-431 — who may issue', () => {
  it('defaults to the strictest level, and says so to every side', async () => {
    const asOwnerSuper = (await (
      await get(ownerSuperSession, `/projects/${projectId}/external-issue-settings`)
    ).json()) as GetExternalIssueSettingsResponse;
    expect(asOwnerSuper.permission).toBe('owner_super_user');
    expect(asOwnerSuper.mayIssue).toBe(true);
    expect(asOwnerSuper.mayConfigure).toBe(true);

    // a plain participant of the OWNER organisation is still below the line —
    // the level is about the super-user capability, not about the firm alone
    const asOwnerPlain = (await (
      await get(ownerPlainSession, `/projects/${projectId}/external-issue-settings`)
    ).json()) as GetExternalIssueSettingsResponse;
    expect(asOwnerPlain.mayIssue).toBe(false);

    // and a super user of a MEMBER organisation is below it too
    const asProducer = (await (
      await get(producerSuperSession, `/projects/${projectId}/external-issue-settings`)
    ).json()) as GetExternalIssueSettingsResponse;
    expect(asProducer.mayIssue).toBe(false);
    expect(asProducer.mayConfigure).toBe(false);
  });

  // T-432 changed what this looks like from the outside, and deliberately:
  // before it, somebody below the line got a refusal. Now the SAME endpoint
  // answers them with a request — nobody is shut out, they are asked to ask.
  it('turns the act of everybody below the line into a request, not a refusal', async () => {
    for (const cookie of [ownerPlainSession, producerSuperSession]) {
      const res = await post(cookie, `/containers/${containerId}/external-issues`, {
        ...issueBody,
        recipientEmail: 'below-the-line@example.com',
      });
      expect(res.status).toBe(201);
      const asked = (await res.json()) as ExternalIssue;
      expect(asked.state).toBe('requested');
      expect(asked.linkToken).toBeNull();
    }
  });

  it('keeps the whole-project settings out of a member organisation’s hands', async () => {
    const res = await patch(producerSuperSession, `/projects/${projectId}/external-issue-settings`, {
      standardMessage: 'not theirs to write',
    });
    expect(res.status).toBe(404);
  });
});

describe('T-431 — the issue, and what the link reaches', () => {
  let issued: ExternalIssue;
  let token: string;

  it('issues from the library, and the record is a person and not an organisation', async () => {
    // the owner sets its standing note first, so the recipient's page can be
    // asserted to carry both messages
    await patch(ownerSuperSession, `/projects/${projectId}/external-issue-settings`, {
      standardMessage: 'Issued for information by the project team.',
    });
    const res = await post(ownerSuperSession, `/containers/${containerId}/external-issues`, {
      ...issueBody,
      expiresInDays: 14,
    });
    expect(res.status).toBe(201);
    issued = (await res.json()) as ExternalIssue;
    expect(issued.state).toBe('issued');
    expect(issued.recipientName).toBe(issueBody.recipientName);
    expect(issued.versionId).toBe(v1Id);
    expect(issued.linkToken).toBeTruthy();
    token = issued.linkToken!;

    // no Organisation, no Participant, no Membership was created for the
    // recipient, and no deliverable share opened: the LINK is the access
    const [recipient] = await db
      .select()
      .from(s.externalRecipients)
      .where(eq(s.externalRecipients.id, issued.id));
    expect(recipient!.transmittalId).not.toBeNull();
    const shares = await db
      .select()
      .from(s.deliverableShares)
      .where(eq(s.deliverableShares.containerId, containerId));
    expect(shares).toHaveLength(0);
  });

  it('writes a transmittal that can never touch a review cycle', async () => {
    const [transmittal] = await db
      .select()
      .from(s.transmittals)
      .where(and(eq(s.transmittals.containerId, containerId), eq(s.transmittals.kind, 'external')));
    expect(transmittal!.roundId).toBeNull();
    expect(transmittal!.direction).toBeNull();
    expect(transmittal!.recipientOrganisationIds).toEqual([]);
    // and the database refuses one that would: the CHECK, not the route
    await expect(
      db.insert(s.transmittals).values({
        kind: 'external',
        containerId,
        versionId: v1Id,
        senderParticipantId: ownerSuperParticipantId,
        direction: 'issue',
      }),
    ).rejects.toThrow();
  });

  it('serves one version to somebody with no session at all', async () => {
    const res = await app.request(`/external-documents/${token}`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as ExternalDocumentResponse;
    expect(doc.versionReference).toBe('P01');
    expect(doc.content).toBe('the issued revision');
    expect(doc.recipientName).toBe(issueBody.recipientName);
    expect(doc.message).toBe(issueBody.message);
    expect(doc.standardMessage).toBe('Issued for information by the project team.');
    // and nothing that would let the holder ask a second question: no
    // container id, no version id, no project id, no participant
    expect(Object.keys(doc)).not.toContain('containerId');
    expect(Object.keys(doc)).not.toContain('versionId');
    expect(Object.keys(doc)).not.toContain('projectId');
  });

  it('reaches the document and NOTHING ELSE of the project', async () => {
    // the token is not a session: the library, the project and the deliverable
    // itself all answer the same 401 they answer a stranger
    expect((await app.request(`/projects/${projectId}/library`)).status).toBe(401);
    expect((await app.request(`/versions/${v1Id}`)).status).toBe(401);
    expect((await app.request(`/containers/${containerId}/transmittals`)).status).toBe(401);
    // and the token cannot be spent on another document's file
    const [otherVersion] = await db
      .insert(s.versions)
      .values({ containerId, versionReference: 'ZZ', content: 'not this one', isCurrent: false })
      .returning();
    const [foreignRendition] = await db
      .insert(s.renditions)
      .values({ versionId: otherVersion!.id, kind: 'pdf', format: 'pdf', contentRef: 'blob:none' })
      .returning();
    const res = await app.request(`/external-documents/${token}/renditions/${foreignRendition!.id}/file`);
    expect(res.status).toBe(404);
  });

  it('does not follow the document forward — a later revision is not served', async () => {
    await db.update(s.versions).set({ isCurrent: false }).where(eq(s.versions.id, v1Id));
    const [v2] = await db
      .insert(s.versions)
      .values({ containerId, versionReference: 'P02', content: 'the revised text', isCurrent: true })
      .returning();
    const doc = (await (await app.request(`/external-documents/${token}`)).json()) as ExternalDocumentResponse;
    expect(doc.versionReference).toBe('P01');
    expect(doc.content).toBe('the issued revision');
    // an issued document is a snapshot of what was sent (ADR-0013/ISO 19650):
    // the newer revision exists and this link has never heard of it
    expect(v2!.id).not.toBe(v1Id);
  });

  it('refuses an expired link, and refuses it exactly as it refuses a made-up one', async () => {
    const [transmittal] = await db
      .insert(s.transmittals)
      .values({
        kind: 'external',
        containerId,
        versionId: v1Id,
        senderParticipantId: ownerSuperParticipantId,
      })
      .returning();
    const expiredToken = `expired-${stamp}-0123456789abcdef`;
    await db.insert(s.externalRecipients).values({
      containerId,
      versionId: v1Id,
      transmittalId: transmittal!.id,
      name: 'Mr B Okafor',
      email: 'b.okafor@example.com',
      reason: 'Consultation',
      message: 'Sent last spring.',
      state: 'issued',
      linkToken: expiredToken,
      expiresAt: sql`now() - interval '1 day'`,
      requestedByParticipantId: ownerSuperParticipantId,
      issuedByParticipantId: ownerSuperParticipantId,
      decidedAt: sql`now()`,
    });
    const expired = await app.request(`/external-documents/${expiredToken}`);
    const invented = await app.request(`/external-documents/never-minted-${stamp}-aaaaaaaaaaaa`);
    expect(expired.status).toBe(404);
    expect(invented.status).toBe(404);
    expect(await expired.json()).toEqual(await invented.json());
  });
});

describe('T-432 — the three levels, from both sides', () => {
  async function setPermission(level: 'any_member' | 'any_super_user' | 'owner_super_user') {
    const res = await patch(ownerSuperSession, `/projects/${projectId}/external-issue-settings`, {
      permission: level,
    });
    expect(res.status).toBe(200);
  }
  const mayIssue = async (cookie: string) =>
    (
      (await (
        await get(cookie, `/projects/${projectId}/external-issue-settings`)
      ).json()) as GetExternalIssueSettingsResponse
    ).mayIssue;

  it('any member of any organisation — everybody issues, nobody requests', async () => {
    await setPermission('any_member');
    expect(await mayIssue(ownerPlainSession)).toBe(true);
    expect(await mayIssue(producerSuperSession)).toBe(true);
    const res = await post(producerSuperSession, `/containers/${containerId}/external-issues`, {
      ...issueBody,
      recipientEmail: 'any-member@example.com',
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as ExternalIssue).state).toBe('issued');
  });

  it('any super user — a plain member asks, and another firm’s super user answers', async () => {
    await setPermission('any_super_user');
    expect(await mayIssue(ownerPlainSession)).toBe(false);
    expect(await mayIssue(producerSuperSession)).toBe(true);

    const asked = (await (
      await post(ownerPlainSession, `/containers/${containerId}/external-issues`, {
        ...issueBody,
        recipientEmail: 'asked-by-plain@example.com',
      })
    ).json()) as ExternalIssue;
    expect(asked.state).toBe('requested');
    expect(asked.linkToken).toBeNull();

    // asking is NOT sending: no transmittal and no expiry stand behind a request
    const [row] = await db
      .select()
      .from(s.externalRecipients)
      .where(eq(s.externalRecipients.id, asked.id));
    expect(row!.transmittalId).toBeNull();
    expect(row!.expiresAt).toBeNull();

    // ADR-0055 §7 supersedes "the sending firm's own super user approves":
    // anybody above the line answers, and here that is a different firm's
    const answered = (await (
      await post(producerSuperSession, `/external-issues/${asked.id}/answer`, { approve: true })
    ).json()) as ExternalIssue;
    expect(answered.state).toBe('issued');
    expect(answered.linkToken).toBeTruthy();
    expect(answered.recipientEmail).toBe('asked-by-plain@example.com');
    // approving issues what was ASKED FOR — the frozen version, not whatever
    // has since become current
    expect(answered.versionId).toBe(asked.versionId);
    expect((await app.request(`/external-documents/${answered.linkToken}`)).status).toBe(200);
  });

  it('only the owning organisation’s super users — the client answers the consultant', async () => {
    await setPermission('owner_super_user');
    expect(await mayIssue(producerSuperSession)).toBe(false);
    expect(await mayIssue(ownerSuperSession)).toBe(true);

    const asked = (await (
      await post(producerSuperSession, `/containers/${containerId}/external-issues`, {
        ...issueBody,
        recipientEmail: 'consultant-asked@example.com',
      })
    ).json()) as ExternalIssue;
    expect(asked.state).toBe('requested');

    // the consultant cannot answer their own request
    const selfAnswer = await post(producerSuperSession, `/external-issues/${asked.id}/answer`, {
      approve: true,
    });
    expect(selfAnswer.status).toBe(404);

    const declined = (await (
      await post(ownerSuperSession, `/external-issues/${asked.id}/answer`, {
        approve: false,
        declineReason: 'The consultation window has closed.',
      })
    ).json()) as ExternalIssue;
    expect(declined.state).toBe('declined');
    expect(declined.declineReason).toBe('The consultation window has closed.');
    expect(declined.declinedBy?.name).toBe('t431-owner-super');
    expect(declined.linkToken).toBeNull();

    // answered once — and the second answer is refused rather than overwriting
    const second = await post(ownerSuperSession, `/external-issues/${asked.id}/answer`, {
      approve: true,
    });
    expect(second.status).toBe(409);
  });

  it('refuses a decline with no reason — “no” with nothing after it is not an answer', async () => {
    const asked = (await (
      await post(producerSuperSession, `/containers/${containerId}/external-issues`, {
        ...issueBody,
        recipientEmail: 'no-reason@example.com',
      })
    ).json()) as ExternalIssue;
    const res = await post(ownerSuperSession, `/external-issues/${asked.id}/answer`, {
      approve: false,
    });
    expect(res.status).toBe(400);
  });

  it('shows the asker their own request, and the approver the facts to decide on', async () => {
    const asked = (await (
      await post(producerSuperSession, `/containers/${containerId}/external-issues`, {
        ...issueBody,
        recipientEmail: 'queue-visible@example.com',
      })
    ).json()) as ExternalIssue;

    const mine = (await (
      await get(producerSuperSession, `/projects/${projectId}/external-issues`)
    ).json()) as ListExternalIssuesResponse;
    expect(mine.items.some((i) => i.id === asked.id)).toBe(true);

    const approver = (await (
      await get(ownerSuperSession, `/projects/${projectId}/external-issues`)
    ).json()) as ListExternalIssuesResponse;
    const seen = approver.items.find((i) => i.id === asked.id);
    expect(seen?.recipientEmail).toBe('queue-visible@example.com');
    expect(seen?.message).toBe(issueBody.message);

    // the rival firm is not above the line and has nothing to do with the ask
    const rival = (await (
      await get(rivalSession, `/projects/${projectId}/external-issues`)
    ).json()) as ListExternalIssuesResponse;
    expect(rival.items.some((i) => i.id === asked.id)).toBe(false);
  });
});

describe('T-431 — who reads that it happened (ADR-0055 §8)', () => {
  it('answers "who was this issued to" on the transmittal log the other kinds use', async () => {
    const res = await get(ownerSuperSession, `/containers/${containerId}/transmittals`);
    const { items } = (await res.json()) as ListContainerTransmittalsResponse;
    const external = items.filter((i) => i.kind === 'external');
    expect(external.length).toBeGreaterThanOrEqual(1);
    expect(external.some((i) => i.externalRecipient?.name === issueBody.recipientName)).toBe(true);
    expect(external[0]!.direction).toBeNull();
    expect(external[0]!.roundNumber).toBeNull();
  });

  it('tells the producing organisation that its document left, and not to whom', async () => {
    const res = await get(producerSuperSession, `/containers/${containerId}/transmittals`);
    const { items } = (await res.json()) as ListContainerTransmittalsResponse;
    // the producer's OWN sends are its own business and are not withheld from
    // it; what §8 withholds is somebody else's recipient, so the assertion is
    // on the rows the owner organisation sent
    const other = items.filter((i) => i.kind === 'external' && i.sender.name === 't431-owner-super');
    expect(other.length).toBeGreaterThanOrEqual(1);
    for (const row of other) {
      expect(row.recipientsWithheld).toBe(true);
      expect(row.externalRecipient).toBeNull();
    }
    const anyExternal = items.filter((i) => i.kind === 'external');
    expect(anyExternal.some((i) => i.externalRecipient?.email === issueBody.recipientEmail)).toBe(false);
  });

  it('shows a rival organisation on the project nothing at all', async () => {
    // give the rival everything the existing transmittal read needs — a live
    // share and an acknowledgement — so this asserts the EXTERNAL cut and not
    // merely that the rival cannot see the deliverable
    await db.insert(s.deliverableShares).values({
      containerId,
      organisationId: rivalOrgId,
      grantedByParticipantId: ownerSuperParticipantId,
    });
    const [current] = await db
      .select({ id: s.versions.id })
      .from(s.versions)
      .where(and(eq(s.versions.containerId, containerId), eq(s.versions.isCurrent, true)));
    await db.insert(s.deliverableAcknowledgements).values({
      containerId,
      versionId: current!.id,
      organisationId: rivalOrgId,
      acknowledgedByParticipantId: rivalParticipantId,
    });

    const log = await get(rivalSession, `/containers/${containerId}/transmittals`);
    expect(log.status).toBe(200);
    const { items } = (await log.json()) as ListContainerTransmittalsResponse;
    expect(items.filter((i) => i.kind === 'external')).toHaveLength(0);

    const list = await get(rivalSession, `/containers/${containerId}/external-issues`);
    const external = (await list.json()) as ListExternalIssuesResponse;
    expect(external.items).toHaveLength(0);

    // the owner, on the same read, sees the person
    const ownerList = (await (
      await get(ownerSuperSession, `/containers/${containerId}/external-issues`)
    ).json()) as ListExternalIssuesResponse;
    expect(ownerList.items.some((i) => i.recipientEmail === issueBody.recipientEmail)).toBe(true);
  });
});
