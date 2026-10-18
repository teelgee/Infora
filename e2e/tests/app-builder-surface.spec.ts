// T-450 — the building screen in a browser: the conversation first, the state of
// the app beside it, and Apps as a section of the project beside Tools
// (ADR-0056's third addendum, rulings 2 and 4; ADR-0058 decision 2).
//
// *In plain terms: Eleanor Price opens Apps from the project's rail, makes an
// app, and builds it by talking to the agent. The panel beside the conversation
// fills in as the agent works, marks the questions still open, and will not
// open the app until they are answered — saying so in words. She renames a
// screen by hand; the agent's next turn leaves her name alone. She opens it.
// Tomorrow the conversation is still there.*
import { expect, test } from '@playwright/test';
import type { GetAppResponse, MeResponse } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const stamp = Date.now();

test('Apps beside Tools, and an app built by conversation with the panel live beside it', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;

  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrenfield–Ashcombe 400kV Connection')).toBeVisible();
  await page.goto(`/projects/${projectId}`);

  // ── The navigation: Apps beside Tools, each holding its own ──────────────
  const rail = page.locator('nav').filter({ has: page.getByRole('link', { name: 'Knowledge', exact: true }) });
  await expect(rail.getByRole('link', { name: 'Tools', exact: true })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Apps', exact: true })).toBeVisible();
  await rail.getByRole('link', { name: 'Tools', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tools', exact: true })).toBeVisible();
  // the Tools page holds what you run — no apps on it any more
  await expect(page.getByText('Apps built for this project')).toHaveCount(0);
  await rail.getByRole('link', { name: 'Apps', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/apps$`));
  await expect(page.getByRole('heading', { name: 'Apps', exact: true })).toBeVisible();
  await expect(page.getByText('Apps built for this project')).toBeVisible();

  // ── Make an app, and go to its building screen ───────────────────────────
  const name = `Returns by conversation ${stamp}`;
  await page.getByLabel('New app').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: 'Build it with the agent' }).click();
  await expect(page).toHaveURL(/\/apps\/[0-9a-f-]+\/build$/);
  const appId = /\/apps\/([0-9a-f-]+)\/build$/.exec(page.url())![1]!;

  // the steps are gone: no step rail, no Next
  await expect(page.getByRole('button', { name: /^Next:/ })).toHaveCount(0);
  const panel = page.getByRole('complementary', { name: 'The state of the app' });
  await expect(panel.getByText('No tables yet.')).toBeVisible();

  // ── Who it is open to: the person's act, in the panel (the agent has none) ─
  const openTo = panel.locator('select', { has: page.locator('option', { hasText: 'Open it to…' }) });
  for (const organisation of ['Trentmoor Energy', 'Redgate Ecology']) {
    await openTo.selectOption({ label: organisation });
    await panel.getByRole('button', { name: 'Open it to this organisation' }).click();
    await expect(panel.locator('.builder-list li', { hasText: organisation })).toBeVisible();
  }

  // ── The description leads; the panel fills in as the agent works ─────────
  const box = page.getByPlaceholder('e.g. Build me a monthly sustainability returns app for three contractors.');
  await box.fill('Build me a monthly sustainability returns app for three contractors.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('I have drafted a monthly returns app')).toBeVisible();
  await expect(page.getByText('Declared the table “Monthly returns”', { exact: false })).toBeVisible();
  await expect(panel.locator('strong', { hasText: 'Monthly returns' })).toBeVisible();
  await expect(panel.locator('[data-screen-id="submit-a-return"]')).toBeVisible();
  await expect(panel.locator('[data-screen-id="client-dashboard"]')).toBeVisible();

  // ── What is unanswered is marked where it lives, and blocks opening in words
  await expect(panel.getByText('Still to answer').first()).toBeVisible();
  // marked on the table it is about…
  const returnsItem = panel
    .locator('.builder-item.is-open')
    .filter({ has: page.locator('strong', { hasText: 'Monthly returns' }) });
  await expect(returnsItem.getByText('Does “Monthly returns” hold contractual data?', { exact: false })).toBeVisible();
  // …and on the screen it is about
  await expect(panel.locator('[data-screen-id="client-dashboard"].is-open')).toBeVisible();
  await expect(panel.getByText('Still to answer — who may open “Client dashboard”?')).toBeVisible();
  const gate = panel.getByRole('status');
  await expect(gate).toHaveText(
    'This app cannot be opened yet: 3 questions still need an answer — whether “Monthly returns” holds contractual data; who may open “Submit a return”; and who may open “Client dashboard”.',
  );
  await expect(panel.getByRole('button', { name: 'Open it', exact: true })).toBeDisabled();

  // ── A manual edit in the panel ───────────────────────────────────────────
  const submit = panel.locator('[data-screen-id="submit-a-return"]');
  await submit.locator('input').first().fill('Monthly return form');
  await submit.getByRole('button', { name: 'Rename' }).click();
  await expect(gate).toContainText('who may open “Monthly return form”');

  // ── The person answers, and asks for a change; the agent's turn leaves the
  // hand edit alone ──────────────────────────────────────────────────────
  await box.fill(
    'Yes — the returns are contractual. Everyone may open Monthly return form. Only Trentmoor Energy may open Client dashboard. And add a pie chart to the dashboard.',
  );
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('I added a pie chart to “Client dashboard”.')).toBeVisible();
  await expect(gate).toHaveText('Every required question has an answer, so this app can be opened.');
  // the manual edit survived the agent's next turn
  await expect(submit.locator('input').first()).toHaveValue('Monthly return form');
  const working = await eleanor.get<GetAppResponse>(`/apps/${appId}`);
  const screens = working.app.definition!.interfaces;
  expect(screens.find((s) => s.id === 'submit-a-return')!.label).toBe('Monthly return form');
  expect(screens.find((s) => s.id === 'client-dashboard')!.source).toContain('pieChart');
  await expect(panel.getByText('Contractual — submitted, then accepted or rejected')).toBeVisible();

  // ── Opening it is the person's act ───────────────────────────────────────
  await panel.getByRole('button', { name: 'Open it', exact: true }).click();
  await expect(page.getByText('Open as version', { exact: false })).toBeVisible();
  expect((await eleanor.get<GetAppResponse>(`/apps/${appId}`)).app.state).toBe('open');

  // ── The next day: the conversation is still there ────────────────────────
  await page.reload();
  await expect(page.getByText('I have drafted a monthly returns app')).toBeVisible();
  await expect(page.getByText('I added a pie chart to “Client dashboard”.')).toBeVisible();
  await expect(page.locator('.builder-turn')).toHaveCount(4);

  // ── An old address under Tools lands on the app where it now lives ───────
  await page.goto(`/projects/${projectId}/tools/apps/${appId}`);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/apps/${appId}$`));

  await eleanor.dispose();
});

test('the building screen refuses Owen Vance in words — his firm has not let him build', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  const app = await eleanor.post<{ id: string }>(`/projects/${projectId}/apps`, {
    name: `Not Owen's to build ${stamp}`,
    organisationIds: [],
    participantIds: [],
  });

  await page.goto('/');
  await page.getByLabel('Email').fill('owen.vance@calderhale.example');
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrenfield–Ashcombe 400kV Connection')).toBeVisible();
  await page.goto(`/projects/${projectId}/apps/${app.id}/build`);
  await expect(page.getByText('There is no app here for you to build.')).toBeVisible();
  await expect(page.getByPlaceholder('e.g. Build me a monthly sustainability returns app for three contractors.')).toHaveCount(0);

  await eleanor.dispose();
});
