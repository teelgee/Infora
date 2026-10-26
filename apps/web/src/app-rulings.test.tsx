// T-489 — the owner's rulings on apps, as web units (ADR-0056's fifth addendum):
// a chart grouped by the entering organisation, the dashboard's Accept and
// Reject (offered only where the server says), and what a figure counts.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ScreenBlock,
  ScreenRowTable,
  chartGroupingWords,
  decisionSubject,
  organisationSeries,
} from './screens/app-screen';
import { AppTableRows } from './screens/app-rows';
import { QueueItemLine } from './work-queue';

const table = {
  id: 't1',
  appId: 'a1',
  name: 'Monthly returns',
  kind: 'data',
  hasAcceptance: true,
  retiredAt: null,
  shares: [],
  columns: [
    { key: 'month', label: 'Month', type: 'text', required: true },
    { key: 'energy', label: 'Energy used (kWh)', type: 'number', required: true },
    { key: 'diesel', label: 'Diesel used', type: 'number', required: false, addedAt: '2026-10-26T10:00:00.000Z' },
  ],
};

const rowOf = (
  n: number,
  organisationName: string,
  month: string,
  energy: number,
  extra: Record<string, unknown> = {},
) => ({
  id: `r${n}`,
  appTableId: 't1',
  organisationId: `o-${organisationName}`,
  organisationName,
  enteredByName: 'Someone',
  enteredAt: '2026-10-01T09:00:00.000Z',
  state: 'accepted',
  decidedByName: null,
  decidedAt: null,
  rejectionReason: null,
  supersedesRowId: null,
  supersededByRowId: null,
  previousVersionId: null,
  retiredAt: null,
  values: { month, energy },
  mayEdit: false,
  maySubmit: false,
  mayDecide: false,
  mayCorrect: false,
  mayRetire: false,
  ...extra,
});

const draw = (block: unknown, rows: unknown[]) =>
  renderToStaticMarkup(
    <ScreenBlock block={block as never} table={table as never} rows={rows as never} onEnter={() => {}} pending={false} />,
  );

describe('a chart grouped by the entering organisation (ruling 1)', () => {
  const rows = [
    rowOf(1, 'Redgate Ecology', 'October 2026', 120),
    rowOf(2, 'Calder & Hale', 'October 2026', 80),
    rowOf(3, 'Redgate Ecology', 'November 2026', 30),
  ];

  it('adds the value column up per organisation, alphabetically', () => {
    expect(organisationSeries(rows as never, 'energy')).toEqual([
      { label: 'Calder & Hale', value: 80 },
      { label: 'Redgate Ecology', value: 150 },
    ]);
  });

  it('draws one bar per organisation, named, with no category column anywhere', () => {
    const html = draw({ kind: 'barChart', label: 'Energy by contractor', groupBy: 'organisation', valueColumn: 'energy' }, rows);
    expect(html).toContain('Calder &amp; Hale');
    expect(html).toContain('Redgate Ecology');
    expect(html).toContain('>150<');
    expect(html).toContain('>80<');
  });

  it('the builder’s panel words it “by organisation”, and a column-grouped chart by the column’s label', () => {
    expect(
      chartGroupingWords({ kind: 'barChart', label: 'x', groupBy: 'organisation', valueColumn: 'energy' }, table as never),
    ).toBe('by organisation');
    expect(
      chartGroupingWords({ kind: 'barChart', label: 'x', categoryColumn: 'month', valueColumn: 'energy' }, table as never),
    ).toBe('by Month');
  });
});

describe('what a figure counts (ruling 4)', () => {
  const rows = [
    rowOf(1, 'Redgate Ecology', 'October 2026', 100, { state: 'accepted' }),
    rowOf(2, 'Calder & Hale', 'October 2026', 40, { state: 'submitted' }),
    rowOf(3, 'Calder & Hale', 'November 2026', 25, { state: 'draft' }),
    rowOf(4, 'Redgate Ecology', 'November 2026', 999, { state: 'rejected', rejectionReason: 'No.' }),
    rowOf(5, 'Redgate Ecology', 'December 2026', 888, { state: 'superseded' }),
  ];

  it('a rejected row, and a replaced one, leave the total and the count', () => {
    const total = draw({ kind: 'total', columnKey: 'energy', label: 'Energy so far' }, rows);
    expect(total).toContain('<strong>165</strong>');
    expect(total).not.toContain('999');
    expect(draw({ kind: 'count', label: 'Returns in' }, rows)).toContain('<strong>3</strong>');
  });

  it('says how many are not yet accepted, in one plain line, under the total, the count and each chart', () => {
    for (const block of [
      { kind: 'total', columnKey: 'energy', label: 'Energy so far' },
      { kind: 'count', label: 'Returns in' },
      { kind: 'barChart', label: 'By month', categoryColumn: 'month', valueColumn: 'energy' },
      { kind: 'lineChart', label: 'By month', categoryColumn: 'month', valueColumn: 'energy', showTrend: false },
      { kind: 'pieChart', label: 'By firm', groupBy: 'organisation', valueColumn: 'energy' },
    ]) {
      expect(draw(block, rows)).toContain('Includes 2 not yet accepted.');
    }
  });

  it('says it in the singular for one, and not at all when nothing is waiting', () => {
    const one = [rowOf(1, 'A', 'October 2026', 1, { state: 'submitted' }), rowOf(2, 'A', 'November 2026', 1)];
    expect(draw({ kind: 'count', label: 'Returns in' }, one)).toContain('Includes 1 not yet accepted.');
    expect(draw({ kind: 'count', label: 'Returns in' }, [rowOf(1, 'A', 'October 2026', 1)])).not.toContain('not yet accepted');
    // a rejected row is not in the total, so it is not in the "not yet accepted" count either
    expect(draw({ kind: 'count', label: 'x' }, [rowOf(1, 'A', 'October 2026', 1, { state: 'rejected', rejectionReason: 'x' })])).not.toContain('not yet accepted');
  });

  it('the row table still lists the rejected row, with its state, as before', () => {
    const html = draw({ kind: 'rowTable', columnKeys: ['month', 'energy'], showOrganisation: true, showState: true }, rows);
    expect(html).toContain('Rejected');
    expect(html).toContain('999');
  });
});

describe('Accept and Reject on the dashboard’s row table (ruling 2)', () => {
  const block = { kind: 'rowTable' as const, columnKeys: ['month', 'energy'], showOrganisation: true, showState: true };
  const rows = [
    rowOf(1, 'Redgate Ecology', 'October 2026', 100, { state: 'submitted', mayDecide: true }),
    rowOf(2, 'Calder & Hale', 'October 2026', 40, { state: 'submitted', mayDecide: false }),
    rowOf(3, 'Calder & Hale', 'September 2026', 40, { state: 'accepted', mayDecide: false }),
  ];
  const label = (key: string) => key;
  const drawTable = (props: Record<string, unknown>) =>
    renderToStaticMarkup(<ScreenRowTable block={block} rows={rows as never} label={label} columns={table.columns as never} {...props} />);

  it('offers both buttons on the row the server flagged, labelled with the firm and the month — and on no other', () => {
    const html = drawTable({ onDecide: async () => {} });
    expect(html).toContain('aria-label="Accept the return from Redgate Ecology, October 2026"');
    expect(html).toContain('aria-label="Reject the return from Redgate Ecology, October 2026"');
    // the row the server did not flag, and the accepted one, get nothing
    expect(html).not.toContain('Calder &amp; Hale, October 2026"');
    expect((html.match(/>Accept</g) ?? []).length).toBe(1);
  });

  it('draws no Decision column at all when no row may be decided — the contractor’s view', () => {
    const contractorView = rows.map((row) => ({ ...row, mayDecide: false }));
    const html = renderToStaticMarkup(
      <ScreenRowTable block={block} rows={contractorView as never} label={label} columns={table.columns as never} onDecide={async () => {}} />,
    );
    expect(html).not.toContain('Decision');
    expect(html).not.toContain('>Accept<');
    expect(html).not.toContain('>Reject<');
  });

  it('offers nothing when the screen was given no way to decide (the screen decides nothing for itself)', () => {
    const html = drawTable({});
    expect(html).not.toContain('>Accept<');
  });

  it('asks why before a rejection can be sent: the reason box is open and the confirm button is disabled while it is empty', () => {
    const html = drawTable({ onDecide: async () => {}, startRejecting: 'r1' });
    expect(html).toContain('Why is the return from Redgate Ecology, October 2026 being rejected?');
    expect(html).toMatch(/aria-label="Confirm the rejection of the return from Redgate Ecology, October 2026"[^>]*disabled|disabled=""[^>]*aria-label="Confirm the rejection/);
  });

  it('names a row with no readable month by its firm alone', () => {
    expect(decisionSubject({ ...rows[0]!, values: { energy: 1 } } as never, table.columns as never)).toBe('row from Redgate Ecology');
    expect(decisionSubject(rows[0] as never, table.columns as never)).toBe('return from Redgate Ecology, October 2026');
  });
});

describe('a column added since the last publish (ruling 1)', () => {
  const columns = table.columns;
  it('the building screen’s opened table marks it and offers no input for it; the people using the app have none to see', () => {
    const asBuilder = renderToStaticMarkup(
      <AppTableRows table={{ ...table, columns } as never} appState="open" publishedAt="2026-10-01T00:00:00.000Z" onChanged={() => {}} />,
    );
    // no input is offered for the unpublished column (nothing is entered into a column the app's people cannot see)
    expect(asBuilder).toContain('Energy used (kWh)');
    expect(asBuilder).not.toContain('Diesel used');
    // once published after it was added, it is a column like any other
    const afterPublish = renderToStaticMarkup(
      <AppTableRows table={{ ...table, columns } as never} appState="open" publishedAt="2026-10-27T00:00:00.000Z" onChanged={() => {}} />,
    );
    expect(afterPublish).toContain('Diesel used');
  });
});

describe('a rejected return on the home page (ruling 3)', () => {
  it('shows the sentence and, under it, the client’s reason', () => {
    const html = renderToStaticMarkup(
      <QueueItemLine
        item={{
          kind: 'correct_app_row',
          label: 'Your October 2026 return was rejected — correct it',
          detail: 'Looks like a decimal slip.',
          href: 'apps/a1?table=t1&correct=r1',
          at: '2026-10-20T10:00:00.000Z',
        }}
        onOpen={() => {}}
      />,
    );
    expect(html).toContain('Your October 2026 return was rejected — correct it');
    expect(html).toContain('“Looks like a decimal slip.”');
  });
});
