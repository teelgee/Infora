// T-472 — reference-material intake, against the live dev database.
//
// *In plain terms: the owner's super user drops files on the library. Each one
// waits in an intake queue with the AI's proposed title and classification;
// nothing is in the library, and nothing can be read by a run, until a person
// confirms it; the record names who confirmed what.*
//
// Four parties on one project: the owner organisation's super user (the only
// party that may use any of this), an owner-organisation member who is not a
// super user, a producing organisation's super user, and — for the wall — a
// stranger with no place on the project.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type {
  BulkConfirmIntakeResponse,
  GetLibraryAdmissionResponse,
  GetLibraryResponse,
  IntakeRow,
  ListReferenceIntakeResponse,
  UploadReferenceIntakeResponse,
} from '@infora/contracts';
import { isVersionIndexed } from '@infora/data';
import { createDb, hashPassword, schema as s, seedProjectOntology } from '@infora/db';
import { buildApp } from './app';
import { removeLibraryContainer } from './purge';
import { INTAKE_AGENT_ID } from './reference-intake';
import { getBlob, textToDocx, textToPdf } from './renditions';
import { FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

const { db, pool } = createDb();
const stamp = Date.now();
const password = 'pw-t472';

// the proposal the fake model gives: a Standard (confident), an Environmental
// discipline (likely), and one term the scheme does not have
let asked = 0;
let embedded = 0;
let failEmbeds = false;
const router = fakeRouter(
  (system, prompt) => {
    if (!system.includes('proposing a title and a classification')) return 'ok';
    asked += 1;
    const name = /^File name: (.+)$/m.exec(prompt)![1]!;
    return JSON.stringify({
      title: `Proposed: ${name.replace(/\.[^.]+$/, '')}`,
      classifications: [
        { facet: 'document_type', term: 'STD', confidence: 'confident' },
        { facet: 'discipline', term: 'V', confidence: 'likely' },
        { facet: 'phase', term: 'HYDROLOGY', confidence: 'confident' },
      ],
    });
  },
  FAKE_EMBED_MODEL,
  (text) => {
    if (failEmbeds) throw new Error('embedding unavailable');
    embedded += 1;
    return fakeVector(text);
  },
);
const app = buildApp({ db, sessionSecret: 'test-secret', router });

let projectId: string;
let ownerOrgId: string;
let ownerSuper: string; // cookie
let ownerSuperParticipant: string;
let ownerMember: string; // owner org, not elevated
let producerSuper: string; // another organisation's super user
let facetId: Record<string, string>; // key → id
let termId: Record<string, string>; // `${facetKey}:${code}` → id

/** a user whose organisation holds no place on the project */
async function makeUserOutside() {
  const [org] = await db.insert(s.organisations).values({ name: `t472 outsider ${stamp}-${Math.random()}` }).returning();
  const email = `t472-out-${stamp}-${Math.random().toString(36).slice(2, 7)}@test.local`;
  const [user] = await db.insert(s.users).values({ name: 't472-out', email, organisationId: org!.id, orgRole: 'admin' }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

async function makeUser(name: string, organisationId: string, elevated: boolean) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db.insert(s.users).values({ name, email, organisationId, orgRole: 'admin' }).returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db.insert(s.participants).values({ userId: user!.id, projectId, elevated }).returning();
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, participantId: participant!.id };
}

beforeAll(async () => {
  const [ownerOrg] = await db.insert(s.organisations).values({ name: `t472 owner ${stamp}` }).returning();
  const [prodOrg] = await db.insert(s.organisations).values({ name: `t472 producer ${stamp}` }).returning();
  ownerOrgId = ownerOrg!.id;
  const [project] = await db.insert(s.projects).values({ name: `t472 ${stamp}`, ownerOrganisationId: ownerOrgId }).returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrgId, projectId, role: 'owner' },
    { organisationId: prodOrg!.id, projectId, role: 'member' },
  ]);
  await seedProjectOntology(db, projectId);
  const o = await makeUser('t472-owner', ownerOrgId, true);
  ownerSuper = o.cookie;
  ownerSuperParticipant = o.participantId;
  ownerMember = (await makeUser('t472-member', ownerOrgId, false)).cookie;
  producerSuper = (await makeUser('t472-prod', prodOrg!.id, true)).cookie;

  const facets = await db.select().from(s.classificationFacets).where(eq(s.classificationFacets.projectId, projectId));
  facetId = Object.fromEntries(facets.map((f) => [f.key, f.id]));
  const terms = await db.select().from(s.classificationTerms);
  termId = {};
  for (const f of facets) for (const t of terms.filter((x) => x.facetId === f.id)) termId[`${f.key}:${t.code}`] = t.id;
});

afterAll(async () => {
  await pool.end();
});

const pdf = (text: string) => textToPdf('Doc', text);
/** a scan: pages, an image, no text layer */
const scannedPdf = () =>
  Buffer.from(
    `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length 3 >>
stream
q Q
endstream
endobj
trailer << /Root 1 0 R >>
%%EOF
`,
    'latin1',
  );

async function upload(cookie: string, name: string, bytes: Buffer) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name));
  return app.request(`/projects/${projectId}/reference-intake`, { method: 'POST', headers: { cookie }, body: form });
}
const uploaded = async (name: string, bytes: Buffer): Promise<IntakeRow> => {
  const res = await upload(ownerSuper, name, bytes);
  expect(res.status).toBe(201);
  return ((await res.json()) as UploadReferenceIntakeResponse).item;
};
const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
const get = (cookie: string, path: string) => app.request(path, { headers: { cookie } });
const queue = async (status: 'proposed' | 'confirmed' = 'proposed') =>
  (await (await get(ownerSuper, `/projects/${projectId}/reference-intake?status=${status}`)).json()) as ListReferenceIntakeResponse;
const library = async (cookie = ownerSuper) =>
  ((await (await get(cookie, `/projects/${projectId}/library`)).json()) as GetLibraryResponse).items;
const intakeRow = async (id: string) =>
  (await db.select().from(s.referenceIntake).where(eq(s.referenceIntake.id, id)).limit(1))[0];
const settled = (title: string, ...pairs: Array<[string, string]>) => ({
  title,
  classifications: pairs.map(([facet, code]) => ({ facetId: facetId[facet]!, termId: termId[`${facet}:${code}`]! })),
});

describe('reference-material intake (T-472)', () => {
  it('a dropped file lands in the queue with its text, a proposed title and classification — and is NOT in the library', async () => {
    const before = asked;
    const item = await uploaded(`T472-noise-${stamp}.pdf`, pdf('Construction noise limits for the scheme are set out below.'));
    expect(item).toMatchObject({
      textStatus: 'extracted',
      readable: true,
      status: 'proposed',
      proposedTitle: `Proposed: T472-noise-${stamp}`,
    });
    expect(item.uploadedBy.name).toBe('t472-owner');
    // the invented term is dropped; the two real ones are kept, as words
    expect(item.proposedClassifications).toEqual([
      { facetId: facetId['document_type'], termId: termId['document_type:STD'], confidence: 'confident' },
      { facetId: facetId['discipline'], termId: termId['discipline:V'], confidence: 'likely' },
    ]);
    expect(asked).toBe(before + 1);

    // the extracted text is held on the intake row, and nothing else exists yet
    const row = await intakeRow(item.id);
    expect(row!.extractedText).toContain('Construction noise limits');
    expect(row!.containerId).toBeNull();
    expect(await library()).toEqual([]);
    // the proposal is an agent run on the record: a conversation, a run, one step
    const [run] = await db.select().from(s.runs).where(eq(s.runs.id, row!.proposedByRunId!));
    expect(run).toMatchObject({ agentId: INTAKE_AGENT_ID, state: 'completed', requesterParticipantId: ownerSuperParticipant });
    const steps = await db.select().from(s.steps).where(eq(s.steps.runId, run!.id));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'intake_proposal', status: 'completed', modelId: 'fake-chat' });
    // the blob is stored
    expect(getBlob(row!.fileRef)).not.toBeNull();
  });

  it('a scanned PDF is accepted, not refused: it lands with its reason, no text and no proposal', async () => {
    const before = asked;
    const item = await uploaded(`T472-scan-${stamp}.pdf`, scannedPdf());
    expect(item).toMatchObject({ textStatus: 'pdf_no_text', readable: false, proposedClassifications: null });
    // titled from the file name, as the operator's load does
    expect(item.proposedTitle).toBe(`T472-scan-${stamp}`);
    expect(asked).toBe(before); // no text, no model call
    const row = await intakeRow(item.id);
    expect(row).toMatchObject({ extractedText: null, proposedByRunId: null });
  });

  it('only the owner organisation\'s super user may use any of it — everyone else is refused in words', async () => {
    for (const cookie of [ownerMember, producerSuper]) {
      const res = await upload(cookie, `T472-no-${stamp}.pdf`, pdf('x'));
      expect(res.status).toBe(403);
      expect(((await res.json()) as { detail: string }).detail).toBe('owner_super_user_required');
      expect((await get(cookie, `/projects/${projectId}/reference-intake`)).status).toBe(403);
      expect((await post(cookie, `/projects/${projectId}/reference-intake/${crypto.randomUUID()}/confirm`, settled('x'))).status).toBe(403);
      expect((await post(cookie, `/projects/${projectId}/reference-intake/${crypto.randomUUID()}/reject`)).status).toBe(403);
      expect((await post(cookie, `/projects/${projectId}/reference-intake/confirm`, { items: [] })).status).toBe(403);
    }
    // an unsupported file and a missing file are told apart
    expect((await upload(ownerSuper, 'notes.txt', Buffer.from('hello'))).status).toBe(400);
    const none = await app.request(`/projects/${projectId}/reference-intake`, { method: 'POST', headers: { cookie: ownerSuper }, body: new FormData() });
    expect(none.status).toBe(400);
  });

  it('confirming admits the file through the one admission path: titled, classified, read by the index, and it names who confirmed', async () => {
    const item = await uploaded(`T472-confirm-${stamp}.pdf`, pdf('Alpha — the vibration limit at receptor R7 is 3 mm/s.'));
    const run = (await intakeRow(item.id))!.proposedByRunId!;
    const res = await post(ownerSuper, `/projects/${projectId}/reference-intake/${item.id}/confirm`, settled('Vibration limits, corrected', ['document_type', 'STD'], ['discipline', 'G']));
    expect(res.status).toBe(200);
    const done = (await res.json()) as { containerId: string; documentReference: string; notCitable: boolean };
    expect(done).toMatchObject({ documentReference: `T472-confirm-${stamp}`, notCitable: false });

    // a reference-material container: live, in the library, NO work item
    const [container] = await db.select().from(s.containers).where(eq(s.containers.id, done.containerId));
    expect(container).toMatchObject({ title: 'Vibration limits, corrected', inLibrary: true, state: 'live', scope: 'library', producingOrganisationId: ownerOrgId });
    expect(await db.select().from(s.workItems).where(eq(s.workItems.containerId, done.containerId))).toHaveLength(0);
    // its genesis version carries the text and is read by the index
    const [version] = await db.select().from(s.versions).where(eq(s.versions.containerId, done.containerId));
    expect(version).toMatchObject({ versionReference: 'R01', notCitable: false });
    expect(version!.content).toContain('vibration limit');
    expect(await isVersionIndexed(db, router, version!.id, projectId)).toBe(true);
    // the file is its native rendition
    const renditions = await db.select().from(s.renditions).where(eq(s.renditions.versionId, version!.id));
    expect(renditions).toHaveLength(1);
    expect(renditions[0]).toMatchObject({ kind: 'native', format: 'pdf' });

    // the classification names the person; the AI's authorship is kept only for the term they left standing
    const rows = await db.select().from(s.containerClassifications).where(eq(s.containerClassifications.containerId, done.containerId));
    const byFacet = Object.fromEntries(rows.map((r) => [r.facetId, r]));
    expect(byFacet[facetId['document_type']!]).toMatchObject({ termId: termId['document_type:STD'], setByParticipantId: ownerSuperParticipant, proposedByRunId: run });
    expect(byFacet[facetId['discipline']!]).toMatchObject({ termId: termId['discipline:G'], setByParticipantId: ownerSuperParticipant, proposedByRunId: null });

    // the intake row stays as the audit: who, when, which document — and the text is not kept twice
    const row = await intakeRow(item.id);
    expect(row).toMatchObject({ status: 'confirmed', confirmedByParticipantId: ownerSuperParticipant, containerId: done.containerId, extractedText: null });
    expect(row!.confirmedAt).not.toBeNull();

    // the library lists it as reference material; the activity read says who put it there
    const listed = (await library()).find((i) => i.containerId === done.containerId);
    expect(listed).toMatchObject({ kind: 'reference', title: 'Vibration limits, corrected', notCitable: false });
    const admission = (await (await get(ownerSuper, `/containers/${done.containerId}/library-admission`)).json()) as GetLibraryAdmissionResponse;
    expect(admission.admission).toMatchObject({ confirmedBy: { name: 't472-owner' }, uploadedBy: { name: 't472-owner' }, originalFilename: `T472-confirm-${stamp}.pdf` });
    // another organisation's member does not read the owner's admission record
    expect((await get(producerSuper, `/containers/${done.containerId}/library-admission`)).status).toBe(404);
    // and it has left the proposed queue for the confirmed one
    expect((await queue()).items.some((i) => i.id === item.id)).toBe(false);
    expect((await queue('confirmed')).items.find((i) => i.id === item.id)?.confirmedBy?.name).toBe('t472-owner');
    // confirming twice is refused in words
    expect((await post(ownerSuper, `/projects/${projectId}/reference-intake/${item.id}/confirm`, settled('Again'))).status).toBe(409);
  });

  it('confirming a scan admits it NOT CITABLE: content empty, no passages embedded, and the library says so', async () => {
    const item = await uploaded(`T472-scan-confirm-${stamp}.pdf`, scannedPdf());
    const before = embedded;
    const res = await post(ownerSuper, `/projects/${projectId}/reference-intake/${item.id}/confirm`, settled('A scanned standard', ['document_type', 'STD']));
    expect(res.status).toBe(200);
    const done = (await res.json()) as { containerId: string; notCitable: boolean };
    expect(done.notCitable).toBe(true);
    const [version] = await db.select().from(s.versions).where(eq(s.versions.containerId, done.containerId));
    expect(version).toMatchObject({ content: '', notCitable: true, isCurrent: true });
    // no ingest ran for it, and a resume treats it as finished, not as a fault
    expect(embedded).toBe(before);
    expect(await isVersionIndexed(db, router, version!.id, projectId)).toBe(true);
    // it is held and openable: the file is its rendition
    expect(await db.select().from(s.renditions).where(eq(s.renditions.versionId, version!.id))).toHaveLength(1);
    const listed = (await library()).find((i) => i.containerId === done.containerId);
    expect(listed).toMatchObject({ kind: 'reference', notCitable: true, notCitableReason: 'pdf_no_text' });
  });

  it('rejecting deletes the file and the row, and asks for no reason', async () => {
    const item = await uploaded(`T472-reject-${stamp}.pdf`, pdf('To be rejected.'));
    const fileRef = (await intakeRow(item.id))!.fileRef;
    expect(getBlob(fileRef)).not.toBeNull();
    const res = await post(ownerSuper, `/projects/${projectId}/reference-intake/${item.id}/reject`);
    expect(res.status).toBe(200);
    expect(await intakeRow(item.id)).toBeUndefined();
    expect(getBlob(fileRef)).toBeNull();
    // a second rejection is "does not exist"
    expect((await post(ownerSuper, `/projects/${projectId}/reference-intake/${item.id}/reject`)).status).toBe(404);
    // …and nothing was ever admitted
    expect((await library()).some((i) => i.documentReference === `T472-reject-${stamp}`)).toBe(false);
  });

  it('bulk confirm admits each in turn and reports per row: one bad row does not sink the rest', async () => {
    const a = await uploaded(`T472-bulk-a-${stamp}.pdf`, pdf('Alpha bulk one.'));
    const b = await uploaded(`T472-bulk-b-${stamp}.pdf`, pdf('Bulk two.'));
    const c = await uploaded(`T472-bulk-c-${stamp}.docx`, textToDocx('Bulk three, a Word file.'));
    const res = await post(ownerSuper, `/projects/${projectId}/reference-intake/confirm`, {
      items: [
        { id: a.id, ...settled('Bulk A', ['document_type', 'GDN']) },
        // a term from no facet this project has
        { id: b.id, title: 'Bulk B', classifications: [{ facetId: facetId['discipline'], termId: crypto.randomUUID() }] },
        { id: c.id, ...settled('Bulk C', ['document_type', 'LEG'], ['phase', '2']) },
        { id: crypto.randomUUID(), title: 'Nobody', classifications: [] },
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BulkConfirmIntakeResponse;
    expect(body).toMatchObject({ confirmed: 2, failed: 2 });
    expect(body.results.map((r) => (r.ok ? 'ok' : r.reason))).toEqual(['ok', 'invalid_classification', 'ok', 'not_found']);
    // the two that landed are in the library, titled, by the same person
    const titles = (await library()).map((i) => i.title);
    expect(titles).toEqual(expect.arrayContaining(['Bulk A', 'Bulk C']));
    expect(titles).not.toContain('Bulk B');
    expect((await intakeRow(b.id))!.status).toBe('proposed'); // still waiting, untouched
    expect((await intakeRow(a.id))!.confirmedByParticipantId).toBe(ownerSuperParticipant);
    // a Word file is read at confirmation too
    const [cv] = await db.select().from(s.versions).innerJoin(s.containers, eq(s.versions.containerId, s.containers.id)).where(eq(s.containers.documentReference, `T472-bulk-c-${stamp}`));
    expect(cv!.versions.content).toContain('Bulk three');
  });

  it('confirming into the library is the FIRST confirmation of currency: the confirmer, now, and the type’s interval (T-473)', async () => {
    const guidance = await uploaded(`T473-first-g-${stamp}.pdf`, pdf('Some guidance.'));
    const legislation = await uploaded(`T473-first-l-${stamp}.pdf`, pdf('Some law.'));
    const g = await post(ownerSuper, `/projects/${projectId}/reference-intake/${guidance.id}/confirm`, settled('First G', ['document_type', 'GDN']));
    const l = await post(ownerSuper, `/projects/${projectId}/reference-intake/${legislation.id}/confirm`, settled('First L', ['document_type', 'LEG']));
    const containerOf = async (res: Response) => ((await res.json()) as { containerId: string }).containerId;
    const months = async (id: string, n: number) =>
      ((await db.execute(sql`select (confirmed_current_at + make_interval(months => ${n}) = recheck_due_at) as ok from containers where id = ${id}`)).rows[0] as { ok: boolean }).ok;
    const gc = await containerOf(g);
    const lc = await containerOf(l);
    const [gRow] = await db.select().from(s.containers).where(eq(s.containers.id, gc));
    expect(gRow!.confirmedCurrentByParticipantId).toBe(ownerSuperParticipant);
    expect(gRow!.confirmedCurrentAt).not.toBeNull();
    expect(await months(gc, 12)).toBe(true); // Guidance
    expect(await months(lc, 6)).toBe(true); // Legislation
    // the library says so
    const items = await library();
    expect(items.find((i) => i.containerId === gc)!.currency).toMatchObject({ state: 'confirmed', confirmedBy: 't472-owner' });
  });

  it('the operator’s load records nobody, so a document it admits starts unconfirmed (T-473)', async () => {
    const { admitReference } = await import('./reference-admission');
    const { containerId } = await admitReference(
      { db, router },
      { projectId, organisationId: ownerOrgId, reference: `T473-cli-${stamp}`, title: 'Loaded by the operator', format: 'pdf', bytes: pdf('Loaded.'), text: 'Loaded by the operator.' },
    );
    const [r] = await db.select().from(s.containers).where(eq(s.containers.id, containerId));
    expect([r!.confirmedCurrentByParticipantId, r!.confirmedCurrentAt, r!.recheckDueAt]).toEqual([null, null, null]);
    expect((await library()).find((i) => i.containerId === containerId)!.currency).toMatchObject({ state: 'unconfirmed' });
  });

  it('a second file with the same reference is refused in words, not merged', async () => {
    const first = await uploaded(`T472-dup-${stamp}.pdf`, pdf('First copy.'));
    const second = await uploaded(`T472-dup-${stamp}.pdf`, pdf('Second copy.'));
    expect((await post(ownerSuper, `/projects/${projectId}/reference-intake/${first.id}/confirm`, settled('Dup'))).status).toBe(200);
    const res = await post(ownerSuper, `/projects/${projectId}/reference-intake/${second.id}/confirm`, settled('Dup again'));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail: string }).detail).toBe('reference_in_use');
    expect((await intakeRow(second.id))!.status).toBe('proposed');
  });

  it('with the AI switched off the upload still lands — with no proposal — and the person fills the fields', async () => {
    const off = await app.request(`/projects/${projectId}/ai-features/reference_intake`, {
      method: 'PUT',
      headers: { cookie: ownerSuper, 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false, reason: 'test: client has not agreed automated proposals' }),
    });
    expect(off.status).toBe(200);
    try {
      const before = asked;
      const item = await uploaded(`T472-no-ai-${stamp}.pdf`, pdf('Switch off.'));
      expect(asked).toBe(before);
      expect(item).toMatchObject({ readable: true, proposedClassifications: null, proposedTitle: `T472-no-ai-${stamp}` });
      expect((await intakeRow(item.id))!.proposedByRunId).toBeNull();
      expect((await queue()).proposalsOn).toBe(false);
      // the person settles it by hand; nothing is claimed for the AI
      const res = await post(ownerSuper, `/projects/${projectId}/reference-intake/${item.id}/confirm`, settled('By hand', ['document_type', 'CRS']));
      expect(res.status).toBe(200);
      const done = (await res.json()) as { containerId: string };
      const [cls] = await db.select().from(s.containerClassifications).where(eq(s.containerClassifications.containerId, done.containerId));
      expect(cls).toMatchObject({ setByParticipantId: ownerSuperParticipant, proposedByRunId: null });
    } finally {
      await app.request(`/projects/${projectId}/ai-features/reference_intake`, {
        method: 'PUT',
        headers: { cookie: ownerSuper, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true, reason: 'test teardown — restored' }),
      });
    }
    expect((await queue()).proposalsOn).toBe(true);
  });

  it('a proposal that fails does not fail the upload: the file lands untitled-by-AI and the run is recorded as failed', async () => {
    // a router whose model is unavailable
    const broken = fakeRouter(() => {
      throw new Error('model unavailable');
    });
    const brokenApp = buildApp({ db, sessionSecret: 'test-secret', router: broken });
    const login = await brokenApp.request('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `t472-owner-${stamp}@test.local`, password }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const form = new FormData();
    form.append('file', new File([new Uint8Array(pdf('Model down.'))], `T472-down-${stamp}.pdf`));
    const res = await brokenApp.request(`/projects/${projectId}/reference-intake`, { method: 'POST', headers: { cookie }, body: form });
    expect(res.status).toBe(201);
    const item = ((await res.json()) as UploadReferenceIntakeResponse).item;
    expect(item).toMatchObject({ readable: true, proposedClassifications: null });
    const [row] = await db.select().from(s.referenceIntake).where(eq(s.referenceIntake.id, item.id));
    expect(row!.proposedByRunId).toBeNull();
    // the attempt itself is on the record, as a failed run
    const failed = await db
      .select()
      .from(s.runs)
      .where(and(eq(s.runs.agentId, INTAKE_AGENT_ID), eq(s.runs.request, `Propose a title and classification for T472-down-${stamp}.pdf`)));
    expect(failed.map((r) => r.state)).toEqual(['failed']);
  });

  it('the upload takes the same cross-site guard as every other file door', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(pdf('Forged.'))], `T472-forged-${stamp}.pdf`));
    const res = await app.request(`/projects/${projectId}/reference-intake`, {
      method: 'POST',
      headers: { cookie: ownerSuper, origin: 'https://evil.example' },
      body: form,
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden', detail: 'cross-origin upload' });
  });

  it('erasing a confirmed document takes its intake row with it — no trace of who confirmed an erased file', async () => {
    const item = await uploaded(`T472-erase-${stamp}.pdf`, pdf('To be erased.'));
    const done = (await (await post(ownerSuper, `/projects/${projectId}/reference-intake/${item.id}/confirm`, settled('Erase me', ['document_type', 'STD']))).json()) as { containerId: string };
    expect(await intakeRow(item.id)).toBeDefined();
    await db.update(s.containers).set({ state: 'withdrawn' }).where(eq(s.containers.id, done.containerId));
    const [participant] = await db.select().from(s.participants).where(eq(s.participants.id, ownerSuperParticipant));
    const removed = await removeLibraryContainer(db, {
      containerId: done.containerId,
      projectId,
      organisationId: ownerOrgId,
      userId: participant!.userId,
    });
    expect(removed.ok).toBe(true);
    expect(await intakeRow(item.id)).toBeUndefined();
  });

  it('a stranger to the project gets the same 404 as nothing, on every door', async () => {
    const stranger = await makeUserOutside();
    expect((await upload(stranger, `T472-stranger-${stamp}.pdf`, pdf('x'))).status).toBe(404);
    expect((await get(stranger, `/projects/${projectId}/reference-intake`)).status).toBe(404);
    expect((await post(stranger, `/projects/${projectId}/reference-intake/confirm`, { items: [] })).status).toBe(404);
    expect((await post(stranger, `/projects/${projectId}/reference-intake/${crypto.randomUUID()}/index`)).status).toBe(404);
  });

  it('a failure INSIDE admission adds nothing: the row stays proposed and the person is told so', async () => {
    const second = await uploaded(`T472-atomic2-${stamp}.pdf`, pdf('Atomic two.'));
    // a format the renditions table refuses: the container and version are
    // already inserted when the rendition fails, so this proves the rollback
    await db.update(s.referenceIntake).set({ format: 'txt' }).where(eq(s.referenceIntake.id, second.id));
    const failed = await post(ownerSuper, `/projects/${projectId}/reference-intake/${second.id}/confirm`, settled('Atomic two'));
    expect(failed.status).toBe(409);
    expect(((await failed.json()) as { detail: string }).detail).toBe('admission_failed');
    expect((await intakeRow(second.id))!.status).toBe('proposed');
    expect((await library()).some((i) => i.documentReference === `T472-atomic2-${stamp}`)).toBe(false);
    const containers = await db.select().from(s.containers).where(eq(s.containers.documentReference, `T472-atomic2-${stamp}`));
    expect(containers).toHaveLength(0);
  });

  it('if only the INDEX call fails, the document is in the library, the row says so, and "Index again" finishes it', async () => {
    const item = await uploaded(`T472-reindex-${stamp}.pdf`, pdf('Alpha reindex text.'));
    failEmbeds = true;
    let body: BulkConfirmIntakeResponse;
    try {
      const res = await post(ownerSuper, `/projects/${projectId}/reference-intake/confirm`, {
        items: [{ id: item.id, ...settled('Needs indexing', ['document_type', 'STD']) }],
      });
      body = (await res.json()) as BulkConfirmIntakeResponse;
    } finally {
      failEmbeds = false;
    }
    const result = body.results[0]!;
    expect(result).toMatchObject({ ok: true, indexed: false });
    const containerId = (result as { containerId: string }).containerId;
    // the row is attached to the container the admission itself returned
    const row = await intakeRow(item.id);
    expect(row).toMatchObject({ status: 'confirmed', containerId });
    const [version] = await db.select().from(s.versions).where(eq(s.versions.containerId, containerId));
    expect(await isVersionIndexed(db, router, version!.id, projectId)).toBe(false);
    // the queue and the activity read both say it needs indexing
    expect((await queue('confirmed')).items.find((i) => i.id === item.id)?.needsIndexing).toBe(true);
    const admission = (await (await get(ownerSuper, `/containers/${containerId}/library-admission`)).json()) as GetLibraryAdmissionResponse;
    expect(admission.admission).toMatchObject({ needsIndexing: true, intakeId: item.id });
    // only the owner's super user may index again
    expect((await post(ownerMember, `/projects/${projectId}/reference-intake/${item.id}/index`)).status).toBe(403);
    // while the index is still failing, it says so and changes nothing
    failEmbeds = true;
    try {
      const again = await post(ownerSuper, `/projects/${projectId}/reference-intake/${item.id}/index`);
      expect(again.status).toBe(409);
      expect(((await again.json()) as { detail: string }).detail).toBe('index_failed');
    } finally {
      failEmbeds = false;
    }
    // and when it works, the version is indexed and the flag clears
    const ok = await post(ownerSuper, `/projects/${projectId}/reference-intake/${item.id}/index`);
    expect(ok.status).toBe(200);
    expect(await isVersionIndexed(db, router, version!.id, projectId)).toBe(true);
    expect((await queue('confirmed')).items.find((i) => i.id === item.id)?.needsIndexing).toBe(false);
  });
});
