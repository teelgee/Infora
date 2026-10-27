/**
 * W2 local helpers. Everything is native px on the plate (1536 × 864, or the
 * 752 × 832 split shell), so the plan's §4 coordinates are used as written.
 */
import React from 'react';
import { C, FONT } from '../../shared';
import { PANE } from '../shared';

/**
 * A layer inside the Shell's main-pane body whose origin is the PLATE's
 * origin, so children can be placed at the plan's native coordinates and are
 * still clipped by the pane (and sit under the Shell overlay).
 */
export const PlateLayer: React.FC<{ railW?: number; width?: number; height?: number; children: React.ReactNode }> = ({
  railW = 216,
  width = 1536,
  height = 864,
  children,
}) => (
  <div style={{ position: 'absolute', left: -railW, top: -(PANE.y + PANE.topbarH), width, height }}>{children}</div>
);

/** Absolutely placed box (native px). */
export const Abs: React.FC<{ x: number; y: number; w?: number; h?: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ x, y, w, h, style, children }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, ...style }}>{children}</div>
);

/** Text whose vertical centre sits on `y` (native px). */
export const TextAt: React.FC<{ x: number; y: number; size?: number; lh?: number; right?: boolean; w?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  x,
  y,
  size = 12,
  lh,
  right,
  w,
  style,
  children,
}) => {
  const l = lh ?? Math.round(size * 1.4);
  return (
    <div
      style={{
        position: 'absolute',
        left: right ? undefined : x,
        right: right ? `calc(100% - ${x}px)` : undefined,
        top: y - l / 2,
        width: w,
        fontFamily: FONT.sans,
        fontSize: size,
        lineHeight: `${l}px`,
        color: C.text,
        whiteSpace: w ? undefined : 'nowrap',
        textAlign: right ? 'right' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** The micro uppercase label (10.5 / 700 / tracking 0.6, muted). */
export const Micro: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ fontFamily: FONT.sans, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.muted, whiteSpace: 'nowrap', ...style }}>
    {children}
  </span>
);

/** The built `suggested` tag (ontology-panel.tsx SuggestedBadge): 11 px muted, 1 px border, r 4. */
export const SuggestedTag: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <span
    style={{
      fontFamily: FONT.sans,
      fontSize: 11,
      lineHeight: '15px',
      fontWeight: 400,
      color: C.muted,
      border: `1px solid ${C.border}`,
      borderRadius: 4,
      padding: '0 5px',
      marginLeft: 6,
      whiteSpace: 'nowrap',
      background: C.pane,
      ...style,
    }}
  >
    suggested
  </span>
);

/** Linear 0→1 over `dur` from `at` (clamped). */
export const lin = (f: number, at: number, dur: number) => (dur <= 0 ? (f >= at ? 1 : 0) : Math.min(1, Math.max(0, (f - at) / dur)));
