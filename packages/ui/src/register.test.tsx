// T-460 — the register's grammar renders the class vocabulary the design
// rules style, and its controlled state round-trips: search, filter chips,
// the filtered note, the column chooser, selection with its bar, sort, pages.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Register } from './register';

type Row = { id: string; ref: string; title: string };
const rows: Row[] = [
  { id: 'a', ref: 'WA-001', title: 'Alpha' },
  { id: 'b', ref: 'WA-002', title: 'Beta' },
];
const columns = [
  { key: 'ref', label: 'Reference', render: (r: Row) => r.ref, sortable: true },
  { key: 'title', label: 'Title', render: (r: Row) => r.title, hideable: true },
];

describe('Register', () => {
  it('renders the table with its label, the search box and the rows', () => {
    const html = renderToStaticMarkup(
      <Register label="Library" columns={columns} rows={rows} rowKey={(r) => r.id} search={{ value: '', onChange: () => {} }} empty="Nothing" />,
    );
    expect(html).toContain('class="register"');
    expect(html).toContain('aria-label="Library"');
    expect(html).toContain('aria-label="Search Library"');
    expect(html).toContain('WA-001');
    expect(html).toContain('Beta');
    expect(html).not.toContain('register--filtered');
  });

  it('says when it is filtering, and shows each active filter as a removable chip', () => {
    const html = renderToStaticMarkup(
      <Register
        label="Library"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        search={{ value: 'WA', onChange: () => {} }}
        filters={{ active: [{ key: 'state', label: 'Live' }], onRemove: () => {} }}
        empty="Nothing"
      />,
    );
    expect(html).toContain('register--filtered');
    expect(html).toContain('Filtered');
    expect(html).toContain('Live ×');
  });

  it('hides a hideable column and never the first; shows the selection bar only with a selection', () => {
    const hiddenHtml = renderToStaticMarkup(
      <Register
        label="Library"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        hiddenColumns={{ value: ['title'], onChange: () => {} }}
        selection={{ selected: new Set(), onChange: () => {}, bar: () => <span>bulk</span> }}
        empty="Nothing"
      />,
    );
    expect(hiddenHtml).not.toContain('>Alpha<');
    expect(hiddenHtml).toContain('WA-001');
    expect(hiddenHtml).toContain('Choose columns');
    expect(hiddenHtml).not.toContain('register-bulk-bar');
    const selectedHtml = renderToStaticMarkup(
      <Register
        label="Library"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.ref}
        selection={{ selected: new Set(['a']), onChange: () => {}, bar: (ids) => <span>bulk {ids.length}</span> }}
        empty="Nothing"
      />,
    );
    expect(selectedHtml).toContain('aria-label="Select WA-001"');
    expect(selectedHtml).toContain('register-bulk-bar');
    expect(selectedHtml).toContain('1 selected');
    expect(selectedHtml).toContain('bulk 1');
    expect(selectedHtml).toContain('register-row--selected');
  });

  it('marks the sorted column for assistive technology and pages a long list', () => {
    const html = renderToStaticMarkup(
      <Register
        label="Library"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        sort={{ value: { key: 'ref', direction: 'desc' }, onChange: () => {} }}
        page={{ page: 2, pageSize: 50, total: 120, onPage: () => {} }}
        empty="Nothing"
      />,
    );
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('51–100 of 120');
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
  });

  // T-486 — a column heading sorts wherever a person clicks it. The button is
  // the whole cell (not just the word), which only the cell's class and the
  // stylesheet together can say; static markup shows the class on the cell, and
  // the stylesheet is read to see that the class makes the button fill it.
  it('makes a sortable heading one button that fills its cell', () => {
    const html = renderToStaticMarkup(
      <Register
        label="Library"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        sort={{ value: null, onChange: () => {} }}
        empty="Nothing"
      />,
    );
    // the sortable column's cell carries the class and holds the sort button
    expect(html).toMatch(/<th class="register-sortable"[^>]*><button type="button" class="register-sort">Reference/);
    // a column that cannot be sorted is a plain cell: no class, no button
    expect(html).toMatch(/<th[^>]*>Title<\/th>/);
    expect(html).not.toMatch(/<th class="register-sortable"[^>]*>Title/);
    // without a sort control no heading is a button at all
    const unsorted = renderToStaticMarkup(<Register label="Library" columns={columns} rows={rows} rowKey={(r) => r.id} empty="Nothing" />);
    expect(unsorted).not.toContain('register-sortable');
    expect(unsorted).not.toContain('register-sort"');

    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    const cell = /\n\.register-table thead th\.register-sortable \{([^}]*)\}/.exec(css)?.[1] ?? '';
    const button = /\n\.register-sortable \.register-sort \{([^}]*)\}/.exec(css)?.[1] ?? '';
    // the cell gives up its padding and the button takes the table's own
    expect(cell).toContain('padding: 0');
    expect(button).toContain('display: block');
    expect(button).toContain('width: 100%');
    expect(button).toContain('padding: var(--table-cell-padding)');
    expect(button).toContain('text-align: inherit');
  });

  it('shows skeleton rows while loading and the empty sentence when there is nothing', () => {
    const loading = renderToStaticMarkup(<Register label="Library" columns={columns} rows={null} rowKey={(r) => r.id} empty="Nothing here" />);
    expect(loading).toContain('class="skeleton"');
    const empty = renderToStaticMarkup(<Register label="Library" columns={columns} rows={[]} rowKey={(r) => r.id} empty="Nothing here" />);
    expect(empty).toContain('Nothing here');
  });
});
