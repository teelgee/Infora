// T-460 — the register's grammar renders the class vocabulary the design
// rules style, and its controlled state round-trips: search, filter chips,
// the filtered note, the column chooser, selection with its bar, sort, pages.
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
        selection={{ selected: new Set(['a']), onChange: () => {}, bar: (ids) => <span>bulk {ids.length}</span> }}
        empty="Nothing"
      />,
    );
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

  it('shows skeleton rows while loading and the empty sentence when there is nothing', () => {
    const loading = renderToStaticMarkup(<Register label="Library" columns={columns} rows={null} rowKey={(r) => r.id} empty="Nothing here" />);
    expect(loading).toContain('class="skeleton"');
    const empty = renderToStaticMarkup(<Register label="Library" columns={columns} rows={[]} rowKey={(r) => r.id} empty="Nothing here" />);
    expect(empty).toContain('Nothing here');
  });
});
