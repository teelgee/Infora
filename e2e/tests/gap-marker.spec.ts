// T-475 — visible gaps and passage authorship, driven in the browser (ADR-0048's
// amendment of 2026-10-24, ADR-0049 §7 as amended).
//
// *In plain terms: the author asks the agent for a draft. One sentence the
// record cannot support is not silently dropped — it comes back as a marked gap
// at the place it was needed. The author accepts the draft, sees the gap boxed
// in the text and counted in the Checks tab, is stopped when she tries to
// promote, can hover a paragraph to see who wrote it, and once she deletes the
// gap line the promotion goes through.*
//
// The fake model's drafting call already answers "one grounded sentence, then
// one with no source" (apps/api/src/e2e-server.ts), so the ground-check
// withholds exactly one claim and the substrate needed no new behaviour.
import { expect, test } from '@playwright/test';
import type {
  PlanRow,
  ReviewCycle,
  ReviewerGrant,
  RosterEntry,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const stamp = String(Date.now()).slice(-6);
const TITLE = `Gap marker e2e ${stamp}`;
const SURVIVING = 'The investigation recorded contamination exceedances.';
const WITHHELD = 'An unsupported figure of 40%.';
const GAP_LINE = `[Gap: the record does not support "${WITHHELD}"]`;

let eleanor: ApiSession;
let rachel: ApiSession;
let projectId: string;
let documentId: string;
let containerId: string;

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;

  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: `WA-GAP-ECO-${stamp}`,
    title: TITLE,
    metadata: { discipline: 'ecology' },
  });
  containerId = row.containerId;
  const roster = await eleanor.get<{ items: RosterEntry[] }>(`/projects/${projectId}/participants`);
  const el = roster.items.find((r) => r.name === 'Eleanor Price')!;
  const rb = roster.items.find((r) => r.name === 'Rachel Bowen')!;
  await eleanor.post(`/containers/${containerId}/authors`, { participantId: el.participantId, isLead: true });
  const proposal = await eleanor.post<ReviewerGrant>(`/containers/${containerId}/reviewers`, {
    participantId: rb.participantId,
    isLead: true,
  });
  await rachel.post(`/reviewers/${proposal.id}/confirmation`, {});
  await rachel.post(`/reviewers/${proposal.id}/acceptance`, {});
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: `${TITLE} draft`,
    containerId,
  });
  documentId = doc.id;
  // this deliverable skips internal QA — performed, not inherited by silence
  await eleanor.patch(`/sandboxes/${doc.sandboxId}/settings`, { promotionRequiresQa: false });
});

test.afterAll(async () => {
  await Promise.all([eleanor, rachel].filter(Boolean).map((s) => s.dispose()));
});

test('a draft the record cannot fully support shows its gap; promotion waits; the hover names author and acceptor; deleting the gap lets it through', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
  await page.goto(`/projects/${projectId}/editor/${documentId}`);

  // ── ask for a draft: the unsupported sentence comes back as a gap ─────────
  await page.getByPlaceholder('Ask for a draft into this document').fill('Draft the land quality summary');
  await page.getByPlaceholder('Ask for a draft into this document').press('Enter');
  const proposed = page.locator('.proposed').first();
  await expect(proposed.getByText(SURVIVING)).toBeVisible();
  // nothing is written into the document until the person accepts
  await expect(page.locator('.doc-body textarea')).toHaveValue('');
  // the withheld-claims notice is gone; the gap is the notice, drawn as a gap
  await expect(proposed.locator('.gap-marker')).toContainText(WITHHELD);
  await expect(proposed.locator('.gap-marker')).toContainText('Gap');

  // ── accept: the gap lands only through the accepted suggestion ────────────
  await proposed.getByRole('button', { name: /Accept/ }).click();
  await expect(page.locator('.doc-body textarea')).toHaveValue(`${SURVIVING}\n\n${GAP_LINE}`);
  // painted at the sentence that needed it: a dashed box on the line, in the text layer
  await expect(page.locator('.canvas-mirror mark.mark--gap')).toHaveCount(1);
  await expect(page.locator('.canvas-mirror mark.mark--gap')).toHaveText(GAP_LINE);

  // ── the Checks tab counts it, names it, and jumps to it ───────────────────
  await expect(page.getByText('Checks (1)', { exact: true })).toBeVisible();
  await page.getByText('Checks (1)', { exact: true }).click();
  const gaps = page.getByRole('region', { name: 'Gaps' });
  await expect(gaps.getByText('1 gap', { exact: true })).toBeVisible();
  await expect(gaps.getByRole('button', { name: new RegExp(WITHHELD.replace('.', '\\.')) })).toBeVisible();
  await gaps.getByRole('button').first().click();
  const selected = await page
    .locator('.doc-body textarea')
    .evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
  expect(selected).toBe(GAP_LINE);

  // ── promotion is refused while the gap is open, and the window says why ───
  await page.getByRole('button', { name: /Promote/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('What is still open')).toBeVisible();
  await expect(dialog.getByText('1 open gap')).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Open gaps' })).toContainText(WITHHELD);
  await expect(dialog.getByRole('button', { name: 'Promote', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: /Cancel|Close/ }).first().click();
  await expect(dialog).toBeHidden();
  // the API agrees with the window
  const refused = await eleanor.raw('post', `/sandbox-documents/${documentId}/promotion`, {});
  expect(refused.status()).toBe(409);

  // ── hover: who drafted it, who accepted it ────────────────────────────────
  const agentMark = page.getByRole('button', { name: /Who wrote paragraph 1:/ });
  await agentMark.hover();
  const card = page.getByRole('dialog', { name: 'Who wrote paragraph 1' });
  await expect(card).toContainText('Drafted by the agent in run');
  await expect(card).toContainText('accepted by Eleanor Price');
  await page.keyboard.press('Escape');

  // ── delete the gap line: the author's way to clear it ─────────────────────
  const textarea = page.locator('.doc-body textarea');
  await textarea.fill(SURVIVING);
  await textarea.blur();
  await expect(page.locator('.canvas-mirror mark.mark--gap')).toHaveCount(0);
  await expect(page.getByText('Checks', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Promote/ }).first().click();
  await expect(dialog.getByRole('button', { name: 'Promote', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Promote', exact: true }).click();
  await expect(dialog).toBeHidden();

  const cycle = (await rachel.get<ReviewCycle | null>(`/containers/${containerId}/cycle`))!;
  expect(cycle.rounds).toHaveLength(1);
  expect(cycle.rounds[0]!.versionReference).toBe('P01');
});
