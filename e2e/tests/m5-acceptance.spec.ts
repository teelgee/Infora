// T-061, re-ruled by T-104 (2026-07-12): the record turns inward. Every Run
// is retained, immutable, producing-organisation-private background data —
// the consultant carries the professional liability for the work product,
// and the client owner reviews the *document* through the review cycle,
// never the agent's internals. The owner's cross-role read is the work
// item's review-cycle facts, nothing more.
import { expect, test } from '@playwright/test';
import type {
  CreateConversationResponse,
  ListWorkItemsResponse,
  Run,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

let consultant: ApiSession;
let owner: ApiSession;
let projectId: string;
let workItemId: string;
let boundRun: Run; // as written at production, read by its producer
let adHocRun: Run;

test.beforeAll(async () => {
  consultant = await ApiSession.login(SEEDED.consultant);
  owner = await ApiSession.login(SEEDED.owner);

  const me = await consultant.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;
  const workItems = await consultant.get<ListWorkItemsResponse>(`/projects/${projectId}/work-items`);
  workItemId = workItems.items[0]!.id;

  const bound = await consultant.post<CreateConversationResponse>(
    `/projects/${projectId}/conversations`,
    { surface: 'web', workItemId },
  );
  boundRun = await consultant.post<Run>(`/conversations/${bound.conversationId}/runs`, {
    request: 'T-061 governed draft for the record',
  });

  const adHoc = await consultant.post<CreateConversationResponse>(
    `/projects/${projectId}/conversations`,
    { surface: 'web' },
  );
  adHocRun = await consultant.post<Run>(`/conversations/${adHoc.conversationId}/runs`, {
    request: 'T-061 private ad-hoc ask',
  });
});

test.afterAll(async () => {
  await Promise.all([consultant.dispose(), owner.dispose()]);
});

test('the record is retained for its producer — immutable, byte-identical, in full', async () => {
  const asProducer = await consultant.get<Run>(`/runs/${boundRun.id}`);
  expect(asProducer.request).toBe('T-061 governed draft for the record');
  expect(asProducer.steps.map((st) => st.type)).toEqual([
    'retrieve',
    'delegate',
    'draft',
    'ground_check',
    'cite',
  ]);
  // nothing mutated between production and the later read
  expect(JSON.stringify(asProducer)).toBe(JSON.stringify(boundRun));
});

test("no run reaches the client owner — bound or ad-hoc, it is the producer's background data", async () => {
  expect((await owner.raw('get', `/runs/${boundRun.id}`)).status()).toBe(404);
  expect((await owner.raw('get', `/runs/${adHocRun.id}`)).status()).toBe(404);

  // the review-cycle facts stay readable; the runs list is empty
  const workItem = await owner.get<{ runs: Run[]; status: string }>(`/work-items/${workItemId}`);
  expect(workItem.status).toBeTruthy();
  expect(workItem.runs).toEqual([]);

  // while the producer still reads everything
  expect((await consultant.raw('get', `/runs/${adHocRun.id}`)).status()).toBe(200);
});

test('browser: the owner walks to the work item and sees the review cycle, not the agent', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.owner);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByText('Wrenfield–Ashcombe 400kV Connection').click();
  await page.getByText('EIA Scoping Method Statement — Land Quality').click();

  await expect(page.getByText('Review cycle')).toBeVisible();
  // the agent's internals never render here — no prompt text, no step tree
  await expect(page.getByText('T-061 governed draft for the record')).not.toBeVisible();
  await expect(page.getByText('step tree', { exact: false })).not.toBeVisible();
});
