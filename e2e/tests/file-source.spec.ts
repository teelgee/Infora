// T-451 — the file source, end to end over HTTP on the seeded three-organisation
// world (ADR-0059).
//
// **The person who keeps the spreadsheet is not the person who built the app.**
// Eleanor Price (Calder & Hale) builds the cost dashboard; Owen Vance — the
// seed's Calder & Hale participant who may NOT build — keeps the cost report
// and replaces it each month. The dashboard is fed by Owen's act on Owen's own
// file, and every row names him. Trentmoor Energy, the project owner, reads the
// submitted rows; Redgate Ecology, inside the app's scope but never shared the
// table, reads none. Every negative is driven as that party.
import { expect, test } from '@playwright/test';
import type {
  AppRecord,
  AppTableRecord,
  AppTableSourceResponse,
  ListAppRowsResponse,
  ListRosterResponse,
  ListSourceRegionsResponse,
  MeResponse,
  SandboxDocument,
} from '@infora/contracts';
import { ApiSession, SEEDED, addStandInScreen } from './support/api';
import { costReport, XLSX_MIME } from './support/workbook';

const PROJECT = 'Wrenfield–Ashcombe 400kV Connection';
const OWEN = 'owen.vance@calderhale.example';

async function world(stamp: number) {
  const rachel = await ApiSession.login(SEEDED.owner);
  const eleanor = await ApiSession.login(SEEDED.consultant);
  const nadia = await ApiSession.login(SEEDED.secondConsultant);
  const owen = await ApiSession.login(OWEN);
  const me = await eleanor.get<MeResponse>('/me');
  const projectId = me.participants.find((p) => p.projectName === PROJECT)!.projectId;
  const roster = (await rachel.get<ListRosterResponse>(`/projects/${projectId}/participants`)).items;
  const orgOf = (name: string) => roster.find((e) => e.name === name && e.removedAt === null)!.organisationId;

  const app = await eleanor.post<AppRecord>(`/projects/${projectId}/apps`, {
    name: `Cost dashboard ${stamp}`,
    organisationIds: [orgOf('Rachel Bowen'), orgOf('Nadia Okonjo')],
    participantIds: [],
  });
  const table = await eleanor.post<AppTableRecord>(`/apps/${app.id}/tables`, {
    name: 'Monthly costs',
    columns: [
      { key: 'month', label: 'Month', type: 'text', required: true },
      { key: 'cost', label: 'Cost', type: 'number', required: true },
    ],
    kind: 'data',
    hasAcceptance: true,
  });
  await addStandInScreen(eleanor, app.id); // T-487 — the gate wants a screen to open
  await eleanor.post(`/apps/${app.id}/publish`, {});

  // Owen uploads his cost report into Calder & Hale's sandbox
  const uploaded = await owen.context.post(`/projects/${projectId}/sandbox-uploads`, {
    multipart: {
      file: { name: `Cost report ${stamp}.xlsx`, mimeType: XLSX_MIME, buffer: costReport([['Oct', 100], ['Nov', 120]]) },
    },
  });
  expect(uploaded.status()).toBe(201);
  const documentId = ((await uploaded.json()) as SandboxDocument).id;

  const replace = (lines: Array<[string, number | string]>) =>
    owen.context.post(`/sandbox-documents/${documentId}/file`, {
      multipart: { file: { name: 'cost report.xlsx', mimeType: XLSX_MIME, buffer: costReport(lines) } },
    });
  const rows = async (who: ApiSession) =>
    (await who.get<ListAppRowsResponse>(`/app-tables/${table.id}/rows`)).items;
  const attach = () =>
    eleanor.post<AppTableSourceResponse>(`/app-tables/${table.id}/source`, {
      sandboxDocumentId: documentId,
      sheet: 'Costs',
      headerRow: ['Month', 'Cost (£)'],
      mapping: [
        { header: 'Month', columnKey: 'month' },
        { header: 'Cost (£)', columnKey: 'cost' },
      ],
    });
  return { rachel, eleanor, nadia, owen, app, table, documentId, replace, rows, attach };
}

test('replacing the source spreadsheet refills the table as its uploader’s submitted rows', async () => {
  const w = await world(Date.now());

  // the builder finds the table under the report's title line
  const regions = await w.eleanor.get<ListSourceRegionsResponse>(
    `/apps/${w.app.id}/source-documents/regions?sandboxDocumentId=${w.documentId}`,
  );
  expect(regions.regions.map((r) => [r.sheet, r.headerRowNumber, r.headers, r.rowCount])).toEqual([
    ['Costs', 3, ['Month', 'Cost (£)'], 2],
  ]);

  // attaching imports v0.1 — as OWEN, whose upload it was, never as Eleanor
  const attached = (await w.attach()).source!;
  expect(attached.lastImport!.outcome).toBe('Imported 2 rows from v0.1, submitted for acceptance.');
  const first = await w.rows(w.eleanor);
  expect(first.map((r) => [r.values['month'], r.values['cost'], r.state, r.enteredByName])).toEqual([
    ['Oct', 100, 'submitted', 'Owen Vance'],
    ['Nov', 120, 'submitted', 'Owen Vance'],
  ]);

  // Owen cannot build, so the source's configuration is not his to read
  expect((await w.owen.raw('get', `/app-tables/${w.table.id}/source`)).status()).toBe(404);

  // Rachel, the project owner, accepts October
  await w.rachel.post(`/app-rows/${first[0]!.id}/decision`, { decision: 'accept' });

  // next month Owen replaces the file — nobody touches the app
  expect((await w.replace([['Oct', 100], ['Nov', 125], ['Dec', 90]])).status()).toBe(200);
  const after = await w.rows(w.owen);
  expect(
    after.filter((r) => r.state === 'submitted').map((r) => [r.values['month'], r.values['cost'], r.enteredByName]),
  ).toEqual([
    ['Oct', 100, 'Owen Vance'],
    ['Nov', 125, 'Owen Vance'],
    ['Dec', 90, 'Owen Vance'],
  ]);
  // the prior import is superseded, the accepted row keeping its decider
  expect(after.filter((r) => first.some((f) => f.id === r.id)).map((r) => [r.state, r.decidedByName])).toEqual([
    ['superseded', 'Rachel Bowen'],
    ['superseded', null],
  ]);
  const receipt = (await w.eleanor.get<AppTableSourceResponse>(`/app-tables/${w.table.id}/source`)).source!;
  expect(receipt.reflectsVersion).toBe('v0.2');

  // the wall, as each party
  expect((await w.rows(w.rachel)).filter((r) => r.state === 'submitted')).toHaveLength(3);
  expect(await w.rows(w.nadia)).toEqual([]);
});

test('a failed import changes no rows and says why in the stored receipt', async () => {
  const w = await world(Date.now());
  await w.attach();
  const before = await w.rows(w.eleanor);

  // a figure typed as words: refused, row named, nothing moved
  expect((await w.replace([['Oct', 100], ['Nov', 'TBC']])).status()).toBe(200);
  expect(await w.rows(w.eleanor)).toEqual(before);
  const receipt = (await w.eleanor.get<AppTableSourceResponse>(`/app-tables/${w.table.id}/source`)).source!;
  expect(receipt.reflectsVersion).toBe('v0.1');
  expect(receipt.lastImport).toEqual(
    expect.objectContaining({
      succeeded: false,
      outcome: 'Nothing was imported from v0.2. Row 5, “Cost (£)” holds something that is not a number.',
    }),
  );
  // the client sees exactly what they saw before the bad month arrived
  expect((await w.rows(w.rachel)).map((r) => r.id)).toEqual(before.map((r) => r.id));
});
