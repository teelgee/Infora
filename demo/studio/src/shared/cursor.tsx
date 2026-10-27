/**
 * The cursor and typing (master-plan §4.8, §5.3).
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C } from './theme';
import { appear, ease, type F } from './motion';

// ------------------------------------------------------------------ Cursor

export interface CursorProps {
  /** Screen-px keyframes; travel between keys uses ease.inOut. */
  path: Array<{ f: F; x: number; y: number }>;
  clicks: F[];
  /** Fade in over 6 f from here (10–20 f before the click). */
  showFrom: F;
  /** Fade out over 6 f from here (8 f after the click). */
  hideAfter: F;
}

function cursorPos(f: number, path: CursorProps['path']) {
  if (f <= path[0].f) return path[0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (f <= b.f) {
      const t = ease.inOut((f - a.f) / Math.max(1, b.f - a.f));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return path[path.length - 1];
}

/**
 * macOS arrow, 30 px, ink with a 2 px white outline. Rendered above the
 * Camera (place it outside any Camera); never blurred. The hotspot (arrow
 * tip) sits on the path point.
 */
export const Cursor: React.FC<CursorProps> = ({ path, clicks, showFrom, hideAfter }) => {
  const f = useCurrentFrame();
  const o = appear(f, showFrom, 6, ease.linear) * (1 - appear(f, hideAfter, 6, ease.linear));
  if (o <= 0) return null;
  const { x, y } = cursorPos(f, path);
  let s = 1;
  let ring: { r: number; o: number } | null = null;
  for (const c of clicks) {
    if (f >= c && f <= c + 6) s = Math.min(s, interpolate(f, [c, c + 3, c + 6], [1, 0.88, 1]));
    if (f >= c && f < c + 12) {
      const p = (f - c) / 12;
      ring = { r: 44 * ease.out(Math.min(1, p * 1.4)), o: 0.25 * (1 - p) };
    }
  }
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 100 }}>
      {ring ? (
        <div
          style={{
            position: 'absolute',
            left: x - ring.r / 2,
            top: y - ring.r / 2,
            width: ring.r,
            height: ring.r,
            borderRadius: 999,
            border: `2px solid rgba(28,27,24,${ring.o})`,
          }}
        />
      ) : null}
      <svg
        width={30}
        height={30}
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: x - 6.9,
          top: y - 3.1,
          opacity: o,
          transform: `scale(${s})`,
          transformOrigin: '6.9px 3.1px',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.25))',
          overflow: 'visible',
        }}
      >
        <path
          d="M5.5 2.5 L5.5 19.5 L9.8 15.4 L12.6 21.6 L15.3 20.4 L12.6 14.4 L18.6 14.4 Z"
          fill={C.ink}
          stroke="#ffffff"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ TypedText

export interface TypedTextProps {
  text: string;
  /** First character appears at `from`; last at `to` (linear). */
  from: F;
  to: F;
  caret?: boolean;
  /** Caret visible until this frame (default: `to` + 20). */
  caretUntil?: F;
  caretColour?: string;
  style?: React.CSSProperties;
}

/** Number of characters of `text` revealed at frame `f`. */
export function typedCount(f: number, text: string, from: F, to: F): number {
  if (f < from) return 0;
  if (f >= to) return text.length;
  return Math.max(1, Math.round(interpolate(f, [from, to], [1, text.length])));
}

/** Linear reveal; caret 2 px × 1.1em, blinking 15/15 when idle. */
export const TypedText: React.FC<TypedTextProps> = ({ text, from, to, caret = true, caretUntil, caretColour = C.ink, style }) => {
  const f = useCurrentFrame();
  const n = typedCount(f, text, from, to);
  const until = caretUntil ?? to + 20;
  const typing = f >= from && f < to;
  const idleBlink = Math.floor((f - (f < from ? 0 : to)) / 15) % 2 === 0;
  const showCaret = caret && f < until && (typing || idleBlink);
  return (
    <span style={style}>
      {text.slice(0, n)}
      {caret && f < until ? (
        <span
          style={{
            display: 'inline-block',
            width: 2,
            height: '1.1em',
            marginLeft: 1,
            verticalAlign: '-0.18em',
            background: caretColour,
            opacity: showCaret ? 1 : 0,
          }}
        />
      ) : null}
    </span>
  );
};
