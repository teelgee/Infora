import type { ReactNode } from 'react';

/** A 30px square icon-only button — send, close, overflow. */
export interface IconButtonProps {
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  /** Required — there is no visible label to read. */
  'aria-label': string;
  /** A single Lucide icon at 14px. */
  children: ReactNode;
}
export function IconButton(props: IconButtonProps): JSX.Element;
