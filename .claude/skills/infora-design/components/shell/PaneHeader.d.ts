import type { ReactNode } from 'react';

/** The per-pane header — replaces the old full-width topbar. */
export interface PaneHeaderProps {
  /** A breadcrumb location chip, e.g. "Project sandbox". */
  location?: ReactNode;
  title?: ReactNode;
  /** The pane's single primary action. */
  action?: ReactNode;
}
export function PaneHeader(props: PaneHeaderProps): JSX.Element;
