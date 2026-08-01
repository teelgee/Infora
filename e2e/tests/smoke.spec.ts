// T-084 — harness smoke: the substrate works end to end in both modes. The
// browser path walks login → workspace landing → project home against the
// seeded data; the API path proves the session helper the acceptance suites
// (T-054, T-061, T-080) build on.
import { expect, test } from '@playwright/test';
import type { MeResponse } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

test('browser: login → workspace landing → project home', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // the workspace landing shows the seeded project with its role badge
  const projectCard = page.getByText('Wrenfield–Ashcombe 400kV Connection');
  await expect(projectCard).toBeVisible();
  await expect(page.getByText('Owner: Trentmoor Energy')).toBeVisible();

  await projectCard.click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByText('EIA Scoping Method Statement — Land Quality')).toBeVisible();
});

test('api: the session helper resolves the seeded identities', async () => {
  const consultant = await ApiSession.login(SEEDED.consultant);
  const me = await consultant.get<MeResponse>('/me');
  expect(me.organisationName).toBe('Calder & Hale');
  // TWO schemes since T-298: the conflict-register scenario needs a subject who
  // works both clients, so Eleanor is a Participant of Wrenfield and Marchwood.
  // The assertion that survives the seed growing is the ORDER — twelve specs
  // index `participants[0]`, which T-298 made deterministic by `created_at`.
  expect(me.participants).toHaveLength(2);
  expect(me.participants[0]!.projectName).toBe('Wrenfield–Ashcombe 400kV Connection');

  // the wall subject authenticates but is entitled to nothing
  const marcus = await ApiSession.login(SEEDED.noParticipant);
  const marcusMe = await marcus.get<MeResponse>('/me');
  expect(marcusMe.participants).toHaveLength(0);
  const denied = await marcus.raw('get', `/projects/${me.participants[0]!.projectId}/work-items`);
  expect(denied.status()).toBe(404);

  await Promise.all([consultant.dispose(), marcus.dispose()]);
});
