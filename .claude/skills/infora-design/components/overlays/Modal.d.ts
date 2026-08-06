import type { ReactNode } from 'react';

/** A centred dialog above everything. Scrim closes it; so does the ✕. */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
  children: ReactNode;
}
export function Modal(props: ModalProps): JSX.Element | null;
