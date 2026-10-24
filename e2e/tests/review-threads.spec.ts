// T-479 — threads, progress and the response link.
//
// One review of thirty comments across two organisations, walked with one key
// each. What this run proves:
//
//   THE WALK. The reviewing side opens the Threads list and presses J thirty
//   times; the highlight lands on a new comment each time, in the list and in
//   the round's tray at once. Filtering by one reviewer narrows both the list
//   and the walk.
//
//   THE PROGRESS LINE, AND THE WALL. While the round is open the reviewing
//   side sees one line per reviewer ("Nadia Okonjo — 15 comments · done"). The
//   authoring side sees the withheld notice and no line at all, not zeros.
//
//   THE AUTHORING SIDE'S SWEEP (T-480). Once the round is issued back, the same
//   reviewer filter narrows what J walks and E acts on; it survives saving an
//   answer, and with "Open" chosen too the next J is that reviewer's next
//   unanswered comment.
//
//   THE LINK LANDS ON THE CHANGE. A response that says what changed becomes a
//   link; once the next version exists it opens that version with the changed
//   words stated above it (and, for a version with only text, marked in the
//   text — pinned in the unit test).
import { expect, test } from '@playwright/test';
import type { PlanRow, ReviewComment, ReviewCycle, ReviewerGrant, RosterEntry, SandboxDocument } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const stamp = String(Date.now()).slice(-6);
const TITLE = `Threads e2e ${stamp}`;
const REFERENCE = `WA-THR-ECO-${stamp}`;
const REVISED = 'the 2024 supplementary ground investigation';

let eleanor: ApiSession; // lead author, Calder & Hale — the authoring side
let rachel: ApiSession; // owner organisation (Trentmoor), lead reviewer
let nadia: ApiSession; // Redgate Ecology, a second organisation's reviewer
let projectId: string;
let containerId: string;
let roundId: string;
let sandboxDocumentId: string;
let expectedOrder: string[] = []; // comment ids in the order the server returns them
let expectedNadia: string[] = [];

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
}

const cyclePath = () => `/projects/${projectId}/review/${containerId}/cycle`;

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  rachel = await ApiSession.login(SEEDED.owner);
  nadia = await ApiSession.login(SEEDED.secondConsultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;

  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: REFERENCE,
    title: TITLE,
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
  // a reviewer from a third organisation needs the deliverable shared with it
  // first (ADR-0015), then the owner's own appointment confirms itself
  await rachel.post(`/containers/${containerId}/shares`, {
    organisationId: roster.items.find((r) => r.name === 'Nadia Okonjo')!.organisationId,
  });
  await rachel.post(`/containers/${containerId}/reviewers`, { participantId: idOf('Nadia Okonjo') });

  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: `${TITLE} draft`,
    containerId,
  });
  sandboxDocumentId = doc.id;
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: 'The contamination baseline.' });
  await eleanor.patch(`/sandboxes/${doc.sandboxId}/settings`, { promotionRequiresQa: false });
  const p01 = await eleanor.post<{ roundId: string }>(`/sandbox-documents/${doc.id}/promotion`, {});
  roundId = p01.roundId;
  await rachel.post(`/rounds/${roundId}/acknowledge`, {});

  const codes = await rachel.get<{ items: Array<{ id: string; code: string; isAccepting: boolean }> }>(
    `/projects/${projectId}/acceptance-codes`,
  );
  const [codeA, codeB] = [codes.items.find((c) => c.code === 'S1')!, codes.items.find((c) => c.code === 'S2')!];
  // thirty comments, fifteen from each organisation's reviewer, two codes and some uncoded
  for (let i = 0; i < 30; i++) {
    const author = i % 2 === 0 ? rachel : nadia;
    const code = i % 3 === 0 ? codeA : i % 3 === 1 ? codeB : null;
    await author.post<ReviewComment>(`/rounds/${roundId}/comments`, {
      body: `Thread ${stamp}-${String(i).padStart(2, '0')} — the baseline needs a second look.\nSecond line of the comment.`,
      ...(code && { acceptanceCodeId: code.id }),
    });
  }
  const read = (await rachel.get<ReviewCycle>(`/containers/${containerId}/cycle`))!;
  const comments = read.rounds[0]!.comments;
  expectedOrder = comments.map((c) => c.id);
  expectedNadia = comments.filter((c) => c.author.name === 'Nadia Okonjo').map((c) => c.id);
  expect(expectedOrder).toHaveLength(30);
  expect(expectedNadia).toHaveLength(15);
});

test.afterAll(async () => {
  await Promise.all([eleanor, rachel, nadia].filter(Boolean).map((s) => s.dispose()));
});

test('the reviewing side walks thirty comments with one key each, and the progress line follows the round', async ({
  page,
}) => {
  await loginAs(page, SEEDED.owner);
  await page.goto(cyclePath());

  const list = page.getByRole('list', { name: 'Threads' });
  await expect(list.getByRole('listitem')).toHaveCount(30);
  await expect(page.getByText('30 comments', { exact: false }).first()).toBeVisible();

  // the progress line: one per confirmed reviewer, nothing counted against anyone
  const progress = page.locator('[data-progress-line]');
  await expect(progress).toHaveCount(2);
  await expect(page.getByText('Rachel Bowen — 15 comments · still reading')).toBeVisible();
  await expect(page.getByText('Nadia Okonjo — 15 comments · still reading')).toBeVisible();
  await expect(page.getByText(/of \d+ (required|reviewers)/i)).toHaveCount(0);

  // Nadia marks her pass done; the line follows on the next read
  await nadia.post(`/rounds/${roundId}/review-completion`, {});
  await page.reload();
  await expect(page.getByText('Nadia Okonjo — 15 comments · done')).toBeVisible();
  await expect(page.getByText('Rachel Bowen — 15 comments · still reading')).toBeVisible();

  // the walk: thirty presses of J, a new comment each time, in the list and in the tray
  await expect(list.getByRole('listitem')).toHaveCount(30);
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('j');
    const id = expectedOrder[i]!;
    await expect(list.locator('li[aria-current="true"]')).toHaveCount(1);
    await expect(list.locator('li[aria-current="true"]')).toHaveAttribute('data-thread-id', id);
    await expect(page.locator(`[data-comment-id="${id}"][data-active="true"]`)).toHaveCount(1);
  }
  // K walks back
  await page.keyboard.press('k');
  await expect(list.locator('li[aria-current="true"]')).toHaveAttribute('data-thread-id', expectedOrder[28]!);

  // a filter by one reviewer narrows the list, and the walk follows it
  await page.getByRole('group', { name: 'Filter by reviewer' }).getByRole('button', { name: /Nadia Okonjo/ }).click();
  await expect(list.getByRole('listitem')).toHaveCount(15);
  await expect(page.getByText('15 of 30 comments shown')).toBeVisible();
  // the highlight was on a comment of Rachel's, which the filter hides: the walk starts again
  await page.mouse.click(5, 300); // empty space: the focus is not in a field
  await page.keyboard.press('j');
  await expect(list.locator('li[aria-current="true"]')).toHaveAttribute('data-thread-id', expectedNadia[0]!);
  await page.keyboard.press('j');
  await expect(list.locator('li[aria-current="true"]')).toHaveAttribute('data-thread-id', expectedNadia[1]!);
  const nadiaIds = await list.locator('li').evaluateAll((els) => els.map((e) => e.getAttribute('data-thread-id')));
  expect(nadiaIds).toEqual(expectedNadia);

  // by code, and the filters are visible and clearable
  await page.getByRole('group', { name: 'Filter by code' }).getByRole('button', { name: /^S1/ }).click();
  // the filters combine: S1 sits on every third comment (ten of thirty), and of
  // those five are Nadia's (the odd ones)
  await expect(list.getByRole('listitem')).toHaveCount(5);
  await expect(page.getByText('5 of 30 comments shown')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(30);
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
});

test('the authoring side is told the round is withheld, and sees no progress line', async ({ page }) => {
  await loginAs(page, SEEDED.consultant);
  await page.goto(cyclePath());
  await expect(page.getByText(/Round 1 is open, so there is nothing to list yet/)).toBeVisible();
  await expect(page.getByText(/Its comments are withheld until the lead reviewer closes the round/)).toBeVisible();
  await expect(page.locator('[data-progress-line]')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Threads' })).toHaveCount(0);
  await expect(page.getByText(/\b0 comments?\b/)).toHaveCount(0);
  await expect(page.getByText(/still reading|· done/)).toHaveCount(0);
});

test('the authoring side answers, and the response link lands on the change', async ({ page }) => {
  // the lead reviewer closes and issues the round
  const codes = await rachel.get<{ items: Array<{ id: string; code: string }> }>(`/projects/${projectId}/acceptance-codes`);
  await rachel.post(`/rounds/${roundId}/deliverable-code`, { acceptanceCodeId: codes.items.find((c) => c.code === 'S3')!.id });
  await rachel.post(`/rounds/${roundId}/issue`, {});

  await loginAs(page, SEEDED.consultant);
  await page.goto(cyclePath());
  const list = page.getByRole('list', { name: 'Threads' });
  await expect(list.getByRole('listitem')).toHaveCount(30);
  await expect(page.getByRole('button', { name: /^Open \(30\)/ })).toBeVisible();

  // J then R: the first comment's response opens, the revised passage is typed in
  await page.keyboard.press('j');
  await expect(list.locator('li[aria-current="true"]')).toHaveAttribute('data-thread-id', expectedOrder[0]!);
  await page.keyboard.press('r');
  const tray = page.locator(`[data-comment-id="${expectedOrder[0]}"]`);
  await tray.getByPlaceholder('The response — how the comment is addressed…').fill('The baseline now cites the 2024 work.');
  await tray.getByPlaceholder(/The revised passage that answers it/).fill(REVISED);
  await tray.getByRole('button', { name: 'Record the response' }).click();
  await expect(list.locator(`li[data-thread-id="${expectedOrder[0]}"]`)).toHaveAttribute('data-state', 'answered');

  // T-480 — the authoring side narrows its sweep to one reviewer. The filtered
  // list is what J walks and E acts on, it stays while the answer is saved, and
  // with "Open" chosen too the next J lands on that reviewer's next unanswered comment.
  await page.getByRole('group', { name: 'Filter by reviewer' }).getByRole('button', { name: /Nadia Okonjo/ }).click();
  await expect(list.getByRole('listitem')).toHaveCount(15);
  await expect(page.getByText('15 of 30 comments shown')).toBeVisible();
  await page.mouse.click(5, 300); // empty space: the focus is not in a field
  await page.keyboard.press('j');
  // the highlight was on Rachel's comment, which the filter hides: the walk starts at Nadia's first
  await expect(list.locator('li[aria-current="true"]')).toHaveAttribute('data-thread-id', expectedNadia[0]!);
  await page.keyboard.press('e');
  const nadiaTray = page.locator(`[data-comment-id="${expectedNadia[0]}"]`);
  await nadiaTray.getByPlaceholder('The response — how the comment is addressed…').fill('Considered.');
  await nadiaTray.getByPlaceholder('Why no change was made…').fill('Out of scope for this section.');
  await nadiaTray.getByRole('button', { name: 'Record the response' }).click();
  await expect(list.locator(`li[data-thread-id="${expectedNadia[0]}"]`)).toHaveAttribute('data-state', 'no_change');
  // saving did not clear the filter
  await expect(list.getByRole('listitem')).toHaveCount(15);
  await expect(page.getByText('15 of 30 comments shown')).toBeVisible();
  // only that reviewer's unanswered comments, and the walk goes to the next of them
  await page.getByRole('group', { name: 'Filter by state' }).getByRole('button', { name: /^Open \(14\)/ }).click();
  await expect(list.getByRole('listitem')).toHaveCount(14);
  await page.mouse.click(5, 300);
  await page.keyboard.press('j');
  await expect(list.locator('li[aria-current="true"]')).toHaveAttribute('data-thread-id', expectedNadia[1]!);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(30);

  // the other twenty-eight say no change was made
  for (const id of expectedOrder.slice(1).filter((x) => x !== expectedNadia[0])) {
    await eleanor.post(`/review-comments/${id}/response`, { body: 'Considered.', noChangeReason: 'Out of scope for this section.' });
  }
  await page.reload();
  await expect(page.getByRole('button', { name: /^Answered \(1\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^No change \(29\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open \(0\)/ })).toBeVisible();
  // no link yet: the next version does not exist
  await expect(page.locator('[data-response-link]')).toHaveCount(0);

  // the next version goes out; the link now exists
  await eleanor.patch(`/sandbox-documents/${sandboxDocumentId}`, {
    content: `The contamination baseline, now drawing on ${REVISED} and the earlier boreholes.`,
  });
  await eleanor.post(`/sandbox-documents/${sandboxDocumentId}/promotion`, {});
  await page.reload();
  const link = list.locator('[data-response-link]');
  await expect(link).toHaveCount(1);
  await expect(link).toContainText('See the change in');
  await link.click();

  await expect(page).toHaveURL(/\/documents\/.*version=.*quote=/);
  // an authored version has text as well as a PDF: it opens in the text, the
  // revised passage marked, with the PDF one click away
  await expect(page.getByRole('radio', { name: 'Versions' })).toBeChecked();
  const mark = page.locator('mark[data-quote]');
  await expect(mark).toBeVisible();
  await expect(mark).toContainText(REVISED);
  await expect(page.getByRole('button', { name: 'Open the PDF' })).toBeVisible();
});
