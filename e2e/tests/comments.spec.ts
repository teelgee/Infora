// T-112 — sandbox comments on the Editor surface, driven in the browser:
// select text → 💬 Comment captures the advisory anchor; the thread takes a
// reply; a "suggested edit" is prose, resolved by editing the canvas and
// closing the thread; the anchor chip finds its span again; a mention
// completes from the @-typeahead. The wall and author-only rules live in the
// API suite (apps/api/src/comments.test.ts).
import { expect, test } from '@playwright/test';
import type { ListSandboxCommentsResponse, SandboxDocument } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const DOC_TEXT = 'The site drainage strategy is robust and follows current guidance.';

test.describe.configure({ mode: 'serial' });

let consultant: ApiSession;
let projectId: string;
let documentTitle: string;
let documentId: string;

test.beforeAll(async () => {
  consultant = await ApiSession.login(SEEDED.consultant);
  const me = await consultant.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;
  documentTitle = `T-112 comments ${Date.now()}`;
  const doc = await consultant.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: documentTitle,
  });
  documentId = doc.id;
  await consultant.patch<SandboxDocument>(`/sandbox-documents/${documentId}`, { content: DOC_TEXT });
});

test.afterAll(async () => {
  await consultant.dispose();
});

async function openInEditor(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).click();
  await page.getByRole('link', { name: /Sandbox/ }).click();
  // Open in Editor moved into the row's overflow kebab (T-227)
  const row = page.getByRole('row').filter({ hasText: documentTitle });
  await row.getByRole('button', { name: /More actions/ }).click();
  await page.locator('.dropdown-menu').getByText('Open in Editor').click();
  // the canvas is loaded (test 1 edits the text, so match the stable stem)
  await expect(page.locator('.doc-body textarea')).toHaveValue(/The site drainage strategy/);
}

test('select → comment → reply → close: the whole working-draft loop', async ({ page }) => {
  await openInEditor(page);

  // select "robust" on the canvas; the Comment button captures it as the anchor
  const selected = 'robust';
  const from = DOC_TEXT.indexOf(selected);
  await page.locator('.doc-body textarea').evaluate(
    (el, range) => {
      const area = el as HTMLTextAreaElement;
      area.focus();
      area.setSelectionRange(range.from, range.to);
    },
    { from, to: from + selected.length },
  );
  await page.getByRole('button', { name: /Comment/ }).click();

  // the Comments tab opened with the anchored composer; a suggested edit is prose
  await expect(page.locator('.comment-anchor')).toContainText(selected);
  await page
    .locator('.comment-box')
    .fill("I don't like 'robust' here — let's say 'resilient'.");
  await page.getByRole('button', { name: 'Comment', exact: true }).click();

  const thread = page.locator('.comment-thread');
  await expect(thread.getByText('Eleanor Price').first()).toBeVisible();
  await expect(thread.getByText(/let's say 'resilient'/)).toBeVisible();

  // a colleague replies in the thread (same session — the API suite proves
  // multi-user), edits the canvas by hand, and closes the comment
  await page.getByRole('button', { name: /Reply/ }).click();
  await page.locator('.comment-box').fill('Agreed — changing it now.');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(thread.getByText('Agreed — changing it now.')).toBeVisible();

  const edited = DOC_TEXT.replace('robust', 'resilient');
  await page.locator('.doc-body textarea').fill(edited);
  await page.locator('.doc-body textarea').blur();
  await expect(page.getByText('No document controls')).toBeVisible(); // blur-saved

  await page.getByRole('button', { name: /Close/ }).click();
  await expect(page.getByText(/Resolved \(1\)/)).toBeVisible();
  await page.getByText(/Resolved \(1\)/).click();
  await expect(page.getByText(/Resolved by Eleanor Price/)).toBeVisible();

  // the record agrees: one closed root, one reply, the anchor kept
  const { items } = await consultant.get<ListSandboxCommentsResponse>(
    `/sandbox-documents/${documentId}/comments`,
  );
  const root = items.find((c) => c.parentCommentId === null)!;
  expect(root.status).toBe('closed');
  expect(root.anchor).toBe(selected);
  expect(root.closedBy?.name).toBe('Eleanor Price');
  expect(items.filter((c) => c.parentCommentId === root.id)).toHaveLength(1);
});

test('the @-typeahead completes a project colleague into the comment', async ({ page }) => {
  await openInEditor(page);
  await page.locator('.panel-tabs').getByText('Comments').click();
  await page.getByRole('button', { name: /New comment/ }).click();

  await page.locator('.comment-box').pressSequentially('Over to you @Ele');
  await page.locator('.mention-pop').getByText('@Eleanor Price').click();
  await expect(page.locator('.comment-box')).toHaveValue('Over to you @Eleanor Price ');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();

  // rendered as a highlight; recorded as a participant reference
  await expect(page.locator('.mention')).toHaveText('@Eleanor Price');
  const { items } = await consultant.get<ListSandboxCommentsResponse>(
    `/sandbox-documents/${documentId}/comments`,
  );
  const mentioning = items.find((c) => c.body.startsWith('Over to you'))!;
  expect(mentioning.mentions).toHaveLength(1);
});
