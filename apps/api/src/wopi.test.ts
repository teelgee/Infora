// T-453 acceptance, against the live dev database: a SCRIPTED WOPI client — no
// editing engine — opens, edits and saves an uploaded .docx and .xlsx through
// Infora's WOPI host, and each save lands as a v0.x working revision that keeps
// its file. The engine's lock rides the check-out (head_locked +
// sandbox_checkout_events); a second writer is refused with the holder named in
// words; and a revoked scope grant drops editor access on the very next call,
// driven over HTTP as the party who revokes (the wall negative).
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { createDb, hashPassword, schema as s } from '@infora/db';
import type { EditingSession } from '@infora/contracts';
import { buildApp } from './app';
import { getBlob, putBlob } from './renditions';
import { docx } from './test-docx';
import { purgeSandboxDocument } from './purge';
import { fakeRouter } from './test-router';
import { buildXlsx } from './xlsx';

const { db, pool } = createDb();
const app = buildApp({
  db,
  sessionSecret: 'test-secret',
  router: fakeRouter(),
  editing: { wopiHostUrl: 'http://engine-sees-this:3000' },
});

const stamp = Date.now();
const password = 'pw-t453';
let projectId: string;
let orgA: string;
let amy: { cookie: string; participantId: string; userId: string; name: string };
let cal: { cookie: string; participantId: string; userId: string; name: string };
let ola: { cookie: string; participantId: string; userId: string; name: string };
let docxId: string;
let xlsxId: string;

async function makeUser(name: string, organisationId: string) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name.normalize('NFKD').replace(/[^a-z0-9-]/g, '')}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId }).returning();
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user!.email, password }),
  });
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, participantId: participant!.id, userId: user!.id, name };
}

async function upload(cookie: string, name: string, bytes: Buffer): Promise<string> {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name));
  const res = await app.request(`/projects/${projectId}/sandbox-uploads`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function mint(cookie: string, documentId: string) {
  return app.request(`/sandbox-documents/${documentId}/editing-session`, { method: 'POST', headers: { cookie } });
}
async function pass(cookie: string, documentId: string): Promise<EditingSession> {
  const res = await mint(cookie, documentId);
  expect(res.status).toBe(201);
  return (await res.json()) as EditingSession;
}

// ── the scripted WOPI client: exactly what an engine sends, and no cookie ────
const wopi = {
  checkFileInfo: (fileId: string, token: string) =>
    app.request(`/wopi/files/${fileId}?access_token=${encodeURIComponent(token)}`),
  getFile: (fileId: string, token: string) =>
    app.request(`/wopi/files/${fileId}/contents?access_token=${encodeURIComponent(token)}`),
  putFile: (fileId: string, token: string, lock: string, bytes: Buffer) =>
    app.request(`/wopi/files/${fileId}/contents?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'X-WOPI-Override': 'PUT', 'X-WOPI-Lock': lock, 'content-type': 'application/octet-stream' },
      body: new Uint8Array(bytes),
    }),
  lockOp: (fileId: string, token: string, override: string, lock = '', oldLock?: string) =>
    app.request(`/wopi/files/${fileId}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'X-WOPI-Override': override,
        ...(lock !== '' && { 'X-WOPI-Lock': lock }),
        ...(oldLock !== undefined && { 'X-WOPI-OldLock': oldLock }),
      },
    }),
};

const docRow = async (id: string) =>
  (await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, id)))[0]!;
const revisions = (id: string) =>
  db
    .select()
    .from(s.sandboxDocumentVersions)
    .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, id))
    .orderBy(asc(s.sandboxDocumentVersions.createdAt));
const checkouts = (id: string) =>
  db
    .select()
    .from(s.sandboxCheckoutEvents)
    .where(eq(s.sandboxCheckoutEvents.sandboxDocumentId, id))
    .orderBy(asc(s.sandboxCheckoutEvents.createdAt));

beforeAll(async () => {
  const [a] = await db.insert(s.organisations).values({ name: 't453 org A' }).returning();
  const [b] = await db.insert(s.organisations).values({ name: 't453 org B' }).returning();
  orgA = a!.id;
  const [project] = await db.insert(s.projects).values({ name: 't453 project', ownerOrganisationId: orgA }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: orgA, projectId, role: 'owner' },
    { organisationId: b!.id, projectId, role: 'member' },
  ]);
  amy = await makeUser('t453-amy', orgA);
  cal = await makeUser('t453-cal', orgA);
  ola = await makeUser('t453-ola', b!.id);
  docxId = await upload(amy.cookie, `t453-report.docx`, docx(['First draft of the report.']));
  xlsxId = await upload(amy.cookie, `t453-costs.xlsx`, buildXlsx([{ name: 'Costs', rows: [['Item', 'Cost'], ['Piling', '1200']] }]));
});

afterAll(async () => {
  await pool.end();
});

describe('the pass: one file, one sign-in, worth nothing on its own (T-453)', () => {
  it('mints a short-lived pass for an uploaded Office file, stored only as a hash', async () => {
    const session = await pass(amy.cookie, docxId);
    expect(session.wopiSrc).toBe(`http://engine-sees-this:3000/wopi/files/${docxId}`);
    expect(session.accessTokenTtl).toBeGreaterThan(Date.now());
    expect(session.accessTokenTtl).toBeLessThanOrEqual(Date.now() + 60 * 60_000);
    const hash = createHash('sha256').update(session.accessToken).digest('hex');
    const [row] = await db.select().from(s.wopiAccessTokens).where(eq(s.wopiAccessTokens.tokenHash, hash));
    expect(row?.sandboxDocumentId).toBe(docxId);
    const [raw] = await db
      .select()
      .from(s.wopiAccessTokens)
      .where(eq(s.wopiAccessTokens.tokenHash, session.accessToken));
    expect(raw).toBeUndefined(); // the pass itself is never stored
  });

  it('refuses a pass for a file the requester cannot reach — another organisation is 404', async () => {
    expect((await mint(ola.cookie, docxId)).status).toBe(404);
  });

  it('opens no other file: a docx pass presented for the xlsx is 401', async () => {
    const session = await pass(amy.cookie, docxId);
    expect((await wopi.checkFileInfo(xlsxId, session.accessToken)).status).toBe(401);
    expect((await wopi.getFile(xlsxId, session.accessToken)).status).toBe(401);
  });

  it('an unknown or expired pass is 401', async () => {
    expect((await wopi.checkFileInfo(docxId, 'not-a-pass')).status).toBe(401);
    const session = await pass(amy.cookie, docxId);
    await db
      .update(s.wopiAccessTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(s.wopiAccessTokens.tokenHash, createHash('sha256').update(session.accessToken).digest('hex')));
    expect((await wopi.checkFileInfo(docxId, session.accessToken)).status).toBe(401);
  });

  it('dies with the sign-in that asked for it', async () => {
    const leaver = await makeUser('t453-lee', orgA);
    const session = await pass(leaver.cookie, docxId);
    expect((await wopi.checkFileInfo(docxId, session.accessToken)).status).toBe(200);
    await app.request('/auth/session', { method: 'DELETE', headers: { cookie: leaver.cookie } });
    expect((await wopi.checkFileInfo(docxId, session.accessToken)).status).toBe(401);
  });
});

describe('a scripted WOPI client opens, edits and saves (T-453)', () => {
  it('opens a .docx: CheckFileInfo describes it and GetFile serves its exact bytes', async () => {
    const { accessToken } = await pass(amy.cookie, docxId);
    const info = (await (await wopi.checkFileInfo(docxId, accessToken)).json()) as Record<string, unknown>;
    expect(info).toMatchObject({
      BaseFileName: 't453-report.docx',
      UserFriendlyName: 't453-amy',
      UserId: amy.participantId,
      UserCanWrite: true,
      SupportsLocks: true,
      SupportsUpdate: true,
      UserCanNotWriteRelative: true,
      Version: 'v0.1',
    });
    const file = await wopi.getFile(docxId, accessToken);
    expect(file.status).toBe(200);
    const served = Buffer.from(await file.arrayBuffer());
    expect(served.equals(getBlob((await docRow(docxId)).fileRef!)!)).toBe(true);
    expect(info.Size).toBe(served.length);
  });

  it('edits and saves a .docx: lock → save → v0.2 keeping its file → unlock, all on the check-out', async () => {
    const { accessToken } = await pass(amy.cookie, docxId);
    expect((await wopi.lockOp(docxId, accessToken, 'LOCK', 'engine-lock-1')).status).toBe(200);
    const locked = await docRow(docxId);
    expect(locked.headLocked).toBe(true); // the WOPI lock IS the check-out
    expect(locked.wopiLock).toBe('engine-lock-1');

    const edited = docx(['Second draft, edited in the browser.']);
    const saved = await wopi.putFile(docxId, accessToken, 'engine-lock-1', edited);
    expect(saved.status).toBe(200);
    expect(saved.headers.get('X-WOPI-ItemVersion')).toBe('v0.2');

    const after = await docRow(docxId);
    expect(getBlob(after.fileRef!)!.equals(edited)).toBe(true);
    const history = await revisions(docxId);
    expect(history).toHaveLength(2);
    expect(history[1]!.fileRef).toBe(after.fileRef); // the revision keeps its file
    expect(history[1]!.createdByParticipantId).toBe(amy.participantId);
    expect(getBlob(history[0]!.fileRef!)!.equals(edited)).toBe(false); // v0.1 is still v0.1

    // the version history over the ordinary API shows the save as v0.2
    const listed = (await (
      await app.request(`/sandbox-documents/${docxId}/history`, { headers: { cookie: amy.cookie } })
    ).json()) as { items: { versionReference: string }[] };
    expect(listed.items.map((i) => i.versionReference)).toEqual(['v0.2', 'v0.1']);

    expect((await wopi.lockOp(docxId, accessToken, 'UNLOCK', 'engine-lock-1')).status).toBe(200);
    expect((await docRow(docxId)).headLocked).toBe(false);
    const trail = await checkouts(docxId);
    expect(trail.map((e) => [e.action, e.wopiLock, e.byParticipantId])).toEqual([
      ['checked_out', 'engine-lock-1', amy.participantId],
      ['released', 'engine-lock-1', amy.participantId],
    ]);
  });

  it('edits and saves a .xlsx: the saved workbook lands as v0.2 and its text is re-extracted', async () => {
    const { accessToken } = await pass(amy.cookie, xlsxId);
    expect((await wopi.lockOp(xlsxId, accessToken, 'LOCK', 'engine-lock-x')).status).toBe(200);
    const edited = buildXlsx([{ name: 'Costs', rows: [['Item', 'Cost'], ['Piling', '1350'], ['Drainage', '400']] }]);
    const saved = await wopi.putFile(xlsxId, accessToken, 'engine-lock-x', edited);
    expect(saved.status).toBe(200);
    expect(saved.headers.get('X-WOPI-ItemVersion')).toBe('v0.2');
    const after = await docRow(xlsxId);
    expect(after.content).toContain('Drainage');
    expect((await revisions(xlsxId)).map((r) => r.fileRef)).toContain(after.fileRef);
    const info = (await (await wopi.checkFileInfo(xlsxId, accessToken)).json()) as { Version: string };
    expect(info.Version).toBe('v0.2');
    expect((await wopi.lockOp(xlsxId, accessToken, 'UNLOCK', 'engine-lock-x')).status).toBe(200);
  });

  it('refuses a save into an unlocked file, and an unlock by a lock that does not hold it', async () => {
    const { accessToken } = await pass(amy.cookie, xlsxId);
    const before = (await revisions(xlsxId)).length;
    const res = await wopi.putFile(xlsxId, accessToken, 'nobody', buildXlsx([{ name: 'X', rows: [['x']] }]));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail: string }).detail).toBe('not_locked');
    expect((await wopi.lockOp(xlsxId, accessToken, 'UNLOCK', 'nobody')).status).toBe(409);
    expect(await revisions(xlsxId)).toHaveLength(before);
  });
});

describe('the engine lock refuses a second writer, in words (T-453)', () => {
  it('a second editor is refused with the holder named, and cannot save', async () => {
    const amyPass = await pass(amy.cookie, docxId);
    const calPass = await pass(cal.cookie, docxId);
    expect((await wopi.lockOp(docxId, amyPass.accessToken, 'LOCK', 'engine-A')).status).toBe(200);

    const refused = await wopi.lockOp(docxId, calPass.accessToken, 'LOCK', 'engine-B');
    expect(refused.status).toBe(409);
    expect(refused.headers.get('X-WOPI-Lock')).toBe('engine-A');
    expect(refused.headers.get('X-WOPI-LockFailureReason')).toMatch(
      /^t453-amy has this file open in another editor since .+ UTC\. Only that editor can save it until it closes the file\.$/,
    );

    const before = (await revisions(docxId)).length;
    const save = await wopi.putFile(docxId, calPass.accessToken, 'engine-B', docx(['overwrite']));
    expect(save.status).toBe(409);
    const body = (await save.json()) as { detail: string; hint: string };
    expect(body.detail).toBe('held_by_another_editor');
    expect(body.hint).toContain('t453-amy has this file open in another editor');
    expect(await revisions(docxId)).toHaveLength(before);
  });

  it('a holder whose name is not ASCII is still named — exactly in the body, safely in the header', async () => {
    const zoe = await makeUser('t453-zoë', orgA);
    const docId = await upload(zoe.cookie, 't453-zoe.docx', docx(['Zoë’s file.']));
    const zoePass = await pass(zoe.cookie, docId);
    const calPass = await pass(cal.cookie, docId);
    expect((await wopi.lockOp(docId, zoePass.accessToken, 'LOCK', 'engine-Z')).status).toBe(200);
    const refused = await wopi.lockOp(docId, calPass.accessToken, 'LOCK', 'engine-Q');
    expect(refused.status).toBe(409);
    expect(refused.headers.get('X-WOPI-LockFailureReason')).toMatch(/^t453-zoe has this file open/);
    expect(((await refused.json()) as { hint: string }).hint).toMatch(/^t453-zoë has this file open/);
  });

  it('the same engine re-asserting its lock is a refresh, and a co-editor saving THROUGH it lands under their own name', async () => {
    const amyPass = await pass(amy.cookie, docxId);
    const calPass = await pass(cal.cookie, docxId);
    // an engine co-editing for two people holds ONE lock and saves with
    // whichever person's pass is current — the lock, not the pass, is the gate
    expect((await wopi.lockOp(docxId, amyPass.accessToken, 'LOCK', 'engine-A')).status).toBe(200);
    expect((await wopi.lockOp(docxId, amyPass.accessToken, 'REFRESH_LOCK', 'engine-A')).status).toBe(200);
    const getLock = await wopi.lockOp(docxId, calPass.accessToken, 'GET_LOCK');
    expect(getLock.headers.get('X-WOPI-Lock')).toBe('engine-A');
    expect((await wopi.putFile(docxId, calPass.accessToken, 'engine-A', docx(['Cal’s edit.']))).status).toBe(200);
    expect((await revisions(docxId)).at(-1)!.createdByParticipantId).toBe(cal.participantId);
  });

  it('a person cannot replace, freeze or delete the file while the engine holds it', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(docx(['swap']))], 'swap.docx'));
    const replace = await app.request(`/sandbox-documents/${docxId}/file`, {
      method: 'POST',
      headers: { cookie: amy.cookie },
      body: form,
    });
    expect(replace.status).toBe(409);
    expect(((await replace.json()) as { detail: string }).detail).toBe('head_locked');
    const freeze = await app.request(`/sandbox-documents/${docxId}/freeze`, {
      method: 'POST',
      headers: { cookie: amy.cookie, 'content-type': 'application/json' },
    });
    expect(freeze.status).toBe(409);
    expect(((await freeze.json()) as { detail: string }).detail).toBe('open_in_editor');
    expect((await app.request(`/sandbox-documents/${docxId}`, { method: 'DELETE', headers: { cookie: amy.cookie } })).status).toBe(409);
  });

  it('UnlockAndRelock swaps the holder’s own string, and only the holder’s', async () => {
    const { accessToken } = await pass(amy.cookie, docxId);
    expect((await wopi.lockOp(docxId, accessToken, 'LOCK', 'engine-A2', 'not-the-lock')).status).toBe(409);
    expect((await wopi.lockOp(docxId, accessToken, 'LOCK', 'engine-A2', 'engine-A')).status).toBe(200);
    expect((await docRow(docxId)).wopiLock).toBe('engine-A2');
  });

  it('a lock whose 30 minutes ran out is released, with the reason written down, and the next engine takes it', async () => {
    await db
      .update(s.sandboxDocuments)
      .set({ wopiLockExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(s.sandboxDocuments.id, docxId));
    const { accessToken } = await pass(cal.cookie, docxId);
    expect((await wopi.lockOp(docxId, accessToken, 'LOCK', 'engine-C')).status).toBe(200);
    expect((await docRow(docxId)).wopiLock).toBe('engine-C');
    const lapsed = (await checkouts(docxId)).find((e) => e.reason === 'engine lock lapsed');
    expect(lapsed).toMatchObject({ action: 'released', wopiLock: 'engine-A2', byParticipantId: amy.participantId });
  });

  it('releasing the check-out in Infora ends the engine lock too — one lock', async () => {
    const release = await app.request(`/sandbox-documents/${docxId}/release`, {
      method: 'POST',
      headers: { cookie: cal.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'closing the editor for them' }),
    });
    expect(release.status).toBe(200);
    const row = await docRow(docxId);
    expect([row.headLocked, row.wopiLock, row.wopiLockExpiresAt]).toEqual([false, null, null]);
    expect((await checkouts(docxId)).at(-1)).toMatchObject({ action: 'released', wopiLock: 'engine-C' });
  });

  it('a person’s freeze holds the head: the engine opens read-only and its lock is refused in words', async () => {
    const freeze = await app.request(`/sandbox-documents/${xlsxId}/freeze`, {
      method: 'POST',
      headers: { cookie: amy.cookie, 'content-type': 'application/json' },
    });
    expect(freeze.status).toBe(201);
    const { accessToken } = await pass(cal.cookie, xlsxId);
    const info = (await (await wopi.checkFileInfo(xlsxId, accessToken)).json()) as { UserCanWrite: boolean };
    expect(info.UserCanWrite).toBe(false);
    const refused = await wopi.lockOp(xlsxId, accessToken, 'LOCK', 'engine-D');
    expect(refused.status).toBe(409);
    expect(refused.headers.get('X-WOPI-Lock')).toBe('');
    expect(refused.headers.get('X-WOPI-LockFailureReason')).toMatch(/^t453-amy has checked this file out for review since/);
  });
});

describe('the wall negative: a revoked grant drops editor access on the next call (T-453)', () => {
  let sandboxId: string;
  let grantId: string;
  let teamDocId: string;

  beforeAll(async () => {
    // a team sandbox: Amy's own, with Cal admitted by a participant grant
    const [sandbox] = await db
      .insert(s.sandboxes)
      .values({ projectId, name: 't453 team', scope: 'team', owningOrganisationId: orgA, createdByParticipantId: amy.participantId })
      .returning();
    sandboxId = sandbox!.id;
    await db.insert(s.sandboxScopeGrants).values({
      sandboxId,
      granteeType: 'participant',
      participantId: amy.participantId,
      grantedByParticipantId: amy.participantId,
    });
    const [grant] = await db
      .insert(s.sandboxScopeGrants)
      .values({ sandboxId, granteeType: 'participant', participantId: cal.participantId, grantedByParticipantId: amy.participantId })
      .returning();
    grantId = grant!.id;
    const bytes = buildXlsx([{ name: 'Team', rows: [['Owner', 'Amy']] }]);
    const fileRef = putBlob(bytes, 'xlsx');
    const [doc] = await db
      .insert(s.sandboxDocuments)
      .values({
        projectId,
        organisationId: orgA,
        sandboxId,
        title: 't453 team sheet',
        origin: 'uploaded',
        format: 'xlsx',
        content: 'Owner Amy',
        fileRef,
        createdByParticipantId: amy.participantId,
      })
      .returning();
    teamDocId = doc!.id;
    await db.insert(s.sandboxDocumentVersions).values({
      sandboxDocumentId: teamDocId,
      content: 'Owner Amy',
      fileRef,
      createdByParticipantId: amy.participantId,
    });
  });

  it('Cal, admitted, is editing; Amy revokes over HTTP; Cal’s very next call — even holding the lock — is refused', async () => {
    const { accessToken } = await pass(cal.cookie, teamDocId);
    expect((await wopi.lockOp(teamDocId, accessToken, 'LOCK', 'engine-cal')).status).toBe(200);
    expect((await wopi.putFile(teamDocId, accessToken, 'engine-cal', buildXlsx([{ name: 'Team', rows: [['Owner', 'Cal']] }]))).status).toBe(200);
    const before = (await revisions(teamDocId)).length;

    // driven as the other party: the sandbox's owner revokes Cal's grant
    const revoke = await app.request(`/sandbox-scope-grants/${grantId}/revocation`, {
      method: 'POST',
      headers: { cookie: amy.cookie },
    });
    expect(revoke.status).toBe(200);

    // the pass is unexpired and its sign-in live — the ENTITLEMENT is what ended
    expect((await wopi.checkFileInfo(teamDocId, accessToken)).status).toBe(404);
    expect((await wopi.getFile(teamDocId, accessToken)).status).toBe(404);
    const save = await wopi.putFile(teamDocId, accessToken, 'engine-cal', buildXlsx([{ name: 'Team', rows: [['Owner', 'Mallory']] }]));
    expect(save.status).toBe(404);
    expect((await wopi.lockOp(teamDocId, accessToken, 'REFRESH_LOCK', 'engine-cal')).status).toBe(404);
    expect(await revisions(teamDocId)).toHaveLength(before);
    expect((await mint(cal.cookie, teamDocId)).status).toBe(404);
  });

  it('Amy, still admitted, keeps editing the same file', async () => {
    const { accessToken } = await pass(amy.cookie, teamDocId);
    expect((await wopi.checkFileInfo(teamDocId, accessToken)).status).toBe(200);
  });

  it('another organisation never reaches the team file at all', async () => {
    expect((await mint(ola.cookie, teamDocId)).status).toBe(404);
    const [grantRows] = await db
      .select()
      .from(s.sandboxScopeGrants)
      .where(and(eq(s.sandboxScopeGrants.sandboxId, sandboxId), eq(s.sandboxScopeGrants.id, grantId)));
    expect(grantRows!.removedAt).not.toBeNull();
  });
});

describe('the history is real files (T-453, ADR-0043 P2)', () => {
  it('restoring an uploaded document’s earlier revision restores its FILE', async () => {
    const history = await revisions(xlsxId);
    // the freeze above holds the xlsx; release it so the restore is allowed
    await app.request(`/sandbox-documents/${xlsxId}/release`, {
      method: 'POST',
      headers: { cookie: amy.cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    const res = await app.request(`/sandbox-documents/${xlsxId}/restore`, {
      method: 'POST',
      headers: { cookie: amy.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ historyVersionId: history[0]!.id }),
    });
    expect(res.status).toBe(200);
    expect((await docRow(xlsxId)).fileRef).toBe(history[0]!.fileRef);
    expect((await revisions(xlsxId)).at(-1)!.fileRef).toBe(history[0]!.fileRef);
  });

  it('purging the document erases every file it ever was, each counted once', async () => {
    const history = await revisions(docxId);
    const files = [...new Set(history.map((r) => r.fileRef!))];
    expect(files.length).toBeGreaterThan(2); // v0.1, the browser saves
    const result = await purgeSandboxDocument(db, { documentId: docxId, projectId, organisationId: orgA, userId: amy.userId });
    expect(result?.reach.blobs).toBe(files.length);
    for (const ref of files) expect(getBlob(ref)).toBeNull();
    // and the passes for it went with it (cascade)
    const passes = await db.select().from(s.wopiAccessTokens).where(eq(s.wopiAccessTokens.sandboxDocumentId, docxId));
    expect(passes).toHaveLength(0);
  });
});
