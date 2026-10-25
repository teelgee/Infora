// T-477 — Working together in the sandbox: presence and the "changed since you
// looked" dot (one batched read), the History panel's proof (restore writes a
// NEW version and rewrites nothing; a frozen version is named), and an upload
// that lands in the sandbox and folder the person was standing in.
//
// Fresh organisations and a fresh project, so the file is repeatable on one seed;
// every row is looked up by the id this file created.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import type {
  GetSandboxActivityResponse,
  ListSandboxHistoryResponse,
  Sandbox,
  SandboxDocument,
  SandboxFolder,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { textToDocx, textToPdf } from './renditions';
import { ensureDefaultSandbox } from './sandbox';
import { fakeRouter } from './test-router';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t477';
let projectId: string;
let orgAId: string;
let annCookie: string; // org A, super-user
let benCookie: string; // org A, ordinary member — the teammate
let danCookie: string; // org D — admitted nowhere in org A's sandboxes
let annParticipant: string;
let benParticipant: string;

async function makeUser(name: string, organisationId: string, elevated = false) {
  const [user] = await db
    .insert(s.users)
    .values({ name, email: `${name}-${stamp}@test.local`, organisationId })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [p] = await db.insert(s.participants).values({ userId: user!.id, projectId, elevated }).returning();
  return { user: user!, participant: p! };
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function createDoc(cookie: string, title: string): Promise<string> {
  const res = await app.request(`/projects/${projectId}/sandbox-documents`, {
    method: 'POST',
    headers: asJson(cookie),
    body: JSON.stringify({ title }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as SandboxDocument).id;
}
const save = (cookie: string, id: string, content: string) =>
  app.request(`/sandbox-documents/${id}`, { method: 'PATCH', headers: asJson(cookie), body: JSON.stringify({ content }) });
const history = async (cookie: string, id: string) =>
  ((await (await app.request(`/sandbox-documents/${id}/history`, { headers: { cookie } })).json()) as ListSandboxHistoryResponse).items;
const activityOf = async (cookie: string, id: string) => {
  const res = await app.request(`/projects/${projectId}/sandbox-documents/activity`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as GetSandboxActivityResponse).items.find((i) => i.sandboxDocumentId === id);
};

beforeAll(async () => {
  const [a] = await db.insert(s.organisations).values({ name: 't477 A' }).returning();
  const [d] = await db.insert(s.organisations).values({ name: 't477 D' }).returning();
  const [project] = await db.insert(s.projects).values({ name: 't477 project', ownerOrganisationId: a!.id }).returning();
  projectId = project!.id;
  orgAId = a!.id;
  await db.insert(s.memberships).values([
    { organisationId: a!.id, projectId, role: 'owner' },
    { organisationId: d!.id, projectId, role: 'member' },
  ]);
  const ann = await makeUser('t477-ann', a!.id, true);
  const ben = await makeUser('t477-ben', a!.id);
  const dan = await makeUser('t477-dan', d!.id);
  annParticipant = ann.participant.id;
  benParticipant = ben.participant.id;
  annCookie = await session(ann.user.email);
  benCookie = await session(ben.user.email);
  danCookie = await session(dan.user.email);
});

afterAll(async () => {
  await pool.end();
});

describe('restore writes a new version and never rewrites history (T-477 Done-when)', () => {
  let docId: string;

  it('restoring v0.2 of a four-version draft makes v0.5 with v0.2’s text, and v0.1–v0.4 are exactly as they were', async () => {
    docId = await createDoc(annCookie, 't477 restore');
    for (const content of ['c1', 'c2', 'c3', 'c4']) expect((await save(annCookie, docId, content)).status).toBe(200);

    const rowsOf = () =>
      db
        .select()
        .from(s.sandboxDocumentVersions)
        .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, docId))
        .orderBy(asc(s.sandboxDocumentVersions.createdAt));
    const before = await rowsOf();
    expect(before.map((r) => r.content)).toEqual(['c1', 'c2', 'c3', 'c4']);

    const items = await history(annCookie, docId);
    expect(items.map((i) => i.versionReference)).toEqual(['v0.4', 'v0.3', 'v0.2', 'v0.1']);
    const v2 = items.find((i) => i.versionReference === 'v0.2')!;

    const restored = await app.request(`/sandbox-documents/${docId}/restore`, {
      method: 'POST',
      headers: asJson(annCookie),
      body: JSON.stringify({ historyVersionId: v2.id }),
    });
    expect(restored.status).toBe(200);
    expect(((await restored.json()) as SandboxDocument).workingRevision).toBe('v0.5');

    const after = await rowsOf();
    expect(after.length).toBe(5);
    // v0.5 holds v0.2's text
    expect(after[4]!.content).toBe(after[1]!.content);
    expect(after[4]!.content).toBe('c2');
    // v0.1–v0.4: same rows, same text, same times — nothing was rewritten
    expect(after.slice(0, 4).map((r) => [r.id, r.content, r.createdAt.getTime()])).toEqual(
      before.map((r) => [r.id, r.content, r.createdAt.getTime()]),
    );
    expect((await history(annCookie, docId)).map((i) => i.versionReference)).toEqual(['v0.5', 'v0.4', 'v0.3', 'v0.2', 'v0.1']);
  });

  it('an ungranted organisation cannot read the history (absence, not refusal)', async () => {
    expect((await app.request(`/sandbox-documents/${docId}/history`, { headers: { cookie: danCookie } })).status).toBe(404);
  });

  it('a freeze names the version it took: plain check-out as itself, an issued round as its P revision', async () => {
    // the head now equals both v0.2 and v0.5; the freeze belongs to the LATEST such version
    const frozen = await app.request(`/sandbox-documents/${docId}/freeze`, { method: 'POST', headers: { cookie: annCookie } });
    expect(frozen.status).toBe(201);
    let items = await history(annCookie, docId);
    expect(items.find((i) => i.versionReference === 'v0.5')!.frozen).toEqual([
      expect.objectContaining({ frozenAs: 'v0.5', issuedForReview: false }),
    ]);
    for (const ref of ['v0.1', 'v0.2', 'v0.3', 'v0.4']) {
      expect(items.find((i) => i.versionReference === ref)!.frozen).toBeUndefined();
    }

    // release, save, appoint a confirmed lead, freeze again: this one opens an internal round → P01
    expect((await app.request(`/sandbox-documents/${docId}/release`, { method: 'POST', headers: { cookie: annCookie } })).status).toBe(200);
    expect((await save(annCookie, docId, 'c5')).status).toBe(200);
    const [freezeContainer] = await db.select().from(s.containers).where(eq(s.containers.sandboxDocumentId, docId));
    await db.insert(s.deliverableReviewers).values({
      containerId: freezeContainer!.id,
      participantId: annParticipant,
      isLead: true,
      grantedByParticipantId: annParticipant,
      confirmedByParticipantId: annParticipant,
      confirmedAt: new Date(),
    });
    const issued = await app.request(`/sandbox-documents/${docId}/freeze`, { method: 'POST', headers: { cookie: annCookie } });
    expect(issued.status).toBe(201);
    items = await history(annCookie, docId);
    expect(items.find((i) => i.versionReference === 'v0.6')!.frozen).toEqual([
      expect.objectContaining({ frozenAs: 'P01', issuedForReview: true }),
    ]);
    // the earlier mark is untouched
    expect(items.find((i) => i.versionReference === 'v0.5')!.frozen).toHaveLength(1);
  });
});

describe('presence on rows and the changed-since-you-looked dot (T-477)', () => {
  it('a teammate’s save shows as a dot until you open the document; your own saves never do', async () => {
    const docId = await createDoc(annCookie, 't477 dot');
    expect((await save(annCookie, docId, 'ann writes')).status).toBe(200);

    // ann saved it herself and has never needed to "look": no dot
    expect((await activityOf(annCookie, docId))!.changedSinceYouLooked).toBe(false);
    // ben has never opened it: ann's version is news to him
    expect((await activityOf(benCookie, docId))!.changedSinceYouLooked).toBe(true);

    // ben opens it in the editor, which heartbeats: the dot clears, and ann sees him there
    expect((await app.request(`/sandbox-documents/${docId}/presence`, { method: 'POST', headers: { cookie: benCookie } })).status).toBe(200);
    expect((await activityOf(benCookie, docId))!.changedSinceYouLooked).toBe(false);
    const annSees = await activityOf(annCookie, docId);
    expect(annSees!.present.map((p) => p.participantId)).toEqual([benParticipant]);
    expect(annSees!.present[0]!.initials).toBe('T');
    // never yourself
    expect((await activityOf(benCookie, docId))!.present).toEqual([]);

    // ann has now opened it too; then ben saves: ann's dot comes on
    await app.request(`/sandbox-documents/${docId}/presence`, { method: 'POST', headers: { cookie: annCookie } });
    expect((await activityOf(annCookie, docId))!.changedSinceYouLooked).toBe(false);
    await sleep(15); // the DB clock is the only clock: the save must land after the heartbeat
    expect((await save(benCookie, docId, 'ben edits')).status).toBe(200);
    expect((await activityOf(annCookie, docId))!.changedSinceYouLooked).toBe(true);
    // ben's own save leaves ben's dot off
    expect((await activityOf(benCookie, docId))!.changedSinceYouLooked).toBe(false);
    // ann opens it again: clear
    await app.request(`/sandbox-documents/${docId}/presence`, { method: 'POST', headers: { cookie: annCookie } });
    expect((await activityOf(annCookie, docId))!.changedSinceYouLooked).toBe(false);
  });

  it('covers exactly the live documents the list returns, and nothing across the organisation line', async () => {
    const docId = await createDoc(annCookie, 't477 gone');
    const res = await app.request(`/sandbox-documents/${docId}`, { method: 'DELETE', headers: { cookie: annCookie } });
    expect(res.status).toBe(200);
    const listed = (await (
      await app.request(`/projects/${projectId}/sandbox-documents`, { headers: { cookie: annCookie } })
    ).json()) as { items: Array<{ id: string }> };
    const activity = ((await (
      await app.request(`/projects/${projectId}/sandbox-documents/activity`, { headers: { cookie: annCookie } })
    ).json()) as GetSandboxActivityResponse).items;
    expect(new Set(activity.map((a) => a.sandboxDocumentId))).toEqual(new Set(listed.items.map((d) => d.id)));
    expect(activity.some((a) => a.sandboxDocumentId === docId)).toBe(false);
    // org D has no documents: it sees nothing of org A's
    const dan = (await (
      await app.request(`/projects/${projectId}/sandbox-documents/activity`, { headers: { cookie: danCookie } })
    ).json()) as GetSandboxActivityResponse;
    expect(dan.items).toEqual([]);
  });
});

describe('creating a document in a named folder (T-477 review)', () => {
  it('a folder of another sandbox, or one that does not exist, is a 404 and not a 500', async () => {
    const mk = async (name: string) =>
      ((await (
        await app.request(`/projects/${projectId}/sandboxes`, { method: 'POST', headers: asJson(annCookie), body: JSON.stringify({ name, scope: 'single_org' }) })
      ).json()) as Sandbox).id;
    const a = await mk('t477 create A');
    const b = await mk('t477 create B');
    const folderB = ((await (
      await app.request(`/sandboxes/${b}/folders`, { method: 'POST', headers: asJson(annCookie), body: JSON.stringify({ name: 'B only' }) })
    ).json()) as SandboxFolder).id;
    const create = (folderId: string) =>
      app.request(`/projects/${projectId}/sandbox-documents`, {
        method: 'POST',
        headers: asJson(annCookie),
        body: JSON.stringify({ title: 't477 folder check', sandboxId: a, folderId }),
      });
    expect((await create(folderB)).status).toBe(404);
    expect((await create(crypto.randomUUID())).status).toBe(404);
  });
});

describe('an upload lands where the person was (T-477)', () => {
  let defaultSandboxId: string;
  let sandboxId: string;
  let otherSandboxId: string;
  let folderId: string;
  let otherFolderId: string;

  const upload = async (cookie: string, fields: Record<string, string>) => {
    const { textToDocx } = await import('./renditions.js');
    const form = new FormData();
    form.append('file', new File([new Uint8Array(textToDocx('Placed where it was sent.'))], 'Where.docx'));
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return app.request(`/projects/${projectId}/sandbox-uploads`, { method: 'POST', headers: { cookie }, body: form });
  };

  beforeAll(async () => {
    // T-486 (h) — the organisation's default area is made FIRST, here, so this
    // describe no longer leans on an earlier describe having made it: the default
    // is the OLDEST area (the rule is pinned in sandbox-default.test.ts), and the
    // last assertions below name it by id instead of "not one of the other two".
    defaultSandboxId = await ensureDefaultSandbox(db, projectId, orgAId, annParticipant);
    const mk = async (name: string) =>
      ((await (
        await app.request(`/projects/${projectId}/sandboxes`, {
          method: 'POST',
          headers: asJson(annCookie),
          body: JSON.stringify({ name, scope: 'single_org' }),
        })
      ).json()) as Sandbox).id;
    sandboxId = await mk('t477 upload target');
    otherSandboxId = await mk('t477 upload other');
    const folder = async (sid: string, name: string) =>
      ((await (
        await app.request(`/sandboxes/${sid}/folders`, {
          method: 'POST',
          headers: asJson(annCookie),
          body: JSON.stringify({ name }),
        })
      ).json()) as SandboxFolder).id;
    folderId = await folder(sandboxId, 'Drainage');
    otherFolderId = await folder(otherSandboxId, 'Elsewhere');
  });

  it('with a sandbox and folder named, the document is created in that folder', async () => {
    const res = await upload(annCookie, { sandboxId, folderId });
    expect(res.status).toBe(201);
    const doc = (await res.json()) as SandboxDocument;
    expect(doc.sandboxId).toBe(sandboxId);
    expect(doc.folderId).toBe(folderId);
    expect(doc.origin).toBe('uploaded');
  });

  it('with only a sandbox named, it lands at that sandbox’s root', async () => {
    const doc = (await (await upload(annCookie, { sandboxId })).json()) as SandboxDocument;
    expect(doc.sandboxId).toBe(sandboxId);
    expect(doc.folderId).toBeNull();
  });

  it('with neither named, it lands in the organisation’s default sandbox, as before', async () => {
    const res = await upload(annCookie, {});
    expect(res.status).toBe(201);
    const doc = (await res.json()) as SandboxDocument;
    expect(doc.sandboxId).toBe(defaultSandboxId);
    expect([sandboxId, otherSandboxId]).not.toContain(doc.sandboxId);
    expect(doc.folderId).toBeNull();
  });

  it('a sandbox the requester holds no grant on is a 404, and nothing is written', async () => {
    const countBefore = (await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.sandboxId, sandboxId))).length;
    expect((await upload(danCookie, { sandboxId })).status).toBe(404);
    expect((await upload(danCookie, { sandboxId, folderId })).status).toBe(404);
    expect((await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.sandboxId, sandboxId))).length).toBe(countBefore);
  });

  it('a folder that belongs to another sandbox is a 404, as is one that does not exist', async () => {
    expect((await upload(annCookie, { sandboxId, folderId: otherFolderId })).status).toBe(404);
    expect((await upload(annCookie, { sandboxId, folderId: crypto.randomUUID() })).status).toBe(404);
    expect((await upload(annCookie, { sandboxId: 'not-an-id' })).status).toBe(404);
    // a folder with no sandbox named is checked against the default sandbox
    expect((await upload(annCookie, { folderId })).status).toBe(404);
  });
});

// T-486 (d) — a freeze of an UPLOADED or PDF document names the working version
// it holds. T-477 matched a frozen version to a working one by checksum of the
// text and by time; for an uploaded .docx the text is '' on every version, so
// the match was by time alone, and that was untested.
//
// What each side stores, read from the code before these were written:
//   - a working version (sandbox_document_versions) of an uploaded document
//     keeps the FILE it was (`file_ref`, migration 0070) and its text — '' for a
//     .docx, the extracted text with page breaks for a PDF;
//   - the frozen copy (versions) keeps the text, and its NATIVE rendition (made
//     right after the freeze commits) points at the very file the head held;
//   - a restore writes a new working version holding the older one's file again.
// So the file reference is on both sides and is the exact match; time is only
// the tie-break among working versions that hold the same file.
describe('a freeze of an uploaded or PDF document names the version it holds (T-486 d)', () => {
  const sendFile = async (path: string, cookie: string, name: string, bytes: Buffer) => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(bytes)], name));
    return app.request(path, { method: 'POST', headers: { cookie }, body: form });
  };
  const uploadDoc = async (name: string, bytes: Buffer): Promise<SandboxDocument> => {
    const res = await sendFile(`/projects/${projectId}/sandbox-uploads`, annCookie, name, bytes);
    expect(res.status).toBe(201);
    return (await res.json()) as SandboxDocument;
  };
  const replaceFile = async (id: string, name: string, bytes: Buffer) => {
    const res = await sendFile(`/sandbox-documents/${id}/file`, annCookie, name, bytes);
    expect(res.status).toBe(200);
  };
  const freezeIt = async (id: string) => {
    const res = await app.request(`/sandbox-documents/${id}/freeze`, { method: 'POST', headers: { cookie: annCookie } });
    expect(res.status).toBe(201);
  };
  const releaseIt = async (id: string) => {
    const res = await app.request(`/sandbox-documents/${id}/release`, { method: 'POST', headers: { cookie: annCookie } });
    expect(res.status).toBe(200);
  };
  /** version reference → what the history marks on it (absent: nothing) */
  const marks = async (id: string) =>
    Object.fromEntries((await history(annCookie, id)).map((i) => [i.versionReference, i.frozen?.map((f) => f.frozenAs)]));

  it('a .docx replaced once, frozen, then replaced again: the mark is on the second version — not the first, not the third', async () => {
    const doc = await uploadDoc('T486 d docx.docx', textToDocx('First draft.'));
    await replaceFile(doc.id, 'second.docx', textToDocx('Second draft.'));
    await freezeIt(doc.id);
    await releaseIt(doc.id);
    await replaceFile(doc.id, 'third.docx', textToDocx('Third draft.'));
    // every working version of an uploaded .docx has the text '' — the text cannot tell them apart
    const texts = await db.select().from(s.sandboxDocumentVersions).where(eq(s.sandboxDocumentVersions.sandboxDocumentId, doc.id));
    expect(new Set(texts.map((v) => v.content))).toEqual(new Set(['']));
    expect(await marks(doc.id)).toEqual({ 'v0.3': undefined, 'v0.2': ['v0.2'], 'v0.1': undefined });
  });

  it('a PDF replaced once, frozen, then replaced again: the same', async () => {
    const doc = await uploadDoc('T486 d pdf.pdf', textToPdf('Survey', 'First survey text.'));
    await replaceFile(doc.id, 'second.pdf', textToPdf('Survey', 'Second survey text.'));
    await freezeIt(doc.id);
    await releaseIt(doc.id);
    await replaceFile(doc.id, 'third.pdf', textToPdf('Survey', 'Third survey text.'));
    expect(await marks(doc.id)).toEqual({ 'v0.3': undefined, 'v0.2': ['v0.2'], 'v0.1': undefined });
    // a PDF replaced by one with the SAME text still marks the latest version at or before the freeze
    const same = await uploadDoc('T486 d same.pdf', textToPdf('Survey', 'Unchanged text.'));
    await replaceFile(same.id, 'again.pdf', textToPdf('Survey', 'Unchanged text.'));
    await freezeIt(same.id);
    expect(await marks(same.id)).toEqual({ 'v0.2': ['v0.2'], 'v0.1': undefined });
  });

  it('a freeze whose head is an OLDER file restored marks the restoring version, not the original it copies', async () => {
    const doc = await uploadDoc('T486 d restored.docx', textToDocx('Original file.'));
    await replaceFile(doc.id, 'later.docx', textToDocx('Later file.'));
    const items = await history(annCookie, doc.id);
    const original = items.find((i) => i.versionReference === 'v0.1')!;
    const restored = await app.request(`/sandbox-documents/${doc.id}/restore`, {
      method: 'POST',
      headers: asJson(annCookie),
      body: JSON.stringify({ historyVersionId: original.id }),
    });
    expect(restored.status).toBe(200);
    // v0.3 holds v0.1's file again
    const refs = await db
      .select({ fileRef: s.sandboxDocumentVersions.fileRef, createdAt: s.sandboxDocumentVersions.createdAt })
      .from(s.sandboxDocumentVersions)
      .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, doc.id))
      .orderBy(asc(s.sandboxDocumentVersions.createdAt));
    expect(refs[2]!.fileRef).toBe(refs[0]!.fileRef);
    expect(refs[1]!.fileRef).not.toBe(refs[0]!.fileRef);
    await freezeIt(doc.id);
    expect(await marks(doc.id)).toEqual({ 'v0.3': ['v0.3'], 'v0.2': undefined, 'v0.1': undefined });
  });

  // The case time alone gets wrong. A freeze reads the document, then opens its
  // transaction; a file that lands in that gap is saved BEFORE the freeze's own
  // clock, but is not what the freeze copied. The frozen copy's native
  // rendition names the file it did copy, and that file is on the working
  // version it came from — so that is the version marked, whatever the clock says.
  // (Built in the tables here: the gap is milliseconds wide, so it is not
  // reachable on demand through the API.)
  async function freezeCopyOf(docId: string, fileRef: string | null) {
    const [doc] = await db.select().from(s.sandboxDocuments).where(eq(s.sandboxDocuments.id, docId));
    const [container] = await db
      .insert(s.containers)
      .values({ projectId, scope: 'sandbox', producingOrganisationId: orgAId, sandboxDocumentId: docId, inLibrary: false })
      .returning();
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'v0.1', content: doc!.content, isCurrent: true })
      .returning();
    if (fileRef !== null) {
      await db.insert(s.renditions).values({ versionId: version!.id, kind: 'native', format: 'docx', contentRef: fileRef });
    }
  }

  it('a file that landed before the freeze’s clock but is not what the freeze copied: the mark follows the FILE', async () => {
    const doc = await uploadDoc('T486 d gap.docx', textToDocx('Copied by the freeze.'));
    await replaceFile(doc.id, 'landed.docx', textToDocx('Landed in the gap.'));
    const working = await db
      .select({ fileRef: s.sandboxDocumentVersions.fileRef })
      .from(s.sandboxDocumentVersions)
      .where(eq(s.sandboxDocumentVersions.sandboxDocumentId, doc.id))
      .orderBy(asc(s.sandboxDocumentVersions.createdAt));
    // the freeze holds v0.1's file, and its clock is after v0.2 was saved
    await freezeCopyOf(doc.id, working[0]!.fileRef);
    expect(await marks(doc.id)).toEqual({ 'v0.2': undefined, 'v0.1': ['v0.1'] });
  });

  it('with no rendition to read yet, the match falls back to the latest working version at or before the freeze', async () => {
    const doc = await uploadDoc('T486 d fallback.docx', textToDocx('First.'));
    await replaceFile(doc.id, 'second.docx', textToDocx('Second.'));
    await freezeCopyOf(doc.id, null);
    expect(await marks(doc.id)).toEqual({ 'v0.2': ['v0.1'], 'v0.1': undefined });
  });
});
