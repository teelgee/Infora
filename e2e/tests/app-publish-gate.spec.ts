// T-448 — the publish gate, end to end on the seeded three-organisation world
// (ADR-0056's third addendum, ruling 1).
//
// *In plain terms: Calder & Hale builds an app, tries to open it to the client
// and the other consultancy before answering the two required questions, and
// is told — in words, naming each question — that it cannot. Answering them
// through the ordinary acts opens the door. Owen Vance, whom his own firm has
// not let build, cannot push the app open either. And (T-487) an app with
// nothing in it — no table for people to fill in, no screen to open — says so,
// and its Open button is closed.*
import { expect, test } from '@playwright/test';
import type {
  AppRecord,
  AppTableRecord,
  GetAppResponse,
  ListRosterResponse,
  MeResponse,
  PublishRefusedResponse,
} from '@infora/contracts';
import { EMPTY_APP_DEFINITION, serialiseAppScreen } from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const stamp = Date.now();

test('a publish past an unanswered question is refused in words, and answering clears it', async ({
  page,
}) => {
  const rachel = await ApiSession.login(SEEDED.owner); // Trentmoor Energy — the client
  const eleanor = await ApiSession.login(SEEDED.consultant); // Calder & Hale — builds it
  const owen = await ApiSession.login('owen.vance@calderhale.example'); // may not build

  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoorOrgId = roster.find((r) => r.name === 'Rachel Bowen')!.organisationId;

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Gated returns ${stamp}`,
    organisationIds: [trentmoorOrgId],
    participantIds: [],
  });

  // ── A table declared WITHOUT saying whether it holds contractual data ────
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
    ],
    kind: 'data',
  });

  const refused = await eleanor.raw('post', `/apps/${app.id}/publish`, {});
  expect(refused.status()).toBe(409);
  const body = (await refused.json()) as PublishRefusedResponse;
  // T-487 — the table has no screen to open yet, and the question is still open:
  // one sentence says both
  expect(body.detail).toBe(
    'This app cannot be opened yet: it has no screen for people to open, and one question still needs an answer — whether “Monthly returns” holds contractual data.',
  );
  // the client still cannot see it: nothing was opened
  expect((await rachel.raw('get', `/apps/${app.id}`)).status()).toBe(404);
  // and a colleague whose firm has not let him build cannot force it either
  expect((await owen.raw('post', `/apps/${app.id}/publish`, {})).status()).toBe(404);

  // ── The refusal is on the screen in the same words, before and after the click
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrenfield–Ashcombe 400kV Connection').first()).toBeVisible();
  await page.goto(`/projects/${projectId}/apps/${app.id}`);
  await page.getByRole('button', { name: 'Check and open' }).click();
  await expect(page.getByText(body.detail)).toBeVisible();

  // ── Answered through the ordinary act ────────────────────────────────────
  await eleanor.patch<AppTableRecord>(`/app-tables/${table.id}`, { hasAcceptance: true });

  // ── A screen written straight at the API, its who-may-open unanswered ────
  const working = (await eleanor.get<GetAppResponse>(`/apps/${app.id}`)).app.definition!;
  const screen = serialiseAppScreen({
    version: 1,
    blocks: [{ kind: 'rowTable', columnKeys: ['month', 'landfill'], showOrganisation: true, showState: true }],
  });
  await eleanor.patch<AppRecord>(`/apps/${app.id}/definition`, {
    definition: {
      ...EMPTY_APP_DEFINITION,
      interfaces: [
        { id: 'dashboard', label: 'Client dashboard', appTableId: table.id, openToOrganisationIds: [trentmoorOrgId], source: screen },
      ],
      // the table's answer, recorded by the act above, is kept; the screen's is not given
      answeredQuestions: working.answeredQuestions,
    },
  });
  const again = await eleanor.raw('post', `/apps/${app.id}/publish`, {});
  expect(again.status()).toBe(409);
  expect(((await again.json()) as PublishRefusedResponse).detail).toBe(
    'This app cannot be opened yet: one question still needs an answer — who may open “Client dashboard”.',
  );

  // the gate's state, read before the click, says the same
  expect((await eleanor.get<GetAppResponse>(`/apps/${app.id}`)).publishGate?.words).toContain(
    'who may open “Client dashboard”',
  );

  await eleanor.patch<AppRecord>(`/apps/${app.id}/definition`, {
    definition: {
      ...EMPTY_APP_DEFINITION,
      interfaces: [
        { id: 'dashboard', label: 'Client dashboard', appTableId: table.id, openToOrganisationIds: [trentmoorOrgId], source: screen },
      ],
      answeredQuestions: [...working.answeredQuestions, 'who-may-open:dashboard'],
    },
  });
  const opened = await eleanor.post<AppRecord>(`/apps/${app.id}/publish`, {});
  expect(opened.state).toBe('open');
  // and now the client opens it, with its dashboard
  const asClient = await rachel.get<GetAppResponse>(`/apps/${app.id}`);
  expect((asClient.app.published?.interfaces ?? []).map((i) => i.label)).toEqual(['Client dashboard']);

  await Promise.all([rachel.dispose(), eleanor.dispose(), owen.dispose()]);
});

// T-487 (walk defect 11) — a freshly created app has nothing to open, and used
// to say "every required question has an answer, so this app can be opened".
test('a freshly created app says it cannot be opened yet, and its Open button is closed', async ({ page }) => {
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const rachel = await ApiSession.login(SEEDED.owner);
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoorOrgId = roster.find((r) => r.name === 'Rachel Bowen')!.organisationId;
  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Nothing in it yet ${stamp}`,
    organisationIds: [trentmoorOrgId],
    participantIds: [],
  });

  const words =
    'This app cannot be opened yet: it has no table for people to fill in and no screen for people to open.';
  // the server says it, with no question pending…
  const refused = await eleanor.raw('post', `/apps/${app.id}/publish`, {});
  expect(refused.status()).toBe(409);
  expect(((await refused.json()) as PublishRefusedResponse).detail).toBe(words);

  // …and the building screen says the same, before any click, with Open closed
  await page.goto('/');
  await page.getByLabel('Email').fill(SEEDED.consultant);
  await page.getByLabel('Password').fill(SEEDED.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrenfield–Ashcombe 400kV Connection').first()).toBeVisible();
  await page.goto(`/projects/${projectId}/apps/${app.id}/build`);
  await expect(page.getByText(words)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open it', exact: true })).toBeDisabled();

  await Promise.all([eleanor.dispose(), rachel.dispose()]);
});
