import type { ReactNode } from 'react';

/**
 * The canonical app shell. Two layers, not three: the `rail` sits flush on the
 * frame with no card of its own, and `children` (the content panes) float on it
 * at pane elevation, inset from the top/right/bottom edges only.
 * @startingPoint section="Shell" subtitle="Rail-as-background shell with floating content panes" viewport="1280x828"
 */
export interface AppFrameProps {
  /** A `<Rail>`. Rendered flush — never wrap it in a pane. */
  rail: ReactNode;
  width?: number | string;
  height?: number | string;
  /** One or two `<Pane>` elements. */
  children: ReactNode;
}
export function AppFrame(props: AppFrameProps): JSX.Element;
