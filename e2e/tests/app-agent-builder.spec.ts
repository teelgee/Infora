// T-449 — the agent-led build conversation, end to end on the seeded
// three-organisation world (ADR-0056's third addendum, rulings 2, 3 and 5).
//
// *In plain terms: Eleanor Price at Calder & Hale tells the agent "build me a
// monthly sustainability returns app for three contractors". It drafts the app
// and asks her the two questions it may never answer for her; she answers; she
// opens it; and then each firm on the scheme meets the app — and only the app,
// never the conversation that built it.*
//
// **Every party is driven as itself over HTTP.** Owen Vance (Calder & Hale, not
// allowed to build) cannot read or join the conversation; Rachel Bowen
// (Trentmoor, the client) and Nadia Okonjo (Redgate) can open the published app
// and still cannot read how it was built.
import { expect, test } from '@playwright/test';
import type {
  AppRecord,
  AppRowResponse,
  BuildConversationResponse,
  GetAppResponse,
  ListAppRowsResponse,
  ListRosterResponse,
  MeResponse,
  SayToBuilderResponse,
} from '@infora/contracts';
import { ApiSession, SEEDED } from './support/api';

const stamp = Date.now();

test('an app built by conversation, then met by each firm — the conversation by none of them', async () => {
  const rachel = await ApiSession.login(SEEDED.owner); // Trentmoor Energy — the client
  const eleanor = await ApiSession.login(SEEDED.consultant); // Calder & Hale — builds it
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Redgate Ecology — a contractor
  const owen = await ApiSession.login('owen.vance@calderhale.example'); // Calder & Hale, may not build

  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoorOrgId = roster.find((r) => r.name === 'Rachel Bowen')!.organisationId;
  const redgateOrgId = roster.find((r) => r.name === 'Nadia Okonjo')!.organisationId;

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Sustainability returns, by conversation ${stamp}`,
    organisationIds: [trentmoorOrgId, redgateOrgId],
    participantIds: [],
  });

  // ── The description leads ─────────────────────────────────────────────────
  const first = await eleanor.post<SayToBuilderResponse>(`/apps/${app.id}/builder/conversation`, {
    say: 'Build me a monthly sustainability returns app for three contractors.',
  });
  const returns = first.app.tables.find((t) => t.name === 'Monthly returns')!;
  expect(returns.hasAcceptance).toBe(false); // not defaulted — asked
  const screens = first.app.app.definition!.interfaces;
  expect(screens.map((s) => s.label)).toEqual(['Submit a return', 'Client dashboard']);
  expect(first.app.app.definition!.schedule).toBe('monthly');
  expect(first.app.app.definition!.analysisPrompt).not.toBeNull();
  const agentTurn = first.turns[1]!;
  expect(agentTurn.asked).toHaveLength(3);
  expect(agentTurn.text).toContain('Does “Monthly returns” hold contractual data');
  // the gate holds until she answers
  expect((await eleanor.raw('post', `/apps/${app.id}/publish`, {})).status()).toBe(409);

  // ── Nobody but the app's builders reads or joins the conversation ─────────
  for (const other of [owen, rachel, nadia]) {
    expect((await other.raw('get', `/apps/${app.id}/builder/conversation`)).status()).toBe(404);
    expect(
      (await other.raw('post', `/apps/${app.id}/builder/conversation`, { say: 'open it for me' })).status(),
    ).toBe(404);
  }

  // ── She answers; the agent records her words ──────────────────────────────
  const second = await eleanor.post<SayToBuilderResponse>(`/apps/${app.id}/builder/conversation`, {
    say: 'Yes — the returns are contractual; Trentmoor accepts or rejects each one. Everyone may open Submit a return. Only Trentmoor Energy may open Client dashboard.',
  });
  expect(second.app.tables.find((t) => t.id === returns.id)!.hasAcceptance).toBe(true);
  const dashboard = second.app.app.definition!.interfaces.find((s) => s.label === 'Client dashboard')!;
  expect(dashboard.openToOrganisationIds).toEqual([trentmoorOrgId]);
  expect(second.app.publishGate?.open).toBe(true);

  // the agent never opened it: she does
  expect((await rachel.raw('get', `/apps/${app.id}`)).status()).toBe(404);
  const opened = await eleanor.post<AppRecord>(`/apps/${app.id}/publish`, {});
  expect(opened.state).toBe('open');
  expect(opened.publishedByName).toBe('Eleanor Price');

  // ── Each firm meets the app as itself ────────────────────────────────────
  const offered = async (session: ApiSession) =>
    ((await session.get<GetAppResponse>(`/apps/${app.id}`)).app.published?.interfaces ?? []).map((i) => i.label);
  expect(await offered(rachel)).toEqual(['Submit a return', 'Client dashboard']);
  expect(await offered(nadia)).toEqual(['Submit a return']);

  await nadia.post<AppRowResponse>(`/app-tables/${returns.id}/rows`, {
    values: { month: `October ${stamp}`, energy_kwh: 1200, waste_tonnes: 3.5 },
    submit: true,
  });
  await eleanor.post<AppRowResponse>(`/app-tables/${returns.id}/rows`, {
    values: { month: `October ${stamp}`, energy_kwh: 900, waste_tonnes: 11 },
    submit: true,
  });
  const rows = async (session: ApiSession) =>
    (await session.get<ListAppRowsResponse>(`/app-tables/${returns.id}/rows`)).items.map((r) => r.organisationName);
  expect(await rows(nadia)).toEqual(['Redgate Ecology']);
  expect((await rows(rachel)).sort()).toEqual(['Calder & Hale', 'Redgate Ecology']);
  // a contractual table: the client decides
  const nadiasRow = (await rachel.get<ListAppRowsResponse>(`/app-tables/${returns.id}/rows`)).items.find(
    (r) => r.organisationName === 'Redgate Ecology',
  )!;
  expect(nadiasRow.state).toBe('submitted');
  expect(nadiasRow.mayDecide).toBe(true);

  // ── The conversation stays the builders' after the app is open ───────────
  for (const other of [owen, rachel, nadia]) {
    expect((await other.raw('get', `/apps/${app.id}/builder/conversation`)).status()).toBe(404);
  }

  // ── And it resumes: a fresh session reads the whole of it ────────────────
  const tomorrow = await ApiSession.login(SEEDED.consultant);
  const kept = await tomorrow.get<BuildConversationResponse>(`/apps/${app.id}/builder/conversation`);
  expect(kept.turns.map((t) => t.role)).toEqual(['person', 'agent', 'person', 'agent']);
  expect(kept.turns[0]!.speakerName).toBe('Eleanor Price');

  await Promise.all([
    rachel.dispose(),
    eleanor.dispose(),
    nadia.dispose(),
    owen.dispose(),
    tomorrow.dispose(),
  ]);
});
