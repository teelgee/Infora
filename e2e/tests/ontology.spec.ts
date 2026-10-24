// T-244 — Slice O P1 acceptance: the project ontology end to end (ADR-0045)
// against seed data. The default Uniclass/ISO-19650 scheme is copied into the
// project at creation; the producing org classifies its deliverable and draws a
// typed edge to another (propose → confirm → live → retire); the wall holds; and
// the classification renders on the plan surface. The scoped-retrieval pre-filter
// (the 100k-doc lever) is proven at the knowledge layer (T-242); here we prove
// the surface and the write/visibility story over the real HTTP stack.
import { expect, test } from '@playwright/test';
import type {
  ClassificationSchemeResponse,
  ContainerClassificationsResponse,
  ContainerRelationshipsResponse,
  DocumentRelationship,
  GetLibraryResponse,
  GetPlanResponse,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

let consultant: ApiSession;
// T-386 — confirming an edge into a LIBRARY container is the owner's act
// (ADR-0045 as amended): the record is the owner's once published, so the
// producing organisation proposes and the owner confirms.
let owner: ApiSession;
let projectId: string;
let myContainerId: string;
let myRef: string;
let targetContainerId: string;
let facetId: string;
let termId: string;
let edgeId: string;

test.beforeAll(async () => {
  consultant = await ApiSession.login(SEEDED.consultant);
  owner = await ApiSession.login(SEEDED.owner);
  const me = await consultant.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;

  // T-369's sibling, swept here too: never `items[0]` on a list ordered by
  // documentReference — sibling specs plant `T190-`/`T363-` rows that sort
  // ahead of the seeded one, so the position holds only by file order. Name
  // the seeded row instead.
  const plan = await consultant.get<GetPlanResponse>(`/projects/${projectId}/plan`);
  const seededRow = plan.items.find((r) => r.documentReference === 'WA-EIA-MST-001')!;
  myContainerId = seededRow.containerId;
  myRef = seededRow.documentReference!;

  const scheme = await consultant.get<ClassificationSchemeResponse>(
    `/projects/${projectId}/classification-scheme`,
  );
  const discipline = scheme.facets.find((f) => f.key === 'discipline')!;
  facetId = discipline.id;
  termId = discipline.terms[0]!.id;

  // an owner library deliverable, visible to the consultant via share + ack —
  // named, not positional: the list is ordered by reference and grows as
  // sibling suites plant rows (the T-369 sweep's rule)
  const library = await consultant.get<GetLibraryResponse>(`/projects/${projectId}/library`);
  targetContainerId = library.items.find((i) => i.documentReference === 'WA-CON-SCC-002')!.containerId;
});

test.afterAll(async () => {
  await consultant.dispose();
  await owner.dispose();
});

test('1 — the default Uniclass/19650 scheme is copied into the project', async () => {
  const scheme = await consultant.get<ClassificationSchemeResponse>(
    `/projects/${projectId}/classification-scheme`,
  );
  const keys = scheme.facets.map((f) => f.key);
  expect(keys).toContain('discipline');
  expect(keys).toContain('system');
  expect(scheme.facets.find((f) => f.key === 'discipline')!.terms.length).toBeGreaterThan(0);
});

test('2 — the producing org classifies its deliverable', async () => {
  const put = await consultant.raw('put', `/containers/${myContainerId}/classifications`, {
    facetId,
    termId,
  });
  expect(put.status()).toBe(204);
  const cc = await consultant.get<ContainerClassificationsResponse>(
    `/containers/${myContainerId}/classifications`,
  );
  const disc = cc.items.find((i) => i.facetKey === 'discipline');
  expect(disc).toBeDefined();
  expect(disc!.termId).toBe(termId);
  expect(disc!.proposed).toBe(false); // human-set, not an unconfirmed agent proposal
});

test('3 — propose a typed edge, then the owner confirms it live', async () => {
  const edge = await consultant.post<DocumentRelationship>(
    `/containers/${myContainerId}/relationships`,
    { toContainerId: targetContainerId, type: 'references' },
  );
  expect(edge.proposed).toBe(true);
  edgeId = edge.id;

  // T-386 — the target is published into the owner's library, so the producing
  // organisation that proposed the edge cannot also confirm it
  const byProducer = await consultant.raw('post', `/relationships/${edgeId}/confirmation`);
  expect(byProducer.status()).toBe(404);

  const live = await owner.post<DocumentRelationship>(
    `/relationships/${edgeId}/confirmation`,
    {},
  );
  expect(live.proposed).toBe(false);

  const rels = await consultant.get<ContainerRelationshipsResponse>(
    `/containers/${myContainerId}/relationships`,
  );
  const found = rels.items.find((r) => r.id === edgeId)!;
  expect(found).toBeDefined();
  expect(found.direction).toBe('outgoing');
  expect(found.otherContainerId).toBe(targetContainerId);
});

test('4 — a duplicate live edge of the same type is rejected', async () => {
  const dup = await consultant.raw('post', `/containers/${myContainerId}/relationships`, {
    toContainerId: targetContainerId,
    type: 'references',
  });
  expect(dup.status()).toBe(409);
});

test('5 — retiring the edge leaves the record and the live list', async () => {
  const retired = await owner.raw('post', `/relationships/${edgeId}/retirement`);
  expect(retired.status()).toBe(200);
  const rels = await consultant.get<ContainerRelationshipsResponse>(
    `/containers/${myContainerId}/relationships`,
  );
  expect(rels.items.find((r) => r.id === edgeId)).toBeUndefined();
});

test('6 — the wall: a user with no project access cannot read the ontology', async () => {
  const outsider = await ApiSession.login(SEEDED.noParticipant);
  const denied = await outsider.raw('get', `/containers/${myContainerId}/classifications`);
  expect(denied.status()).toBe(404);
  await outsider.dispose();
});

test('7 — the classification renders on the plan surface', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
  await page.getByRole('link', { name: /Plan/ }).click();
  // T-462 — the plan is a paged register: find the row by its code first
  await page.getByRole('searchbox', { name: 'Search Deliverables plan' }).fill(myRef);
  await page.getByRole('row').filter({ hasText: myRef }).click();
  // T-457 — the row lands on the document page; its Relationships tab carries the ontology panel
  await page.getByRole('radiogroup', { name: 'Document page sections' }).getByRole('radio', { name: 'Relationships' }).click();
  await expect(page.getByText('Classification', { exact: true })).toBeVisible();
  await expect(page.getByText('Propose a relationship', { exact: false })).toBeVisible();
});
