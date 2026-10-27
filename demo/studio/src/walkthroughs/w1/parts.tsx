/**
 * W1-local building blocks in the built language (screens 07–27). Native px.
 * Everything animated takes video-local frames.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ChevronDown, X } from 'lucide-react';
import { appear, C, ease, FONT, pressScale, RADIUS, SHADOW, ui, type F } from '../../shared';
import { StatusPill, type Tone } from '../shared';

/** ui (5 f linear) fade, optional exit. Returns 0..1. */
export const fade = (f: number, at?: F, exitAt?: F, dur = 5) =>
  (at === undefined ? 1 : appear(f, at, dur, ease.linear)) * (exitAt === undefined ? 1 : 1 - appear(f, exitAt, dur, ease.linear));

/** A step function over frames: value of the last entry whose frame ≤ f. */
export function stepAt<T>(f: number, first: T, steps: Array<[F, T]>): T {
  let v = first;
  for (const [at, val] of steps) if (f >= at) v = val;
  return v;
}

/** The built success banner (`08`, `11`, `14`): tinted, 3 px left rule, the ✕ sits right after the text. */
export const InlineBanner: React.FC<{ text: React.ReactNode; style?: React.CSSProperties }> = ({ text, style }) => (
  <div
    style={{
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      fontSize: 13,
      lineHeight: '20px',
      color: C.prose,
      background: '#e6efe9',
      borderLeft: `3px solid ${C.success.text}`,
      borderRadius: RADIUS.control,
      padding: '0 16px',
      height: 54,
      ...style,
    }}
  >
    <span>{text}</span>
    <X size={14} strokeWidth={1.8} color={C.text2} style={{ flex: 'none', marginTop: -3 }} />
  </div>
);

/** Uppercase micro label (`SANDBOXES`, `ROUND 1 · P01`). */
export const Micro: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 10.5, lineHeight: '13px', letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: 700, color: C.muted, ...style }}>{children}</div>
);

/** Dot + word with no tint (the `● Lead reviewer` role mark). */
export const DotText: React.FC<{ label: string; size?: number }> = ({ label, size = 12.5 }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: size, color: C.text2, whiteSpace: 'nowrap' }}>
    <span style={{ width: 5, height: 5, borderRadius: 999, background: C.faint }} />
    {label}
  </span>
);

/** Pill wrapper with a crossfade to a new tone/label at a frame. */
export const Pill: React.FC<{ tone: Tone; label: React.ReactNode; flip?: { tone: Tone; label: React.ReactNode; at: F }; size?: number; style?: React.CSSProperties }> = ({
  tone,
  label,
  flip,
  size,
  style,
}) => <StatusPill tone={tone} label={label} flipTo={flip} size={size} style={style} />;

/** Primary / secondary / quiet / disabled / danger-outline button (built proportions). */
export const Button: React.FC<{
  kind?: 'primary' | 'quiet' | 'disabled' | 'danger' | 'secondary';
  label: React.ReactNode;
  icon?: React.ReactNode;
  hover?: boolean;
  pressAt?: F;
  size?: number;
  pad?: string;
  style?: React.CSSProperties;
}> = ({ kind = 'quiet', label, icon, hover, pressAt, size = 13, pad, style }) => {
  const f = useCurrentFrame();
  const look: Record<string, React.CSSProperties> = {
    primary: { background: hover ? '#000' : C.ink, color: '#fff', fontWeight: 600 },
    quiet: { background: hover ? C.sunken : 'transparent', color: C.text2, fontWeight: 500 },
    secondary: { background: hover ? C.sunken : C.pane, color: C.text2, fontWeight: 500, boxShadow: `inset 0 0 0 1px ${C.borderStrong}` },
    disabled: { background: '#b9b7b0', color: '#fff', fontWeight: 600 },
    danger: { background: C.pane, color: C.danger.text, fontWeight: 500, boxShadow: 'inset 0 0 0 1px #ecc9c6' },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        fontFamily: FONT.sans,
        fontSize: size,
        lineHeight: '19px',
        borderRadius: RADIUS.control,
        padding: pad ?? '4px 12px',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        transform: `scale(${pressScale(f, pressAt)})`,
        ...look[kind],
        ...style,
      }}
    >
      {icon}
      {label}
    </span>
  );
};

/** A built `<select>` (closed): white, hairline, radius 8, chevron. */
export const SelectBox: React.FC<{ value: React.ReactNode; muted?: boolean; focus?: boolean; height?: number; style?: React.CSSProperties }> = ({
  value,
  muted,
  focus,
  height = 34,
  style,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      height,
      boxSizing: 'border-box',
      padding: '0 10px 0 12px',
      border: `1px solid ${focus ? '#4a6b8c' : 'rgba(20,20,20,.10)'}`,
      boxShadow: focus ? '0 0 0 1px #4a6b8c' : undefined,
      borderRadius: RADIUS.control,
      background: C.pane,
      fontSize: 13,
      color: muted ? C.text2 : C.text,
      minWidth: 0,
      ...style,
    }}
  >
    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{value}</span>
    <ChevronDown size={14} strokeWidth={1.8} color={C.text2} style={{ flex: 'none', marginLeft: 6 }} />
  </div>
);

/** Textarea: sunken when idle (as captured), white with the slate focus ring when focused. */
export const TextArea: React.FC<{
  value?: React.ReactNode;
  placeholder?: string;
  focus?: boolean;
  white?: boolean;
  height: number;
  /** Scroll the content up (auto-scroll to the caret line). */
  scrollY?: number;
  style?: React.CSSProperties;
}> = ({ value, placeholder, focus, white, height, scrollY = 0, style }) => (
  <div
    style={{
      position: 'relative',
      height,
      boxSizing: 'border-box',
      borderRadius: RADIUS.control,
      background: focus || white ? C.pane : C.sunken,
      border: `1px solid ${focus ? '#4a6b8c' : white ? 'rgba(20,20,20,.12)' : 'transparent'}`,
      boxShadow: focus ? '0 0 0 1px #4a6b8c' : undefined,
      overflow: 'hidden',
      fontSize: 13,
      lineHeight: '16px',
      color: C.text,
      ...style,
    }}
  >
    {/* Keeps the end (the caret line) in view once the text overflows, as captured in 17. */}
    <div style={{ position: 'absolute', inset: '7px 11px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>
      <div style={{ flex: 'none', minHeight: '100%', transform: `translateY(${-scrollY}px)` }}>{value ?? <span style={{ color: C.muted }}>{placeholder}</span>}</div>
    </div>
    <svg width={8} height={8} style={{ position: 'absolute', right: 3, bottom: 3 }}>
      <path d="M7 1 L1 7 M7 4.5 L4.5 7" stroke="#9b998f" strokeWidth={1} />
    </svg>
  </div>
);

/** One-line text input. */
export const Input: React.FC<{ value?: React.ReactNode; placeholder?: string; focus?: boolean; height?: number; style?: React.CSSProperties }> = ({
  value,
  placeholder,
  focus,
  height = 32,
  style,
}) => (
  <div
    style={{
      height,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      padding: '0 10px',
      borderRadius: RADIUS.control,
      background: C.pane,
      border: `1px solid ${focus ? '#4a6b8c' : 'rgba(20,20,20,.12)'}`,
      boxShadow: focus ? '0 0 0 1px #4a6b8c' : undefined,
      fontSize: 13,
      color: C.text,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      ...style,
    }}
  >
    {value ?? <span style={{ color: C.muted }}>{placeholder}</span>}
  </div>
);

/** The sunken card (status cards, SUBMISSION, REVIEWERS…): #efeeeb-ish fill, soft shadow, radius 8. */
export const Sunk: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: '#f0efeb', borderRadius: RADIUS.pane, boxShadow: SHADOW.soft, boxSizing: 'border-box', ...style }}>{children}</div>
);

/** A key/value row: muted label left, value right, hairline under. */
export const KV: React.FC<{ k: React.ReactNode; v: React.ReactNode; h?: number; last?: boolean; mono?: boolean }> = ({ k, v, h = 30, last, mono }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      minHeight: h,
      gap: 16,
      borderBottom: last ? undefined : '1px solid rgba(20,20,20,.05)',
      fontSize: 13,
    }}
  >
    <span style={{ color: C.text2, flex: 'none' }}>{k}</span>
    <span style={{ marginLeft: 'auto', textAlign: 'right', color: C.text, fontFamily: mono ? FONT.mono : undefined, fontSize: mono ? 12.5 : 13 }}>{v}</span>
  </div>
);

/** The built avatar square-ish circle (`RB`, `EP`) in cards: 26 px near-black. */
export const Av: React.FC<{ initials: string; size?: number }> = ({ initials, size = 26 }) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: size > 26 ? 999 : 7,
      background: C.ink,
      color: '#fff',
      fontSize: size * 0.42,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
    }}
  >
    {initials}
  </span>
);

/** Fade the content in/out with the ui transition. */
export const Fade: React.FC<{ at?: F; exitAt?: F; dur?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, exitAt, dur = 5, children, style }) => {
  const f = useCurrentFrame();
  const o = fade(f, at, exitAt, dur);
  if (o <= 0) return null;
  return <div style={{ opacity: o, ...style }}>{children}</div>;
};

/**
 * A block that collapses (height → 0) while it fades, so what is below rises
 * (`ui`, 5 f linear) — the appointment and SUBMISSION cards (§4.11).
 */
export const Collapse: React.FC<{ at?: F; h: number; children: React.ReactNode }> = ({ at, h, children }) => {
  const f = useCurrentFrame();
  const p = at === undefined ? 0 : ui(f, at);
  if (p >= 1) return null;
  return <div style={{ height: h * (1 - p), opacity: 1 - p, overflow: 'hidden' }}>{children}</div>;
};

/** Reveal that grows from 0 height (inverse of Collapse). */
export const Grow: React.FC<{ at?: F; h: number; children: React.ReactNode }> = ({ at, h, children }) => {
  const f = useCurrentFrame();
  const p = at === undefined ? 1 : ui(f, at);
  if (p <= 0) return null;
  return <div style={{ height: p >= 1 ? undefined : h * p, opacity: p, overflow: p >= 1 ? undefined : 'hidden' }}>{children}</div>;
};
