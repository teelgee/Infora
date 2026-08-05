import type { ReactNode } from 'react';

/** Shows where an Ask run will write its draft. Removable. */
export interface OutChipProps {
  onRemove?: () => void;
  children: ReactNode;
}
export function OutChip(props: OutChipProps): JSX.Element;
