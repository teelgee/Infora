import type { ReactNode } from 'react';

/** A right-edge panel for source inspection and long detail. */
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}
export function Drawer(props: DrawerProps): JSX.Element | null;
