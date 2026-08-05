import type { ReactNode } from 'react';

/**
 * The nav rail: 216px, flush on the frame, no fill/radius/shadow/divider of its
 * own. Controls inside it use the `--surface-frame-*` fills, not the pane ones.
 */
export interface RailProps {
  /** 64px icon-only mode: labels hidden, glyphs centered, the anchor's `title` carries the label as a tooltip. */
  collapsed?: boolean;
  children: ReactNode;
}
export function Rail(props: RailProps): JSX.Element;
