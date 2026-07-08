// T-061 — the M5 acceptance test: the owner sees exactly what the owner role
// admits — work-item-bound runs in full, and no ad-hoc run (the 2026-07-06
// visibility ruling's negative case); the trail the owner reads is
// byte-identical to what M3 wrote at production.
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
let adHocConversationId: string;

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
  adHocConversationId = adHoc.conversationId;
  adHocRun = await consultant.post<Run>(`/conversations/${adHocConversationId}/runs`, {
    request: 'T-061 private ad-hoc ask',
  });
});

test.afterAll(async () => {
  await Promise.all([consultant.dispose(), owner.dispose()]);
});

test('the owner reads the work-item-bound run in full, byte-identical to production', async () => {
  const asOwner = await owner.get<Run>(`/runs/${boundRun.id}`);

  // in full: the prompt text, the whole step tree, the audit fields
  expect(asOwner.request).toBe('T-061 governed draft for the record');
  expect(asOwner.steps.map((st) => st.type)).toEqual([
    'retrieve',
    'delegate',
    'draft',
    'ground_check',
    'cite',
  ]);

  // byte-identical: nothing mutated between production and review
  expect(JSON.stringify(asOwner)).toBe(JSON.stringify(boundRun));

  // and it is on the work item's record for the owner
  const workItem = await owner.get<{ runs: Run[] }>(`/work-items/${workItemId}`);
  expect(workItem.runs.some((run) => run.id === boundRun.id)).toBe(true);
});

test('no ad-hoc run reaches the owner — the negative case', async () => {
  expect((await owner.raw('get', `/runs/${adHocRun.id}`)).status()).toBe(404);
  expect((await owner.raw('get', `/conversations/${adHocConversationId}`)).status()).toBe(200);
  const conversation = await owner.get<{ runs: Run[] }>(`/conversations/${adHocConversationId}`);
  expect(conversation.runs).toEqual([]);

  // while its producer still reads it
  expect((await consultant.raw('get', `/runs/${adHocRun.id}`)).status()).toBe(200);

  // and the owner's work-item record never contains it
  const workItem = await owner.get<{ runs: Run[] }>(`/work-items/${workItemId}`);
  expect(workItem.runs.some((run) => run.id === adHocRun.id)).toBe(false);
});

test('browser: the owner walks to the audit screen and reads the trail', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.owner);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByText('Wrenfield–Ashcombe 400kV Connection').click();
  await page.getByText('EIA Scoping Method Statement — Land Quality').click();

  await expect(page.getByText('Append-only audit.')).toBeVisible();

  // the bound run is on the record — its table row, found by run id, carries
  // the prompt text (the bare text also appears in the detail panel, and other
  // suites may have written further runs to this work item)
  const boundRow = page.getByRole('row').filter({ hasText: boundRun.id.slice(0, 8) });
  await expect(boundRow.getByText('T-061 governed draft for the record')).toBeVisible();
  await expect(page.getByText('T-061 private ad-hoc ask')).not.toBeVisible();

  // select it explicitly — its step tree and defensibility panels show
  await boundRow.click();
  await expect(
    page.getByText(
      `Run ${boundRun.id.slice(0, 8)} — step tree (retrieve → draft → ground-check → cite)`,
    ),
  ).toBeVisible();
  await expect(page.getByText('Deterministic verifier', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Access-resolved source set (defensibility)')).toBeVisible();
});
