/**
 * The walkthrough cursor (master-plan §2.10). Screen-space, outside the camera,
 * but authored in native points so it rides with the camera.
 *
 * Path keys give the ARRIVAL frame at each point. The departure is computed
 * from the travel-time rule T = clamp(15, 10 + d / 45, 27) f (d = screen px),
 * along a slight arc (6% of d, perpendicular, one side per video). A `linear`
 * key is a drag (text selection): 20 px/frame, straight.
 *
 * Clicks: arrive, dwell 8 f, click (scale 1 → 0.88 → 1 over 6 f, ring 0 → 44 px
 * over 12 f), dwell 6 f before the next move. The UI should respond at
 * click + 2 f. Shapes switch 4 f before arrival.
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { appear, C, ease, type F } from '../../shared';
import { useCameraKeys, toScreen } from './context';
import type { Pt, ScreenPt, WindowId, WtCameraKey } from './geometry';

export type CursorShape = 'arrow' | 'hand' | 'ibeam';

export interface CursorKey {
  /** Arrival frame at `at`. The first key is where the cursor starts. */
  f: F;
  at: Pt;
  /** Shape from 4 f before arrival (default: the previous key's, else arrow). */
  shape?: CursorShape;
  /** Travel to this key in a straight line at 20 px/f (a drag). */
  linear?: boolean;
}

export interface WtCursorProps {
  path: CursorKey[];
  clicks?: F[];
  /** Press-and-hold intervals (text selection): pressed scale, ring at press. */
  drags?: Array<{ from: F; to: F }>;
  /** Fade in over 6 f from here. */
  showFrom: F;
  /** Fade out over 6 f from here. */
  hideAfter?: F;
  /** Idle gaps: fade out over 6 f at a; fade back in over the 10 f before b. */
  idle?: Array<[F, F]>;
  window?: WindowId;
  /** Which side the travel arc bows to (keep one per video). */
  arc?: 1 | -1;
}

/** Travel frames for a move of `d` screen px (§2.10). */
export const travelFrames = (d: number) => Math.round(Math.min(27, Math.max(15, 10 + d / 45)));
/** Travel frames for a drag of `d` screen px (20 px/f). */
export const dragFrames = (d: number) => Math.max(2, Math.round(d / 20));

const dist = (a: ScreenPt, b: ScreenPt) => Math.hypot(b.sx - a.sx, b.sy - a.sy);

/** Pure: where is the cursor at f? Exposed so directors can check click points. */
export function cursorAt(f: number, path: CursorKey[], win: WindowId, keys: WtCameraKey[] | undefined, arc: 1 | -1 = 1) {
  const map = (p: Pt) => toScreen(p, win, f, keys);
  if (f <= path[0].f) return { ...map(path[0].at), shape: path[0].shape ?? ('arrow' as CursorShape) };
  let shape: CursorShape = path[0].shape ?? 'arrow';
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (b.shape && f >= b.f - 4) shape = b.shape;
    if (f >= b.f) continue;
    const pa = map(a.at);
    const pb = map(b.at);
    const arriveD = dist(toScreen(a.at, win, b.f, keys), toScreen(b.at, win, b.f, keys));
    const T = b.linear ? dragFrames(arriveD) : travelFrames(arriveD);
    const depart = Math.max(a.f, b.f - T);
    if (f <= depart) return { ...pa, shape };
    const raw = (f - depart) / Math.max(1, b.f - depart);
    const t = b.linear ? raw : ease.inOut(raw);
    const d = dist(pa, pb);
    const bow = b.linear || d < 1 ? 0 : Math.sin(Math.PI * t) * d * 0.06 * arc;
    const nx = d < 1 ? 0 : -(pb.sy - pa.sy) / d;
    const ny = d < 1 ? 0 : (pb.sx - pa.sx) / d;
    return { sx: pa.sx + (pb.sx - pa.sx) * t + nx * bow, sy: pa.sy + (pb.sy - pa.sy) * t + ny * bow, shape };
  }
  const last = path[path.length - 1];
  return { ...map(last.at), shape };
}

const STROKE = { stroke: '#ffffff', strokeWidth: 1.6, strokeLinejoin: 'round' as const };

const ArrowGlyph: React.FC = () => (
  <svg width={30} height={30} viewBox="0 0 24 24" style={{ overflow: 'visible', display: 'block' }}>
    <path d="M5.5 2.5 L5.5 19.5 L9.8 15.4 L12.6 21.6 L15.3 20.4 L12.6 14.4 L18.6 14.4 Z" fill={C.ink} {...STROKE} />
  </svg>
);

const HandGlyph: React.FC = () => (
  <svg width={30} height={30} viewBox="0 0 24 24" style={{ overflow: 'visible', display: 'block' }}>
    <path
      d="M9 3.2 C9 2.3 9.7 1.6 10.6 1.6 C11.5 1.6 12.2 2.3 12.2 3.2 L12.2 9.4 C12.4 9 12.9 8.7 13.5 8.7 C14.3 8.7 14.9 9.3 14.9 10.1 L14.9 10.6 C15.1 10.2 15.6 9.9 16.2 9.9 C17 9.9 17.6 10.5 17.6 11.3 L17.6 11.9 C17.8 11.5 18.3 11.2 18.9 11.2 C19.7 11.2 20.3 11.8 20.3 12.6 L20.3 16.4 C20.3 19.6 18 22.2 14.8 22.2 L13.2 22.2 C11.2 22.2 9.9 21.4 8.7 19.9 L5 15.3 C4.5 14.7 4.6 13.8 5.2 13.3 C5.8 12.8 6.7 12.8 7.3 13.4 L9 15.1 Z"
      fill={C.ink}
      {...STROKE}
    />
    <path d="M12.2 9.6 L12.2 14 M14.9 10.8 L14.9 14 M17.6 12 L17.6 14.4" stroke="#ffffff" strokeWidth={0.9} strokeLinecap="round" fill="none" />
  </svg>
);

const IBeamGlyph: React.FC = () => (
  <svg width={14} height={24} viewBox="0 0 14 24" style={{ overflow: 'visible', display: 'block' }}>
    <path d="M3.5 2 H5.5 Q7 2 7 3.4 Q7 2 8.5 2 H10.5 M7 3.4 V20.6 M3.5 22 H5.5 Q7 22 7 20.6 Q7 22 8.5 22 H10.5" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" fill="none" />
    <path d="M3.5 2 H5.5 Q7 2 7 3.4 Q7 2 8.5 2 H10.5 M7 3.4 V20.6 M3.5 22 H5.5 Q7 22 7 20.6 Q7 22 8.5 22 H10.5" stroke={C.ink} strokeWidth={1.7} strokeLinecap="round" fill="none" />
  </svg>
);

/** Hotspot offsets (glyph px from its top-left to the click point). */
const HOT: Record<CursorShape, { x: number; y: number }> = {
  arrow: { x: 6.9, y: 3.1 },
  hand: { x: 13.25, y: 2.2 },
  ibeam: { x: 7, y: 12 },
};

export const WtCursor: React.FC<WtCursorProps> = ({ path, clicks = [], drags = [], showFrom, hideAfter, idle = [], window: win = 'main', arc = 1 }) => {
  const f = useCurrentFrame();
  const keys = useCameraKeys();
  let o = appear(f, showFrom, 6, ease.linear) * (hideAfter === undefined ? 1 : 1 - appear(f, hideAfter, 6, ease.linear));
  for (const [a, b] of idle) {
    if (f >= a && f < b) o *= Math.min(1 - appear(f, a, 6, ease.linear), appear(f, b - 10, 10, ease.linear));
  }
  if (o <= 0) return null;
  const { sx, sy, shape } = cursorAt(f, path, win, keys, arc);
  let s = 1;
  let ring: { r: number; o: number } | null = null;
  const presses = [...clicks, ...drags.map((d) => d.from)];
  for (const c of clicks) {
    if (f >= c && f <= c + 6) s = Math.min(s, interpolate(f, [c, c + 3, c + 6], [1, 0.88, 1]));
  }
  for (const d of drags) if (f >= d.from && f <= d.to) s = Math.min(s, 0.9);
  for (const c of presses) {
    if (f >= c && f < c + 12) {
      const p = (f - c) / 12;
      ring = { r: 44 * ease.out(Math.min(1, p * 1.4)), o: 0.25 * (1 - p) };
    }
  }
  const hot = HOT[shape];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 100 }}>
      {ring ? (
        <div
          style={{
            position: 'absolute',
            left: sx - ring.r / 2,
            top: sy - ring.r / 2,
            width: ring.r,
            height: ring.r,
            borderRadius: 999,
            border: `2px solid rgba(28,27,24,${ring.o})`,
            opacity: o,
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: sx - hot.x,
          top: sy - hot.y,
          opacity: o,
          transform: `scale(${s})`,
          transformOrigin: `${hot.x}px ${hot.y}px`,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.25))',
        }}
      >
        {shape === 'arrow' ? <ArrowGlyph /> : shape === 'hand' ? <HandGlyph /> : <IBeamGlyph />}
      </div>
    </AbsoluteFill>
  );
};
