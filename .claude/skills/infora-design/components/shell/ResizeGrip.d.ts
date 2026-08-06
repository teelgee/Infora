import type { PointerEvent } from 'react';

/**
 * The 12px drag gutter. It carries the whole gap between two panes — set the
 * containing flex row's `gap` to 0 or the gutter doubles.
 */
export interface ResizeGripProps {
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
}
export function ResizeGrip(props: ResizeGripProps): JSX.Element;
