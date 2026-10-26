// T-488 — the app builder's last walk defects, as web units: charts that read
// cleanly (labels that do not collide, a value scale, distinct pie colours, £
// and thousands separators), date and number boxes, and the column matcher.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CHART_INK,
  ScreenBlock,
  formatFigure,
  isMoneyLabel,
  labelCentre,
  labelStride,
  pieSlices,
  valueTicks,
} from './screens/app-screen';
import { AppTableRows } from './screens/app-rows';
import { headingWords, suggestMapping } from './screens/heading-match';
import { inputTypeFor } from './screens/shared';
import { dispositionFilename } from './api';

const table = {
  id: 't1',
  appId: 'a1',
  name: 'Costs',
  kind: 'data',
  hasAcceptance: false,
  retiredAt: null,
  shares: [],
  columns: [
    { key: 'month', label: 'Month', type: 'text', required: true },
    { key: 'cost', label: 'Cost (£)', type: 'number', required: true },
    { key: 'tonnes', label: 'Waste (tonnes)', type: 'number', required: false },
    { key: 'due', label: 'Due', type: 'date', required: false },
  ],
};

const rowOf = (values: Record<string, unknown>, n: number) => ({
  id: `r${n}`,
  appTableId: 't1',
  organisationId: 'o1',
  organisationName: 'Calder & Hale',
  enteredByName: 'Eleanor Price',
  enteredAt: '2026-09-01T09:00:00.000Z',
  state: null,
  decidedByName: null,
  decidedAt: null,
  rejectionReason: null,
  supersedesRowId: null,
  supersededByRowId: null,
  previousVersionId: null,
  retiredAt: null,
  values,
  mayEdit: false,
  maySubmit: false,
  mayDecide: false,
  mayCorrect: false,
  mayRetire: false,
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const yearOfRows = MONTHS.map((month, i) => rowOf({ month: `${month} 2026`, cost: 1200 * (i + 1) + 0.5, tonnes: i + 1 }, i));

const draw = (block: unknown, rows: unknown[] = yearOfRows) =>
  renderToStaticMarkup(
    <ScreenBlock block={block as never} table={table as never} rows={rows as never} onEnter={() => {}} pending={false} />,
  );

describe('figures print with thousands separators, and £ where the column says pounds (T-488, defect 16)', () => {
  it('formats with en-GB separators, at most two decimals, and no trailing zeroes', () => {
    expect(formatFigure(12400)).toBe('12,400');
    expect(formatFigure(1234567.891)).toBe('1,234,567.89');
    expect(formatFigure(12.4)).toBe('12.4');
    expect(formatFigure(0)).toBe('0');
  });

  it('puts the £ in front, and the minus in front of the £', () => {
    expect(formatFigure(12400, true)).toBe('£12,400');
    expect(formatFigure(-1200.5, true)).toBe('-£1,200.5');
    expect(formatFigure(-0.001, true)).toBe('£0');
  });

  it('reads money from the column label alone: £, GBP or pounds, any case', () => {
    expect(isMoneyLabel('Cost (£)')).toBe(true);
    expect(isMoneyLabel('Spend GBP')).toBe(true);
    expect(isMoneyLabel('Cost in Pounds')).toBe(true);
    expect(isMoneyLabel('Waste (tonnes)')).toBe(false);
  });

  it('a total block shows £ and separators for a money column, and neither unit nor symbol for tonnes', () => {
    const money = draw({ kind: 'total', columnKey: 'cost', label: 'Spend so far' });
    expect(money).toContain('£93,606');
    const tonnes = draw({ kind: 'total', columnKey: 'tonnes', label: 'Waste so far' });
    expect(tonnes).toContain('78');
    expect(tonnes).not.toContain('£');
  });
});

describe('category labels never collide (T-488, defect 16)', () => {
  it('shows every label when they fit, every second or third when they do not', () => {
    expect(labelStride(['Jan', 'Feb', 'Mar'], 100)).toBe(1);
    // twelve "September 2026"-length labels in a 360-wide chart: about 28px a slot
    const long = Array.from({ length: 12 }, () => 'September 2026');
    expect(labelStride(long, 28)).toBeGreaterThanOrEqual(3);
    expect(labelStride(long, 28)).toBeLessThanOrEqual(5);
  });

  it('a bar chart of twelve long month names draws only some of them, and a value on some', () => {
    const html = draw({ kind: 'barChart', label: 'Cost by month', categoryColumn: 'month', valueColumn: 'cost' });
    const shown = MONTHS.filter((month) => new RegExp(`<text[^>]*>${month} 2026</text>`).test(html));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(12);
    // every bar still says what it is, for anyone who hovers
    expect(html).toContain('<title>December 2026: £14,400.5</title>');
    expect(html).toContain('£');
  });

  it('a bar chart of three short labels draws them all', () => {
    const html = draw(
      { kind: 'barChart', label: 'Cost', categoryColumn: 'month', valueColumn: 'cost' },
      [rowOf({ month: 'May 2026', cost: 1 }, 1), rowOf({ month: 'Jun 2026', cost: 2 }, 2), rowOf({ month: 'Jul 2026', cost: 3 }, 3)],
    );
    for (const month of ['May 2026', 'Jun 2026', 'Jul 2026']) expect(html).toContain(`>${month}</text>`);
  });
});

describe('an edge label is kept inside the drawing (T-488)', () => {
  it('nudges a label near either edge inwards by what it would have overhung, and leaves a middle one alone', () => {
    // "January 2026" is about 72px wide at 10px: centred at 30 it would start at -6
    expect(labelCentre(30, 'January 2026', 0, 360)).toBe(36);
    expect(labelCentre(340, 'December 2026', 0, 360)).toBeCloseTo(360 - (13 * 6) / 2);
    expect(labelCentre(180, 'June 2026', 0, 360)).toBe(180);
  });

  it('every label of a drawn bar chart sits inside the 360-wide drawing', () => {
    const html = draw({ kind: 'barChart', label: 'Cost by month', categoryColumn: 'month', valueColumn: 'cost' });
    for (const match of html.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="middle"[^>]*>([^<]+)<\/text>/g)) {
      const half = (match[2]!.length * 6) / 2;
      expect(Number(match[1]) - half).toBeGreaterThanOrEqual(-0.01);
      expect(Number(match[1]) + half).toBeLessThanOrEqual(360.01);
    }
  });
});

describe('a line chart draws a value scale (T-488, defect 16)', () => {
  it('chooses three to five round ticks inside the range', () => {
    expect(valueTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(valueTicks(0, 14400.5).length).toBeGreaterThanOrEqual(3);
    expect(valueTicks(0, 14400.5).length).toBeLessThanOrEqual(5);
    for (const tick of valueTicks(-30, 70)) {
      expect(tick).toBeGreaterThanOrEqual(-30);
      expect(tick).toBeLessThanOrEqual(70);
    }
    expect(valueTicks(0, 0)).toEqual([0]);
  });

  it('draws gridlines and labelled values down the left, in £ for a money column', () => {
    const html = draw({ kind: 'lineChart', label: 'Cost over the year', categoryColumn: 'month', valueColumn: 'cost', showTrend: false });
    const labelled = html.match(/text-anchor="end"/g) ?? [];
    expect(labelled.length).toBeGreaterThanOrEqual(3);
    expect(labelled.length).toBeLessThanOrEqual(5);
    expect(html).toContain('>£0<');
    expect(html).toMatch(/>£\d{1,3},\d{3}</);
  });
});

describe('a pie never repeats a colour (T-488, defect 16)', () => {
  const slices = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `S${i + 1}`, value: n - i }));

  it('has eight distinct inks, all from design tokens', () => {
    expect(new Set(CHART_INK).size).toBe(8);
    for (const ink of CHART_INK) expect(ink).toMatch(/^var\(--chart-[1-8]\)$/);
  });

  it('keeps up to eight slices as they are', () => {
    expect(pieSlices(slices(8))).toHaveLength(8);
    expect(pieSlices(slices(3))).toEqual(slices(3));
  });

  it('groups the smallest into one Other slice past eight, keeping the largest in order', () => {
    const grouped = pieSlices(slices(11));
    expect(grouped).toHaveLength(8);
    expect(grouped.at(-1)).toEqual({ label: 'Other', value: 4 + 3 + 2 + 1 });
    expect(grouped.slice(0, 7).map((s) => s.label)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
  });

  it('the drawn pie of twelve months uses eight different fills', () => {
    const html = draw({ kind: 'pieChart', label: 'Share', categoryColumn: 'month', valueColumn: 'cost' });
    const fills = new Set([...html.matchAll(/<path[^>]*fill="(var\(--chart-\d\))"/g)].map((m) => m[1]));
    expect(fills.size).toBe(8);
    expect(html).toContain('Other —');
    expect(html).toContain('£');
  });
});

describe('date and number fields are date and number inputs (T-488, defect 15)', () => {
  it('maps a column type to an input type', () => {
    expect(inputTypeFor('number')).toBe('number');
    expect(inputTypeFor('date')).toBe('date');
    expect(inputTypeFor('text')).toBe('text');
    expect(inputTypeFor('boolean')).toBe('text');
  });

  it('the screen form draws a number box and a date box', () => {
    const html = draw({ kind: 'rowForm', columnKeys: ['month', 'cost', 'due'], submitLabel: 'Add' });
    expect(html).toMatch(/<input[^>]*type="number"/);
    expect(html).toMatch(/<input[^>]*type="date"/);
    expect(html).toMatch(/<input[^>]*type="text"/);
  });

  it('the row editor draws them too', () => {
    const html = renderToStaticMarkup(
      <AppTableRows table={table as never} appState="open" onChanged={() => {}} />,
    );
    expect(html.match(/type="number"/g)).toHaveLength(2);
    expect(html.match(/type="date"/g)).toHaveLength(1);
  });
});

describe('the column matcher pairs on words (T-488, defect 19)', () => {
  it('reads £ and GBP as pounds and drops the small words', () => {
    expect([...headingWords('Cost (£)')].sort()).toEqual(['cost', 'pounds']);
    expect([...headingWords('Cost in pounds')].sort()).toEqual(['cost', 'pounds']);
    expect([...headingWords('Spend GBP')].sort()).toEqual(['pounds', 'spend']);
    expect([...headingWords('Waste per the month')].sort()).toEqual(['month', 'waste']);
  });

  it('pairs "Cost (£)" with "Cost in pounds", "Month" with "Month", and leaves a non-match alone', () => {
    const columns = [
      { key: 'month', label: 'Month' },
      { key: 'cost', label: 'Cost in pounds' },
      { key: 'notes', label: 'Notes' },
    ];
    expect(suggestMapping(columns, ['Month', 'Cost (£)', 'Contractor'])).toEqual({ month: 'Month', cost: 'Cost (£)' });
  });

  it('pairs when one set holds the other, and by the column key', () => {
    expect(suggestMapping([{ key: 'waste', label: 'Waste to landfill (tonnes)' }], ['Waste'])).toEqual({ waste: 'Waste' });
    expect(suggestMapping([{ key: 'energy_kwh', label: 'Energy used' }], ['energy kwh'])).toEqual({ energy_kwh: 'energy kwh' });
  });

  it('never gives one heading to two columns: the closer column wins it, the other goes without', () => {
    const columns = [
      { key: 'cost', label: 'Cost' },
      { key: 'cost_gbp', label: 'Cost in pounds' },
    ];
    const mapping = suggestMapping(columns, ['Cost (£)']);
    expect(Object.values(mapping)).toEqual(['Cost (£)']);
    expect(mapping).toEqual({ cost_gbp: 'Cost (£)' });
  });

  it('honours a mapping already kept while its heading still exists', () => {
    expect(suggestMapping([{ key: 'cost', label: 'Cost' }], ['Cost', 'Total'], { cost: 'Total' })).toEqual({ cost: 'Total' });
    expect(suggestMapping([{ key: 'cost', label: 'Cost' }], ['Cost'], { cost: 'Gone' })).toEqual({ cost: 'Cost' });
  });
});

describe('the file name a download asks for (T-488)', () => {
  it('prefers the RFC 5987 name, then the plain one, then "download"', () => {
    expect(dispositionFilename(`attachment; filename="Cafe report.docx"; filename*=UTF-8''Caf%C3%A9%20report.docx`)).toBe('Café report.docx');
    expect(dispositionFilename('attachment; filename="plain.xlsx"')).toBe('plain.xlsx');
    expect(dispositionFilename(`attachment; filename="bad.docx"; filename*=UTF-8''%E0%A4%A`)).toBe('bad.docx');
    expect(dispositionFilename(null)).toBe('download');
  });
});
