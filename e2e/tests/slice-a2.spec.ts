// T-162 — the Slice A2 acceptance run: the producing-side lifecycle as one
// continuous story on the Slice A spine (ADR-0036/0038/0039; refined 0022).
// Owner defines the coding scheme → the consultant self-generates a compliant
// reference and plans the deliverable (TIDP) → creates a single-org sandbox with
// a folder and a document → the document is unbound and cannot promote → binds
// it (one-way) → freezes for internal review (head locked) → promotes → opens a
// document-bound multiplayer thread and pins an attached-source working set.
import { expect, test } from '@playwright/test';
import { defaultDeliverableSchema } from '@infora/contracts';
import type {
  AttachedSource,
  CreateConversationResponse,
  GenerateReferenceResponse,
  ListAttachedSourcesResponse,
  PlanRow,
  Sandbox,
  SandboxDocument,
  SandboxFolder,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const suffix = String(stamp).slice(-3);

let eleanor: ApiSession; // consultant lead author (Calder & Hale)
let rachel: ApiSession; // owner (Trentmoor)
let projectId: string;
let containerId: string;
let sandboxId: string;
let documentId: string;

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;
});

test.afterAll(async () => {
  // T-369's audit: `workers: 1` orders the scheme replacement below, but it
  // does not UNDO it — the mutation outlives the process, so a second local
  // run of any suite would meet the WA/BB-CC/GEO-ENV scheme instead of the
  // seeded default. Put the default back before leaving.
  if (rachel && projectId) {
    await rachel.raw('put', `/projects/${projectId}/naming-scheme`, defaultDeliverableSchema());
  }
  await Promise.all([eleanor, rachel].filter(Boolean).map((s) => s.dispose()));
});

test('1 — the owner defines the project-wide coding scheme; a member cannot', async () => {
  const scheme = {
    separator: '-',
    fields: [
      { key: 'project', label: 'Project', allowedValues: ['WA'] },
      { key: 'originator', label: 'Originator', isOriginator: true, allowedValues: ['BB', 'CC'] },
      { key: 'discipline', label: 'Discipline', allowedValues: ['GEO', 'ENV'] },
      { key: 'serial', label: 'Serial', isSerial: true, width: 3 },
    ],
  };
  const denied = await eleanor.raw('put', `/projects/${projectId}/naming-scheme`, scheme);
  expect(denied.status()).toBe(404); // the wall: a member cannot edit the scheme
  const ok = await rachel.raw('put', `/projects/${projectId}/naming-scheme`, scheme);
  expect(ok.status()).toBe(200);
});

test('2 — the consultant self-generates a compliant reference and plans the deliverable', async () => {
  const gen = await eleanor.post<GenerateReferenceResponse>(
    `/projects/${projectId}/naming-scheme/references`,
    { values: { project: 'WA', originator: 'CC', discipline: 'ENV' } },
  );
  expect(gen.reference).toMatch(/^WA-CC-ENV-\d{3}$/);

  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: `${gen.reference}-${suffix}`,
    title: 'Ecology chapter (Slice A2 e2e)',
  });
  containerId = row.containerId;
  expect(row.workItem?.status).toBe('planned'); // event-driven: planned until a draft/promote moves it
});

test('3 — the consultant provisions a single-org sandbox with a folder and a document', async () => {
  const sandbox = await eleanor.post<Sandbox>(`/projects/${projectId}/sandboxes`, {
    name: `Calder & Hale — ${suffix}`,
    scope: 'single_org',
  });
  sandboxId = sandbox.id;
  expect(sandbox.scope).toBe('single_org');

  const folder = await eleanor.post<SandboxFolder>(`/sandboxes/${sandboxId}/folders`, {
    name: 'Ecology',
  });
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: 'Ecology draft',
    sandboxId,
    folderId: folder.id,
  });
  documentId = doc.id;
  expect(doc.sandboxId).toBe(sandboxId);
  expect(doc.folderId).toBe(folder.id);
  expect(doc.containerId).toBeNull(); // unbound
});

test('4 — an unbound document cannot promote; binding is one-way', async () => {
  const cantPromote = await eleanor.raw('post', `/sandbox-documents/${documentId}/promotion`, {});
  expect(cantPromote.ok()).toBe(false); // unbound → no container to promote into

  const bound = await eleanor.post<{ ok: true; containerId: string }>(
    `/sandbox-documents/${documentId}/binding`,
    { containerId },
  );
  expect(bound.containerId).toBe(containerId);

  const reBind = await eleanor.raw('post', `/sandbox-documents/${documentId}/binding`, { containerId });
  expect(reBind.status()).toBe(409); // one-way — already bound
});

test('5 — the binding is recorded on the document; a document freezes for the internal review', async () => {
  // the binding transition is now on the document (the code inherited via the
  // link); from here promotion is the Slice A path (lead author + confirmed lead
  // reviewer, exercised by the T-129 acceptance), so this run stops at bind.
  const doc = await eleanor.get<SandboxDocument>(`/sandbox-documents/${documentId}`);
  expect(doc.containerId).toBe(containerId);

  // freeze is promotion's twin at sandbox scope: it snapshots the head into an
  // immutable frozen Version for the internal (org-private) review cycle
  const freeze = await eleanor.raw('post', `/sandbox-documents/${documentId}/freeze`, {});
  expect(freeze.ok()).toBe(true);
});

test('6 — a document-bound multiplayer thread carries an attached-source working set', async () => {
  const { conversationId } = await eleanor.post<CreateConversationResponse>(
    `/projects/${projectId}/conversations`,
    { surface: 'web', sandboxDocumentId: documentId },
  );
  await eleanor.post<AttachedSource>(`/conversations/${conversationId}/attached-sources`, {
    kind: 'web',
    ref: 'https://example.test/ecology-standard',
    label: 'Ecology standard',
  });
  await eleanor.post<AttachedSource>(`/conversations/${conversationId}/attached-sources`, {
    kind: 'sandbox',
    ref: documentId,
  });
  const set = await eleanor.get<ListAttachedSourcesResponse>(
    `/conversations/${conversationId}/attached-sources`,
  );
  expect(set.items.length).toBe(2); // one or several, persisting across the thread
  expect(set.items.map((i) => i.kind).sort()).toEqual(['sandbox', 'web']);
});
