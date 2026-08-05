import type { ReactNode } from 'react';

export interface TableRow {
  id?: string;
  /** One entry per column. */
  cells: ReactNode[];
  /** Leading icon in the first cell — a file or folder glyph. */
  icon?: ReactNode;
  /** Nest this row one level (folder trees). */
  indent?: boolean;
}

/**
 * Dense list data: library documents, sandbox trees, review comments. Elevation
 * 1 — the containing pane provides the surface, so never shadow a row.
 * @startingPoint section="Content" subtitle="Hairline table with status badges and folder indents" viewport="700x260"
 */
export interface TableProps {
  columns: string[];
  rows: TableRow[];
  onRowClick?: (row: TableRow) => void;
}
export function Table(props: TableProps): JSX.Element;
