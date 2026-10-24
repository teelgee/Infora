// T-467 — the home is a work queue: a reviewer proposed by the producing firm
// is waiting on the owner's super user, one click from the status page where
// it is confirmed; the workspace home lists the same across projects.
import { expect, test } from '@playwright/test';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
type PlanRow = { containerId: string };

test('what is waiting on you is one click from where it is done, on the project home and across projects', async ({ page }) => {
  const stamp = Date.now();
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<{ participants: Array<{ projectId: string; projectName: string }> }>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const roster = await eleanor.get<{ items: Array<{ participantId: string; name: string }> }>(`/projects/${projectId}/participants`);
  const rachel = roster.items.find((r) => r.name === 'Rachel Bowen')!;
  const ref = `T467-${String(stamp).slice(-6)}`;
  const row = await eleanor.post<PlanRow>(`/projects/${projectId}/plan`, { documentReference: ref, title: `Queue me ${stamp}` });
  await eleanor.post(`/containers/${row.containerId}/reviewers`, { participantId: rachel.participantId, isLead: true });
  await eleanor.dispose();

  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.owner);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // the workspace home: the same item, under the project's name
  const across = page.getByRole('list', { name: `Waiting on you — ${PROJECT}` });
  await expect(across).toContainText(ref);

  await page.getByText(PROJECT).first().click();
  const queue = page.getByRole('list', { name: 'Waiting on you' });
  const item = queue.getByRole('button', { name: new RegExp(`Confirm Rachel Bowen as lead reviewer of ${ref}`) });
  await expect(item).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recent documents' })).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/review/${row.containerId}$`));
});
