/** Collapses the nav rail or a side panel. */
export interface CollapseToggleProps {
  direction?: 'left' | 'right';
  onClick?: () => void;
  /** Accessible name, e.g. "Collapse sidebar". */
  label: string;
}
export function CollapseToggle(props: CollapseToggleProps): JSX.Element;
