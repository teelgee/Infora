import type { ReactNode } from 'react';

/**
 * The action control. Exactly one `primary` per view or toolbar; everything
 * else is the default bordered variant.
 * @startingPoint section="Core" subtitle="Primary, secondary, quiet and danger actions with all interactive states" viewport="700x150"
 */
export interface ButtonProps {
  /** `primary` = the single main action (near-black fill). `quiet` = no border. `danger` = destructive, red label. Omit for the standard bordered button. */
  variant?: 'primary' | 'quiet' | 'danger';
  /** `sm` for dense contexts (table rows, inline actions). */
  size?: 'sm';
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  title?: string;
  /** Required for icon-only or repeated generic labels. */
  'aria-label'?: string;
  children: ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
