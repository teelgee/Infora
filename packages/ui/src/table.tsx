// component.table (design-rules.md §B) — dense/tabular data, elevation 1
// (flat, never a shadow). A thin scoping wrapper: screens keep writing plain
// <table>/<thead>/<tbody> JSX (custom cell content, row onClick, colSpan
// empty-states — all unchanged), the wrapper's class just puts the new
// component.table tokens in scope instead of the generic .card treatment.
import type { ReactNode } from 'react';

export function Table(props: { className?: string; children: ReactNode }) {
  return <div className={props.className ? `table ${props.className}` : 'table'}>{props.children}</div>;
}
