import type { ReactNode } from 'react';

/**
 * An overlay menu at elevation 4. Placement rule: the parent must reserve space
 * or the menu must be portalled — it must never be clipped by an
 * `overflow: hidden` ancestor or collide with content below.
 * @startingPoint section="Overlays" subtitle="Open dropdown at overlay elevation" viewport="700x220"
 */
export interface DropdownMenuProps {
  trigger: ReactNode;
  open?: boolean;
  /** Horizontal anchor relative to the trigger. */
  align?: 'start' | 'end';
  children: ReactNode;
}
export function DropdownMenu(props: DropdownMenuProps): JSX.Element;
