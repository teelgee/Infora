import type { ReactNode } from 'react';

/**
 * A pill-shaped attach-context token — Files, Sources, Library — sitting beside
 * a composer. Never use it for navigation or a primary action.
 */
export interface ChipProps {
  onClick?: () => void;
  /** Shown on hover; a disabled chip still shows its title via `cursor: help`. */
  title?: string;
  disabled?: boolean;
  children: ReactNode;
}
export function Chip(props: ChipProps): JSX.Element;
