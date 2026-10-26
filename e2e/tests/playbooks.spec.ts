// T-445 — the playbook, end to end on the seeded world (ADR-0056 §10).
//
// **The seed already holds the scenario**, which is why nothing is constructed
// here: Calder & Hale acts for BOTH clients — Eleanor Price is a participant on
// Trentmoor Energy's Wrenfield–Ashcombe scheme and on Marchwood Aggregates'
// Quarry Rail Link. So the ticket's own "done when" reads straight off the
// seed: build the returns app in Client A's project, keep it as a template,
// deploy it into Client B's project, and check that changing the template
// afterwards moves nothing that is already running.
//
// **The negatives are driven as the other party**, over HTTP: Rachel Bowen at
// the client whose project the app lives in, Nadia Okonjo at the peer
// consultancy, and Owen Vance inside the building firm, whose organisation
// does not let him build. (Comment corrected in review 2026-09-07: this spec's
// app has an empty scope, so Rachel's and Nadia's 404s prove unreachability —
// the save RULE itself, refused to in-scope parties, is driven in
// apps/api/src/playbooks.test.ts on a fixture that admits them.)
import { expect, test } from '@playwright/test';
import type {
  AppRecord,
  AppTableRecord,
  GetAppResponse,
  ListPlaybooksResponse,
  MeResponse,
  PlaybookResponse,
} from '@infora/contracts';
import { ApiSession, SEEDED, addStandInScreen } from './support/api';

const stamp = Date.now();

/** A screen in T-442's closed grammar — a heading, the contractor's form, and
 * the table of what this viewer may read. */
const SCREEN_SOURCE = JSON.stringify({
  version: 1,
  blocks: [
    { kind: 'heading', text: 'Monthly returns' },
    { kind: 'rowForm', columnKeys: ['month', 'landfill'], submitLabel: 'Submit the return' },
    { kind: 'rowTable', columnKeys: ['month', 'landfill'], showOrganisation: true, showState: true },
  ],
});

test('a playbook: kept with no rows, deployed into a second client’s project, and never linked back', async () => {
  const eleanor = await ApiSession.login(SEEDED.consultant); // Calder & Hale — acts for both clients
  const rachel = await ApiSession.login(SEEDED.owner); // Trentmoor Energy — client A
  const nadia = await ApiSession.login(SEEDED.secondConsultant); // Redgate Ecology — the peer
  const owen = await ApiSession.login('owen.vance@calderhale.example'); // may not build

  const me = await eleanor.get<MeResponse>('/me');
  const wrenfield = me.participants.find(
    (p) => p.projectName === 'Wrenfield–Ashcombe 400kV Connection',
  )!.projectId;
  // the second scheme, a DIFFERENT client's — which is what makes the wall
  // question in this ticket a real one rather than a copy inside one project
  const marchwood = me.participants.find(
    (p) => p.projectName === 'Marchwood Quarry Rail Link',
  )!.projectId;

  // ── The returns app, built in Client A's project ─────────────────────────
  const built = await eleanor.post<AppRecord>(`/projects/${wrenfield}/apps`, {
    name: `Sustainability returns ${stamp}`,
    description: 'Monthly environmental returns from each organisation on the scheme.',
    organisationIds: [],
    participantIds: [],
  });
  const returns = await eleanor.post<AppTableRecord>(`/apps/${built.id}/tables`, {
    name: 'Monthly returns',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: true,
  });
  const factors = await eleanor.post<AppTableRecord>(`/apps/${built.id}/tables`, {
    name: 'Emission factors',
    columns: [
      { key: 'material', label: 'Material', type: 'text', required: true },
      { key: 'factor', label: 'kgCO2e per tonne', type: 'number', required: true },
    ],
    kind: 'reference',
    hasAcceptance: false,
  });
  await eleanor.patch(`/apps/${built.id}/definition`, {
    definition: {
      connections: [{ id: 'c1', system: 'arcgis', needs: 'the site boundary layer, read only' }],
      interfaces: [
        {
          id: 'screen-1',
          label: 'The contractor’s return',
          appTableId: returns.id,
          openToOrganisationIds: [],
          source: SCREEN_SOURCE,
        },
      ],
      schedule: 'monthly',
      analysisPrompt: 'Summarise the landfill trend across the returns.',
      // T-448 — every non-insight table is asked, the reference table included
      answeredQuestions: [
        `contractual-data:${returns.id}`,
        `contractual-data:${factors.id}`,
        'who-may-open:screen-1',
      ],
    },
  });
  await eleanor.post(`/apps/${built.id}/publish`, {});

  // rows in BOTH tables, so "no rows travel" is a claim about tables that
  // actually hold something — the client's returns and the firm's own lookups
  await eleanor.post(`/app-tables/${returns.id}/rows`, {
    values: { month: 'August 2026', landfill: 12.4 },
    submit: true,
  });
  await eleanor.post(`/app-tables/${factors.id}/rows`, {
    values: { material: 'Mixed waste', factor: 587 },
    submit: false,
  });

  // ── Kept as a template, and NOT ONE ROW GOES WITH IT ─────────────────────
  const name = `Returns template ${stamp}`;
  const kept = (await eleanor.post<PlaybookResponse>(`/apps/${built.id}/playbook`, { name }))
    .playbook;
  expect(kept.version).toBe(1);
  expect(kept.savedByName).toBe('Eleanor Price');
  expect(kept.savedFromAppId).toBe(built.id);
  expect(kept.savedFromProjectName).toBe('Wrenfield–Ashcombe 400kV Connection');

  // the shape travelled, reference table included — its DEFINITION is structure
  expect(kept.tableDeclarations.map((t) => t.name).sort()).toEqual([
    'Emission factors',
    'Monthly returns',
  ]);
  expect(kept.tableDeclarations.find((t) => t.name === 'Monthly returns')!.hasAcceptance).toBe(true);
  expect(kept.tableDeclarations.find((t) => t.name === 'Emission factors')!.kind).toBe('reference');
  expect(kept.definition.schedule).toBe('monthly');
  expect(kept.definition.analysisPrompt).toContain('landfill trend');
  expect(kept.definition.connections[0]!.system).toBe('arcgis');
  expect(kept.definition.interfaces[0]!.tableName).toBe('Monthly returns');

  // 🔒 the whole playbook as JSON, searched for anything anybody typed
  const asText = JSON.stringify(kept.definition) + JSON.stringify(kept.tableDeclarations);
  expect(asText).not.toContain('August 2026');
  expect(asText).not.toContain('12.4');
  expect(asText).not.toContain('Mixed waste');
  expect(asText).not.toContain('587');
  expect(asText).not.toContain('"rows"');

  // ── The shelf is org-private ─────────────────────────────────────────────
  const mine = await eleanor.get<ListPlaybooksResponse>('/organisation/playbooks');
  expect(mine.maySave).toBe(true);
  expect(mine.items.map((item) => item.name)).toContain(name);
  // the client whose project it was built in never sees its consultant's template
  const clients = await rachel.get<ListPlaybooksResponse>('/organisation/playbooks');
  expect(clients.items.map((item) => item.name)).not.toContain(name);
  // nor does the peer consultancy on the same scheme
  const peers = await nadia.get<ListPlaybooksResponse>('/organisation/playbooks');
  expect(peers.items.map((item) => item.name)).not.toContain(name);
  // and a colleague their own firm does not let build is told so, and gets none
  const owens = await owen.get<ListPlaybooksResponse>('/organisation/playbooks');
  expect(owens.maySave).toBe(false);
  expect(owens.items).toEqual([]);

  // nobody but the app's own firm's builder may keep it
  expect((await rachel.raw('post', `/apps/${built.id}/playbook`, {})).status()).toBe(404);
  expect((await nadia.raw('post', `/apps/${built.id}/playbook`, {})).status()).toBe(404);
  expect((await owen.raw('post', `/apps/${built.id}/playbook`, {})).status()).toBe(404);

  // ── Deployed into the SECOND client's project ────────────────────────────
  const deployed = await eleanor.post<GetAppResponse>(`/projects/${marchwood}/apps/deployments`, {
    playbookId: kept.id,
    name: `Returns for Marchwood ${stamp}`,
  });
  expect(deployed.app.projectId).toBe(marchwood);
  expect(deployed.app.id).not.toBe(built.id);
  expect(deployed.app.state).toBe('unpublished');
  expect(deployed.app.ownerName).toBe('Eleanor Price');
  expect(deployed.app.deployedFrom).toEqual({
    playbookId: kept.id,
    playbookName: name,
    version: 1,
  });

  // the same steps
  expect(deployed.tables.map((t) => t.name).sort()).toEqual([
    'Emission factors',
    'Monthly returns',
  ]);
  const deployedReturns = deployed.tables.find((t) => t.name === 'Monthly returns')!;
  expect(deployedReturns.hasAcceptance).toBe(true);
  expect(deployedReturns.columns.map((c) => c.key)).toEqual(['month', 'landfill']);
  expect(deployed.app.definition!.schedule).toBe('monthly');
  expect(deployed.app.definition!.interfaces[0]!.appTableId).toBe(deployedReturns.id);
  expect(deployed.app.definition!.interfaces[0]!.source).toContain('rowForm');

  // and empty tables — the deploying firm loads its own lookups in here
  for (const table of deployed.tables) {
    const rows = await eleanor.get<{ items: unknown[] }>(`/app-tables/${table.id}/rows`);
    expect(rows.items).toEqual([]);
  }

  // nothing inherited Wrenfield's scope: Calder & Hale alone, and Marchwood's
  // own client cannot even see the app until Eleanor opens it to them
  expect(deployed.app.scope).toHaveLength(1);
  const hannah = await ApiSession.login('hannah.sturt@marchwood.example');
  expect((await hannah.raw('get', `/apps/${deployed.app.id}`)).status()).toBe(404);

  // ── No live link, in both directions ─────────────────────────────────────
  //
  // The firm changes its template — a third table, a different schedule — and
  // keeps it again. What is already running in Marchwood's project does not
  // move, which is the sentence the ADR insisted on: a firm must not be able to
  // change what runs inside a client's project without anybody there seeing it.
  const site = await eleanor.post<AppTableRecord>(`/apps/${built.id}/tables`, {
    name: 'Site register',
    columns: [{ key: 'site', label: 'Site', type: 'text', required: true }],
    kind: 'data',
    hasAcceptance: false,
  });
  await eleanor.patch(`/apps/${built.id}/definition`, {
    definition: {
      connections: [],
      interfaces: [],
      schedule: 'weekly',
      analysisPrompt: 'Something else entirely.',
      // T-448 — a hand-written definition carries its answers or the gate refuses it
      answeredQuestions: [
        `contractual-data:${returns.id}`,
        `contractual-data:${factors.id}`,
        `contractual-data:${site.id}`,
      ],
    },
  });
  await addStandInScreen(eleanor, built.id); // T-487 — the gate wants a screen to open
  await eleanor.post(`/apps/${built.id}/publish`, {});
  const again = (await eleanor.post<PlaybookResponse>(`/apps/${built.id}/playbook`, { name }))
    .playbook;
  expect(again.version).toBe(2);
  expect(again.tableDeclarations).toHaveLength(3);

  const after = await eleanor.get<GetAppResponse>(`/apps/${deployed.app.id}`);
  expect(after.tables).toHaveLength(2);
  expect(after.app.definition!.schedule).toBe('monthly');
  expect(after.app.deployedFrom!.version).toBe(1);

  // the shelf still holds ONE entry for this template, at its latest version
  const shelf = await eleanor.get<ListPlaybooksResponse>('/organisation/playbooks');
  const entries = shelf.items.filter((item) => item.name === name);
  expect(entries).toHaveLength(1);
  expect(entries[0]!.version).toBe(2);

  // and the reverse: building on the deployed instance changes no template
  await eleanor.post(`/apps/${deployed.app.id}/tables`, {
    name: 'Only in Marchwood',
    columns: [{ key: 'note', label: 'Note', type: 'text', required: false }],
    kind: 'data',
    hasAcceptance: false,
  });
  const unchanged = await eleanor.get<ListPlaybooksResponse>('/organisation/playbooks');
  const stillTwo = unchanged.items.find((item) => item.name === name)!;
  expect(stillTwo.version).toBe(2);
  expect(stillTwo.tableDeclarations.map((t) => t.name)).not.toContain('Only in Marchwood');

  // ── Who may deploy ──────────────────────────────────────────────────────
  //
  // Owen is on Wrenfield and his firm does not let him build; Nadia may build
  // and this is not her firm's template.
  expect(
    (await owen.raw('post', `/projects/${wrenfield}/apps/deployments`, { playbookId: kept.id })).status(),
  ).toBe(404);
  expect(
    (await nadia.raw('post', `/projects/${wrenfield}/apps/deployments`, { playbookId: kept.id })).status(),
  ).toBe(404);

  await Promise.all([
    eleanor.dispose(),
    rachel.dispose(),
    nadia.dispose(),
    owen.dispose(),
    hannah.dispose(),
  ]);
});
