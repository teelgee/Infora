// T-132 — address the review in the editor, driven in the browser. The API
// half stands up a deliverable whose round 1 is issued back to the authors;
// the browser half proves the author's editor enters review-response mode:
// the version under review read-only beside the canvas, the review comments
// (Drawer 5) in the right panel with the agent stepped aside, and a response
// recorded in place (the T-124 loop, T-127's cycle read).
import { expect, test, type Page } from '@playwright/test';
import type {
  ListRosterResponse,
  PlanRow,
  PromotionResult,
  ReviewerGrant,
  RosterEntry,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';
import { uniqueCodeSuffix } from './support/unique-code';

test.describe.configure({ mode: 'serial' });

const REFERENCE = `WA-ENV-GEO-${uniqueCodeSuffix()}`;

let eleanor: ApiSession; // consultant lead author (Calder & Hale)
let rachel: ApiSession; // owner-side lead reviewer (Trentmoor)
let projectId: string;
let documentId: string;
let containerId: string;

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrenfield–Ashcombe 400kV Connection').first()).toBeVisible();
}

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;

  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: REFERENCE,
    title: 'Geology chapter',
  });
  containerId = row.containerId;
  const roster = await eleanor.get<ListRosterResponse>(`/projects/${projectId}/participants`);
  const el = roster.items.find((r: RosterEntry) => r.name === 'Eleanor Price')!;
  const ra = roster.items.find((r: RosterEntry) => r.name === 'Rachel Bowen')!;
  await eleanor.post(`/containers/${row.containerId}/authors`, { participantId: el.participantId, isLead: true });
  const proposal = await eleanor.post<ReviewerGrant>(`/containers/${row.containerId}/reviewers`, {
    participantId: ra.participantId,
    isLead: true,
  });
  await rachel.post(`/reviewers/${proposal.id}/confirmation`, {});
  // T-372 — the appointee's own act; the receipt below waits on it
  await rachel.post(`/reviewers/${proposal.id}/acceptance`, {});

  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: 'Geology chapter draft',
    containerId: row.containerId,
  });
  documentId = doc.id;
  await eleanor.patch(`/sandbox-documents/${documentId}`, {
    content: 'The ground model is built from twelve boreholes and the regional solid geology.',
  });
  // this spec drives the review round from the editor, not internal QA — the
  // T-355 gate is turned off deliberately
  await eleanor.patch(`/sandboxes/${doc.sandboxId}/settings`, { promotionRequiresQa: false });
  const promoted = await eleanor.post<PromotionResult>(`/sandbox-documents/${documentId}/promotion`, {});
  await rachel.post(`/rounds/${promoted.roundId}/acknowledge`, {}); // the ADR-0051 gate

  // the lead reviewer comments, sets a revise verdict, and issues the round
  // back to the authors — the pen returns to the authoring side
  const codes = await rachel.get<{ items: Array<{ id: string; code: string; isAccepting: boolean }> }>(
    `/projects/${projectId}/acceptance-codes`,
  );
  const revise = codes.items.find((c) => !c.isAccepting)!.id;
  await rachel.post(`/rounds/${promoted.roundId}/comments`, {
    body: 'State the borehole depths and the ground investigation dates.',
    anchor: { page: 1, quote: 'twelve boreholes', rects: [{ x: 0.08, y: 0.19, w: 0.4, h: 0.016 }] },
  });
  await rachel.post(`/rounds/${promoted.roundId}/deliverable-code`, { acceptanceCodeId: revise });
  await rachel.post(`/rounds/${promoted.roundId}/issue`, { purposeCode: 'For revision' });
});

test.afterAll(async () => {
  await Promise.all([eleanor, rachel].filter(Boolean).map((s) => s.dispose()));
});

test('the editor enters review-response mode: the version under review, the comments, the agent stepped aside', async ({
  page,
}) => {
  await signIn(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/editor/${documentId}`);

  // the version under review sits read-only beside the editable canvas
  await expect(page.getByText(/Version under review · P01 · read-only/i)).toBeVisible();

  // the review leads in the right panel — the agent has stepped aside to a tab
  await expect(page.getByText('Round 1 — respond to the review')).toBeVisible();
  await expect(page.locator('.panel-tabs').getByText('Chat', { exact: true })).toBeVisible();

  // the reviewer's comment (Drawer 5) is here to answer
  await expect(page.getByText('State the borehole depths and the ground investigation dates.')).toBeVisible();

  // record a response in place; it sticks on the record. ADR-0004 (T-354):
  // the response declares the revised passage — the change link's anchor
  await page.getByRole('button', { name: 'Respond' }).first().click();
  await page.getByPlaceholder('How is the comment addressed?').fill('Borehole depths and dates added in §1.');
  await page
    .getByPlaceholder('The revised passage that answers it — the link into the next version…')
    .fill('Boreholes BH-01 to BH-04, drilled March 2026, depths stated in §1');
  await page.getByRole('button', { name: 'Record the response' }).click();
  await expect(page.getByText('Your response', { exact: false })).toBeVisible();

  // the response is durable — a reviewer read sees it on the round
  await expect
    .poll(async () => {
      const cycle = await rachel.get<{ rounds: Array<{ comments: Array<{ response: unknown }> }> }>(
        `/containers/${containerId}/cycle`,
      );
      return cycle.rounds[0]!.comments.filter((c) => c.response !== null).length;
    })
    .toBeGreaterThan(0);
});
