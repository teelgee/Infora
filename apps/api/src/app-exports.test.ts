// T-444 acceptance — the export, and its provenance stamp (ADR-0056 §8).
//
// **The three sentences of the ticket's done-when, each driven as a real
// party**: an export by a contractor contains only its organisation's rows, an
// export by the project owner contains all, and the file's stamp shows data and
// time only.
//
// The third is the one worth being blunt about. The stamp is asserted by
// reading the produced workbook back with the reader that already exists
// (`parseXlsxSheets`) and checking not only what IS on it but what is NOT: the
// exporter's name, their organisation, the word "agent", the word "drafted",
// the word "produced by". A stamp naming the app's agent as author would drift
// into exactly the label the owner declined, and a test that only checks the
// happy line would never notice it arriving.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppRecord, AppTableRecord, ListAppExportsResponse } from '@infora/contracts';
import { eq } from 'drizzle-orm';
import { createDb, hashPassword, schema as s } from '@infora/db';
import { buildApp } from './app';
import { fakeRouter } from './test-router';
import { addStandInScreen } from './app-test-support';
import { parseXlsxSheets } from './xlsx';
import { sheetFor, sheetName } from './app-exports';

const { db, pool } = createDb();
const app = buildApp({ db, sessionSecret: 'test-secret', router: fakeRouter() });

const stamp = Date.now();
const password = 'pw-t444';

let projectId: string;
let ownerOrg: string;
let builderOrg: string;
let peerOrg: string;
let ownerCookie: string;
let builderCookie: string;
let peerCookie: string;

async function makeUser(
  name: string,
  organisationId: string,
  options: { mayBuildApps?: boolean; elevated?: boolean } = {},
) {
  const email = `${name}-${stamp}@test.local`;
  const [user] = await db
    .insert(s.users)
    .values({ name, email, organisationId, orgRole: 'admin', mayBuildApps: options.mayBuildApps ?? false })
    .returning();
  await db.insert(s.userCredentials).values({ userId: user!.id, passwordHash: hashPassword(password) });
  await db
    .insert(s.participants)
    .values({ userId: user!.id, projectId, elevated: options.elevated ?? false });
  return email;
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

beforeAll(async () => {
  const orgs = await db
    .insert(s.organisations)
    .values([
      { name: `t444 client ${stamp}` },
      { name: `t444 builder ${stamp}` },
      { name: `t444 peer ${stamp}` },
    ])
    .returning();
  [ownerOrg, builderOrg, peerOrg] = orgs.map((o) => o.id) as [string, string, string];
  const [project] = await db
    .insert(s.projects)
    .values({ name: `t444 project ${stamp}`, ownerOrganisationId: ownerOrg })
    .returning();
  projectId = project!.id;
  await db.insert(s.memberships).values([
    { organisationId: ownerOrg, projectId, role: 'owner' },
    { organisationId: builderOrg, projectId, role: 'member' },
    { organisationId: peerOrg, projectId, role: 'member' },
  ]);
  ownerCookie = await session(
    await makeUser('t444-rhoda', ownerOrg, { mayBuildApps: true, elevated: true }),
  );
  builderCookie = await session(await makeUser('t444-bella', builderOrg, { mayBuildApps: true }));
  peerCookie = await session(await makeUser('t444-pia', peerOrg, { mayBuildApps: true }));
});

afterAll(async () => {
  await pool.end();
});

/** The returns app, open to all three, with one submitted row from each
 * consultancy — the fixture every assertion below reads through. */
async function returnsApp(): Promise<{ app: AppRecord; table: AppTableRecord }> {
  const created = (await (
    await post(builderCookie, `/projects/${projectId}/apps`, {
      name: `Sustainability returns ${stamp}`,
      organisationIds: [ownerOrg, peerOrg],
      participantIds: [],
    })
  ).json()) as AppRecord;
  const table = (await (
    await post(builderCookie, `/apps/${created.id}/tables`, {
      name: 'Monthly returns',
      columns: [
        { key: 'month', label: 'Month', type: 'text', required: true },
        { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true },
      ],
      kind: 'data',
      hasAcceptance: true,
    })
  ).json()) as AppTableRecord;
  await addStandInScreen((path, init) => app.request(path, init), builderCookie, created.id);
  await post(builderCookie, `/apps/${created.id}/publish`);
  await post(builderCookie, `/app-tables/${table.id}/rows`, {
    values: { month: 'August 2026', landfill: 12.4 },
    submit: true,
  });
  await post(peerCookie, `/app-tables/${table.id}/rows`, {
    values: { month: 'August 2026', landfill: 3.1 },
    submit: true,
  });
  return { app: created, table };
}

/** The workbook text without its ISO clock times ("2026-10-25T12:25:33.189Z"). */
const withoutClockTimes = (text: string) => text.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '');

async function exportSheets(cookie: string, appId: string) {
  const res = await post(cookie, `/apps/${appId}/exports`, { format: 'xlsx', appTableIds: [] });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-disposition')).toContain('.xlsx');
  return parseXlsxSheets(Buffer.from(await res.arrayBuffer()))!;
}

describe('an export contains only what the exporting person may see', () => {
  it('a contractor’s export holds its own organisation’s rows and nobody else’s', async () => {
    const { app: built } = await returnsApp();
    const sheets = await exportSheets(builderCookie, built.id);
    const data = sheets.find((sheet) => sheet.name === 'Monthly returns')!;
    // header + exactly one row
    expect(data.rows).toHaveLength(2);
    expect(data.rows[1]![0]).toBe(`t444 builder ${stamp}`);
    const text = JSON.stringify(sheets);
    expect(text).not.toContain(`t444 peer ${stamp}`);
    // the peer's figure, looked for in the WHOLE workbook — a leak into any sheet
    // must fail — after taking out the ISO clock times: the provenance sheet prints
    // "Data as of <ISO clock>", and at a moment like …:33.189Z that holds "3.1" —
    // it failed this once in four full parallel runs (T-486)
    expect(withoutClockTimes(text)).not.toContain('3.1');
  });

  it('the peer consultancy’s export holds its own, and not the other consultancy’s', async () => {
    const { app: built } = await returnsApp();
    const sheets = await exportSheets(peerCookie, built.id);
    const data = sheets.find((sheet) => sheet.name === 'Monthly returns')!;
    expect(data.rows).toHaveLength(2);
    expect(data.rows[1]![0]).toBe(`t444 peer ${stamp}`);
    // the whole workbook again, minus the clock times, for the reason given in the
    // test above ("…:12.4xxZ" holds "12.4")
    expect(withoutClockTimes(JSON.stringify(sheets))).not.toContain('12.4');
  });

  it('the project owner’s export holds all of them', async () => {
    const { app: built } = await returnsApp();
    const sheets = await exportSheets(ownerCookie, built.id);
    const data = sheets.find((sheet) => sheet.name === 'Monthly returns')!;
    expect(data.rows).toHaveLength(3);
    expect(data.rows.slice(1).map((row) => row[0]).sort()).toEqual(
      [`t444 builder ${stamp}`, `t444 peer ${stamp}`].sort(),
    );
  });

  it('a draft is in nobody’s export but its own organisation’s', async () => {
    const { app: built, table } = await returnsApp();
    await post(builderCookie, `/app-tables/${table.id}/rows`, {
      values: { month: 'September 2026', landfill: 99.9 },
      submit: false,
    });
    // the same narrowing the screen has: the client's dashboard says "no return
    // yet", and so does the client's spreadsheet
    expect(JSON.stringify(await exportSheets(ownerCookie, built.id))).not.toContain('99.9');
    expect(JSON.stringify(await exportSheets(builderCookie, built.id))).toContain('99.9');
  });

  it('an app nobody let you open exports nothing at all', async () => {
    const created = (await (
      await post(builderCookie, `/projects/${projectId}/apps`, {
        name: `t444 private ${stamp}`,
        organisationIds: [],
        participantIds: [],
      })
    ).json()) as AppRecord;
    // unpublished: open to its builders alone
    expect(
      (await post(ownerCookie, `/apps/${created.id}/exports`, { format: 'xlsx', appTableIds: [] }))
        .status,
    ).toBe(404);
  });
});

describe('the file’s stamp is provenance, not authorship', () => {
  it('shows what data it came from and when — and says nothing about who', async () => {
    const { app: built } = await returnsApp();
    const sheets = await exportSheets(builderCookie, built.id);
    const provenance = sheets.find((sheet) => sheet.name === 'Provenance')!;
    const flat = provenance.rows.map((row) => row.join(' | '));
    expect(flat[0]).toBe(`Produced from | Sustainability returns ${stamp}`);
    expect(flat[1]).toBe('Tables | Monthly returns');
    expect(flat[2]).toMatch(/^Data as of \| \d{4}-\d{2}-\d{2}T/);
    // and nothing else at all: three lines, no fourth
    expect(provenance.rows).toHaveLength(3);
  });

  it('🔒 names no producer, no exporter, and no agent — anywhere in the file', async () => {
    const { app: built } = await returnsApp();
    const whole = JSON.stringify(await exportSheets(builderCookie, built.id)).toLowerCase();
    for (const forbidden of [
      't444-bella', // the exporter
      'produced by',
      'prepared by',
      'author',
      'agent',
      'drafted',
      'generated by',
      'infora',
    ]) {
      expect(whole).not.toContain(forbidden);
    }
  });

  it('names no person on a row either — a row’s enterer stays out of the file', async () => {
    // `app_rows.entered_by_participant_id` is registered personal data whose
    // deletion path runs through its own organisation; a copy inside a
    // downloaded file would sit outside that path
    const { app: built } = await returnsApp();
    expect(JSON.stringify(await exportSheets(ownerCookie, built.id))).not.toContain('t444-bella');
  });
});

describe('the export is recorded', () => {
  it('writes an app_exports row with what it covered and when', async () => {
    const { app: built, table } = await returnsApp();
    await exportSheets(builderCookie, built.id);
    const body = (await (
      await get(builderCookie, `/apps/${built.id}/exports`)
    ).json()) as ListAppExportsResponse;
    expect(body.items).toHaveLength(1);
    const record = body.items[0]!;
    expect(record.rowsCovered).toBe(1);
    expect(record.tablesCovered).toEqual([table.id]);
    expect(record.exportedByName).toBe('t444-bella');
    expect(new Date(record.dataAsOf).getTime()).toBeGreaterThan(0);
  });

  it('records the owner’s wider export as wider, from the same read', async () => {
    const { app: built } = await returnsApp();
    await exportSheets(ownerCookie, built.id);
    const body = (await (
      await get(ownerCookie, `/apps/${built.id}/exports`)
    ).json()) as ListAppExportsResponse;
    expect(body.items[0]!.rowsCovered).toBe(2);
  });

  it('a firm reads its own exports; the project owner reads every one', async () => {
    const { app: built } = await returnsApp();
    await exportSheets(builderCookie, built.id);
    await exportSheets(peerCookie, built.id);
    const mine = (await (
      await get(builderCookie, `/apps/${built.id}/exports`)
    ).json()) as ListAppExportsResponse;
    expect(mine.items.map((i) => i.exportedByName)).toEqual(['t444-bella']);
    const theirs = (await (
      await get(peerCookie, `/apps/${built.id}/exports`)
    ).json()) as ListAppExportsResponse;
    expect(theirs.items.map((i) => i.exportedByName)).toEqual(['t444-pia']);
    // a rival firm learning that another firm exported twelve rows last
    // Tuesday learns something about the project it was never given
    const client = (await (
      await get(ownerCookie, `/apps/${built.id}/exports`)
    ).json()) as ListAppExportsResponse;
    expect(client.items.map((i) => i.exportedByName).sort()).toEqual(['t444-bella', 't444-pia']);
  });

  it('stores the bytes where file_ref points', async () => {
    const { app: built } = await returnsApp();
    await exportSheets(builderCookie, built.id);
    const [row] = await db
      .select({ fileRef: s.appExports.fileRef })
      .from(s.appExports)
      .where(eqAppId(built.id));
    expect(row!.fileRef.startsWith('blob:')).toBe(true);
  });
});

describe('an insight as Word', () => {
  it('carries the insight and the same data-and-time stamp', async () => {
    const created = (await (
      await post(builderCookie, `/projects/${projectId}/apps`, {
        name: `t444 insights ${stamp}`,
        organisationIds: [ownerOrg],
        participantIds: [],
      })
    ).json()) as AppRecord;
    const table = (await (
      await post(builderCookie, `/apps/${created.id}/tables`, {
        name: 'Insights',
        // T-443 — an insight table's columns are Infora's, not the builder's
        // (`INSIGHT_TABLE_COLUMNS`), so whatever is sent here is replaced; the
        // row below is written with the keys the platform declares
        columns: [{ key: 'summary', label: 'What the run found', type: 'text', required: false }],
        kind: 'insight',
        hasAcceptance: false,
      })
    ).json()) as AppTableRecord;
    expect(table.columns.map((column) => column.key)).toContain('insight');
    // T-487 — an app is opened only with a table people fill in and a screen,
    // and an insight table is neither: the app gets a plain data table too
    await post(builderCookie, `/apps/${created.id}/tables`, {
      name: 'Returns',
      columns: [{ key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number', required: true }],
      kind: 'data',
      hasAcceptance: false,
    });
    await addStandInScreen((path, init) => app.request(path, init), builderCookie, created.id);
    expect((await post(builderCookie, `/apps/${created.id}/publish`)).status).toBe(200);
    const entered = (await (
      await post(builderCookie, `/app-tables/${table.id}/rows`, {
        values: {
          as_at: new Date().toISOString(),
          insight: 'Two organisations returned in August; one did not.',
          rows_covered: 2,
          definitions_version: 1,
        },
        submit: false,
      })
    ).json()) as { row: { id: string } };

    const res = await post(builderCookie, `/apps/${created.id}/exports`, {
      format: 'docx',
      appRowId: entered.row.id,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('.docx');
    const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
    // a docx is a zip; the document part is deflated, so what is asserted here
    // is that the file is a real one and the record beside it is right
    expect(text.startsWith('PK')).toBe(true);
    const body = (await (
      await get(builderCookie, `/apps/${created.id}/exports`)
    ).json()) as ListAppExportsResponse;
    expect(body.items[0]!.rowsCovered).toBe(1);
    expect(body.items[0]!.tablesCovered).toEqual([table.id]);

    // and a row this person cannot read is not exportable by naming it
    expect(
      (await post(peerCookie, `/apps/${created.id}/exports`, {
        format: 'docx',
        appRowId: entered.row.id,
      })).status,
    ).toBe(404);
  });
});

/** Local helper — keeps the drizzle import out of the assertions above. */
function eqAppId(appId: string) {
  return eq(s.appExports.appId, appId);
}

// ── T-488 (walk defect 18) — the sheet is called what the table is, and says what
// became of each row ──────────────────────────────────────────────────────────

describe('sheet names are the tables’ own, numbered only on a collision (T-488)', () => {
  it('a table’s sheet carries no “(n)”; two tables of one name are told apart; nothing takes the Provenance sheet’s name', () => {
    const taken = new Set(['provenance']);
    expect(sheetName('Monthly returns', taken)).toBe('Monthly returns');
    expect(sheetName('Insights', taken)).toBe('Insights');
    expect(sheetName('Monthly returns', taken)).toBe('Monthly returns (2)');
    expect(sheetName('monthly RETURNS', taken)).toBe('monthly RETURNS (3)'); // Excel compares without regard to case
    expect(sheetName('Provenance', taken)).toBe('Provenance (2)');
  });

  it('keeps within Excel’s 31 characters, even when it has to number a long name', () => {
    const taken = new Set<string>();
    const long = 'A very long table name that goes past thirty-one characters';
    const first = sheetName(long, taken);
    const second = sheetName(long, taken);
    expect(first).toHaveLength(31);
    expect(second.length).toBeLessThanOrEqual(31);
    expect(second.endsWith(' (2)')).toBe(true);
    expect(first).not.toBe(second);
  });
});

describe('a table’s sheet carries the reason for a rejection and what became of earlier rows (T-488)', () => {
  const columns = [
    { key: 'month', label: 'Month', type: 'text' as const, required: true },
    { key: 'landfill', label: 'Waste to landfill (tonnes)', type: 'number' as const, required: true },
  ];
  const row = (over: Record<string, unknown>) =>
    ({
      organisationName: 'Calder & Hale',
      values: { month: 'October 2026', landfill: 4.6 },
      state: 'submitted',
      rejectionReason: null,
      supersededByRowId: null,
      retiredAt: null,
      ...over,
    }) as never;

  it('an acceptance table: a State column in the screen’s words, and the rejection reason beside it', () => {
    const sheet = sheetFor(
      'Monthly returns',
      new Set(),
      columns,
      [
        row({ state: 'accepted' }),
        row({ state: 'rejected', rejectionReason: 'Looks like a decimal slip.', supersededByRowId: 'next' }),
        row({ state: 'draft' }),
        row({ state: 'superseded' }),
        row({ state: 'accepted', retiredAt: '2026-10-01T00:00:00.000Z' }),
      ],
      true,
    );
    expect(sheet.name).toBe('Monthly returns');
    expect(sheet.rows[0]).toEqual(['Organisation', 'Month', 'Waste to landfill (tonnes)', 'State', 'Reason for rejection']);
    expect(sheet.rows.slice(1).map((line) => [line[3], line[4]])).toEqual([
      ['Accepted', null],
      ['Rejected · replaced', 'Looks like a decimal slip.'],
      ['Draft', null],
      ['Replaced', null],
      ['Retired', null],
    ]);
  });

  it('a table with no acceptance step gains a State column only when some row is no longer current', () => {
    const current = sheetFor('Costs', new Set(), columns, [row({ state: null })], false);
    expect(current.rows[0]).toEqual(['Organisation', 'Month', 'Waste to landfill (tonnes)']);
    const withHistory = sheetFor(
      'Costs',
      new Set(),
      columns,
      [row({ state: null, retiredAt: '2026-10-01T00:00:00.000Z' }), row({ state: null })],
      false,
    );
    expect(withHistory.rows[0]).toEqual(['Organisation', 'Month', 'Waste to landfill (tonnes)', 'State']);
    expect(withHistory.rows.slice(1).map((line) => line[3])).toEqual(['Retired', null]);
  });
});

describe('the exported workbook, end to end (T-488)', () => {
  it('names the sheet “Monthly returns”, and a rejected return’s reason is in the file for the people who may read it', async () => {
    const { app: built, table } = await returnsApp();
    const rows = (await (await get(ownerCookie, `/app-tables/${table.id}/rows`)).json()) as {
      items: Array<{ id: string; organisationName: string }>;
    };
    const target = rows.items.find((item) => item.organisationName === `t444 builder ${stamp}`)!;
    const rejected = await post(ownerCookie, `/app-rows/${target.id}/decision`, {
      decision: 'reject',
      reason: 'Decimal slip — please check the tonnage.',
    });
    expect(rejected.status).toBe(200);

    const asOwner = await exportSheets(ownerCookie, built.id);
    expect(asOwner.map((sheet) => sheet.name)).toEqual(['Monthly returns', 'Provenance']);
    const data = asOwner[0]!;
    expect(data.rows[0]).toContain('State');
    expect(data.rows[0]).toContain('Reason for rejection');
    expect(JSON.stringify(data.rows)).toContain('Decimal slip — please check the tonnage.');
    expect(JSON.stringify(data.rows)).toContain('Rejected');

    // the peer firm, whose own row was not rejected, gets no such reason — it
    // never could read the other firm's row
    const asPeer = await exportSheets(peerCookie, built.id);
    expect(JSON.stringify(asPeer)).not.toContain('Decimal slip');
  });
});
