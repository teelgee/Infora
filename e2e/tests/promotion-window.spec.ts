// T-373 — the promotion window, driven in the browser (approved mockup:
// docs/design/mockups/promotion-window.html; ADR-0008 addendum, 2026-08-22).
//
// Promotion was one click and no form at all. What this run proves is that the
// window put in front of it RECONFIRMS rather than composes: the plan-owned
// identity is shown and locked, what promotes is named, the review group is
// listed with its lead, the review period is prefilled from the project — and
// a straight confirm produces exactly the plan's state, which is the whole
// answer to the click-through risk ADR-0008 named.
//
// The fixture is built through the API (that path is proven elsewhere); the
// window itself is clicked.
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
const TITLE = `Promotion window e2e ${stamp}`;

let eleanor: ApiSession; // lead author, Calder & Hale
let rachel: ApiSession; // owner-side lead reviewer, Trentmoor
let projectId: string;
let documentId: string;
let containerId: string;

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;

  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: `WA-PWX-ECO-${stamp}`,
    title: TITLE,
    metadata: { discipline: 'ecology' },
  });
  containerId = row.containerId;

  const roster = await eleanor.get<{ items: RosterEntry[] }>(`/projects/${projectId}/participants`);
  const el = roster.items.find((r) => r.name === 'Eleanor Price')!;
  const rb = roster.items.find((r) => r.name === 'Rachel Bowen')!;
  await eleanor.post(`/containers/${containerId}/authors`, {
    participantId: el.participantId,
    isLead: true,
  });
  const proposal = await eleanor.post<ReviewerGrant>(`/containers/${containerId}/reviewers`, {
    participantId: rb.participantId,
    isLead: true,
  });
  await rachel.post(`/reviewers/${proposal.id}/confirmation`, {});
  await rachel.post(`/reviewers/${proposal.id}/acceptance`, {}); // T-372

  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: `${TITLE} draft`,
    containerId,
  });
  documentId = doc.id;
  await eleanor.patch(`/sandbox-documents/${documentId}`, { content: 'The ecology chapter.' });
  // this deliverable skips internal QA, so the deliberate gate-off act the
  // T-355 ruling models is performed rather than inherited by silence
  await eleanor.patch(`/sandboxes/${doc.sandboxId}/settings`, { promotionRequiresQa: false });
});

test.afterAll(async () => {
  await Promise.all([eleanor, rachel].filter(Boolean).map((s) => s.dispose()));
});

test('the window reconfirms: the plan is locked, the group is named, and a straight confirm promotes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
  await page.goto(`/projects/${projectId}/sandbox`);

  await page.getByRole('button', { name: `Promote ${TITLE}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // it says what the click will and will NOT do — the round does not open here
  await expect(
    dialog.getByText(/The round opens when the lead reviewer accepts the appointment/),
  ).toBeVisible();

  // the plan-owned identity is shown and LOCKED (ADR-0038 §2), so a thoughtless
  // confirm produces exactly the plan's state
  await expect(dialog.getByText('From the plan', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Locked', { exact: true })).toBeVisible();
  // twice over, deliberately: in the window's own title and in the locked block
  await expect(dialog.getByText(`WA-PWX-ECO-${stamp}`)).toHaveCount(2);

  // the review group as it stands, with its lead named — the thing a version
  // two six months on would otherwise inherit silently
  await expect(dialog.getByText('Review group', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Rachel Bowen')).toBeVisible();
  await expect(dialog.getByText(/Trentmoor Energy · Lead reviewer/)).toBeVisible();
  // naming confers nothing, and the window says so
  await expect(dialog.getByText(/a proposal on its own confers nothing/)).toBeVisible();

  // the review period, prefilled from the project default (T-371)
  await expect(dialog.getByText('Review period', { exact: true })).toBeVisible();
  await expect(dialog.getByText('working days', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/^Target/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Promote' }).click();
  await expect(dialog).toBeHidden();

  // the plan's state, exactly: P01 submitted, the lead unchanged
  const cycle = (await rachel.get<ReviewCycle | null>(`/containers/${containerId}/cycle`))!;
  expect(cycle.rounds).toHaveLength(1);
  expect(cycle.rounds[0]!.versionReference).toBe('P01');
  expect(cycle.rounds[0]!.state).toBe('submitted');
  expect(cycle.rounds[0]!.reviewPeriodTarget).not.toBeNull();
  const plan = await eleanor.get<{ items: PlanRow[] }>(`/projects/${projectId}/plan`);
  const after = plan.items.find((r) => r.containerId === containerId)!;
  expect(after.reviewers.filter((g) => g.revokedAt === null && g.isLead)).toHaveLength(1);
});
