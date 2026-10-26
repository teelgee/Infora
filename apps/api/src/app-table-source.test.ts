// T-451 acceptance — the file source (ADR-0059), driven over HTTP as each party
// on a genuinely cross-organisation fixture: a contractor firm that builds the
// app and keeps the spreadsheet, a colleague of theirs who replaces it, the
// project owner who accepts, and a peer firm that must see none of it.
//
// What the ticket's Done-when asks, each as a test below:
//   * replacing the file refills the table as THE UPLOADER'S submitted rows and
//     supersedes the prior import — the uploader, never the builder;
//   * a vanished region or an unreadable column fails loudly in the stored
//     receipt and changes NO rows;
//   * detaching stops imports and deletes nothing;
//   * a table without a source behaves exactly as before.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  AppRecord,
  AppRowRecord,
  AppTableRecord,
  AppTableSourceResponse,
  ListAppRowsResponse,
  ListSourceDocumentsResponse,
  ListSourceRegionsResponse,
} from '@infora/contracts';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { findRegions, importOnVersionLanding, rowsFromWorkbook } from './app-table-source';
import { purgeSandboxDocument } from './purge';
import { putBlob } from './renditions';
import { fakeRouter } from './test-router';
import { addStandInScreen } from './app-test-support';
import { testWorkbook } from './test-workbook';
import type { TestCell } from './test-workbook';
import { parseXlsxSheets, readXlsxCells, usesDate1904 } from './xlsx';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t451';

let projectId: string;
let ownerOrg: string;
let contractorOrg: string;
let peerOrg: string;
let ownerCookie: string;
let builderCookie: string;
let colleagueCookie: string;
let peerCookie: string;
let nonBuilderCookie: string;
let builderParticipant: string;
let colleagueParticipant: string;

async function makeUser(name: string, organisationId: string, mayBuildApps: boolean) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: 'admin', mayBuildApps })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  const [participant] = await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated: true })
    .returning();
  return { email, participantId: participant!.id };
}

async function session(email: string): Promise<string> {
  const res = await app.request('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const get = (cookie: string, path: string) => app.request(path, { headers: { cookie } });
const post = (cookie: string, path: string, body?: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

const rows = async (cookie: string, tableId: string): Promise<AppRowRecord[]> =>
  ((await (await get(cookie, `/app-tables/${tableId}/rows`)).json()) as ListAppRowsResponse).items;

const sourceOf = async (cookie: string, tableId: string) =>
  ((await (await get(cookie, `/app-tables/${tableId}/source`)).json()) as AppTableSourceResponse).source;

/** The cost report as the contractor keeps it: a title line, a blank row, then
 * the table — the shape the region finder has to see through. */
const costReport = (lines: Array<[string, TestCell, TestCell]>) =>
  testWorkbook([
    {
      name: 'Costs',
      rows: [
        ['Wrenfield cost report'],
        null,
        ['Month', 'Cost (£)', 'Notes'],
        ...lines.map(([month, cost, notes]) => [month, cost, notes]),
      ],
    },
  ]);

async function upload(cookie: string, bytes: Buffer, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name));
  const res = await app.request(`/projects/${projectId}/sandbox-uploads`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function replaceFile(cookie: string, documentId: string, bytes: Buffer) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], 'cost-report.xlsx'));
  return app.request(`/sandbox-documents/${documentId}/file`, { method: 'POST', headers: { cookie }, body: form });
}

/** A published app, built by the contractor and open to all three firms, with
 * one table of the given shape. */
async function newTable(hasAcceptance: boolean): Promise<{ appId: string; tableId: string }> {
  const created = (await (
    await post(builderCookie, `/projects/${projectId}/apps`, {
      name: `cost dashboard ${stamp}-${Math.random()}`,
      organisationIds: [ownerOrg, peerOrg],
      participantIds: [],
    })
  ).json()) as AppRecord;
  const table = (await (
    await post(builderCookie, `/apps/${created.id}/tables`, {
      name: 'Monthly costs',
      columns: [
        { key: 'month', label: 'Month', type: 'text', required: true },
        { key: 'cost', label: 'Cost', type: 'number', required: true },
      ],
      kind: 'data',
      hasAcceptance,
    })
  ).json()) as AppTableRecord;
  await addStandInScreen((path, init) => app.request(path, init), builderCookie, created.id);
  await post(builderCookie, `/apps/${created.id}/publish`);
  return { appId: created.id, tableId: table.id };
}

const MAPPING = [
  { header: 'Month', columnKey: 'month' },
  { header: 'Cost (£)', columnKey: 'cost' },
];

const attach = (cookie: string, tableId: string, sandboxDocumentId: string) =>
  post(cookie, `/app-tables/${tableId}/source`, {
    sandboxDocumentId,
    sheet: 'Costs',
    headerRow: ['Month', 'Cost (£)', 'Notes'],
    mapping: MAPPING,
  });

beforeAll(async () => {
  const orgs = await db
    .insert(s.organisations)
    .values([
      { name: `t451 client ${stamp}` },
      { name: `t451 contractor ${stamp}` },
      { name: `t451 peer ${stamp}` },
    ])
    .returning();
  [ownerOrg, contractorOrg, peerOrg] = orgs.map((o) => o.id) as [string, string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t451 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: contractorOrg, projectId, role: 'member' },
    { organisationId: peerOrg, projectId, role: 'member' },
  ]);
  ownerCookie = await session((await makeUser('t451-rhoda', ownerOrg, true)).email);
  const builder = await makeUser('t451-bella', contractorOrg, true);
  builderParticipant = builder.participantId;
  builderCookie = await session(builder.email);
  // the colleague who keeps the spreadsheet may NOT build apps — and still
  // feeds the dashboard, because replacing the file is their own act on their
  // own document
  const colleague = await makeUser('t451-colm', contractorOrg, false);
  colleagueParticipant = colleague.participantId;
  colleagueCookie = await session(colleague.email);
  peerCookie = await session((await makeUser('t451-pia', peerOrg, true)).email);
  nonBuilderCookie = await session((await makeUser('t451-nico', contractorOrg, false)).email);
});

afterAll(async () => {
  await pool.end();
});

// ── the reader: values, never formulas ───────────────────────────────────────

describe('the in-tree .xlsx reader (ADR-0059 decision 5)', () => {
  it('reads a formula as the RESULT Excel stored, never the formula', () => {
    const bytes = testWorkbook([
      { name: 'S', rows: [['A', 'B'], [2, { formula: 'A2*10', result: 20 }], ['x', { formula: 'A3&"y"', result: 'xy' }]] },
    ]);
    const [sheet] = readXlsxCells(bytes)!;
    expect(sheet!.rows[1]![1]).toEqual({ kind: 'number', value: 20, text: '20' });
    expect(sheet!.rows[2]![1]).toEqual({ kind: 'text', text: 'xy' });
    // the string view the plan import and corpus extraction use agrees
    expect(parseXlsxSheets(bytes)![0]!.rows[1]).toEqual(['2', '20']);
  });

  it('marks a formula nobody calculated and an error cell, rather than reading them as blank', () => {
    const [sheet] = readXlsxCells(
      testWorkbook([{ name: 'S', rows: [['A', 'B'], [{ formula: 'SUM(A1:A9)' }, { error: '#DIV/0!' }]] }]),
    )!;
    expect(sheet!.rows[1]![0]).toEqual({ kind: 'uncalculated' });
    expect(sheet!.rows[1]![1]).toEqual({ kind: 'error', text: '#DIV/0!' });
  });

  it('keeps Excel row numbers across omitted blank rows, and booleans as booleans', () => {
    const [sheet] = readXlsxCells(testWorkbook([{ name: 'S', rows: [['A', 'B'], null, [true, false]] }]))!;
    expect(sheet!.rows[1]).toEqual([]);
    expect(sheet!.rows[2]![0]).toEqual({ kind: 'boolean', value: true, text: '1' });
  });
});

// ── the regions: header-topped blocks, never loose cells ─────────────────────

describe('dates and the workbook’s own day count', () => {
  it('reads a date cell against 1900, or 1904 when the workbook says so', () => {
    const columns = [{ key: 'day', label: 'Day', type: 'date' as const, required: true }];
    const mapping = [{ header: 'Day', columnKey: 'day' }];
    const sheets = readXlsxCells(testWorkbook([{ name: 'S', rows: [['Day', 'x'], [46326, 'a']] }]))!;
    expect(rowsFromWorkbook(sheets, { sheet: 'S', mapping }, columns)).toEqual({ ok: true, rows: [{ day: '2026-10-31' }] });
    expect(rowsFromWorkbook(sheets, { sheet: 'S', mapping }, columns, true)).toEqual({ ok: true, rows: [{ day: '2030-11-01' }] });
    // the workbook says which, and the reader hears it
    expect(usesDate1904(testWorkbook([{ name: 'S', rows: [] }], { date1904: true }))).toBe(true);
    expect(usesDate1904(testWorkbook([{ name: 'S', rows: [] }]))).toBe(false);
    const typed = readXlsxCells(testWorkbook([{ name: 'S', rows: [['Day', 'x'], ['31/10/2026', 'a']] }]))!;
    const refused = rowsFromWorkbook(typed, { sheet: 'S', mapping }, columns);
    expect(!refused.ok && refused.reason).toContain('holds something Infora cannot read as a date without guessing');
  });
});

describe('finding table-shaped regions', () => {
  it('finds the block under a title line, and two blocks side by side as two', () => {
    const regions = findRegions(
      readXlsxCells(
        testWorkbook([
          {
            name: 'Costs',
            rows: [
              ['Wrenfield cost report'],
              null,
              ['Month', 'Cost', null, 'Package', 'Lead'],
              ['Oct', 100, null, 'Civils', 'Bella'],
              ['Nov', 120, null, 'M&E', 'Colm'],
              null,
              ['loose note'],
            ],
          },
        ]),
      )!,
    );
    expect(regions.map((r) => [r.headerRowNumber, r.headers, r.rowCount])).toEqual([
      [3, ['Month', 'Cost'], 2],
      [3, ['Package', 'Lead'], 2],
    ]);
    expect(regions[0]!.sample).toEqual([
      ['Oct', '100'],
      ['Nov', '120'],
    ]);
  });

  it('skips a short label row sitting directly on a wider header row', () => {
    const regions = findRegions(
      readXlsxCells(
        testWorkbook([
          {
            name: 'S',
            rows: [
              ['Project:', 'Wrenfield'],
              ['Month', 'Cost', 'Notes'],
              ['Oct', 5, 'ok'],
            ],
          },
        ]),
      )!,
    );
    expect(regions.map((r) => r.headers)).toEqual([['Month', 'Cost', 'Notes']]);
  });

  it('re-finds a region by its headings after it MOVED, and names the heading when it vanished', () => {
    const columns = [
      { key: 'month', label: 'Month', type: 'text' as const, required: true },
      { key: 'cost', label: 'Cost', type: 'number' as const, required: true },
    ];
    const moved = readXlsxCells(
      testWorkbook([{ name: 'Costs', rows: [null, null, null, [null, 'Notes', 'Cost (£)', 'Month'], [null, 'x', 7, 'Dec']] }]),
    )!;
    expect(rowsFromWorkbook(moved, { sheet: 'Costs', mapping: MAPPING }, columns)).toEqual({
      ok: true,
      rows: [{ month: 'Dec', cost: 7 }],
    });
    const renamed = readXlsxCells(testWorkbook([{ name: 'Costs', rows: [['Month', 'Spend'], ['Dec', 7]] }]))!;
    const failed = rowsFromWorkbook(renamed, { sheet: 'Costs', mapping: MAPPING }, columns);
    expect(failed.ok).toBe(false);
    expect(!failed.ok && failed.reason).toContain('“Cost (£)” is no longer on this sheet');
  });
});

// ── the Done-when, over HTTP, as each party ──────────────────────────────────

describe('replacing the source file refills the table', () => {
  it('lands the uploader’s rows as submitted, supersedes the prior import, and keeps the wall', async () => {
    const { appId, tableId } = await newTable(true);
    // the COLLEAGUE uploads the contractor's cost report; the builder, a
    // different person in the same firm, attaches it
    const documentId = await upload(
      colleagueCookie,
      costReport([
        ['Oct', 100, 'first month'],
        ['Nov', { formula: 'B4*1.2', result: 120 }, ''],
      ]),
      'cost-report.xlsx',
    );

    // the builder sees the spreadsheet among the documents they can open, and
    // the region under its title line
    const docs = (await (await get(builderCookie, `/apps/${appId}/source-documents`)).json()) as ListSourceDocumentsResponse;
    expect(docs.items).toContainEqual({ kind: 'sandbox', id: documentId, title: 'cost-report', version: 'v0.1' });
    const regions = (await (
      await get(builderCookie, `/apps/${appId}/source-documents/regions?sandboxDocumentId=${documentId}`)
    ).json()) as ListSourceRegionsResponse;
    expect(regions.regions).toEqual([
      expect.objectContaining({ sheet: 'Costs', headerRowNumber: 3, headers: ['Month', 'Cost (£)', 'Notes'], rowCount: 2 }),
    ]);

    // attaching runs the first import: the rows are the UPLOADER's — the
    // colleague, never the builder who configured the source
    const attached = await attach(builderCookie, tableId, documentId);
    expect(attached.status).toBe(201);
    const source = ((await attached.json()) as AppTableSourceResponse).source!;
    expect(source.reflectsVersion).toBe('v0.1');
    expect(source.lastImport).toEqual(
      expect.objectContaining({ succeeded: true, outcome: 'Imported 2 rows from v0.1, submitted for acceptance.' }),
    );
    expect(source.configuredByName).toBe('t451-bella');
    const first = await rows(builderCookie, tableId);
    expect(first.map((r) => [r.values, r.state, r.enteredByName, r.organisationId])).toEqual([
      [{ month: 'Oct', cost: 100 }, 'submitted', 't451-colm', contractorOrg],
      [{ month: 'Nov', cost: 120 }, 'submitted', 't451-colm', contractorOrg],
    ]);
    const [stored] = await db.select().from(s.appRows).where(eq(s.appRows.id, first[0]!.id));
    expect(stored!.enteredByParticipantId).toBe(colleagueParticipant);
    expect(stored!.enteredByParticipantId).not.toBe(builderParticipant);

    // the client accepts October
    const accepted = await post(ownerCookie, `/app-rows/${first[0]!.id}/decision`, { decision: 'accept' });
    expect(accepted.status).toBe(200);

    // next month: the colleague replaces the file. The table refills on the
    // version landing — nobody touches the app
    const replaced = await replaceFile(
      colleagueCookie,
      documentId,
      costReport([
        ['Oct', 100, ''],
        ['Nov', 125, 'corrected'],
        ['Dec', 90, ''],
      ]),
    );
    expect(replaced.status).toBe(200);

    const after = await rows(colleagueCookie, tableId);
    const live = after.filter((r) => r.state === 'submitted');
    expect(live.map((r) => r.values)).toEqual([
      { month: 'Oct', cost: 100 },
      { month: 'Nov', cost: 125 },
      { month: 'Dec', cost: 90 },
    ]);
    // the previous import is superseded — the accepted row keeps its decider
    // (0067's carve-out), the undecided one simply moves aside
    const old = after.filter((r) => first.some((f) => f.id === r.id));
    expect(old.map((r) => [r.state, r.decidedByName])).toEqual([
      ['superseded', 't451-rhoda'],
      ['superseded', null],
    ]);
    const receipt = (await sourceOf(builderCookie, tableId))!;
    expect(receipt.reflectsVersion).toBe('v0.2');
    expect(receipt.lastImport!.outcome).toBe(
      'Imported 3 rows from v0.2, submitted for acceptance. The 2 rows from the previous import were superseded.',
    );

    // the wall, as each party: the owner reads the submitted rows; the peer
    // firm, inside the app's scope but not shared the table, reads nothing
    expect((await rows(ownerCookie, tableId)).filter((r) => r.state === 'submitted')).toHaveLength(3);
    expect(await rows(peerCookie, tableId)).toEqual([]);
  });

  it('lands stateless rows on a table with no acceptance step, and RETIRES the previous import', async () => {
    const { tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, '']]), 'plain.xlsx');
    expect((await attach(builderCookie, tableId, documentId)).status).toBe(201);
    const [firstRow] = await rows(builderCookie, tableId);
    expect(firstRow!.state).toBeNull();
    await replaceFile(colleagueCookie, documentId, costReport([['Oct', 2, '']]));
    const after = await rows(builderCookie, tableId);
    expect(after.map((r) => [r.values, r.retiredAt === null])).toEqual([
      [{ month: 'Oct', cost: 1 }, false],
      [{ month: 'Oct', cost: 2 }, true],
    ]);
    const [retired] = await db.select().from(s.appRows).where(eq(s.appRows.id, firstRow!.id));
    // retired by the person whose new version replaced it
    expect(retired!.retiredByParticipantId).toBe(colleagueParticipant);
  });

  it('never touches a row a person typed into the same table', async () => {
    const { tableId } = await newTable(false);
    const typed = await post(builderCookie, `/app-tables/${tableId}/rows`, { values: { month: 'Sep', cost: 9 } });
    expect(typed.status).toBe(201);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, '']]), 'mixed.xlsx');
    await attach(builderCookie, tableId, documentId);
    await replaceFile(colleagueCookie, documentId, costReport([['Oct', 2, '']]));
    const sep = (await rows(builderCookie, tableId)).find((r) => r.values['month'] === 'Sep')!;
    expect(sep.retiredAt).toBeNull();
  });
});

describe('a failed import changes no rows and says why, in words, in the stored receipt', () => {
  it('a vanished region', async () => {
    const { tableId } = await newTable(true);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 100, '']]), 'vanish.xlsx');
    await attach(builderCookie, tableId, documentId);
    const before = await rows(builderCookie, tableId);

    // the heading was renamed in this month's file
    const renamed = testWorkbook([{ name: 'Costs', rows: [['Month', 'Spend'], ['Nov', 5]] }]);
    expect((await replaceFile(colleagueCookie, documentId, renamed)).status).toBe(200);

    expect(await rows(builderCookie, tableId)).toEqual(before);
    const receipt = (await sourceOf(builderCookie, tableId))!;
    expect(receipt.reflectsVersion).toBe('v0.1');
    expect(receipt.lastImport).toEqual(
      expect.objectContaining({
        succeeded: false,
        outcome:
          'Nothing was imported from v0.2. On the sheet “Costs”: The table\'s heading “Cost (£)” is no longer on this sheet, so the table could not be found.',
      }),
    );
  });

  it('a column that cannot be read as its declared type, naming the row', async () => {
    const { tableId } = await newTable(true);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 100, '']]), 'tbc.xlsx');
    await attach(builderCookie, tableId, documentId);
    const before = await rows(builderCookie, tableId);
    await replaceFile(
      colleagueCookie,
      documentId,
      costReport([
        ['Oct', 100, ''],
        ['Nov', 'TBC', ''],
        ['Dec', { formula: 'B5/0' }, ''],
      ]),
    );
    expect(await rows(builderCookie, tableId)).toEqual(before);
    expect((await sourceOf(builderCookie, tableId))!.lastImport!.outcome).toBe(
      'Nothing was imported from v0.2. Row 5, “Cost (£)” holds something that is not a number. Row 6, “Cost (£)” holds a formula the spreadsheet never calculated — open the file in Excel and save it again.',
    );
  });

  it('refresh-now after the file is fixed brings the table level again', async () => {
    const { tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 'TBC', '']]), 'fix.xlsx');
    const attached = ((await (await attach(builderCookie, tableId, documentId)).json()) as AppTableSourceResponse).source!;
    expect(attached.lastImport!.succeeded).toBe(false);
    expect(await rows(builderCookie, tableId)).toEqual([]);
    // the fix lands as a version, which imports on its own; refresh-now then
    // re-derives the same version on request and supersedes its own rows
    await replaceFile(colleagueCookie, documentId, costReport([['Oct', 3, '']]));
    const refreshed = await post(builderCookie, `/app-tables/${tableId}/source/refresh`);
    expect(refreshed.status).toBe(200);
    const receipt = ((await refreshed.json()) as AppTableSourceResponse).source!;
    expect(receipt.lastImport!.outcome).toBe(
      'Imported 1 row from v0.2. The 1 row from the previous import was superseded.',
    );
    // the refresh was the BUILDER's click, and the rows still name the
    // UPLOADER (review 2026-10-18: pinned, having only been claimed). The list
    // keeps the retired prior import visible as history; one row is current.
    const landed = await rows(builderCookie, tableId);
    expect([...new Set(landed.map((r) => r.enteredByName))]).toEqual(['t451-colm']);
    expect(landed.filter((r) => r.retiredAt === null)).toHaveLength(1);
  });
});

describe('detaching stops imports and deletes nothing', () => {
  it('keeps the imported rows live and ignores the next version', async () => {
    const { tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, '']]), 'detach.xlsx');
    await attach(builderCookie, tableId, documentId);
    const imported = await rows(builderCookie, tableId);
    const detached = await post(builderCookie, `/app-tables/${tableId}/source/detachment`);
    expect(detached.status).toBe(200);
    expect(((await detached.json()) as AppTableSourceResponse).source!.detachedAt).not.toBeNull();
    await replaceFile(colleagueCookie, documentId, costReport([['Oct', 2, '']]));
    expect(await rows(builderCookie, tableId)).toEqual(imported);
    expect((await post(builderCookie, `/app-tables/${tableId}/source/refresh`)).status).toBe(404);
  });
});

describe('erasure reaches the configuration, and stops at the rows', () => {
  it('purging the source document deletes the source (it quotes the file) and keeps the imported rows', async () => {
    const { tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, '']]), 'purge.xlsx');
    await attach(builderCookie, tableId, documentId);
    const imported = await rows(builderCookie, tableId);
    const [colleagueUser] = await db
      .select({ id: s.participants.userId })
      .from(s.participants)
      .where(eq(s.participants.id, colleagueParticipant));
    const purged = await purgeSandboxDocument(db, {
      documentId,
      projectId,
      organisationId: contractorOrg,
      userId: colleagueUser!.id,
    });
    expect(purged).not.toBeNull();
    expect(await sourceOf(builderCookie, tableId)).toBeNull();
    expect(await rows(builderCookie, tableId)).toEqual(imported);
  });
});

describe('a table without a source behaves exactly as before', () => {
  it('a replaced file pointed at by nothing touches no table, and a sourceless table reads null', async () => {
    const { tableId } = await newTable(true);
    const typed = await post(builderCookie, `/app-tables/${tableId}/rows`, {
      values: { month: 'Sep', cost: 9 },
      submit: true,
    });
    expect(typed.status).toBe(201);
    const before = await rows(builderCookie, tableId);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, '']]), 'unrelated.xlsx');
    expect((await replaceFile(colleagueCookie, documentId, costReport([['Oct', 2, '']]))).status).toBe(200);
    expect(await rows(builderCookie, tableId)).toEqual(before);
    expect(await sourceOf(builderCookie, tableId)).toBeNull();
  });
});

describe('attaching is the builder’s act, gated by what they can read (decision 4)', () => {
  it('refuses a person who may not build, and a document the builder cannot open', async () => {
    const { appId, tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, '']]), 'gate.xlsx');
    // same firm, may not build: the source is not theirs to see or set
    expect((await attach(nonBuilderCookie, tableId, documentId)).status).toBe(404);
    expect((await get(nonBuilderCookie, `/app-tables/${tableId}/source`)).status).toBe(404);
    expect((await get(nonBuilderCookie, `/apps/${appId}/source-documents`)).status).toBe(404);
    // the peer firm's own spreadsheet sits behind the wall: the contractor's
    // builder cannot point at it, and is answered as if it does not exist
    const peerDoc = await upload(peerCookie, costReport([['Oct', 1, '']]), 'peer.xlsx');
    expect((await attach(builderCookie, tableId, peerDoc)).status).toBe(404);
    const docs = (await (await get(builderCookie, `/apps/${appId}/source-documents`)).json()) as ListSourceDocumentsResponse;
    expect(docs.items.map((d) => d.id)).not.toContain(peerDoc);
  });

  it('refuses a mapping that leaves a required column unfed, in words', async () => {
    const { tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, '']]), 'unfed.xlsx');
    const res = await post(builderCookie, `/app-tables/${tableId}/source`, {
      sandboxDocumentId: documentId,
      sheet: 'Costs',
      headerRow: ['Month', 'Cost (£)', 'Notes'],
      mapping: [{ header: 'Month', columnKey: 'month' }],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail: string }).detail).toBe(
      'the table\'s required column “Cost” is not fed by any heading.',
    );
  });

  it('T-489: maps the PUBLISHED columns only — a column added since the last publish cannot be fed by a spreadsheet until the publish', async () => {
    const { appId, tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, 'late']]), 'added.xlsx');
    expect((await post(builderCookie, `/app-tables/${tableId}/columns`, { key: 'notes', label: 'Notes', type: 'text' })).status).toBe(201);
    const mapping = [...MAPPING, { header: 'Notes', columnKey: 'notes' }];
    const body = { sandboxDocumentId: documentId, sheet: 'Costs', headerRow: ['Month', 'Cost (£)', 'Notes'], mapping };
    // before the publish: refused, in words, as a column the table does not have
    const refused = await post(builderCookie, `/app-tables/${tableId}/source`, body);
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { detail: string }).detail).toContain('the table has no column “notes”');
    // after the publish the column is part of the published copy and can be fed
    expect((await post(builderCookie, `/apps/${appId}/publish`)).status).toBe(200);
    expect((await post(builderCookie, `/app-tables/${tableId}/source`, body)).status).toBeLessThan(300);
    expect((await rows(ownerCookie, tableId)).some((row) => row.values['notes'] === 'late')).toBe(true);
  });

  it('the database refuses a source naming both a sandbox document and a library record', async () => {
    const { tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, '']]), 'both.xlsx');
    const [container] = await db
      .insert(s.containers)
      .values({ projectId, producingOrganisationId: contractorOrg, documentReference: `T451-BOTH-${stamp}` })
      .returning();
    await expect(
      db.insert(s.appTableSources).values({
        appTableId: tableId,
        sandboxDocumentId: documentId,
        containerId: container!.id,
        sheet: 'Costs',
        configuredByParticipantId: builderParticipant,
      }),
    ).rejects.toThrow();
  });
});

describe('a library record as the source', () => {
  /** A live library record whose current revision is a workbook, issued by the
   * named person (or by nobody, as bulk-loaded reference material is). */
  async function libraryRecord(bytes: Buffer, issuedBy: string | null) {
    const [container] = await db
      .insert(s.containers)
      .values({
        projectId,
        producingOrganisationId: contractorOrg,
        documentReference: `T451-LIB-${stamp}-${Math.random()}`,
        scope: 'library',
        inLibrary: true,
        state: 'live',
      })
      .returning();
    const [version] = await db
      .insert(s.versions)
      .values({ containerId: container!.id, versionReference: 'P01', content: '', isCurrent: true })
      .returning();
    await db.insert(s.renditions).values({
      versionId: version!.id,
      kind: 'native',
      format: 'xlsx',
      contentRef: putBlob(bytes, 'xlsx'),
    });
    if (issuedBy !== null) {
      await db.insert(s.transmittals).values({
        kind: 'non_review',
        containerId: container!.id,
        versionId: version!.id,
        senderParticipantId: issuedBy,
        recipientOrganisationIds: [ownerOrg],
      });
    }
    return container!.id;
  }

  it('names the person who ISSUED the revision, and refills on the next revision landing', async () => {
    const { appId, tableId } = await newTable(false);
    const containerId = await libraryRecord(costReport([['Oct', 10, '']]), colleagueParticipant);
    const docs = (await (await get(builderCookie, `/apps/${appId}/source-documents`)).json()) as ListSourceDocumentsResponse;
    expect(docs.items.find((d) => d.id === containerId)).toEqual(
      expect.objectContaining({ kind: 'library', version: 'P01' }),
    );
    const res = await post(builderCookie, `/app-tables/${tableId}/source`, {
      containerId,
      sheet: 'Costs',
      headerRow: ['Month', 'Cost (£)', 'Notes'],
      mapping: MAPPING,
    });
    expect(res.status).toBe(201);
    expect((await rows(builderCookie, tableId)).map((r) => [r.values, r.enteredByName])).toEqual([
      [{ month: 'Oct', cost: 10 }, 't451-colm'],
    ]);

    // the next revision lands (a promotion calls exactly this hook)
    await db.update(s.versions).set({ isCurrent: false }).where(eq(s.versions.containerId, containerId));
    const [p02] = await db
      .insert(s.versions)
      .values({ containerId, versionReference: 'P02', content: '', isCurrent: true })
      .returning();
    await db.insert(s.renditions).values({
      versionId: p02!.id,
      kind: 'native',
      format: 'xlsx',
      contentRef: putBlob(costReport([['Oct', 10, ''], ['Nov', 11, '']]), 'xlsx'),
    });
    await db.insert(s.transmittals).values({
      kind: 'non_review',
      containerId,
      versionId: p02!.id,
      senderParticipantId: builderParticipant,
      recipientOrganisationIds: [ownerOrg],
    });
    await importOnVersionLanding(db, { containerId });
    const live = (await rows(builderCookie, tableId)).filter((r) => r.retiredAt === null);
    expect(live.map((r) => [r.values['month'], r.enteredByName])).toEqual([
      ['Oct', 't451-bella'],
      ['Nov', 't451-bella'],
    ]);
    expect((await sourceOf(builderCookie, tableId))!.reflectsVersion).toBe('P02');
  });

  it('fails in words when nobody issued the revision — a figure nobody vouched for is not evidence', async () => {
    const { tableId } = await newTable(false);
    const containerId = await libraryRecord(costReport([['Oct', 10, '']]), null);
    const res = await post(builderCookie, `/app-tables/${tableId}/source`, {
      containerId,
      sheet: 'Costs',
      headerRow: ['Month', 'Cost (£)', 'Notes'],
      mapping: MAPPING,
    });
    // refused at attach, in words: a source that could never import is not
    // saved to fail on every version that lands
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail: string }).detail).toBe(
      'Infora cannot name who issued P01 of this record, so nobody could be named as entering its figures. Material loaded into the library in bulk has no issuer.',
    );
    expect(await sourceOf(builderCookie, tableId)).toBeNull();
    expect(await rows(builderCookie, tableId)).toEqual([]);
  });
});


// ── The review's guards (2026-10-18) ─────────────────────────────────────────

describe('the review’s guards (2026-10-18)', () => {
  it('refresh, detachment and the region list are no non-builder’s or peer’s either', async () => {
    const { appId, tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 1, '']]), 'guards.xlsx');
    await attach(builderCookie, tableId, documentId);
    for (const cookie of [nonBuilderCookie, peerCookie]) {
      expect((await post(cookie, `/app-tables/${tableId}/source/refresh`)).status).toBe(404);
      expect((await post(cookie, `/app-tables/${tableId}/source/detachment`)).status).toBe(404);
      expect(
        (await get(cookie, `/apps/${appId}/source-documents/regions?documentId=${documentId}`)).status,
      ).toBe(404);
    }
  });

  it('🔒 a text edit by somebody else does not make them the named enterer', async () => {
    // the enterer is the creator of the version that LANDED the current file,
    // not of the newest version row — a PATCH or restore also writes a version
    // row, and before this check whoever made one became the named enterer
    const { tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([['Oct', 9, '']]), 'drift.xlsx');
    await app.request(`/sandbox-documents/${documentId}`, {
      method: 'PATCH',
      headers: { cookie: nonBuilderCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'a stray note' }),
    });
    await attach(builderCookie, tableId, documentId);
    const landed = await rows(builderCookie, tableId);
    expect(landed.map((r) => r.enteredByName)).toEqual(['t451-colm']);
  });

  it('a rejected imported row is RETIRED by the next import — reason intact, counted no more', async () => {
    const { tableId } = await newTable(true);
    const documentId = await upload(
      colleagueCookie,
      costReport([
        ['Oct', 10, ''],
        ['Nov', 120, ''],
      ]),
      'reject.xlsx',
    );
    await attach(builderCookie, tableId, documentId);
    const first = await rows(ownerCookie, tableId);
    const nov = first.find((r) => r.values['month'] === 'Nov')!;
    expect(
      (await post(ownerCookie, `/app-rows/${nov.id}/decision`, { decision: 'reject', reason: 'Too high.' })).status,
    ).toBe(200);
    await replaceFile(
      colleagueCookie,
      documentId,
      costReport([
        ['Oct', 10, ''],
        ['Nov', 125, ''],
      ]),
    );
    const after = await rows(ownerCookie, tableId);
    // one CURRENT Nov, the corrected one; the rejected 120 stays readable as a
    // retired row (the list is the record) and counts in nothing
    const currentNov = after.filter((r) => r.values['month'] === 'Nov' && r.retiredAt === null);
    expect(currentNov).toHaveLength(1);
    expect(currentNov[0]!.values['cost']).toBe(125);
    const [stored] = await db.select().from(s.appRows).where(eq(s.appRows.id, nov.id));
    expect(stored!.retiredAt).not.toBeNull();
    expect(stored!.state).toBe('rejected');
    expect(stored!.rejectionReason).toBe('Too high.');
  });

  it('a table with no rows under its headings fails in words', async () => {
    const { tableId } = await newTable(false);
    const documentId = await upload(colleagueCookie, costReport([]), 'empty.xlsx');
    const res = await attach(builderCookie, tableId, documentId);
    const source = ((await res.json()) as AppTableSourceResponse).source!;
    expect(source.lastImport!.succeeded).toBe(false);
    expect(source.lastImport!.outcome).toContain('has no rows under its headings');
  });

  it('the 5,000-row ceiling holds at 5,001', async () => {
    const { tableId } = await newTable(false);
    const big = costReport(
      Array.from({ length: 5001 }, (_, i) => [`R${i}`, i, ''] as ['string', number, ''] & [string, number, string]),
    );
    const documentId = await upload(colleagueCookie, big, 'big.xlsx');
    const res = await attach(builderCookie, tableId, documentId);
    const source = ((await res.json()) as AppTableSourceResponse).source!;
    expect(source.lastImport!.succeeded).toBe(false);
    expect(source.lastImport!.outcome).toContain('5,000');
    expect(await rows(builderCookie, tableId)).toEqual([]);
  });
});
