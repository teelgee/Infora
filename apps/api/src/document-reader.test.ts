// T-483 — the document page opens any document the person may READ.
//
// *In plain terms: a consultant can open the page of a standard, and Redgate
// can open the page of another firm's report that was shared with it and
// acknowledged. Each gets what the library list already tells them (what it is,
// its revision, its currency, what has happened to it) and none of the plan's
// management facts. Before the share is acknowledged, after it is revoked, or
// for an organisation that never had it: the same silent absence as ever.*
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type {
  ContainerCitedByResponse,
  GetContainerCurrencyResponse,
  GetReaderDocumentResponse,
  ListContainerStateChangesResponse,
  ListRenditionsResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const stamp = Date.now();
const password = 'pw-t483';
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter('ok') });

let projectId: string;
let ownerOrgId: string;
let producerOrgId: string;
let readerOrgId: string;
let outsiderOrgId: string;
let ownerParticipant: string;
let cookies: Record<'owner' | 'producer' | 'reader' | 'outsider' | 'consultant', string>;
let standardId: string; // reference material produced by the owner, shared to the consultant
let reportId: string; // a producer's deliverable shared to the reader
let reportVersionId: string;
let freezeId: string; // a sandbox-scope container of the producer
let withdrawnStandardId: string;

async function makeUser(name: string, organisationId: string) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db.insert(s.users).values({ name, email, organisationId, orgRole: 'admin' }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId, elevated: true }).returning();
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, participantId: participant!.id };
}
const get = (cookie: string, path: string) => app.request(path, { headers: { cookie } });

async function container(values: {
  producer: string;
  reference: string;
  title: string;
  scope?: 'library' | 'sandbox';
  state?: 'live' | 'withdrawn' | 'superseded';
  withWorkItem?: boolean;
}) {
  const [c] = await db
    .insert(s.containers)
    .values({
      projectId,
      producingOrganisationId: values.producer,
      documentReference: values.scope === 'sandbox' ? null : values.reference,
      title: values.title,
      scope: values.scope ?? 'library',
      inLibrary: (values.scope ?? 'library') === 'library',
      state: values.state ?? 'live',
    })
    .returning();
  const [v] = await db
    .insert(s.versions)
    .values({ containerId: c!.id, versionReference: 'R01', content: `Content of ${values.title}`, isCurrent: true })
    .returning();
  if (values.withWorkItem) {
    await db.insert(s.workItems).values({
      projectId,
      type: 'document_production',
      title: values.title,
      status: 'accepted',
      containerId: c!.id,
    });
  }
  return { id: c!.id, versionId: v!.id };
}
const share = (containerId: string, organisationId: string) =>
  db.insert(s.deliverableShares).values({ containerId, organisationId, grantedByParticipantId: ownerParticipant });
const acknowledge = (containerId: string, versionId: string, organisationId: string, by: string) =>
  db.insert(s.deliverableAcknowledgements).values({ containerId, versionId, organisationId, acknowledgedByParticipantId: by });

beforeAll(async () => {
  const orgs = await db
    .insert(s.organisations)
    .values(['owner', 'producer', 'reader', 'outsider', 'consultant'].map((n) => ({ name: `t483 ${n} ${stamp}` })))
    .returning();
  ownerOrgId = orgs[0]!.id;
  producerOrgId = orgs[1]!.id;
  readerOrgId = orgs[2]!.id;
  outsiderOrgId = orgs[3]!.id;
  const consultantOrgId = orgs[4]!.id;
  const [project] = await db.insert(s.projects).values({ name: `t483 ${stamp}`, ownerOrganisationId: ownerOrgId }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrgId, projectId, role: 'owner' },
    ...[producerOrgId, readerOrgId, outsiderOrgId, consultantOrgId].map((organisationId) => ({
      organisationId,
      projectId,
      role: 'member' as const,
    })),
  ]);
  const owner = await makeUser('t483-owner', ownerOrgId);
  ownerParticipant = owner.participantId;
  const producer = await makeUser('t483-producer', producerOrgId);
  const reader = await makeUser('t483-reader', readerOrgId);
  const outsider = await makeUser('t483-outsider', outsiderOrgId);
  const consultant = await makeUser('t483-consultant', consultantOrgId);
  cookies = {
    owner: owner.cookie,
    producer: producer.cookie,
    reader: reader.cookie,
    outsider: outsider.cookie,
    consultant: consultant.cookie,
  };

  // a standard of the owner's, shared with the consultant and acknowledged
  const standard = await container({ producer: ownerOrgId, reference: `T483-STD-${stamp}`, title: 'A standard' });
  standardId = standard.id;
  await share(standardId, consultantOrgId);
  await acknowledge(standardId, standard.versionId, consultantOrgId, consultant.participantId);
  await db.insert(s.containerStateChanges).values({
    containerId: standardId,
    projectId,
    fromState: 'live',
    toState: 'live',
    reason: 'checked',
    changedByParticipantId: ownerParticipant,
  });

  // a withdrawn standard the consultant once cited: still opens
  const withdrawn = await container({
    producer: ownerOrgId,
    reference: `T483-WDR-${stamp}`,
    title: 'A withdrawn standard',
    state: 'withdrawn',
  });
  withdrawnStandardId = withdrawn.id;
  await db
    .update(s.containers)
    .set({ withdrawnReason: 'replaced by a newer edition' })
    .where(eq(s.containers.id, withdrawnStandardId));
  await share(withdrawnStandardId, consultantOrgId);
  await acknowledge(withdrawnStandardId, withdrawn.versionId, consultantOrgId, consultant.participantId);
  await db.insert(s.containerStateChanges).values({
    containerId: withdrawnStandardId,
    projectId,
    fromState: 'live',
    toState: 'withdrawn',
    reason: 'replaced by a newer edition',
    changedByParticipantId: ownerParticipant,
  });

  // the producer's own deliverable (a work item, so a deliverable, not reference material)
  const report = await container({
    producer: producerOrgId,
    reference: `T483-RPT-${stamp}`,
    title: 'A report',
    withWorkItem: true,
  });
  reportId = report.id;
  reportVersionId = report.versionId;
  await db.insert(s.containerStateChanges).values({
    containerId: reportId,
    projectId,
    fromState: 'live',
    toState: 'superseded',
    reason: 'a newer issue',
    changedByParticipantId: producer.participantId,
  });
  // shared to the reader, NOT yet acknowledged (the first cases below)
  await share(reportId, readerOrgId);

  // the producer's org-private freeze-series container
  freezeId = (await container({ producer: producerOrgId, reference: '', title: 'Freeze', scope: 'sandbox' })).id;
  // even a share row on it must not open it: a freeze-series container is its producer's alone
  await share(freezeId, readerOrgId);
});

afterAll(async () => {
  await pool.end();
});

describe('T-483 — the reader read and the reads behind the page', () => {
  it('a consultant reads a standard: its reader row, currency, cited-by and state changes', async () => {
    const res = await get(cookies.consultant, `/containers/${standardId}/reader`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetReaderDocumentResponse;
    expect(body.containerId).toBe(standardId);
    expect(body.kind).toBe('reference');
    expect(body.state).toBe('live');
    expect(body.title).toBe('A standard');
    // no plan facts ride on it
    expect(Object.keys(body)).not.toContain('authors');
    expect(Object.keys(body)).not.toContain('reviewers');
    expect(Object.keys(body)).not.toContain('sharedWith');

    const currency = await get(cookies.consultant, `/containers/${standardId}/currency`);
    expect(currency.status).toBe(200);
    expect(((await currency.json()) as GetContainerCurrencyResponse).currency.state).toBe('unconfirmed');
    const citedBy = await get(cookies.consultant, `/containers/${standardId}/cited-by`);
    expect(citedBy.status).toBe(200);
    expect(((await citedBy.json()) as ContainerCitedByResponse).items).toEqual([]);
    const changes = await get(cookies.consultant, `/containers/${standardId}/state-changes`);
    expect(changes.status).toBe(200);
    expect(((await changes.json()) as ListStateChanges).items).toHaveLength(1);
    expect((await get(cookies.consultant, `/containers/${standardId}/relationships`)).status).toBe(200);
    const renditions = await get(cookies.consultant, `/versions/${body.currentVersionId}/renditions`);
    expect(renditions.status).toBe(200);
    expect(((await renditions.json()) as ListRenditionsResponse).items).toEqual([]);
  });

  it('a withdrawn standard still opens, carrying the reason', async () => {
    const res = await get(cookies.consultant, `/containers/${withdrawnStandardId}/reader`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetReaderDocumentResponse;
    expect(body.state).toBe('withdrawn');
    expect(body.withdrawnReason).toBe('replaced by a newer edition');
    const changes = await get(cookies.consultant, `/containers/${withdrawnStandardId}/state-changes`);
    expect(changes.status).toBe(200);
  });

  it('before the share is acknowledged the reader gets absence on both reads', async () => {
    expect((await get(cookies.reader, `/containers/${reportId}/reader`)).status).toBe(404);
    expect((await get(cookies.reader, `/containers/${reportId}/state-changes`)).status).toBe(404);
  });

  it('after acknowledgement the reader opens the shared deliverable, with no plan facts', async () => {
    const [reader] = await db
      .select({ id: s.participants.id })
      .from(s.participants)
      .innerJoin(s.users, eq(s.users.id, s.participants.userId))
      .where(and(eq(s.participants.projectId, projectId), eq(s.users.organisationId, readerOrgId)));
    await acknowledge(reportId, reportVersionId, readerOrgId, reader!.id);
    const res = await get(cookies.reader, `/containers/${reportId}/reader`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetReaderDocumentResponse;
    expect(body.kind).toBe('deliverable');
    expect(body.containerId).toBe(reportId);
    expect(Object.keys(body)).not.toContain('authors');
    const changes = await get(cookies.reader, `/containers/${reportId}/state-changes`);
    expect(changes.status).toBe(200);
    expect(((await changes.json()) as ListStateChanges).items).toHaveLength(1);
    // the plan read is NOT widened: the reader still has no plan row for it
    const plan = (await (await get(cookies.reader, `/projects/${projectId}/plan`)).json()) as {
      items: Array<{ containerId: string }>;
    };
    expect(plan.items.some((r) => r.containerId === reportId)).toBe(false);
  });

  it('an organisation outside the share gets absence on both reads, and so does a consultant on the unshared report', async () => {
    expect((await get(cookies.outsider, `/containers/${reportId}/reader`)).status).toBe(404);
    expect((await get(cookies.outsider, `/containers/${reportId}/state-changes`)).status).toBe(404);
    expect((await get(cookies.consultant, `/containers/${reportId}/reader`)).status).toBe(404);
    expect((await get(cookies.outsider, `/containers/${standardId}/reader`)).status).toBe(404);
  });

  it('the owner and the producer are answered by the reader read too', async () => {
    expect((await get(cookies.owner, `/containers/${reportId}/reader`)).status).toBe(200);
    expect((await get(cookies.producer, `/containers/${reportId}/reader`)).status).toBe(200);
  });

  it('after revocation the reader gets absence again', async () => {
    await db
      .update(s.deliverableShares)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(s.deliverableShares.containerId, reportId), eq(s.deliverableShares.organisationId, readerOrgId)));
    expect((await get(cookies.reader, `/containers/${reportId}/reader`)).status).toBe(404);
    expect((await get(cookies.reader, `/containers/${reportId}/state-changes`)).status).toBe(404);
  });

  it('a sandbox-scope container opens for nobody but its producer, even with a share row', async () => {
    expect((await get(cookies.reader, `/containers/${freezeId}/reader`)).status).toBe(404);
    expect((await get(cookies.owner, `/containers/${freezeId}/reader`)).status).toBe(404);
    expect((await get(cookies.outsider, `/containers/${freezeId}/reader`)).status).toBe(404);
    expect((await get(cookies.reader, `/containers/${freezeId}/state-changes`)).status).toBe(404);
    expect((await get(cookies.owner, `/containers/${freezeId}/state-changes`)).status).toBe(404);
  });

  it('a malformed or unknown id is plain absence', async () => {
    expect((await get(cookies.owner, `/containers/not-an-id/reader`)).status).toBe(404);
    expect((await get(cookies.owner, `/containers/00000000-0000-4000-8000-000000000000/reader`)).status).toBe(404);
  });
});

type ListStateChanges = ListContainerStateChangesResponse;
