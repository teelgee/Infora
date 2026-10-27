/**
 * Live DOM measurement for clip 04 (local helper). Reads `data-anchor`
 * elements in stage px every frame, so cursor tips and the prompt morph land
 * on the real controls even if a shared component's layout shifts. A pure
 * function of the DOM at this frame: deterministic.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useVideoConfig } from 'remotion';
import { STAGE } from '../../shared';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Stage-px rect of every `data-anchor` id in `ids` (absent ids are left out).
 * Render `<MeasureRoot ref={root} />` somewhere full-stage and unscaled.
 */
export function useAnchorRects(ids: string[], active: boolean) {
  const { width } = useVideoConfig();
  const root = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  useLayoutEffect(() => {
    if (!active || !root.current) return;
    const r = root.current.getBoundingClientRect();
    const k = r.width / width;
    if (!(k > 0)) return;
    const doc = root.current.ownerDocument;
    const next: Record<string, Rect> = {};
    for (const id of ids) {
      const el = doc.querySelector(`[data-anchor="${id}"]`);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      next[id] = { x: (b.left - r.left) / k, y: (b.top - r.top) / k, w: b.width / k, h: b.height / k };
    }
    if (JSON.stringify(next) !== JSON.stringify(rects)) setRects(next);
  });
  return { rects, root };
}

/**
 * A full-stage, pointer-less, explicitly sized layer whose ref anchors the
 * measurement. Explicit px (not AbsoluteFill): during a still render the
 * AbsoluteFill box can measure 0 wide on the first layout pass, which made
 * every derived rect NaN.
 */
export const MeasureRoot = React.forwardRef<HTMLDivElement>((_, ref) => (
  <div ref={ref} style={{ position: 'absolute', left: 0, top: 0, width: STAGE.w, height: STAGE.h, pointerEvents: 'none' }} />
));
MeasureRoot.displayName = 'MeasureRoot';
