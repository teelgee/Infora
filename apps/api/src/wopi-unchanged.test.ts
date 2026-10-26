// T-488 (walk defect 13) — **closing the in-browser editor without a change
// writes no new version.**
//
// *In plain terms: when someone opens a spreadsheet in the browser and closes it
// without changing anything, the editor still saves the file back. That used to
// add a "version" to the history (and refill any dashboard fed from the file).
// Now a save whose bytes are exactly the file already held is answered as a
// success and changes nothing; a real edit still lands as a new version.*
//
// Fresh organisation, project and app per run; rows are counted for the table
// this file made.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import type { AppRecord, AppRowRecord, AppTableRecord, EditingSession, ListAppRowsResponse } from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { addStandInScreen } from './app-test-support';
import { getBlob } from './renditions';
import { fakeRouter } from './test-router';
import { testWorkbook } from './test-workbook';

const { db, pool } = createDb();
const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter(),
  editing: { wopiHostUrl: 'http://engine-sees-this:3000' },
});

const stamp = Date.now();
const password = 'pw-t488w';
let projectId: string;
let cookie: string;

const report = (cost: number) =>
  testWorkbook([
    { name: 'Costs', rows: [['Wrenfield cost report'], null, ['Month', 'Cost (£)'], ['Oct', cost]] },
  ]);

const post = (path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

const wopiPut = (fileId: string, token: string, lock: string, bytes: Buffer) =>
  app.request(`/wopi/files/${fileId}/contents?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'X-WOPI-Override': 'PUT', 'X-WOPI-Lock': lock, 'content-type': 'application/octet-stream' },
    body: new Uint8Array(bytes),
  });
const wopiLock = (fileId: string, token: string, override: string, lock: string) =>
  app.request(`/wopi/files/${fileId}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'X-WOPI-Override': override, 'X-WOPI-Lock': lock },
  });

const revisions = (id: string) =>
  db
    .select()
    .from(s.sandboxDocumentVersions)
    .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, id))
    .orderBy(asc(s.sandboxDocumentVersions.createdAt));

beforeAll(async () => {
  const [org] = await db.insert(s.organisations).values({ name: `t488 wopi org ${stamp}` }).returning();
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t488 wopi project ${stamp}`, ownerOrganisationId: org!.id })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values({ organisationId: org!.id, projectId, role: 'owner' });
  const email = `t488-wanda-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name: 't488-wanda', email, organisationId: org!.id, orgRole: 'admin', mayBuildApps: true })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db.insert(s.participants).values({ userId: user!.id, projectId, elevated: true });
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  cookie = res.headers.get('set-cookie')!.split(';')[0]!;
});

afterAll(async () => {
  await pool.end();
});

describe('an editor save with the bytes already held lands nothing (T-488)', () => {
  it('twice with the same bytes: one version, one import; with different bytes: a new version and a new import', async () => {
    // a dashboard fed from the spreadsheet, so a wrongly-landed save would show as rows
    const created = (await (
      await post(`/projects/${projectId}/apps`, { name: `t488 fed ${stamp}`, organisationIds: [], participantIds: [] })
    ).json()) as AppRecord;
    const table = (await (
      await post(`/apps/${created.id}/tables`, {
        name: 'Monthly costs',
        columns: [
          { key: 'month', label: 'Month', type: 'text', required: true },
          { key: 'cost', label: 'Cost', type: 'number', required: true },
        ],
        kind: 'data',
        hasAcceptance: false,
      })
    ).json()) as AppTableRecord;
    await addStandInScreen((path, init) => app.request(path, init), cookie, created.id);
    await post(`/apps/${created.id}/publish`);

    const original = report(1);
    const form = new FormData();
    form.append('file', new File([new Uint8Array(original)], 't488-costs.xlsx'));
    const uploaded = await app.request(`/projects/${projectId}/sandbox-uploads`, { method: 'POST', headers: { cookie }, body: form });
    expect(uploaded.status).toBe(201);
    const documentId = ((await uploaded.json()) as { id: string }).id;
    const attached = await post(`/app-tables/${table.id}/source`, {
      sandboxDocumentId: documentId,
      sheet: 'Costs',
      headerRow: ['Month', 'Cost (£)'],
      mapping: [
        { header: 'Month', columnKey: 'month' },
        { header: 'Cost (£)', columnKey: 'cost' },
      ],
    });
    expect(attached.status).toBe(201);
    const allRows = async () =>
      ((await (await app.request(`/app-tables/${table.id}/rows`, { headers: { cookie } })).json()) as ListAppRowsResponse).items;
    const importedOnce: AppRowRecord[] = await allRows();
    expect(importedOnce).toHaveLength(1);
    expect(await revisions(documentId)).toHaveLength(1);

    // open it in the editor, and close it again without a change
    const session = (await (
      await app.request(`/sandbox-documents/${documentId}/editing-session`, { method: 'POST', headers: { cookie } })
    ).json()) as EditingSession;
    expect((await wopiLock(documentId, session.accessToken, 'LOCK', 'engine-1')).status).toBe(200);
    const held = getBlob((await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, documentId)))[0]!.fileRef!)!;

    const same = await wopiPut(documentId, session.accessToken, 'engine-1', Buffer.from(held));
    expect(same.status).toBe(200); // answered as a successful save
    expect(same.headers.get('X-WOPI-ItemVersion')).toBe('v0.1'); // and nothing moved
    const sameAgain = await wopiPut(documentId, session.accessToken, 'engine-1', Buffer.from(held));
    expect(sameAgain.status).toBe(200);
    expect(await revisions(documentId)).toHaveLength(1); // one version
    expect(await allRows()).toHaveLength(1); // the table was not refilled: no retired copy, no second import
    expect((await allRows())[0]!.id).toBe(importedOnce[0]!.id);

    // a real edit still lands, and still refills the table
    const edited = report(2);
    const changed = await wopiPut(documentId, session.accessToken, 'engine-1', edited);
    expect(changed.status).toBe(200);
    expect(changed.headers.get('X-WOPI-ItemVersion')).toBe('v0.2');
    expect(await revisions(documentId)).toHaveLength(2);
    const after = await allRows();
    expect(after).toHaveLength(2);
    expect(after.filter((row) => row.retiredAt === null).map((row) => row.values['cost'])).toEqual([2]);

    // and the replace-file route agrees: the file already held is no new version
    const replaceForm = new FormData();
    replaceForm.append('file', new File([new Uint8Array(edited)], 't488-costs.xlsx'));
    expect((await wopiLock(documentId, session.accessToken, 'UNLOCK', 'engine-1')).status).toBe(200);
    const replaced = await app.request(`/sandbox-documents/${documentId}/file`, { method: 'POST', headers: { cookie }, body: replaceForm });
    expect(replaced.status).toBe(200);
    expect(await revisions(documentId)).toHaveLength(2);
    expect(await allRows()).toHaveLength(2);
  });
});
