import type { ReactNode } from 'react';

/**
 * A white content pane floating on the frame at elevation 2. `canvas` fills the
 * remaining width; `panel` is the fixed 308px side column.
 */
export interface PaneProps {
  variant?: 'canvas' | 'panel';
  /** Overrides the default width — live drag-resize state, not a token. */
  width?: number | string;
  children: ReactNode;
}
export function Pane(props: PaneProps): JSX.Element;
