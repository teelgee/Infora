/**
 * Camera, floating panes and the readability toolkit (master-plan §4.4,
 * §4.7, §5.3): Camera, Float, FocusBlur, Greek, GreekText, Highlight,
 * Shimmer, Anchor.
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, RADIUS, SHADOW, type ShadowName } from './theme';
import { appear, ease, hashString, seeded, type EaseName, type F } from './motion';

// ------------------------------------------------------------------ Camera

export interface CameraKey {
  f: F;
  /** Stage point placed at screen centre. */
  x: number;
  y: number;
  scale: number;
  /** Easing used to arrive at this key (default inOut). */
  ease?: 'out' | 'inOut' | 'in' | 'linear';
}

/** Interpolated camera state at frame `f`. */
export function cameraAt(f: number, keys: CameraKey[]): { x: number; y: number; scale: number } {
  if (keys.length === 0) return { x: 960, y: 540, scale: 1 };
  if (f <= keys[0].f) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (f <= b.f) {
      const e = ease[(b.ease ?? 'inOut') as EaseName];
      const t = b.f === a.f ? 1 : e((f - a.f) / (b.f - a.f));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, scale: a.scale + (b.scale - a.scale) * t };
    }
  }
  return keys[keys.length - 1];
}

/**
 * Wraps a 1920×1080 stage. With no keys it is the identity. Camera scale is
 * separate from Float scale; effective scale = Float × Camera.
 */
export const Camera: React.FC<{ keys: CameraKey[]; children: React.ReactNode }> = ({ keys, children }) => {
  const f = useCurrentFrame();
  const { x, y, scale } = cameraAt(f, keys);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transformOrigin: '0 0',
          transform: `translate(${960 - x * scale}px, ${540 - y * scale}px) scale(${scale})`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Convenience: a slow push / push-to-detail pair of keys. */
export function push(from: F, to: F, x: number, y: number, scaleTo: number, scaleFrom = 1, easeName: 'out' | 'inOut' = 'inOut'): CameraKey[] {
  return [
    { f: from, x, y, scale: scaleFrom },
    { f: to, x, y, scale: scaleTo, ease: easeName },
  ];
}

// ------------------------------------------------------------------ Float

export interface FloatProps {
  /** Centre point in stage px. */
  x: number;
  y: number;
  /** Float scale (native → screen). */
  scale: number;
  at?: F;
  exitAt?: F;
  shadow?: ShadowName | 'none';
  /** Native box size; default sizes to content. */
  w?: number;
  h?: number;
  radius?: number;
  background?: string;
  /** Extra opacity multiplier (e.g. a dimmed pane at 0.6). */
  opacity?: number;
  /** Extra translate in stage px (for slides and pans), applied after centring. */
  dx?: number;
  dy?: number;
  /** CSS filter (e.g. a blur from contextStyle). */
  filter?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * A native-size UI card floated on the field, centred on (x, y) at `scale`.
 * Entry: opacity + translateY 24 → 0 over 9 f (`panel`). Exit mirrors it.
 */
export const Float: React.FC<FloatProps> = ({
  x,
  y,
  scale,
  at,
  exitAt,
  shadow = 'pane',
  w,
  h,
  radius = RADIUS.pane,
  background,
  opacity = 1,
  dx = 0,
  dy = 0,
  filter,
  style,
  children,
}) => {
  const f = useCurrentFrame();
  const inP = at === undefined ? 1 : appear(f, at, 9);
  const outP = exitAt === undefined ? 0 : appear(f, exitAt, 9);
  const o = inP * (1 - outP) * opacity;
  if (o <= 0.001) return null;
  const ty = (1 - inP) * 24 + outP * 24;
  return (
    <div
      style={{
        position: 'absolute',
        left: x + dx,
        top: y + dy + ty,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: o,
        filter,
      }}
    >
      <div
        style={{
          width: w,
          height: h,
          borderRadius: radius,
          boxShadow: shadow === 'none' ? undefined : SHADOW[shadow],
          background,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ FocusBlur

/**
 * The context-layer style at frame `f` (§4.7): blur 6 px, opacity 0.45,
 * in over 9 f from `from`, out over 9 f from `to`.
 */
export function contextStyle(f: number, from: F, to?: F, amount = 1): React.CSSProperties {
  const p = appear(f, from, 9) * (to === undefined ? 1 : 1 - appear(f, to, 9)) * amount;
  if (p <= 0) return {};
  return { filter: `blur(${6 * p}px)`, opacity: 1 - 0.55 * p };
}

/** Focal emphasis: scale 1 → 1.04 over 9 f from `from` (and back from `to`). */
export function focalScale(f: number, from: F, to?: F): number {
  const p = appear(f, from, 9) * (to === undefined ? 1 : 1 - appear(f, to, 9));
  return 1 + 0.04 * p;
}

export interface FocusBlurProps {
  from: F;
  to?: F;
  /** The focal layer: kept sharp. */
  focus: React.ReactNode;
  /** The context layer: blurred to 6 px at 0.45 opacity. */
  context: React.ReactNode;
  /** Scale the focal layer ×1.00 → ×1.04 about this point (default centre). */
  focusOrigin?: { x: number; y: number };
  focusZoom?: boolean;
}

/** Two full-stage layers: context blurs out, focus stays sharp (§4.7). */
export const FocusBlur: React.FC<FocusBlurProps> = ({ from, to, focus, context, focusOrigin, focusZoom = true }) => {
  const f = useCurrentFrame();
  const s = focusZoom ? focalScale(f, from, to) : 1;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={contextStyle(f, from, to)}>{context}</AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `scale(${s})`,
          transformOrigin: focusOrigin ? `${focusOrigin.x}px ${focusOrigin.y}px` : '50% 50%',
        }}
      >
        {focus}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ Greek

/** A single Greek bar (§4.7). Height 0.55 × line-height. */
export const GreekBar: React.FC<{ width: number | string; lineHeight: number; colour?: string; style?: React.CSSProperties }> = ({
  width,
  lineHeight,
  colour = C.borderStrong,
  style,
}) => (
  <div style={{ height: lineHeight, display: 'flex', alignItems: 'center', ...style }}>
    <div style={{ width, height: lineHeight * 0.55, borderRadius: 4, background: colour }} />
  </div>
);

export interface GreekProps {
  lines: number;
  /** Line height in px (native). */
  lineHeight: number;
  /** Width per line, 0–1 or px. Seeded 55–95 % when omitted. */
  widths?: number[];
  seed?: number;
  colour?: string;
  /** Last line shorter, like a paragraph end (default true when seeded). */
  ragged?: boolean;
  style?: React.CSSProperties;
}

/** Block of Greek bars standing in for unreadable text. */
export const Greek: React.FC<GreekProps> = ({ lines, lineHeight, widths, seed = 7, colour, ragged = true, style }) => {
  const rnd = seeded(seed);
  const ws = Array.from({ length: lines }, (_, i) => {
    if (widths && widths[i] !== undefined) return widths[i];
    const base = 0.55 + rnd() * 0.4;
    return ragged && i === lines - 1 && lines > 1 ? Math.min(base, 0.45 + rnd() * 0.2) : base;
  });
  return (
    <div style={style}>
      {ws.map((w, i) => (
        <GreekBar key={i} lineHeight={lineHeight} colour={colour} width={w <= 1 ? `${w * 100}%` : w} />
      ))}
    </div>
  );
};

export interface GreekTextProps {
  text: string;
  /** Turn to bars from this frame (crossfade 6 f). */
  greekFrom?: F;
  /** Start as bars; turn sharp from this frame. */
  sharpFrom?: F;
  /** Always Greek. */
  greek?: boolean;
  colour?: string;
  barColour?: string;
  style?: React.CSSProperties;
}

/**
 * Text that turns into word-shaped bars in place, keeping its layout (§4.7
 * Greek-in-place). The workhorse of the readability rule.
 */
export const GreekText: React.FC<GreekTextProps> = ({ text, greekFrom, sharpFrom, greek, colour, barColour = C.borderStrong, style }) => {
  const f = useCurrentFrame();
  let g: number;
  if (greek) g = 1;
  else if (sharpFrom !== undefined) g = 1 - appear(f, sharpFrom, 6, ease.linear);
  else if (greekFrom !== undefined) g = appear(f, greekFrom, 6, ease.linear);
  else g = 0;
  if (g <= 0) return <span style={{ color: colour, ...style }}>{text}</span>;
  const words = text.split(/(\s+)/);
  return (
    <span style={{ color: colour, ...style }}>
      {words.map((w, i) =>
        /^\s+$/.test(w) ? (
          w
        ) : (
          <span key={i} style={{ position: 'relative', display: 'inline' }}>
            <span style={{ opacity: 1 - g }}>{w}</span>
            <span
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                height: '0.62em',
                transform: 'translateY(-50%)',
                borderRadius: 4,
                background: barColour,
                opacity: g,
              }}
            />
          </span>
        ),
      )}
    </span>
  );
};

/** Greek'd text, always (sugar). */
export const G: React.FC<{ children: string; style?: React.CSSProperties }> = ({ children, style }) => (
  <GreekText text={children} greek style={style} />
);

// ------------------------------------------------------------------ Highlight

export interface HighlightProps {
  /** Frame the wipe starts (6 f, left → right). */
  at: F;
  children: React.ReactNode;
  colour?: string;
  dur?: number;
  /** Anchor id (for PhraseLift). */
  id?: string;
  style?: React.CSSProperties;
}

/** `#f8efdd` box, 4 px radius, 2 px horizontal padding, wiped in L → R over 6 f. */
export const Highlight: React.FC<HighlightProps> = ({ at, children, colour = C.warning.tint, dur = 6, id, style }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <span
      data-anchor={id}
      style={{
        backgroundImage: `linear-gradient(${colour}, ${colour})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${p * 100}% 100%`,
        borderRadius: 4,
        padding: '0 2px',
        margin: '0 -2px',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
        ...style,
      }}
    >
      {children}
    </span>
  );
};

// ------------------------------------------------------------------ Shimmer

/** Loading bar (§4.5): 42 f linear sweep, sunken → neutral50 → sunken. Never a spinner. */
export const Shimmer: React.FC<{ w: number | string; h: number; radius?: number; offset?: number; style?: React.CSSProperties }> = ({
  w,
  h,
  radius = 4,
  offset = 0,
  style,
}) => {
  const f = useCurrentFrame();
  const t = (((f + offset) % 42) + 42) % 42 / 42;
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${C.sunken} 25%, ${C.neutral50} 37%, ${C.sunken} 63%)`,
        backgroundSize: '300% 100%',
        backgroundPosition: `${100 - t * 100}% 0`, // highlight sweeps left → right
        ...style,
      }}
    />
  );
};

// ------------------------------------------------------------------ Anchor

/** Marks a DOM node as a PhraseLift source/target (`data-anchor`). */
export const Anchor: React.FC<{ id: string; children: React.ReactNode; style?: React.CSSProperties; inline?: boolean }> = ({
  id,
  children,
  style,
  inline,
}) =>
  inline ? (
    <span data-anchor={id} style={style}>
      {children}
    </span>
  ) : (
    <div data-anchor={id} style={style}>
      {children}
    </div>
  );

/** Deterministic seed from a label (for Greek widths). */
export const seedOf = (s: string) => hashString(s) % 100000;
