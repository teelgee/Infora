// T-080 — the end-to-end acceptance run: the whole walking-skeleton journey
// (its "the skeleton is done" list) as one continuous story against seed
// data — the same consultant, the same governed run, the same document, the
// same record read across the role boundary — plus the two negative wall
// tests. Step 6 (Copilot) rides with the M6 deferral (2026-07-08); the
// skeleton closes over the web surface alone. The work-item binding is
// created at the API level: no web-UI affordance starts governed work yet
// (grill tracker residual, 2026-07-08).
import { expect, test } from '@playwright/test';
import type {
  CreateConversationResponse,
  GetLibraryResponse,
  ListSuggestionsResponse,
  ListWorkItemsResponse,
  Run,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

// the fake providers' deterministic draft: one grounded claim survives,
// one unsupported claim is withheld by ground-check
const SURVIVING = 'The investigation recorded contamination exceedances.';
const WITHHELD_FRAGMENT = 'An unsupported figure of 40%';
// T-475 — the withheld claim is no longer silently dropped: it stands in the
// draft as a gap marker line, after the sentence it followed
const GAP_LINE = `[Gap: the record does not support "${WITHHELD_FRAGMENT}."]`;
const DRAFT = `${SURVIVING}\n\n${GAP_LINE}`;

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const WORK_ITEM = 'EIA Scoping Method Statement — Land Quality';

test.describe.configure({ mode: 'serial' });

let consultant: ApiSession;
let projectId: string;
let workItemId: string;
let documentTitle: string;
let documentId: string;
let run: Run; // as written at production (step 2)
let manualText: string;

test.beforeAll(async () => {
  consultant = await ApiSession.login(SEEDED.consultant);
  const me = await consultant.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;
  const workItems = await consultant.get<ListWorkItemsResponse>(`/projects/${projectId}/work-items`);
  workItemId = workItems.items[0]!.id;
  documentTitle = `T-080 skeleton ${Date.now()}`;
});

test.afterAll(async () => {
  await consultant.dispose();
});

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('1 — the consultant opens the project: access resolves on the real login path', async ({
  page,
}) => {
  await loginAs(page, SEEDED.consultant);
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  await page.getByText(PROJECT).first().click();
  await expect(page.getByText(WORK_ITEM)).toBeVisible(); // the governed-work anchor
});

test('2 — the orchestrated production: the coded chain, audited append-only', async () => {
  const doc = await consultant.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: documentTitle,
  });
  documentId = doc.id;

  // governed work: the Conversation binds to the Work item (API-level — see
  // the grill-tracker residual on the missing UI affordance)
  const conversation = await consultant.post<CreateConversationResponse>(
    `/projects/${projectId}/conversations`,
    { surface: 'web', workItemId },
  );
  run = await consultant.post<Run>(`/conversations/${conversation.conversationId}/runs`, {
    request: 'Draft the contamination summary for the scoping statement',
    sandboxDocumentId: documentId,
  });

  // the chain runs the same ordering every time — no LLM decides the plan
  expect(run.state).toBe('completed');
  expect(run.steps.map((st) => st.type)).toEqual([
    'retrieve',
    'delegate',
    'draft',
    'ground_check',
    'cite',
  ]);
  for (const step of run.steps) expect(step.status).toBe('completed');

  // one real sub-agent, a child Run in the tree
  const childRunId = run.steps.find((st) => st.type === 'delegate')!.childRunId!;
  const child = await consultant.get<Run>(`/runs/${childRunId}`);
  expect(child.parentRunId).toBe(run.id);

  // the two defensibility fields are populated, not placeholder
  const retrieve = run.steps.find((st) => st.type === 'retrieve')!;
  expect(retrieve.sourceSet.length).toBeGreaterThan(0);
  const draft = run.steps.find((st) => st.type === 'draft')!;
  expect(draft.model?.id).toBeTruthy();
  expect(draft.usage?.tokensPrompt).toBeGreaterThan(0);
  const groundCheck = run.steps.find((st) => st.type === 'ground_check')!;
  expect(groundCheck.railOutcomes.some((o) => o.outcome === 'withheld')).toBe(true);

  // the ungrounded claim was withheld; the survivor is cited to a live source
  expect(run.response).toContain(SURVIVING);
  // the withheld claim appears only as a gap marker, never as a sentence of the draft
  expect(run.response).toContain(GAP_LINE);
  const suggestion = run.suggestions[0]!;
  expect(suggestion.content).toBe(DRAFT);
  expect(suggestion.citations.length).toBeGreaterThan(0);
  const library = await consultant.get<GetLibraryResponse>(`/projects/${projectId}/library`);
  const liveVersionIds = new Set(library.items.map((item) => item.currentVersionId));
  for (const citation of suggestion.citations) {
    expect('versionId' in citation.source).toBe(true);
    if ('versionId' in citation.source) expect(liveVersionIds.has(citation.source.versionId)).toBe(true);
  }
});

test('3 — the cited draft in the editor; accept lands it and writes the one Signal', async ({
  page,
}) => {
  await loginAs(page, SEEDED.consultant);
  await page.getByText(PROJECT).first().click();
  await page.getByRole('link', { name: /Sandbox/ }).click();
  // Open in Editor moved into the row's overflow kebab (T-227)
  const editorRow = page.getByRole('row').filter({ hasText: documentTitle });
  await editorRow.getByRole('button', { name: /More actions/ }).click();
  await page.locator('.dropdown-menu').getByText('Open in Editor').click();

  // the proposed block: content, citation chip to a project source, withheld notice
  const proposed = page.locator('.proposed');
  await expect(proposed.getByText(SURVIVING)).toBeVisible();
  const reference = (run.suggestions[0]!.citations[0]!.source as { documentReference: string })
    .documentReference;
  await expect(proposed.getByText(reference)).toBeVisible();
  // T-475 — the gap IS the notice: drawn as a gap, at the sentence that needed it
  await expect(proposed.locator('.gap-marker')).toContainText(WITHHELD_FRAGMENT);

  await page.getByRole('button', { name: /Accept/ }).click();
  await expect(page.locator('.doc-body textarea')).toHaveValue(DRAFT);

  // exactly one Signal rides the Suggestion; the content landed
  const { items } = await consultant.get<ListSuggestionsResponse>(
    `/sandbox-documents/${documentId}/suggestions`,
  );
  expect(items.find((sg) => sg.id === run.suggestions[0]!.id)?.signal?.resolution).toBe('accepted');
  const doc = await consultant.get<SandboxDocument>(`/sandbox-documents/${documentId}`);
  expect(doc.content).toBe(DRAFT);
});

test('4 — a manual edit lands with no ceremony: no Suggestion, no Signal', async ({ page }) => {
  const before = await consultant.get<ListSuggestionsResponse>(
    `/sandbox-documents/${documentId}/suggestions`,
  );

  await loginAs(page, SEEDED.consultant);
  await page.getByText(PROJECT).first().click();
  await page.getByRole('link', { name: /Sandbox/ }).click();
  // Open in Editor moved into the row's overflow kebab (T-227)
  const editorRow = page.getByRole('row').filter({ hasText: documentTitle });
  await editorRow.getByRole('button', { name: /More actions/ }).click();
  await page.locator('.dropdown-menu').getByText('Open in Editor').click();

  manualText = `${SURVIVING}\n\nTyped by hand, as if AI did not exist.`;
  await page.locator('.doc-body textarea').fill(manualText);
  // the editor saves on blur by design — clicking Save races the blur-save
  // that removes the button, so leave the field and assert the saved state
  await page.locator('.doc-body textarea').blur();
  await expect(page.getByText('No document controls')).toBeVisible(); // saved: the Save control is gone

  const doc = await consultant.get<SandboxDocument>(`/sandbox-documents/${documentId}`);
  expect(doc.content).toBe(manualText);
  const after = await consultant.get<ListSuggestionsResponse>(
    `/sandbox-documents/${documentId}/suggestions`,
  );
  expect(after.items.map((sg) => [sg.id, sg.signal?.resolution])).toEqual(
    before.items.map((sg) => [sg.id, sg.signal?.resolution]),
  );
});

test('5 — the record stays with its producer; the owner sees the review cycle', async ({ page }) => {
  // T-104 (2026-07-12): the record is producing-organisation-private
  // background data — retained immutably for the consultant, invisible to
  // the client owner, who reads the work item's review-cycle facts instead
  const producerRead = await consultant.get<Run>(`/runs/${run.id}`);
  expect(JSON.stringify(producerRead.steps)).toBe(JSON.stringify(run.steps)); // nothing mutated

  const owner = await ApiSession.login(SEEDED.owner);
  expect((await owner.raw('get', `/runs/${run.id}`)).status()).toBe(404);
  const workItem = await owner.get<{ runs: Run[]; status: string }>(`/work-items/${workItemId}`);
  expect(workItem.status).toBeTruthy();
  expect(workItem.runs).toEqual([]);
  await owner.dispose();

  // and the walk: landing → work item → the review cycle, never the agent
  await loginAs(page, SEEDED.owner);
  await page.getByText(PROJECT).first().click();
  await page.getByText(WORK_ITEM).click();
  await expect(page.getByText('Review cycle')).toBeVisible();
  await expect(page.getByText(run.request)).not.toBeVisible();
});

// step 6 (Copilot: the same answer over the same API, audited as
// copilot-originated) rides with the M6 deferral — 2026-07-08.

test('negative — the wall subjects get nothing, on the journey’s own resources', async ({
  page,
}) => {
  // the second organisation's no-Participant user, and the third organisation
  // (the Copilot half of this negative is deferred with M6)
  for (const email of [SEEDED.noParticipant, SEEDED.thirdOrg]) {
    const denied = await ApiSession.login(email);
    for (const [method, path] of [
      ['get', `/projects/${projectId}/work-items`],
      ['get', `/projects/${projectId}/library`],
      ['get', `/work-items/${workItemId}`],
      ['get', `/runs/${run.id}`],
      ['get', `/sandbox-documents/${documentId}`],
    ] as const) {
      const res = await denied.raw(method, path);
      expect(`${email} ${path} → ${res.status()}`).toBe(`${email} ${path} → 404`);
    }
    // denial is 404, indistinguishable from nonexistence — and resolution is
    // denied too, so no cross-wall Signal can ever be written
    const res = await denied.raw('post', `/suggestions/${run.suggestions[0]!.id}/resolution`, {
      resolution: 'rejected',
    });
    expect(res.status()).toBe(404);
    await denied.dispose();
  }

  // the same denial on the surface: an empty workspace, not a hidden project
  await loginAs(page, SEEDED.noParticipant);
  await expect(page.getByText('No project access yet')).toBeVisible();
  await expect(page.getByText(PROJECT).first()).not.toBeVisible();
});
