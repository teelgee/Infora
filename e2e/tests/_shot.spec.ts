import { test } from '@playwright/test';
import { ApiSession, SEEDED } from './support/api';
const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
test('viewer heights track viewport', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<{ participants: Array<{ projectId: string; participantId: string }> }>('/me');
  const projectId = me.participants[0]!.projectId; const myPid = me.participants[0]!.participantId;
  const roster = await eleanor.get<{ items: Array<{ participantId: string; name: string }> }>(`/projects/${projectId}/participants`);
  const rachelPid = roster.items.find((r) => r.name === 'Rachel Bowen')!.participantId;
  const stamp = String(Date.now()).slice(-6);
  const row = await eleanor.post<{ containerId: string }>(`/projects/${projectId}/plan`, { documentReference: `HT-${stamp}`, title: 'Height doc' });
  const doc = await eleanor.post<{ id: string }>(`/projects/${projectId}/sandbox-documents`, { title: `Ht ${stamp}` });
  await eleanor.patch(`/sandbox-documents/${doc.id}`, { content: 'body' });
  await eleanor.post(`/sandbox-documents/${doc.id}/binding`, { containerId: row.containerId });
  await eleanor.post(`/containers/${row.containerId}/authors`, { participantId: myPid, isLead: true });
  const rev = await eleanor.post<{ id: string }>(`/containers/${row.containerId}/reviewers`, { participantId: rachelPid, isLead: true });
  await rachel.post(`/reviewers/${rev.id}/confirmation`, {});
  await eleanor.post(`/sandbox-documents/${doc.id}/promotion`, {});
  await eleanor.dispose(); await rachel.dispose();
  for (const h of [800, 1200]) {
    await page.setViewportSize({ width: 1440, height: h });
    await page.context().clearCookies();
    await page.goto('/');
    await page.getByLabel('Email').fill(SEEDED.owner);
    await page.getByLabel('Password').fill(SEEDED.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByText(PROJECT).click();
    await page.goto(`/projects/${projectId}/review/${row.containerId}`);
    await page.waitForTimeout(900);
    const viewer = await page.locator('.review-viewer').boundingBox();
    console.log(`viewportH=${h} viewerHeight=${Math.round(viewer!.height)}`);
  }
});
