// T-193 — the owner sets up the review side from the deliverable card: confirm
// a producer's proposed reviewer, or appoint one directly (auto-confirmed). Before
// T-193 the owner could only confirm from the separate Review table, so the whole
// team set-up was split across two screens/parties.
import { test, expect } from '@playwright/test';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';

test('the owner confirms a proposed reviewer on the deliverable card, and promotion unblocks', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string; participantId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId;
  const myPid = me.participants[0]!.participantId;
  const roster = await eleanor.get<{ items: Array<{ participantId: string; name: string }> }>(
    `/projects/${projectId}/participants`,
  );
  const rachelPid = roster.items.find((r) => r.name === 'Rachel Bowen')!.participantId;
  const stamp = String(Date.now()).slice(-6);
  const row = await eleanor.post<{ containerId: string }>(`/projects/${projectId}/plan`, {
    documentReference: `T193-${stamp}`,
    title: 'Owner confirm test',
  });
  const doc = await eleanor.post<{ id: string; sandboxId: string }>(`/projects/${projectId}/sandbox-documents`, { title: `T193 doc ${stamp}` });
  // reviewer confirmation is the gate under test — the T-355 QA gate is
  // turned off deliberately
  await eleanor.patch(`/sandboxes/${doc.sandboxId}/settings`, { promotionRequiresQa: false });
  await eleanor.post(`/sandbox-documents/${doc.id}/binding`, { containerId: row.containerId });
  await eleanor.post(`/containers/${row.containerId}/authors`, { participantId: myPid, isLead: true });
  await eleanor.post(`/containers/${row.containerId}/reviewers`, { participantId: rachelPid, isLead: true }); // proposed
  await eleanor.dispose();

  // the owner opens the deliverable and confirms the reviewer on the card
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.owner);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(PROJECT).click();
  await page.getByRole('link', { name: /Plan/ }).click();
  await page.getByRole('row').filter({ hasText: `T193-${stamp}` }).click();
  // T-457 — the row lands on the document page; the card is one click further
  await page.getByRole('button', { name: 'Edit details…' }).click();
  await expect(page.getByText('Rachel Bowen · proposed')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Rachel Bowen · proposed')).toHaveCount(0); // now confirmed

  // promotion now succeeds for the producer
  const el2 = await ApiSession.login(SEEDED.consultant);
  const promoted = await el2.raw('post', `/sandbox-documents/${doc.id}/promotion`, {});
  expect(promoted.status()).toBe(201);
  await el2.dispose();
});
