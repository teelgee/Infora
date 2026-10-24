// T-480 — the Compare tab on the document page.
//
// One chapter, reviewed once: a reviewer writes three comments on P01, the
// authoring team answers each with the passage it will add, and P02 goes out
// carrying exactly those three additions. What this run proves:
//
//   THE DONE-WHEN. The Compare tab, P01 against P02, says "3 changes — 3
//   insertions" and underlines exactly three runs, each one a passage a
//   response promised. Turned round (P02 against P01) the same three read as
//   three deletions. The pair rides in the link, so a copied link and a reload
//   open the same comparison.
//
//   NO TAB WITHOUT TWO VERSIONS. A reader who may open the document but sees
//   only one version (a consultant on the seeded standard) gets no Compare tab,
//   and a link that asks for one opens the Overview. The reader page WITH two
//   versions is pinned in render.test.tsx: no read lists a standard's earlier
//   versions, so only a citation to one gives a reader a pair.
import { expect, test } from '@playwright/test';
import type { PlanRow, PromotionResult, ReviewCycle, ReviewerGrant, RosterEntry, SandboxDocument } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const stamp = String(Date.now()).slice(-6);
const REFERENCE = `WA-CMP-ECO-${stamp}`;
const P01_TEXT = [
  'Section one covers the baseline conditions across the corridor',
  'Section two reports the groundwater levels at each monitoring point',
  'Section three sets out the dewatering method for the compound',
].join('\n\n');
const ADDITIONS = ['including the 2024 boreholes', 'recorded over three seasons', 'agreed with the regulator'];
const P02_TEXT = [
  'Section one covers the baseline conditions including the 2024 boreholes across the corridor',
  'Section two reports the groundwater levels recorded over three seasons at each monitoring point',
  'Section three sets out the dewatering method agreed with the regulator for the compound',
].join('\n\n');

let eleanor: ApiSession;
let rachel: ApiSession;
let projectId: string;
let containerId: string;
let p01Id: string;
let p02Id: string;

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
}
const tab = (page: import('@playwright/test').Page, name: string) => page.getByRole('radio', { name, exact: true });

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;

  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: REFERENCE,
    title: `Compare e2e ${stamp}`,
  });
  containerId = row.containerId;
  const roster = await eleanor.get<{ items: RosterEntry[] }>(`/projects/${projectId}/participants`);
  const idOf = (name: string) => roster.items.find((r) => r.name === name)!.participantId;
  await eleanor.post(`/containers/${containerId}/authors`, { participantId: idOf('Eleanor Price'), isLead: true });
  const lead = await eleanor.post<ReviewerGrant>(`/containers/${containerId}/reviewers`, {
    participantId: idOf('Rachel Bowen'),
    isLead: true,
  });
  await rachel.post(`/reviewers/${lead.id}/confirmation`, {});
  await rachel.post(`/reviewers/${lead.id}/acceptance`, {});

  // P01
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: `Compare e2e ${stamp} draft`,
    containerId,
  });
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: P01_TEXT });
  await eleanor.patch(`/sandboxes/${doc.sandboxId}/settings`, { promotionRequiresQa: false });
  const p01 = await eleanor.post<PromotionResult>(`/sandbox-documents/${doc.id}/promotion`, {});
  await rachel.post(`/rounds/${p01.roundId}/acknowledge`, {});

  // three comments from the reviewer, then the round goes back
  const comments: string[] = [];
  for (const topic of ['baseline', 'groundwater', 'dewatering']) {
    const c = await rachel.post<{ id: string }>(`/rounds/${p01.roundId}/comments`, {
      body: `Please say more about the ${topic} (${stamp}).`,
    });
    comments.push(c.id);
  }
  const codes = await rachel.get<{ items: Array<{ id: string; code: string }> }>(`/projects/${projectId}/acceptance-codes`);
  await rachel.post(`/rounds/${p01.roundId}/deliverable-code`, { acceptanceCodeId: codes.items.find((c) => c.code === 'S3')!.id });
  await rachel.post(`/rounds/${p01.roundId}/issue`, {});

  // each comment answered with the passage the next version will carry
  for (const [i, id] of comments.entries()) {
    await eleanor.post(`/review-comments/${id}/response`, {
      body: 'Added.',
      nextVersionAnchor: { quote: ADDITIONS[i]! },
    });
  }

  // P02, carrying exactly those three additions
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: P02_TEXT });
  await eleanor.post(`/sandbox-documents/${doc.id}/promotion`, {});
  const cycle = (await eleanor.get<ReviewCycle>(`/containers/${containerId}/cycle`))!;
  expect(cycle.rounds.map((r) => r.versionReference)).toEqual(['P01', 'P02']);
  p01Id = cycle.rounds[0]!.versionId;
  p02Id = cycle.rounds[1]!.versionId;
});

test.afterAll(async () => {
  await Promise.all([eleanor, rachel].filter(Boolean).map((s) => s.dispose()));
});

test('P01 against P02 shows exactly the three responded changes', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/documents/${containerId}`);
  await expect(tab(page, 'Compare')).toBeVisible();
  await tab(page, 'Compare').click();

  // the previous and the current version are the default pair
  const older = page.getByLabel('Compare — the older version');
  const newer = page.getByLabel('Compare — the newer version');
  await expect(older.locator('option:checked')).toContainText('P01');
  await expect(newer.locator('option:checked')).toContainText('P02');
  await expect(page).toHaveURL(/tab=compare/);

  await expect(page.locator('[data-compare-count]')).toHaveText('3 changes — 3 insertions');
  const inserted = page.locator('[data-compare] [data-side="newer"] ins');
  await expect(inserted).toHaveCount(3);
  await expect(page.locator('[data-compare] del')).toHaveCount(0);
  // each underlined run is a passage a response promised
  expect(await inserted.allTextContents()).toEqual(ADDITIONS);
});

test('the pair rides in the link, so a reload and a copied link open the same comparison', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/documents/${containerId}?tab=compare&from=${p02Id}&to=${p01Id}`);
  await expect(tab(page, 'Compare')).toBeChecked();
  await expect(page.locator('[data-compare-count]')).toHaveText('3 changes — 3 deletions');
  await expect(page.locator('[data-compare] [data-side="older"] del')).toHaveCount(3);
  await expect(page.locator('[data-compare] ins')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-compare-count]')).toHaveText('3 changes — 3 deletions');
  // the link also works the other way round
  await page.goto(`/projects/${projectId}/documents/${containerId}?tab=compare&from=${p01Id}&to=${p02Id}`);
  await expect(page.locator('[data-compare-count]')).toHaveText('3 changes — 3 insertions');
  // leaving the tab drops the pair from the address
  await tab(page, 'Versions').click();
  await expect(page).not.toHaveURL(/tab=compare|from=|to=/);
});

test('a reader who can open only one version gets no Compare tab', async ({ page }) => {
  // the seeded standard: a consultant may read it, and its page lists one version
  await loginAs(page, SEEDED.consultant);
  await page.getByRole('link', { name: /Project library/ }).click();
  await page.getByRole('searchbox', { name: /Search/ }).first().fill('WA-STD-BS5930-001');
  await page.getByRole('row').filter({ hasText: 'WA-STD-BS5930-001' }).first().click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('WA-STD-BS5930-001');
  await expect(tab(page, 'Versions')).toBeVisible();
  await expect(tab(page, 'Compare')).toHaveCount(0);
  // a link to a comparison opens the Overview instead of a tab that is not there
  const here = new URL(page.url());
  await page.goto(`${here.pathname}?tab=compare`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('WA-STD-BS5930-001');
  await expect(tab(page, 'Compare')).toHaveCount(0);
  await expect(tab(page, 'Overview')).toBeChecked();
});
