import type { ReactNode } from 'react';

/** A row inside a `DropdownMenu`. */
export interface DropdownMenuItemProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}
export function DropdownMenuItem(props: DropdownMenuItemProps): JSX.Element;
