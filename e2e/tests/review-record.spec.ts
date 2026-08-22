// T-375 — the review record as one appended table (component-5's "DRR table
// interface"; drawn as review-log.html, deleted at capture).
//
// Two screens, one record. What this run proves is the pair of properties the
// ruling turns on:
//
//   ONE TABLE, APPENDED TO. Round two is a band inside the same table as round
//   one, not a second sheet — the chapter's whole review history in one scroll,
//   each round closed off by the deliverable code it concluded with.
//
//   THE WALL IS A DIFFERENT RECORD, NOT A HIDDEN COLUMN. On the authoring
//   side the open round's rows are ABSENT — not greyed, not zero — under a
//   stated withheld notice, because silence would read as absence and absence
//   is a different and wrong fact.
//
// And the negative that matters just as much: NO EXPORT CONTROL anywhere on the
// screen. ADR-0009 dropped the DRN, and a download button here would quietly
// reinstate it.
import { expect, test } from '@playwright/test';
import type {
  PlanRow,
  ReviewComment,
  ReviewCycle,
  ReviewerGrant,
  RosterEntry,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const stamp = String(Date.now()).slice(-6);
const TITLE = `Review record e2e ${stamp}`;
const REFERENCE = `WA-RRX-ECO-${stamp}`;

let eleanor: ApiSession; // lead author, Calder & Hale — the authoring side
let rachel: ApiSession; // owner-side lead reviewer, Trentmoor
let projectId: string;
let containerId: string;

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).first().click();
}

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;

  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: REFERENCE,
    title: TITLE,
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
  await rachel.post(`/reviewers/${proposal.id}/acceptance`, {});

  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: `${TITLE} draft`,
    containerId,
  });
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: 'The contamination baseline.' });
  await eleanor.patch(`/sandboxes/${doc.sandboxId}/settings`, { promotionRequiresQa: false });

  // ── round 1: commented, coded, closed and issued ────────────────────────
  const p01 = await eleanor.post<{ roundId: string }>(
    `/sandbox-documents/${doc.id}/promotion`,
    {},
  );
  await rachel.post(`/rounds/${p01.roundId}/acknowledge`, {});
  const codes = await rachel.get<{ items: Array<{ id: string; isAccepting: boolean }> }>(
    `/projects/${projectId}/acceptance-codes`,
  );
  const revise = codes.items.find((c) => !c.isAccepting)!.id;
  await rachel.post<ReviewComment>(`/rounds/${p01.roundId}/comments`, {
    body: 'The contamination baseline cites the 2019 ground investigation only.',
    anchor: { page: 4, quote: '…based on the 2019 ground investigation.' },
    acceptanceCodeId: revise,
  });
  await rachel.post(`/rounds/${p01.roundId}/deliverable-code`, { acceptanceCodeId: revise });
  await rachel.post(`/rounds/${p01.roundId}/issue`, {});

  // the authoring side answers, then promotes round 2
  const issued = (await eleanor.get<ReviewCycle | null>(`/containers/${containerId}/cycle`))!;
  for (const comment of issued.rounds[0]!.comments) {
    await eleanor.post(`/review-comments/${comment.id}/response`, {
      body: 'Section 4.2 now cites the 2024 supplementary ground investigation.',
      nextVersionAnchor: { quote: 'the 2024 supplementary ground investigation' },
    });
  }
  await eleanor.patch(`/sandbox-documents/${doc.id}`, {
    content: 'The contamination baseline, 2024 boreholes added.',
  });
  const p02 = await eleanor.post<{ roundId: string }>(
    `/sandbox-documents/${doc.id}/promotion`,
    {},
  );
  // ── round 2: acknowledged open, one comment, NOT yet issued ─────────────
  await rachel.post(`/rounds/${p02.roundId}/acknowledge`, {});
  await rachel.post<ReviewComment>(`/rounds/${p02.roundId}/comments`, {
    body: 'The summary table still lists three investigations rather than four.',
    anchor: { page: 4, quote: 'Summary of ground investigation' },
  });
});

test.afterAll(async () => {
  await Promise.all([eleanor, rachel].filter(Boolean).map((s) => s.dispose()));
});

test('the review group reads both rounds in one table, each closed off by its code', async ({
  page,
}) => {
  await loginAs(page, SEEDED.owner);
  await page.goto(`/projects/${projectId}/review/${containerId}/record`);

  await expect(page.getByRole('heading', { name: /Review record/ })).toBeVisible();

  // ONE table: both rounds are bands inside it, not two sheets
  const table = page.locator('.table table');
  await expect(table).toHaveCount(1);
  await expect(table.getByText(/Round 1/).first()).toBeVisible();
  await expect(table.getByText(/Round 2/).first()).toBeVisible();

  // the comment, where it is, its code, and the response that answered it
  await expect(table.getByText(/cites the 2019 ground investigation only/)).toBeVisible();
  await expect(table.getByText('“…based on the 2019 ground investigation.”')).toBeVisible();
  await expect(table.getByText(/Changed in P02/)).toBeVisible();

  // round 1 is closed off by the code it concluded with; round 2 states that it
  // has none yet, because an open round with no verdict is a state, not a gap
  await expect(table.getByText('Round 1 closed')).toBeVisible();
  await expect(table.getByText('Round 2 has no deliverable code yet')).toBeVisible();
  await expect(table.getByText(/No count of comments closes it/)).toBeVisible();

  // round 2's live comment reads for the group, awaiting the authoring side
  await expect(table.getByText(/summary table still lists three investigations/)).toBeVisible();
  await expect(table.getByText(/Awaiting the authoring side — the round is open/)).toBeVisible();

  // NO EXPORT, deliberately (ADR-0009): no download, no "issue the record",
  // no print — the browser's own print is a browser doing its job
  await expect(page.getByRole('button', { name: /download|export|print|issue the record/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /download|export/i })).toHaveCount(0);
});

test('the authoring side reads the same record, and the open round is absent rather than empty', async ({
  page,
}) => {
  await loginAs(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/review/${containerId}/record`);

  const table = page.locator('.table table');
  // round 1 stays readable here permanently
  await expect(table.getByText(/cites the 2019 ground investigation only/)).toBeVisible();
  await expect(table.getByText('Round 1 closed')).toBeVisible();

  // round 2's band exists — the round is not hidden — but it has no rows, and
  // the notice states that content exists and why it is out of reach
  await expect(table.getByText(/Round 2/).first()).toBeVisible();
  await expect(table.getByText(/summary table still lists three investigations/)).toHaveCount(0);
  await expect(
    table.getByText(/Its comments are withheld until the lead reviewer closes the round/),
  ).toBeVisible();
  // and never the misleading alternative: an open round drawn as empty
  await expect(table.getByText('No comments yet — the round is open to the review group.')).toHaveCount(0);
  // nor a COUNT that says zero where the honest answer is "not yours to know":
  // the header counts what this reader can actually read, and says so
  await expect(page.getByText(/1 round issued/)).toBeVisible();
});
