// T-460 — THE REGISTER: one table grammar for every list of documents.
//
// *In plain terms: the plan, the library, the sandbox's all-documents view
// and the review list are the same kind of thing — a register — and now look
// and work the same way: a search box at the top that says when it is
// filtering, filter chips you can take off one by one, a column chooser,
// sort on any column, a tick box on every row with an action bar that appears
// for the selection, saved views, and the pages of a long list. A row click
// opens the document; a row's tick selects it.*
//
// The component owns the GRAMMAR and nothing about data: the screen decides
// what the rows are, how they are fetched (T-459's paged reads), what the
// filter menu offers and what the bulk bar does. Every piece of state is
// controlled, so a screen can put it in the URL (a filtered view survives
// reload) or in a saved view (T-460's table) without the component knowing.
//
// Design rules §B: Table (elevation 1), Chip for the active filters, Dropdown
// for the column chooser, the bulk-action bar at elevation 2 above the table.
// No new hue: the filtered state is a border and a word, not a colour.
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Chip } from './primitives';
import { DropdownMenu, DropdownMenuItem } from './dropdown-menu';
import { Table } from './table';
import { Skeleton } from './skeleton';

export type RegisterColumn<Row> = {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right';
  /** a column the viewer may hide through the chooser; the first column never is */
  hideable?: boolean;
  width?: number | string;
};

export type RegisterSort = { key: string; direction: 'asc' | 'desc' };

/** one active filter, shown as a chip the viewer can take off */
export type RegisterFilterChip = { key: string; label: string };

export type RegisterProps<Row> = {
  /** names the table for a screen reader and the tests */
  label: string;
  columns: ReadonlyArray<RegisterColumn<Row>>;
  /** null while loading */
  rows: ReadonlyArray<Row> | null;
  rowKey: (row: Row) => string;
  /** what a row's tick box is called for a screen reader — the reference, not the id */
  rowLabel?: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  filters?: {
    active: ReadonlyArray<RegisterFilterChip>;
    onRemove: (key: string) => void;
    /** the "Add filter" menu's items, built by the screen */
    menu?: ReactNode;
  };
  sort?: { value: RegisterSort | null; onChange: (sort: RegisterSort | null) => void };
  /** which hideable columns are hidden; the chooser toggles them */
  hiddenColumns?: { value: ReadonlyArray<string>; onChange: (hidden: string[]) => void };
  selection?: {
    selected: ReadonlySet<string>;
    onChange: (selected: Set<string>) => void;
    /** the bulk-action bar for the current selection; rendered only when something is selected */
    bar: (selected: string[]) => ReactNode;
  };
  page?: { page: number; pageSize: number; total: number; onPage: (page: number) => void };
  /** a slot before the actions: the saved-views menu */
  views?: ReactNode;
  /** the toolbar's right-hand actions */
  actions?: ReactNode;
  empty: ReactNode;
};

export function Register<Row>(props: RegisterProps<Row>) {
  const searchId = useId();
  const hidden = new Set(props.hiddenColumns?.value ?? []);
  const columns = props.columns.filter((c) => !hidden.has(c.key));
  const filtered = (props.search?.value ?? '').trim() !== '' || (props.filters?.active.length ?? 0) > 0;
  const selected = props.selection?.selected ?? new Set<string>();
  const rows = props.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(props.rowKey(r)));
  const [chooserOpen, setChooserOpen] = useState(false);
  void chooserOpen;

  const toggleAll = () => {
    if (!props.selection) return;
    const next = new Set(selected);
    if (allSelected) rows.forEach((r) => next.delete(props.rowKey(r)));
    else rows.forEach((r) => next.add(props.rowKey(r)));
    props.selection.onChange(next);
  };
  const toggleOne = (key: string) => {
    if (!props.selection) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    props.selection.onChange(next);
  };
  const cycleSort = (key: string) => {
    if (!props.sort) return;
    const current = props.sort.value;
    if (current?.key !== key) props.sort.onChange({ key, direction: 'asc' });
    else if (current.direction === 'asc') props.sort.onChange({ key, direction: 'desc' });
    else props.sort.onChange(null);
  };

  const totalPages = props.page ? Math.max(1, Math.ceil(props.page.total / props.page.pageSize)) : 1;

  return (
    <div className={filtered ? 'register register--filtered' : 'register'}>
      <div className="register-toolbar" role="toolbar" aria-label={`${props.label} controls`}>
        {props.search && (
          <label className="register-search" htmlFor={searchId}>
            <span className="register-search-glyph" aria-hidden="true">
              ⌕
            </span>
            <input
              id={searchId}
              type="search"
              value={props.search.value}
              placeholder={props.search.placeholder ?? 'Search'}
              onChange={(e) => props.search!.onChange(e.target.value)}
              aria-label={`Search ${props.label}`}
            />
          </label>
        )}
        {props.filters && (
          <span className="register-filters" aria-label="Active filters">
            {props.filters.active.map((f) => (
              <Chip key={f.key} onClick={() => props.filters!.onRemove(f.key)} title="Remove this filter">
                {f.label} ×
              </Chip>
            ))}
            {props.filters.menu !== undefined && (
              <DropdownMenu
                align="start"
                fixed
                trigger={(toggle) => (
                  <Chip onClick={toggle} title="Add a filter">
                    + Filter
                  </Chip>
                )}
              >
                {props.filters.menu}
              </DropdownMenu>
            )}
          </span>
        )}
        {filtered && <span className="register-filtered-note">Filtered</span>}
        <span className="register-toolbar-spacer" />
        {props.views}
        {props.hiddenColumns && (
          <DropdownMenu
            align="end"
            fixed
            trigger={(toggle, open) => (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  setChooserOpen(!open);
                  toggle();
                }}
                aria-label="Choose columns"
              >
                Columns
              </Button>
            )}
          >
            {props.columns
              .filter((c) => c.hideable)
              .map((c) => (
                <DropdownMenuItem
                  key={c.key}
                  onClick={() => {
                    const next = new Set(props.hiddenColumns!.value);
                    if (next.has(c.key)) next.delete(c.key);
                    else next.add(c.key);
                    props.hiddenColumns!.onChange([...next]);
                  }}
                >
                  <span aria-hidden="true">{hidden.has(c.key) ? '○' : '●'}</span> {c.label}
                </DropdownMenuItem>
              ))}
          </DropdownMenu>
        )}
        {props.actions}
      </div>

      {props.selection && selected.size > 0 && (
        <div className="register-bulk-bar" role="region" aria-label="Selected rows">
          <span className="register-bulk-count">
            {selected.size} selected
          </span>
          {props.selection.bar([...selected])}
          <span className="register-toolbar-spacer" />
          <Button size="sm" variant="quiet" onClick={() => props.selection!.onChange(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Table className="register-table">
        <table aria-label={props.label}>
          <thead>
            <tr>
              {props.selection && (
                <th className="register-select">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all rows on this page" />
                </th>
              )}
              {columns.map((c) => {
                const active = props.sort?.value?.key === c.key ? props.sort.value.direction : null;
                return (
                  <th
                    key={c.key}
                    className={c.sortable && props.sort ? 'register-sortable' : undefined}
                    style={{ ...(c.width !== undefined && { width: c.width }), ...(c.align === 'right' && { textAlign: 'right' }) }}
                    aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined}
                  >
                    {c.sortable && props.sort ? (
                      <button type="button" className="register-sort" onClick={() => cycleSort(c.key)}>
                        {c.label}
                        <span className="register-sort-glyph" aria-hidden="true">
                          {active === 'asc' ? ' ▲' : active === 'desc' ? ' ▼' : ''}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {props.rows === null &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={columns.length + (props.selection ? 1 : 0)}>
                    <Skeleton height={18} />
                  </td>
                </tr>
              ))}
            {props.rows !== null && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (props.selection ? 1 : 0)} style={{ color: 'var(--text-muted)' }}>
                  {props.empty}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const key = props.rowKey(row);
              return (
                <tr
                  key={key}
                  className={selected.has(key) ? 'register-row register-row--selected' : 'register-row'}
                  onClick={props.onRowClick ? () => props.onRowClick!(row) : undefined}
                  style={props.onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {props.selection && (
                    <td className="register-select" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleOne(key)}
                        aria-label={`Select ${props.rowLabel ? props.rowLabel(row) : key}`}
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Table>

      {props.page && props.page.total > props.page.pageSize && (
        <div className="register-pager" role="navigation" aria-label={`${props.label} pages`}>
          <span className="register-pager-note">
            {(props.page.page - 1) * props.page.pageSize + 1}–{Math.min(props.page.page * props.page.pageSize, props.page.total)} of{' '}
            {props.page.total}
          </span>
          <Button size="sm" variant="quiet" disabled={props.page.page <= 1} onClick={() => props.page!.onPage(props.page!.page - 1)}>
            Previous
          </Button>
          <Button
            size="sm"
            variant="quiet"
            disabled={props.page.page >= totalPages}
            onClick={() => props.page!.onPage(props.page!.page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
