import type { ReactNode } from 'react';

/**
 * The ask bar: a filled soft-cornered block at popout elevation, no border.
 * Presentation only — see `ChatComposer` for the controlled-input version.
 * @startingPoint section="Core" subtitle="The ✦ ask bar with attach chips and send" viewport="700x150"
 */
export interface CommandBarProps {
  /** Trailing slot — attach chips and the send button. */
  hint?: ReactNode;
  onClick?: () => void;
  /** The placeholder prompt. */
  children: ReactNode;
}
export function CommandBar(props: CommandBarProps): JSX.Element;
