/**
 * Recreated product primitives at native size (master-plan §5.4), lifted from
 * .claude/skills/infora-design/chrome.css: Pane, Badge, Button, SourceChip,
 * WithheldNotice, Chip, MicroLabel, AgentGlyph, Tick, Avatar.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check } from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, TYPE, type ShadowName } from '../theme';
import { appear, ease, pressScale, ui, type F } from '../motion';

// ------------------------------------------------------------------ glyphs

/** The `✦` agent glyph, drawn (no font fallback). */
export const AgentGlyph: React.FC<{ size?: number; colour?: string; style?: React.CSSProperties }> = ({ size = 12, colour = C.ink, style }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: 'none', ...style }}>
    <path d="M8 0.5 C8.6 5.2 10.8 7.4 15.5 8 C10.8 8.6 8.6 10.8 8 15.5 C7.4 10.8 5.2 8.6 0.5 8 C5.2 7.4 7.4 5.2 8 0.5 Z" fill={colour} />
  </svg>
);

/** Filled ink circle with a white tick (done states). */
export const Tick: React.FC<{ size?: number; tone?: 'ink' | 'success'; style?: React.CSSProperties }> = ({ size = 20, tone = 'ink', style }) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: 999,
      background: tone === 'ink' ? C.ink : C.success.dot,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
      ...style,
    }}
  >
    <Check size={size * 0.6} color="#fff" strokeWidth={3} />
  </span>
);

export const Avatar: React.FC<{ initials: string; size?: number; round?: boolean }> = ({ initials, size = 22, round = false }) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: round ? 999 : RADIUS.control,
      background: C.ink,
      color: '#fff',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.42,
      fontWeight: 700,
      flex: 'none',
      fontFamily: FONT.sans,
    }}
  >
    {initials}
  </span>
);

/** Uppercase micro label ("STEPS", "PROJECT"). */
export const MicroLabel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      fontFamily: FONT.sans,
      fontSize: TYPE.micro,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontWeight: 700,
      color: C.muted,
      ...style,
    }}
  >
    {children}
  </div>
);

// ------------------------------------------------------------------ Pane

export interface PaneProps {
  w?: number;
  h?: number;
  pad?: number | string;
  shadow?: ShadowName | 'none';
  tone?: 'pane' | 'sunken';
  radius?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** A white, shadowed, borderless card (cards are filled and shadowed, never bordered). */
export const Pane: React.FC<PaneProps> = ({ w, h, pad = 16, shadow = 'pane', tone = 'pane', radius = RADIUS.pane, style, children }) => (
  <div
    style={{
      width: w,
      height: h,
      padding: pad,
      background: tone === 'pane' ? C.pane : C.sunken,
      borderRadius: radius,
      boxShadow: shadow === 'none' ? undefined : SHADOW[shadow],
      boxSizing: 'border-box',
      fontFamily: FONT.sans,
      fontSize: TYPE.ui,
      color: C.text,
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);

// ------------------------------------------------------------------ Badge

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const BADGE: Record<BadgeTone, { text: string; dot: string; tint: string }> = {
  success: { text: C.success.text, dot: C.success.dot, tint: C.success.tint },
  warning: { text: C.warning.text, dot: C.warning.dot, tint: C.warning.tint },
  danger: { text: C.danger.text, dot: C.danger.text, tint: C.danger.tint },
  info: { text: C.info.text, dot: C.info.text, tint: C.info.tint },
  neutral: { text: C.text2, dot: C.faint, tint: C.active },
};

const BadgeFace: React.FC<{ tone: BadgeTone; label: React.ReactNode; pill: boolean; size: number }> = ({ tone, label, pill, size }) => {
  const t = BADGE[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5 * (size / TYPE.label),
        fontFamily: FONT.sans,
        fontSize: size,
        fontWeight: pill ? 700 : 500,
        lineHeight: 1.3,
        color: pill && tone === 'neutral' ? C.text : t.text,
        background: pill ? t.tint : undefined,
        borderRadius: 999,
        padding: pill ? `${(4 * size) / TYPE.label}px ${(12 * size) / TYPE.label}px` : 0,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: (6 * size) / TYPE.label, height: (6 * size) / TYPE.label, borderRadius: 999, background: t.dot, flex: 'none' }} />
      {label}
    </span>
  );
};

export interface BadgeProps {
  tone: BadgeTone;
  label: React.ReactNode;
  pill?: boolean;
  /** Appears (fade, `ui`) at this frame. */
  at?: F;
  /** Flips tone and label at a frame (`ui`, 5 f crossfade). */
  flipTo?: { tone: BadgeTone; label: React.ReactNode; at: F };
  /** Font size (default 11.5 native). */
  size?: number;
  style?: React.CSSProperties;
}

/** Status label: always dot + word. Flat in tables, tinted pill on cards. */
export const Badge: React.FC<BadgeProps> = ({ tone, label, pill = false, at, flipTo, size = TYPE.label, style }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  if (o <= 0) return null;
  if (!flipTo || f < flipTo.at) {
    return (
      <span style={{ display: 'inline-flex', opacity: o, ...style }}>
        <BadgeFace tone={tone} label={label} pill={pill} size={size} />
      </span>
    );
  }
  const p = ui(f, flipTo.at);
  return (
    <span style={{ display: 'inline-grid', opacity: o, ...style }}>
      <span style={{ gridArea: '1/1', opacity: 1 - p }}>
        <BadgeFace tone={tone} label={label} pill={pill} size={size} />
      </span>
      <span style={{ gridArea: '1/1', opacity: p }}>
        <BadgeFace tone={flipTo.tone} label={flipTo.label} pill={pill} size={size} />
      </span>
    </span>
  );
};

// ------------------------------------------------------------------ Button

export interface ButtonProps {
  variant: 'primary' | 'secondary' | 'quiet';
  size?: 'sm' | 'md';
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** The pressed state: primary scales 1 → 0.97 → 1 over 3 f; secondary shows the active fill for 6 f. */
  pressAt?: F;
  /** Appears at this frame (`ui`). */
  at?: F;
  /** Fades to 0 from this frame (`ui`). */
  fadeAt?: F;
  /** Swap label (e.g. "Fixed · 1 place") at a frame. */
  flipTo?: { label: React.ReactNode; at: F; tone?: 'success' };
  /** Hold the pressed (active) fill from pressAt onwards (quick replies). */
  latch?: boolean;
  /** Extra opacity (e.g. 0.4 for a reply not chosen). */
  opacity?: number;
  anchor?: string;
  style?: React.CSSProperties;
}

/** Primary / secondary / quiet action, lifted from chrome.css `.btn`. */
export const Button: React.FC<ButtonProps> = ({ variant, size = 'md', label, icon, pressAt, at, fadeAt, flipTo, latch, opacity = 1, anchor, style }) => {
  const f = useCurrentFrame();
  const o = (at === undefined ? 1 : ui(f, at)) * (fadeAt === undefined ? 1 : 1 - ui(f, fadeAt)) * opacity;
  if (o <= 0) return null;
  const primary = variant === 'primary';
  const pressed = pressAt !== undefined && f >= pressAt && (latch || f < pressAt + 6);
  const flipped = flipTo && f >= flipTo.at;
  const sm = size === 'sm';
  const success = flipped && flipTo?.tone === 'success';
  return (
    <span
      data-anchor={anchor}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontFamily: FONT.sans,
        fontSize: sm ? TYPE.label : TYPE.ui,
        fontWeight: primary ? 700 : 600,
        lineHeight: 1.3,
        borderRadius: RADIUS.control,
        padding: primary ? (sm ? '5px 11px' : '8px 16px') : sm ? '5px 11px' : '7px 15px',
        whiteSpace: 'nowrap',
        border: `1px solid ${primary && !success ? C.ink : success ? C.success.tint : C.border}`,
        background: success
          ? C.success.tint
          : primary
            ? C.ink
            : variant === 'quiet'
              ? pressed
                ? C.sunken
                : 'transparent'
              : pressed
                ? C.active
                : C.pane,
        color: success ? C.success.text : primary ? '#fff' : C.text2,
        boxShadow: primary && pressed ? 'inset 0 1px 3px rgba(0,0,0,0.3)' : undefined,
        transform: primary ? `scale(${pressScale(f, pressAt)})` : undefined,
        opacity: o,
        boxSizing: 'border-box',
        ...(variant === 'quiet' ? { borderColor: 'transparent' } : {}),
        ...style,
      }}
    >
      {icon}
      {flipped ? flipTo!.label : label}
    </span>
  );
};

// ------------------------------------------------------------------ Chip

/** Source-row chip under a composer: transparent, hairline, 999 radius. */
export const Chip: React.FC<{ label: React.ReactNode; active?: boolean; icon?: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({
  label,
  active,
  icon,
  size = TYPE.label,
  style,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5 * (size / TYPE.label),
      border: `1px solid ${active ? 'rgba(20,20,20,0.22)' : 'rgba(20,20,20,0.09)'}`,
      background: active ? C.sunken : 'transparent',
      borderRadius: 999,
      padding: `${(4 * size) / TYPE.label}px ${(10 * size) / TYPE.label}px`,
      fontFamily: FONT.sans,
      fontSize: size,
      fontWeight: 500,
      color: active ? C.text : C.text2,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {icon}
    {label}
  </span>
);

// ------------------------------------------------------------------ SourceChip

export interface SourceChipProps {
  /** Document reference, e.g. "WA-GEO-GIR-004". */
  docRef: string;
  variant?: 'library' | 'auth';
  /** Pops in at this frame (scale 0.85 → 1, 5 f). */
  at?: F;
  /** Active (clicked) state from this frame: ink outline. */
  activeAt?: F;
  size?: number;
  style?: React.CSSProperties;
}

/** The inline source pill after a claim it backs (tokens: source-chip-lib-*). */
export const SourceChip: React.FC<SourceChipProps> = ({ docRef, variant = 'library', at, activeAt, size = 11, style }) => {
  const f = useCurrentFrame();
  const p = at === undefined ? 1 : appear(f, at, 5, ease.out);
  const active = activeAt !== undefined && f >= activeAt;
  const lib = variant === 'library';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 4,
        fontFamily: FONT.sans,
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.35,
        borderRadius: 999,
        padding: '2px 8px',
        verticalAlign: 'baseline',
        whiteSpace: 'nowrap',
        border: `1px solid ${active ? C.ink : lib ? C.border : C.info.text}`,
        background: active ? C.pane : lib ? C.sunken : C.info.tint,
        color: active ? C.ink : lib ? C.text2 : C.info.text,
        opacity: p,
        transform: `scale(${0.85 + 0.15 * p})`,
        boxShadow: active ? '0 0 0 3px rgba(28,27,24,0.08)' : undefined,
        ...style,
      }}
    >
      {docRef}
    </span>
  );
};

/** Alias: some briefs call the source pill a citation chip (the word never appears on screen). */
export const CitationChip = SourceChip;

// ------------------------------------------------------------------ WithheldNotice

/** Amber block: content exists but is out of reach. Warning tone, never red. */
export const WithheldNotice: React.FC<{ text: React.ReactNode; at?: F; size?: number; style?: React.CSSProperties }> = ({
  text,
  at,
  size = TYPE.ui,
  style,
}) => {
  const f = useCurrentFrame();
  const p = at === undefined ? 1 : appear(f, at, 9);
  if (p <= 0) return null;
  return (
    <div
      style={{
        background: C.warning.tint,
        color: C.warning.text,
        borderRadius: RADIUS.control,
        padding: '8px 12px',
        fontFamily: FONT.sans,
        fontSize: size,
        fontWeight: 500,
        lineHeight: 1.45,
        opacity: p,
        transform: `translateY(${(1 - p) * 6}px)`,
        ...style,
      }}
    >
      {text}
    </div>
  );
};
