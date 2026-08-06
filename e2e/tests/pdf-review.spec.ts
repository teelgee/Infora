// T-130 — the in-PDF anchored review viewer, driven in the browser. The API
// half stands up a promoted deliverable with an open round 1 on a PDF-bearing
// version; the browser half proves the three behaviours the ticket names:
// an anchored comment created from a text selection on the PDF; the overlay
// painted from the STORED anchor after a reload; and the authoring side
// seeing the overlays only once the round is issued (ADR-0006/0014).
import { expect, test, type Page } from '@playwright/test';
import type {
  ListRosterResponse,
  PlanRow,
  PromotionResult,
  ReviewCycle,
  ReviewerGrant,
  RosterEntry,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const REFERENCE = `WA-ENV-PDF-9${String(stamp).slice(-3)}`;
const CONTENT =
  'The survey methodology draws on the winter ecology walkover and the ' +
  'phase one habitat classification.\n\n' +
  'Bat activity was recorded at three transects across the connection corridor.';

let eleanor: ApiSession; // consultant lead author (Calder & Hale)
let rachel: ApiSession; // owner-side lead reviewer (Trentmoor)
let projectId: string;
let containerId: string;
let roundId: string;
let reviseCodeId: string;

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrenfield–Ashcombe 400kV Connection').first()).toBeVisible();
}

// Select the first painted glyph run on the PDF and fire the mouseup the
// viewer listens for — the deterministic stand-in for a reviewer's drag.
async function selectFirstText(page: Page) {
  await expect(page.locator('.review-pdf .textLayer span')).not.toHaveCount(0);
  await page.evaluate(() => {
    const span = [...document.querySelectorAll<HTMLElement>('.review-pdf .textLayer span')].find(
      (s) => (s.textContent ?? '').trim().length > 3,
    );
    const node = span?.firstChild;
    if (!span || !node) throw new Error('no selectable text on the PDF');
    const len = node.textContent?.length ?? 0;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.max(2, Math.floor(len / 2)));
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;

  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: REFERENCE,
    title: 'Ecology chapter (PDF review)',
  });
  containerId = row.containerId;
  const roster = await eleanor.get<ListRosterResponse>(`/projects/${projectId}/participants`);
  const eleanorEntry = roster.items.find((r: RosterEntry) => r.name === 'Eleanor Price')!;
  const rachelEntry = roster.items.find((r: RosterEntry) => r.name === 'Rachel Bowen')!;
  await eleanor.post(`/containers/${containerId}/authors`, {
    participantId: eleanorEntry.participantId,
    isLead: true,
  });
  const proposal = await eleanor.post<ReviewerGrant>(`/containers/${containerId}/reviewers`, {
    participantId: rachelEntry.participantId,
    isLead: true,
  });
  await rachel.post(`/reviewers/${proposal.id}/confirmation`, {});

  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: 'Ecology chapter draft',
    containerId,
  });
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: CONTENT });
  const promoted = await eleanor.post<PromotionResult>(`/sandbox-documents/${doc.id}/promotion`, {});
  roundId = promoted.roundId;
  await rachel.post(`/rounds/${roundId}/acknowledge`, {}); // the ADR-0051 gate

  const codes = await rachel.get<{ items: Array<{ id: string; isAccepting: boolean }> }>(
    `/projects/${projectId}/acceptance-codes`,
  );
  reviseCodeId = codes.items.find((c) => !c.isAccepting)!.id;
});

test.afterAll(async () => {
  await Promise.all([eleanor, rachel].filter(Boolean).map((s) => s.dispose()));
});

test('the reviewer anchors a comment from a PDF selection; the overlay paints from the stored anchor after reload', async ({
  page,
}) => {
  await signIn(page, SEEDED.owner);
  await page.goto(`/projects/${projectId}/review/${containerId}`);

  // the frozen version's PDF renders in the viewer
  await expect(page.locator('.review-pdf canvas').first()).toBeVisible();

  // select text on the PDF → the pending anchor appears
  await selectFirstText(page);
  await expect(page.getByRole('button', { name: 'Clear anchor' })).toBeVisible();

  // write and file the anchored comment; the form clears on success, so the
  // body text can then only be the comment row, not the composer
  const body = `Please cite the transect coordinates. ${stamp}`;
  await page.getByPlaceholder('Add a review comment…').fill(body);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByText(body)).toBeVisible();
  // confirm the comment is durably on the record before reloading (don't race
  // the reload against the write's commit)
  await expect
    .poll(async () => (await rachel.get<ReviewCycle>(`/containers/${containerId}/cycle`)).rounds[0]!.comments.length)
    .toBeGreaterThan(0);

  // the anchor was stored on the record — reload, and the overlay paints from
  // it (not from any in-memory selection): a highlight over the quoted quads.
  // This is the ADR-0006 guarantee: the anchor lives on the comment, never a
  // sidecar, so it survives a fresh load bound to the immutable version.
  await page.reload();
  await expect(page.locator('.review-pdf canvas').first()).toBeVisible();
  await expect(
    page.locator('.review-pdf-overlay [aria-label="anchored comment highlight"]').first(),
  ).toBeVisible();
  await expect(page.getByText(body)).toBeVisible();

  // the stored anchor is a page + quoted text + normalised quads (never a
  // rendition-specific sidecar)
  const cycle = await rachel.get<ReviewCycle>(`/containers/${containerId}/cycle`);
  const anchor = cycle.rounds[0]!.comments.at(-1)!.anchor!;
  expect(anchor.page).toBe(1);
  expect(anchor.quote && anchor.quote.length).toBeGreaterThan(0);
  expect(anchor.rects && anchor.rects.length).toBeGreaterThan(0);
});

test('the authoring side sees the overlays only once the round is issued (ADR-0014)', async ({ page }) => {
  const body = `Please cite the transect coordinates. ${stamp}`;

  // while the round is open the author is blind to the round's comments and
  // their overlays — the viewer renders, the anchors do not
  await signIn(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/review/${containerId}`);
  await expect(page.locator('.review-pdf canvas').first()).toBeVisible();
  await expect(page.locator('.review-pdf-overlay [aria-label="anchored comment highlight"]')).toHaveCount(0);
  await expect(page.getByText(body)).toHaveCount(0);

  // the lead reviewer sets a verdict and issues the round
  await rachel.post(`/rounds/${roundId}/deliverable-code`, { acceptanceCodeId: reviseCodeId });
  const issued = await rachel.post<{ cycle: ReviewCycle }>(`/rounds/${roundId}/issue`, {
    purposeCode: 'For review',
  });
  expect(issued.cycle.rounds[0]!.state).toBe('issued');

  // reload: the issued round reveals the comment and paints its overlay,
  // now read-only
  await page.reload();
  await expect(
    page.locator('.review-pdf-overlay [aria-label="anchored comment highlight"]').first(),
  ).toBeVisible();
  await expect(page.getByText(body)).toBeVisible();
});
