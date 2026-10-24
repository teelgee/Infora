// T-461 — bulk acts over a selection are ONE ACT: every row checked first, one
// refused row refuses the lot and names itself, the writes land together; and
// the export is the plan template's own shape, so it re-imports.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import type { BulkClassifyResponse, BulkIssueExternallyResponse, BulkRefusal, BulkSupersedeResponse, BulkTransmitResponse, ClassificationSchemeResponse, PlanImportResult } from '@infora/contracts';
import { createDb, hashPassword, schema as s, seedProjectOntology } from '@infora/db';
import { buildApp } from './app';
import { composeReference } from './naming';
import { fakeRouter } from './test-router';
import { parseXlsxSheets } from './xlsx';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });
const stamp = Date.now();
const password = 'pw-t461';
let ownerOrgId: string;
let recvOrgId: string;
let projectId: string;
let owner: string; // the owner organisation's super user
let member: string; // an ordinary member of the owner organisation
let recv: string; // the receiving organisation's super user
let a: string;
let b: string;
let c2: string;
let theirs: string; // produced by the receiving organisation
const scheme = {
  separator: '-',
  fields: [
    { key: 'project', label: 'Project', inCode: true, allowedValues: ['WA'] },
    { key: 'originator', label: 'Originator', inCode: true, isOriginator: true, allowedValues: ['TM', 'RG'] },
    { key: 'discipline', label: 'Discipline', inCode: true, allowedValues: ['GEO', 'ENV'] },
    { key: 'serial', label: 'Serial', inCode: true, isSerial: true, width: 3 },
    { key: 'suitability', label: 'Status code', type: 'select', inCode: false, allowedValues: ['S0', 'S1'] },
  ],
};

async function makeUser(name: string, organisationId: string, elevated: boolean) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId, orgRole: elevated ? 'admin' : 'member' })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId, elevated });
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}-${stamp}@test.local`, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}
async function makeDeliverable(producer: string, values: Record<string, string>, serial: number, title: string, suitability = 'S0') {
  const { reference } = composeReference(scheme as never, values, serial);
  const [container] = await db
    .insert(s.containers)
    .values({ projectId, producingOrganisationId: producer, documentReference: `${reference}`, inLibrary: true, metadata: { suitability, discipline: values['discipline'] } })
    .returning();
  await db.insert(s.workItems).values({ projectId, type: 'document_production', title, status: 'planned', containerId: container!.id });
  await db.insert(s.versions).values({ containerId: container!.id, versionReference: 'C01', content: `text of ${reference}`, isCurrent: true });
  return container!.id;
}
const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) });

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: `t461 owner ${stamp}` }).returning();
  const [recvOrg] = await db.insert(s.organisations).values({ name: `t461 recv ${stamp}` }).returning();
  ownerOrgId = ownerOrg!.id;
  recvOrgId = recvOrg!.id;
  const [project] = await db.insert(s.projects).values({ name: `t461 project ${stamp}`, ownerOrganisationId: ownerOrgId }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrgId, projectId, role: 'owner' },
    { organisationId: recvOrgId, projectId, role: 'member' },
  ]);
  await seedProjectOntology(db, projectId);
  owner = await makeUser('t461-owner', ownerOrgId, true);
  member = await makeUser('t461-member', ownerOrgId, false);
  recv = await makeUser('t461-recv', recvOrgId, true);
  await app.request(`/projects/${projectId}/naming-scheme`, { method: 'PUT', headers: { cookie: owner, 'content-type': 'application/json' }, body: JSON.stringify(scheme) });
  a = await makeDeliverable(ownerOrgId, { project: 'WA', originator: 'TM', discipline: 'GEO' }, 1, 'Ground investigation');
  b = await makeDeliverable(ownerOrgId, { project: 'WA', originator: 'TM', discipline: 'GEO' }, 2, 'Factual report', 'S1');
  c2 = await makeDeliverable(ownerOrgId, { project: 'WA', originator: 'TM', discipline: 'ENV' }, 3, 'Ecology baseline');
  theirs = await makeDeliverable(recvOrgId, { project: 'WA', originator: 'RG', discipline: 'ENV' }, 4, 'Their habitat survey');
  // the rows above were written straight to the table, so the series counters
  // the import allocates from must say where numbering got to
  await db.insert(s.namingSerials).values([
    { projectId, organisationId: ownerOrgId, seriesKey: 'WA-TM-GEO', nextSerial: 3 },
    { projectId, organisationId: ownerOrgId, seriesKey: 'WA-TM-ENV', nextSerial: 4 },
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe('bulk acts (T-461)', () => {
  it('the owner transmits a selection in one act; a row produced by a recipient refuses the lot, and nothing is written', async () => {
    const refusedRes = await post(owner, `/projects/${projectId}/bulk/transmittals`, { containerIds: [a, b, theirs], organisationIds: [recvOrgId] });
    expect(refusedRes.status).toBe(409);
    const refusal = (await refusedRes.json()) as BulkRefusal;
    expect(refusal.failures.map((f) => f.containerId)).toEqual([theirs]);
    expect(refusal.failures[0]!.problem).toBe('produced by a recipient');
    const none = await db.select().from(s.transmittals).where(inArray(s.transmittals.containerId, [a, b]));
    expect(none).toHaveLength(0);

    const ok = await post(owner, `/projects/${projectId}/bulk/transmittals`, { containerIds: [a, b], organisationIds: [recvOrgId] });
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as BulkTransmitResponse;
    expect(body.issued).toBe(2);
    const written = await db.select().from(s.transmittals).where(inArray(s.transmittals.containerId, [a, b]));
    expect(written).toHaveLength(2);
    expect(written.every((t) => t.kind === 'non_review' && t.recipientOrganisationIds?.includes(recvOrgId))).toBe(true);
    // a member of the receiving organisation never issues; a non-owner is absence
    expect((await post(recv, `/projects/${projectId}/bulk/transmittals`, { containerIds: [a], organisationIds: [ownerOrgId] })).status).toBe(404);
  });

  it('classifies a selection with the choice said out loud: append keeps what is set, replace overwrites', async () => {
    const schemeRes = await app.request(`/projects/${projectId}/classification-scheme`, { headers: { cookie: owner } });
    const { facets } = (await schemeRes.json()) as ClassificationSchemeResponse;
    const facet = facets.find((f) => f.key === 'discipline')!;
    const [geo, env] = facet.terms;
    // b already carries a term under the facet
    await app.request(`/containers/${b}/classifications`, { method: 'PUT', headers: { cookie: owner, 'content-type': 'application/json' }, body: JSON.stringify({ facetId: facet.id, termId: env!.id }) });
    const appended = await post(owner, `/projects/${projectId}/bulk/classifications`, { containerIds: [a, b], facetId: facet.id, termId: geo!.id, mode: 'append' });
    expect(appended.status).toBe(200);
    expect((await appended.json()) as BulkClassifyResponse).toEqual({ set: 1, kept: 1 });
    const kept = await db.select().from(s.containerClassifications).where(and(eq(s.containerClassifications.containerId, b), eq(s.containerClassifications.facetId, facet.id)));
    expect(kept[0]!.termId).toBe(env!.id);
    const replaced = await post(owner, `/projects/${projectId}/bulk/classifications`, { containerIds: [a, b], facetId: facet.id, termId: geo!.id, mode: 'replace' });
    expect((await replaced.json()) as BulkClassifyResponse).toEqual({ set: 2, kept: 0 });
    const now = await db.select().from(s.containerClassifications).where(and(eq(s.containerClassifications.containerId, b), eq(s.containerClassifications.facetId, facet.id)));
    expect(now[0]!.termId).toBe(geo!.id);
    // another organisation's row is not the owner's to classify: refused whole
    const crossed = await post(owner, `/projects/${projectId}/bulk/classifications`, { containerIds: [a, theirs], facetId: facet.id, termId: geo!.id, mode: 'replace' });
    expect(crossed.status).toBe(409);
    expect(((await crossed.json()) as BulkRefusal).failures.map((f) => f.containerId)).toEqual([theirs]);
  });

  it('issues a selection outside the project: the super user issues, the member only asks', async () => {
    const issue = { recipientName: 'A Patel', recipientEmail: 'a.patel@example.com', reason: 'Consultation', message: 'Please see attached.', expiresInDays: 7 };
    const issued = await post(owner, `/projects/${projectId}/bulk/external-issues`, { containerIds: [a, b], ...issue });
    expect(issued.status).toBe(201);
    const body = (await issued.json()) as BulkIssueExternallyResponse;
    expect(body.state).toBe('issued');
    expect(body.issueIds).toHaveLength(2);
    const asked = await post(member, `/projects/${projectId}/bulk/external-issues`, { containerIds: [a], ...issue });
    expect(((await asked.json()) as BulkIssueExternallyResponse).state).toBe('requested');
  });

  it('exports the selection in the template’s shape, and the file re-imports through the plan import', async () => {
    const res = await post(owner, `/projects/${projectId}/plan/export`, { containerIds: [a, b, c2, theirs] });
    expect(res.status).toBe(200);
    const sheets = parseXlsxSheets(Buffer.from(await res.arrayBuffer()))!;
    expect(sheets[0]!.name).toBe('Deliverables');
    // T-481 — the Milestones column rides last (a row with none writes an empty cell, which a reader trims)
    expect(sheets[0]!.rows[0]).toEqual(['Title', 'Project', 'Originator', 'Discipline', 'Status code', 'Milestones']);
    expect(sheets[0]!.rows).toHaveLength(5);
    // rows come in reference order; the code columns are read back out of each reference
    expect(sheets[0]!.rows.find((r) => r[0] === 'Ground investigation')).toEqual(['Ground investigation', 'WA', 'TM', 'GEO', 'S0']);
    expect(sheets[0]!.rows.find((r) => r[0] === 'Factual report')).toEqual(['Factual report', 'WA', 'TM', 'GEO', 'S1']);
    expect(sheets[1]!.rows[0]).toEqual(['Reference', 'Title', 'Revision', 'State', 'Producer', 'Issued']);
    expect(sheets[1]!.rows.map((r) => r[0])).toContain('WA-TM-GEO-001');
    // round trip: the owner's own rows re-import as new rows (create-only, T-359)
    const form = new FormData();
    form.append('file', new File([new Uint8Array(await (await post(owner, `/projects/${projectId}/plan/export`, { containerIds: [a, b, c2] })).arrayBuffer())], 'export.xlsx'));
    const imported = await app.request(`/projects/${projectId}/plan/import`, { method: 'POST', headers: { cookie: owner }, body: form });
    expect(imported.status).toBe(201);
    expect(((await imported.json()) as PlanImportResult).created).toBe(3);
    // a row the requester may not see is simply not in the file
    const narrow = await post(recv, `/projects/${projectId}/plan/export`, { containerIds: [a, theirs] });
    const narrowSheets = parseXlsxSheets(Buffer.from(await narrow.arrayBuffer()))!;
    expect(narrowSheets[0]!.rows).toHaveLength(2); // header + theirs: a is behind the wall until acknowledged
  });

  it('one replacement supersedes a selection, confirmed in the same act by the owner', async () => {
    const res = await post(owner, `/projects/${projectId}/bulk/supersessions`, { containerIds: [b, c2], replacementContainerId: a });
    expect(res.status).toBe(201);
    const body = (await res.json()) as BulkSupersedeResponse;
    expect(body.state).toBe('confirmed');
    expect(body.relationshipIds).toHaveLength(2);
    const rows = await db.select({ state: s.containers.state }).from(s.containers).where(inArray(s.containers.id, [b, c2]));
    expect(rows.every((r) => r.state === 'superseded')).toBe(true);
    // the replacement cannot be in its own selection
    const self = await post(owner, `/projects/${projectId}/bulk/supersessions`, { containerIds: [a], replacementContainerId: a });
    expect(self.status).toBe(409);
  });
});
