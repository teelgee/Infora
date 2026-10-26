// T-489 — the owner's four rulings on apps, end to end on the seeded
// three-organisation world (ADR-0056's fifth addendum, 2026-10-25).
//
// *In plain terms: the walk's returns app, driven by the people who would use it.
// Two contractors each submit October's return. The client's dashboard draws
// electricity by contractor; the client rejects one return straight from the
// dashboard, giving a reason; the total drops it and says how many figures are
// still waiting; and the contractor whose return was rejected finds it on their
// home page, with the reason, one click from the correction form.*
//
// Trentmoor Energy is the client, Calder & Hale builds the app and enters a
// return, Redgate Ecology is the second contractor. A fresh app per run, looked
// up by the ids this file made, so the spec passes on a clean seed and on a
// long-lived database alike.
import { expect, test, type Page } from '@playwright/test';
import type {
  AppRecord,
  AppTableRecord,
  GetAppResponse,
  GetWorkQueueResponse,
  ListRosterResponse,
  MeResponse,
} from '@infora/contracts';
import { serialiseAppScreen } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const stamp = Date.now();

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
}

/** The returns app: an acceptance step, a client dashboard grouped by
 * contractor, published, with two contractors' October returns submitted. */
async function build() {
  const rachel = await ApiSession.login(SEEDED.owner); // Trentmoor Energy — the client
  const eleanor = await ApiSession.login(SEEDED.consultant); // Calder & Hale — builds it
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Redgate Ecology

  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoorOrgId = roster.find((r) => r.name === 'Rachel Bowen')!.organisationId;
  const redgateOrgId = roster.find((r) => r.name === 'Nadia Okonjo')!.organisationId;

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `T489 returns ${stamp}`,
    organisationIds: [trentmoorOrgId, redgateOrgId],
    participantIds: [],
  });
  const returns = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'energy', label: 'Energy used (kWh)', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: true,
  });
  await eleanor.post(`/apps/${app.id}/tables`, {
    name: 'Insights',
    columns: [{ key: 'x', label: 'x', type: 'text' }],
    kind: 'insight',
  });
  await eleanor.patch(`/apps/${app.id}/definition`, {
    definition: {
      connections: [],
      interfaces: [
        {
          id: 'dashboard',
          label: 'Returns dashboard',
          appTableId: returns.id,
          openToOrganisationIds: [],
          source: serialiseAppScreen({
            version: 1,
            blocks: [
              { kind: 'heading', text: 'Energy across the scheme' },
              { kind: 'total', columnKey: 'energy', label: 'Energy so far (kWh)' },
              { kind: 'count', label: 'Returns in' },
              // electricity by contractor — grouped by the organisation that entered each row
              { kind: 'barChart', label: 'Energy by contractor', groupBy: 'organisation', valueColumn: 'energy' },
              { kind: 'rowTable', columnKeys: ['month', 'energy'], showOrganisation: true, showState: true },
            ],
          }),
        },
      ],
      schedule: 'manual',
      analysisPrompt: null,
      answeredQuestions: [`contractual-data:${returns.id}`, 'who-may-open:dashboard'],
    },
  });
  expect((await eleanor.post<AppRecord>(`/apps/${app.id}/publish`, {})).state).toBe('open');

  await eleanor.post(`/app-tables/${returns.id}/rows`, { values: { month: 'October 2026', energy: 120 }, submit: true });
  await nadia.post(`/app-tables/${returns.id}/rows`, { values: { month: 'October 2026', energy: 80 }, submit: true });
  return { rachel, eleanor, nadia, projectId, app, returns };
}

test('electricity by contractor; the client rejects from the dashboard; the total drops it; the contractor is told, with the reason', async ({
  page,
  browser,
}) => {
  const { rachel, eleanor, nadia, projectId, app, returns } = await build();
  const reason = `Looks like a decimal slip ${stamp}`;

  // ── The client opens the dashboard ───────────────────────────────────────
  await signIn(page, SEEDED.owner);
  await page.goto(`/projects/${projectId}/apps/${app.id}`);
  const chart = page.locator('.app-chart').first();
  await expect(chart).toBeVisible();
  // the chart draws a bar for EACH contractor, by name — "by contractor"
  await expect(chart.getByText('Calder & Hale', { exact: true })).toBeVisible();
  await expect(chart.getByText('Redgate Ecology', { exact: true })).toBeVisible();
  // both returns are waiting for the client, and count; the line says how many
  const total = page.locator('p', { hasText: 'Energy so far (kWh)' }).first();
  await expect(total).toContainText('200');
  await expect(page.getByText('Includes 2 not yet accepted.').first()).toBeVisible();

  // ── Reject Redgate's return from the dashboard, with a reason ────────────
  await page.getByRole('button', { name: 'Reject the return from Redgate Ecology, October 2026' }).click();
  const confirm = page.getByRole('button', { name: 'Confirm the rejection of the return from Redgate Ecology, October 2026' });
  await expect(confirm).toBeDisabled(); // a rejection has to say why
  await page.getByLabel('Why is the return from Redgate Ecology, October 2026 being rejected?').fill(reason);
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // the rejection is recorded, and the figures beside it moved at once
  await expect(page.getByRole('row').filter({ hasText: 'Redgate Ecology' }).filter({ hasText: 'Rejected' }).first()).toBeVisible();
  await expect(total).toContainText('120');
  await expect(total).not.toContainText('200');
  await expect(page.getByText('Includes 1 not yet accepted.').first()).toBeVisible();
  // the recorded decision, as the server holds it
  const rows = await rachel.get<{ items: Array<{ organisationName: string; state: string; rejectionReason: string | null }> }>(
    `/app-tables/${returns.id}/rows`,
  );
  expect(rows.items.find((row) => row.organisationName === 'Redgate Ecology')).toMatchObject({
    state: 'rejected',
    rejectionReason: reason,
  });
  // Calder & Hale's return is still waiting, so it still has its buttons
  await expect(page.getByRole('button', { name: 'Accept the return from Calder & Hale, October 2026' })).toBeVisible();

  // ── The contractor sees no buttons: the decision is the client's ─────────
  const contractor = await browser.newPage();
  await signIn(contractor, SEEDED.consultant);
  await contractor.goto(`/projects/${projectId}/apps/${app.id}`);
  await expect(contractor.locator('.app-chart').first()).toBeVisible();
  await expect(contractor.getByRole('button', { name: /^(Accept|Reject) the/ })).toHaveCount(0);
  await contractor.close();

  // ── The rejected contractor finds it on their home page, with the reason ─
  const queueFor = async (session: ApiSession) =>
    (await session.get<GetWorkQueueResponse>(`/projects/${projectId}/work-queue`)).items.filter(
      (item) => item.kind === 'correct_app_row' && item.detail === reason,
    );
  expect(await queueFor(nadia)).toHaveLength(1);
  // 🔒 not the client who decided, and not the other contractor
  expect(await queueFor(rachel)).toHaveLength(0);
  expect(await queueFor(eleanor)).toHaveLength(0);

  const redgate = await browser.newPage();
  await signIn(redgate, SEEDED.secondConsultant);
  const item = redgate
    .getByRole('list', { name: `Waiting on you — ${PROJECT}` })
    .getByRole('listitem')
    .filter({ hasText: reason });
  await expect(item).toContainText('Your October 2026 return was rejected — correct it');
  await expect(item).toContainText(`“${reason}”`);
  // one click: the app page, with the correction already started
  await item.getByRole('button', { name: /Your October 2026 return was rejected/ }).click();
  await expect(redgate).toHaveURL(new RegExp(`/apps/${app.id}\\?table=${returns.id}&correct=`));
  await expect(redgate.getByText('Correcting an earlier row')).toBeVisible();

  // correct it and submit: the item leaves the queue
  await redgate.getByLabel('Energy used (kWh)').fill('8');
  await redgate.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(async () => (await queueFor(nadia)).length).toBe(0);
  await redgate.close();

  await Promise.all([rachel.dispose(), eleanor.dispose(), nadia.dispose()]);
});

test('a builder adds a column to a table that already has rows; the app’s people see it from the next publish', async ({
  page,
}) => {
  const { rachel, eleanor, nadia, projectId, app, returns } = await build();

  await signIn(page, SEEDED.consultant);
  await page.goto(`/projects/${projectId}/apps/${app.id}/build`);
  const panel = page.getByRole('complementary', { name: 'The state of the app' });
  await panel.getByRole('button', { name: 'Add a column to Monthly returns' }).click();
  await panel.getByLabel(/New column on/).fill('Diesel used (litres)');
  await panel.getByRole('button', { name: 'Add the column' }).click();
  // the builder sees it at once, marked
  await expect(panel.getByText('Diesel used (litres)').first()).toBeVisible();
  await expect(panel.getByText('new — appears when you publish')).toBeVisible();

  // the app's people do not, until the next publish
  const columnsSeenBy = async (session: ApiSession) =>
    (await session.get<GetAppResponse>(`/apps/${app.id}`)).tables.find((t) => t.id === returns.id)!.columns.map((c) => c.key);
  expect(await columnsSeenBy(eleanor)).toContain('diesel_used_litres');
  expect(await columnsSeenBy(rachel)).not.toContain('diesel_used_litres');
  expect(await columnsSeenBy(nadia)).not.toContain('diesel_used_litres');
  // a value for it is refused like a column that was never declared
  const refused = await nadia.raw('post', `/app-tables/${returns.id}/rows`, {
    values: { month: 'November 2026', energy: 1, diesel_used_litres: 5 },
    submit: true,
  });
  expect(refused.status()).toBe(400);

  // the rows already entered are untouched
  const before = await eleanor.get<{ items: Array<{ values: Record<string, unknown> }> }>(`/app-tables/${returns.id}/rows`);
  expect(before.items.every((row) => row.values['diesel_used_litres'] === undefined)).toBe(true);

  await eleanor.post(`/apps/${app.id}/publish`, {});
  expect(await columnsSeenBy(rachel)).toContain('diesel_used_litres');
  expect(await columnsSeenBy(nadia)).toContain('diesel_used_litres');
  const accepted = await nadia.raw('post', `/app-tables/${returns.id}/rows`, {
    values: { month: 'November 2026', energy: 1, diesel_used_litres: 5 },
    submit: true,
  });
  expect(accepted.status()).toBe(201);

  await Promise.all([rachel.dispose(), eleanor.dispose(), nadia.dispose()]);
});
