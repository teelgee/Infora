// T-129 — the Slice A acceptance run: the whole review-cycle journey as one
// continuous story (ADR-0032/0033/0034). Plan (TIDP) → the owner's MIDP with
// reviewer confirmation → draft → freeze → internal QA round (org-private,
// staffed through T-117's administration) → promote the QA-accepted frozen
// version → round 1 comments + codes → issue → respond → promote v2 →
// accept → library + grounding. Negatives: the internal cycle invisible
// across the wall, the open round hidden from authors, a rejected
// deliverable stands as a record and never grounds, the third org gets
// nothing anywhere.
import { expect, test } from '@playwright/test';
import type {
  GetLibraryResponse,
  ListRosterResponse,
  PlanRow,
  PromotionResult,
  ReviewComment,
  ReviewCycle,
  ReviewerGrant,
  RosterEntry,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const REFERENCE = `WA-ENV-ECO-9${String(stamp).slice(-3)}`;

let eleanor: ApiSession; // consultant lead author + org admin (Calder & Hale)
let rachel: ApiSession; // owner-side lead reviewer (Trentmoor)
let priya: ApiSession; // the wall subject: no membership
let projectId: string;
let row: PlanRow;
let documentId: string;
let freezeContainerId: string;
let cycle: ReviewCycle;

test.beforeAll(async () => {
  eleanor = await ApiSession.login(SEEDED.consultant);
  rachel = await ApiSession.login(SEEDED.owner);
  priya = await ApiSession.login(SEEDED.thirdOrg);
  const me = await eleanor.get<{ participants: Array<{ projectId: string }> }>('/me');
  projectId = me.participants[0]!.projectId;
});

test.afterAll(async () => {
  await Promise.all([eleanor, rachel, priya].filter(Boolean).map((s) => s.dispose()));
});

test('1 — the consultant plans the deliverable; the owner sees it on the MIDP and confirms the proposed lead reviewer', async () => {
  row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: REFERENCE,
    title: 'Ecology chapter',
    metadata: { discipline: 'ecology' },
  });
  expect(row.workItem?.status).toBe('planned');

  // the producing side appoints its lead author (itself) and PROPOSES the
  // owner's lead reviewer from the project-visible roster (ADR-0033)
  const roster = await eleanor.get<ListRosterResponse>(`/projects/${projectId}/participants`);
  const rachelEntry = roster.items.find((r: RosterEntry) => r.name === 'Rachel Bowen')!;
  const eleanorEntry = roster.items.find((r: RosterEntry) => r.name === 'Eleanor Price')!;
  await eleanor.post(`/containers/${row.containerId}/authors`, {
    participantId: eleanorEntry.participantId,
    isLead: true,
  });
  const proposal = await eleanor.post<ReviewerGrant>(`/containers/${row.containerId}/reviewers`, {
    participantId: rachelEntry.participantId,
    isLead: true,
  });
  expect(proposal.confirmedAt).toBeNull(); // proposed — confers nothing

  const midp = await rachel.get<{ items: PlanRow[] }>(`/projects/${projectId}/plan`);
  const consolidated = midp.items.find((r) => r.containerId === row.containerId)!;
  expect(consolidated.producingOrganisationName).toBe('Calder & Hale');
  await rachel.post(`/reviewers/${proposal.id}/confirmation`, {});
});

test('2 — the draft, the freeze, and the org-private internal QA round', async () => {
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: 'Ecology chapter draft',
    containerId: row.containerId,
  });
  documentId = doc.id;
  await eleanor.patch(`/sandbox-documents/${documentId}`, {
    content: 'The ecology chapter, checked by internal QA.',
  });

  // plain freeze creates the P-series
  const p1 = await eleanor.post<{ containerId: string }>(`/sandbox-documents/${documentId}/freeze`, {});
  freezeContainerId = p1.containerId;

  // the org staffs its own internal QA (the enrol path is proven in the
  // T-117 api suite; the seeded wall subjects stay untouched here) —
  // internal reviewer grants auto-confirm, no wall is crossed (T-125)
  const roster = await eleanor.get<ListRosterResponse>(`/projects/${projectId}/participants`);
  const eleanorSelf = roster.items.find((r: RosterEntry) => r.name === 'Eleanor Price')!;
  const internalLead = await eleanor.post<ReviewerGrant>(`/containers/${freezeContainerId}/reviewers`, {
    participantId: eleanorSelf.participantId,
    isLead: true,
  });
  expect(internalLead.confirmedAt).not.toBeNull();

  // the QA freeze opens the internal round and checks the head out
  await eleanor.post(`/sandbox-documents/${documentId}/freeze`, {});
  const locked = await eleanor.raw('patch', `/sandbox-documents/${documentId}`, { content: 'drift' });
  expect(locked.status()).toBe(409);

  // the internal record is invisible across the wall — even to the owner
  const ownerPeek = await rachel.raw('get', `/containers/${freezeContainerId}/cycle`);
  expect(ownerPeek.status()).toBe(404);

  // the internal QA verdict, recorded and issued
  const internal = (await eleanor.get<ReviewCycle | null>(`/containers/${freezeContainerId}/cycle`))!;
  const codes = await eleanor.get<{ items: Array<{ id: string; isAccepting: boolean }> }>(
    `/projects/${projectId}/acceptance-codes`,
  );
  const accepting = codes.items.find((c) => c.isAccepting)!.id;
  const internalRound = internal.rounds.at(-1)!;
  await eleanor.post(`/rounds/${internalRound.id}/deliverable-code`, { acceptanceCodeId: accepting });
  await eleanor.post(`/rounds/${internalRound.id}/issue`, {});
  const afterQa = await eleanor.get<SandboxDocument>(`/sandbox-documents/${documentId}`);
  expect(afterQa.headLocked).toBe(false); // the pen is back
});

test('3 — promotion takes the QA-accepted frozen version and opens round 1 to the reviewers', async () => {
  const result = await eleanor.post<PromotionResult>(`/sandbox-documents/${documentId}/promotion`, {});
  expect(result.versionReference).toBe('P01'); // issued for review (ADR-0041)
  expect(result.roundNumber).toBe(1);

  cycle = (await rachel.get<ReviewCycle | null>(`/containers/${row.containerId}/cycle`))!;
  expect(cycle.editLockHolder).toBe('reviewing');

  // the open round is hidden from the authoring side (ADR-0014)
  await rachel.post<ReviewComment>(`/rounds/${cycle.rounds[0]!.id}/comments`, {
    body: 'Please expand the survey methodology.',
    anchor: { quote: 'ecology chapter' },
  });
  const asAuthor = (await eleanor.get<ReviewCycle | null>(`/containers/${row.containerId}/cycle`))!;
  expect(asAuthor.rounds[0]!.comments).toHaveLength(0);
  const asReviewer = (await rachel.get<ReviewCycle | null>(`/containers/${row.containerId}/cycle`))!;
  expect(asReviewer.rounds[0]!.comments).toHaveLength(1);
});

test('4 — issue, respond, and the transmittal back; then acceptance admits the deliverable to the grounded corpus', async () => {
  const codes = await rachel.get<{ items: Array<{ id: string; code: string; isAccepting: boolean }> }>(
    `/projects/${projectId}/acceptance-codes`,
  );
  const revise = codes.items.find((c) => !c.isAccepting)!.id;
  const accepting = codes.items.find((c) => c.isAccepting)!.id;
  const round1 = cycle.rounds[0]!;
  await rachel.post(`/rounds/${round1.id}/deliverable-code`, { acceptanceCodeId: revise });
  await rachel.post(`/rounds/${round1.id}/issue`, { purposeCode: 'For review' });

  // the authoring side answers every comment, then transmits back
  const revealed = (await eleanor.get<ReviewCycle | null>(`/containers/${row.containerId}/cycle`))!;
  for (const comment of revealed.rounds[0]!.comments) {
    await eleanor.post(`/review-comments/${comment.id}/response`, {
      body: 'Methodology section expanded in the next revision.',
      noChangeReason: 'expanded in v2 §3',
    });
  }
  await eleanor.patch(`/sandbox-documents/${documentId}`, {
    content: 'The ecology chapter, survey methodology expanded.',
  });
  const v2 = await eleanor.post<PromotionResult>(`/sandbox-documents/${documentId}/promotion`, {});
  expect(v2.versionReference).toBe('P02');
  expect(v2.roundNumber).toBe(2);

  // round 2: the accepting verdict closes the cycle
  const round2 = (await rachel.get<ReviewCycle | null>(`/containers/${row.containerId}/cycle`))!.rounds[1]!;
  await rachel.post(`/rounds/${round2.id}/deliverable-code`, { acceptanceCodeId: accepting });
  const closed = await rachel.post<{ cycle: ReviewCycle }>(`/rounds/${round2.id}/issue`, {});
  expect(closed.cycle.state).toBe('accepted');

  // the accepted deliverable is in the library for both sides and grounds
  const consultantLibrary = await eleanor.get<GetLibraryResponse>(`/projects/${projectId}/library`);
  expect(consultantLibrary.items.some((i) => i.documentReference === REFERENCE)).toBe(true);
  const ownerLibrary = await rachel.get<GetLibraryResponse>(`/projects/${projectId}/library`);
  expect(ownerLibrary.items.some((i) => i.documentReference === REFERENCE)).toBe(true);
  const plan = await rachel.get<{ items: PlanRow[] }>(`/projects/${projectId}/plan`);
  const done = plan.items.find((r) => r.containerId === row.containerId)!;
  expect(done.workItem?.status).toBe('accepted');
  expect(done.deliverableCode?.code).toBe('A');
});

test('5 — the rejected pathway: an abandoned deliverable stands as a record and never grounds', async () => {
  const abandoned = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, {
    documentReference: `${REFERENCE}-X`,
    title: 'Abandoned chapter',
  });
  const roster = await eleanor.get<ListRosterResponse>(`/projects/${projectId}/participants`);
  const eleanorEntry = roster.items.find((r: RosterEntry) => r.name === 'Eleanor Price')!;
  const rachelEntry = roster.items.find((r: RosterEntry) => r.name === 'Rachel Bowen')!;
  await eleanor.post(`/containers/${abandoned.containerId}/authors`, {
    participantId: eleanorEntry.participantId,
    isLead: true,
  });
  const proposal = await eleanor.post<ReviewerGrant>(`/containers/${abandoned.containerId}/reviewers`, {
    participantId: rachelEntry.participantId,
    isLead: true,
  });
  await rachel.post(`/reviewers/${proposal.id}/confirmation`, {});
  const doc = await eleanor.post<SandboxDocument>(`/projects/${projectId}/sandbox-documents`, {
    title: 'Abandoned draft',
    containerId: abandoned.containerId,
  });
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: 'never to be finished' });
  await eleanor.post(`/sandbox-documents/${doc.id}/promotion`, {});

  const active = (await eleanor.get<ReviewCycle | null>(`/containers/${abandoned.containerId}/cycle`))!;
  const closed = await eleanor.post<ReviewCycle>(`/cycles/${active.id}/close-rejected`, {
    reason: 'Abandoned — not to be resubmitted',
  });
  expect(closed.state).toBe('closed_rejected');

  // rejected: on the plan as a record, never in the grounded library
  const plan = await rachel.get<{ items: PlanRow[] }>(`/projects/${projectId}/plan`);
  const record = plan.items.find((r) => r.containerId === abandoned.containerId)!;
  expect(record.state).toBe('rejected');
  expect(record.workItem?.status).toBe('rejected');
  const library = await rachel.get<GetLibraryResponse>(`/projects/${projectId}/library`);
  expect(library.items.some((i) => i.documentReference === `${REFERENCE}-X`)).toBe(false);
});

test('negative — the wall holds on every new surface', async () => {
  const denials = await Promise.all([
    priya.raw('get', `/projects/${projectId}/plan`),
    priya.raw('get', `/containers/${row.containerId}/cycle`),
    priya.raw('get', `/containers/${freezeContainerId}/cycle`),
    priya.raw('post', `/sandbox-documents/${documentId}/promotion`, {}),
  ]);
  for (const res of denials) expect(res.status()).toBe(404);
});

test('browser — the accepted deliverable reads on the Review plan table', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.owner);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Wrenfield–Ashcombe 400kV Connection').first().click();
  await page.goto(`/projects/${projectId}/review`);
  await expect(page.getByText(REFERENCE, { exact: true })).toBeVisible();
  await page.getByText(REFERENCE, { exact: true }).click();
  await expect(page.getByText('Round 2')).toBeVisible();
  await expect(page.getByText('A — Accepted', { exact: false }).first()).toBeVisible();
});
