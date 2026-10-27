/**
 * Film furniture (master-plan §5.2): fields, the wordmark, title cards, the
 * clip open and end card, the body fade-out and seat labels.
 */
import React, { useLayoutEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from 'remotion';
import { C, FONT, fontsReady } from './theme';
import { appear, between, ease, type F } from './motion';

// ------------------------------------------------------------------ Field

export type Tone = 'field' | 'ink';

export const Field: React.FC<{ tone?: Tone; children?: React.ReactNode; style?: React.CSSProperties }> = ({
  tone = 'field',
  children,
  style,
}) => <AbsoluteFill style={{ background: tone === 'ink' ? C.ink : C.field, ...style }}>{children}</AbsoluteFill>;

// ------------------------------------------------------------------ Wordmark

const WORDMARK = {
  18: { radius: 4, gap: 8 },
  72: { radius: 16, gap: 32 },
  96: { radius: 21, gap: 42 },
} as const;

export interface WordmarkProps {
  size: 18 | 72 | 96;
  tone?: 'onInk' | 'onField';
  opacity?: number;
  style?: React.CSSProperties;
}

/** CSS square + "Infora" in Source Serif 4. No invented mark (product-inventory §4.1). */
export const Wordmark: React.FC<WordmarkProps> = ({ size, tone = 'onInk', opacity = 1, style }) => {
  const g = WORDMARK[size];
  const colour = tone === 'onInk' ? C.field : C.ink;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: g.gap, opacity, ...style }}>
      <div style={{ width: size, height: size, borderRadius: g.radius, background: colour, flex: 'none' }} />
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: size,
          lineHeight: 1,
          fontWeight: 400,
          color: colour,
          letterSpacing: size >= 72 ? -0.01 * size : 0,
          transform: `translateY(${-size * 0.04}px)`,
        }}
      >
        Infora
      </div>
    </div>
  );
};

/** Wordmark centred on a screen point. */
export const CentredWordmark: React.FC<WordmarkProps & { cx?: number; cy?: number }> = ({ cx = 960, cy = 540, ...p }) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)' }}>
      <Wordmark {...p} />
    </div>
  </AbsoluteFill>
);

// ------------------------------------------------------------------ Card text

export interface CardSeg {
  text: string;
  italic: boolean;
}
/** A word on a card, possibly with mixed italic segments (e.g. `*guesses*.`). */
export type CardWord = CardSeg[];

/** Parse `*word*` italics into words. */
export function parseCard(text: string): CardWord[][] {
  // Lines split on explicit newlines.
  return text.split('\n').map((line) =>
    line
      .split(' ')
      .filter(Boolean)
      .map((w) => {
        const segs: CardSeg[] = [];
        const re = /\*([^*]+)\*/g;
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(w))) {
          if (m.index > last) segs.push({ text: w.slice(last, m.index), italic: false });
          segs.push({ text: m[1], italic: true });
          last = m.index + m[0].length;
        }
        if (last < w.length) segs.push({ text: w.slice(last), italic: false });
        return segs;
      }),
  );
}

const fitCache = new Map<string, { size: number; text: string }>();

function measureWidth(ctx: CanvasRenderingContext2D, words: CardWord[], size: number): number {
  let w = 0;
  words.forEach((word, i) => {
    word.forEach((s) => {
      ctx.font = `${s.italic ? 'italic ' : ''}400 ${size}px "${FONT.family.serif}"`;
      w += ctx.measureText(s.text).width;
    });
    if (i < words.length - 1) {
      ctx.font = `400 ${size}px "${FONT.family.serif}"`;
      w += ctx.measureText(' ').width;
    }
  });
  return w;
}

/**
 * Size stepping (§4.2): base, then base × 88/96, then base × 80/96, keeping
 * one line under `maxWidth`. If even the smallest overflows and the card has
 * two sentences, break at the full stop at the base size. Never wraps
 * mid-sentence. Measures after fonts load (delayRender-guarded).
 */
export function useCardFit(text: string, base: number, maxWidth = 1500): { size: number; text: string } | null {
  const key = `${text}|${base}|${maxWidth}`;
  const [fit, setFit] = useState(() => fitCache.get(key) ?? null);
  useLayoutEffect(() => {
    if (fitCache.has(key)) {
      setFit(fitCache.get(key)!);
      return;
    }
    const handle = delayRender(`fit title card: ${text}`);
    const fam = FONT.family.serif;
    fontsReady
      .then(() => Promise.all([document.fonts.load(`400 ${base}px "${fam}"`), document.fonts.load(`italic 400 ${base}px "${fam}"`)]))
      .then(() => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        const words = parseCard(text.replace(/\n/g, ' '))[0];
        const steps = [base, (base * 88) / 96, (base * 80) / 96];
        let result: { size: number; text: string } | null = null;
        if (!text.includes('\n')) {
          for (const s of steps) {
            if (measureWidth(ctx, words, s) <= maxWidth) {
              result = { size: s, text };
              break;
            }
          }
        }
        if (!result) {
          const broken = text.includes('\n') ? text : text.replace(/\. /, '.\n');
          result = { size: text.includes('\n') || broken !== text ? base : steps[2], text: broken };
        }
        fitCache.set(key, result);
        setFit(result);
        continueRender(handle);
      })
      .catch(() => {
        const result = { size: base, text };
        setFit(result);
        continueRender(handle);
      });
  }, [key, text, base, maxWidth]);
  return fit;
}

// ------------------------------------------------------------------ WordReveal

export interface CardTextProps {
  text: string;
  /** Base size before stepping (96 for cards, 84 for end-card lines). */
  size?: number;
  colour?: string;
  from?: F;
  staggerF?: number;
  /** Skip the reveal (already on screen). */
  revealed?: boolean;
  maxWidth?: number;
}

/** Serif card text with `*italic*` words and the WordReveal (§4.5). Unpositioned. */
export const CardText: React.FC<CardTextProps> = ({
  text,
  size = 96,
  colour = C.ink,
  from = 0,
  staggerF = 4,
  revealed = false,
  maxWidth = 1500,
}) => {
  const frame = useCurrentFrame();
  const fit = useCardFit(text, size, maxWidth);
  if (!fit) return null;
  const lines = parseCard(fit.text);
  let idx = 0;
  return (
    <div
      style={{
        fontFamily: FONT.serif,
        fontSize: fit.size,
        lineHeight: 1.1,
        fontWeight: 400,
        color: colour,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        letterSpacing: -0.01 * fit.size,
        fontFeatureSettings: '"kern", "liga"',
      }}
    >
      {lines.map((line, li) => (
        <div key={li}>
          {line.map((word, wi) => {
            const i = idx++;
            const p = revealed ? 1 : appear(frame, from + i * staggerF, 10, ease.out);
            return (
              <React.Fragment key={wi}>
                <span style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
                  {word.map((s, si) => (
                    <span key={si} style={{ fontStyle: s.italic ? 'italic' : 'normal' }}>
                      {s.text}
                    </span>
                  ))}
                </span>
                {wi < line.length - 1 ? ' ' : null}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ------------------------------------------------------------------ TitleCard

export interface TitleCardProps {
  /** `*word*` marks the one italic word. */
  text: string;
  tone?: Tone;
  from?: F;
  staggerF?: number;
  /** Centre y on screen (default 540). */
  y?: number;
  /** Base size before stepping (default 96). */
  size?: number;
  /** Draw the field behind the card (default true). */
  background?: boolean;
  style?: React.CSSProperties;
}

/** Full-frame serif card on the field or ink. Cards cut out (no fade). */
export const TitleCard: React.FC<TitleCardProps> = ({ text, tone = 'field', from = 0, staggerF = 4, y = 540, size = 96, background = true, style }) => (
  <AbsoluteFill style={{ background: background ? (tone === 'ink' ? C.ink : C.field) : undefined }}>
    <div style={{ position: 'absolute', left: 960, top: y, transform: 'translate(-50%, -50%)', ...style }}>
      <CardText text={text} size={size} colour={tone === 'ink' ? C.field : C.ink} from={from} staggerF={staggerF} />
    </div>
  </AbsoluteFill>
);

// ------------------------------------------------------------------ ClipOpen / EndCard

export const CLIP_OPEN_FRAMES = 30;
export const END_CARD_FRAMES = 90;

/** 30 f: ink, Wordmark 72 fades in 0–8. Standalone only. */
export const ClipOpen: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Field tone="ink">
      <CentredWordmark size={72} tone="onInk" opacity={appear(f, 0, 8, ease.out)} />
    </Field>
  );
};

/**
 * 90 f on ink: the line WordReveals at 84 px; 40–54 it moves up 70 px and dims
 * to 0.55 while Wordmark 72 fades in, centre y 590; hold to 89.
 */
export const EndCard: React.FC<{ line: string }> = ({ line }) => {
  const f = useCurrentFrame();
  const move = between(f, [40, 54], [0, 1], ease.out);
  return (
    <Field tone="ink">
      <div
        style={{
          position: 'absolute',
          left: 960,
          top: 540 - 70 * move,
          transform: 'translate(-50%, -50%)',
          opacity: 1 - 0.45 * move,
        }}
      >
        <CardText text={line} size={84} colour={C.field} from={0} />
      </div>
      <div style={{ position: 'absolute', left: 960, top: 590, transform: 'translate(-50%, -50%)' }}>
        <Wordmark size={72} tone="onInk" opacity={appear(f, 40, 14, ease.out)} />
      </div>
    </Field>
  );
};

// ------------------------------------------------------------------ FadeOutToField

/** The body's closing fade: the field rises over everything (ease.in, 12 f). */
export const FadeOutToField: React.FC<{ from: F; dur?: number; tone?: Tone }> = ({ from, dur = 12, tone = 'field' }) => {
  const f = useCurrentFrame();
  const o = between(f, [from, from + dur - 1], [0, 1], ease.in);
  if (o <= 0) return null;
  // zIndex above every overlay (SeatLabel 50, SavedStrip 40) so nothing survives the fade.
  return <Field tone={tone} style={{ opacity: o, zIndex: 1000 }} />;
};

// ------------------------------------------------------------------ SeatLabel

export type Seat = 'consultant' | 'client' | 'supplier';

export interface SeatLabelProps {
  seat: Seat;
  text: string;
  at: F;
  /** Centre point, screen px. */
  x: number;
  y: number;
  exitAt?: F;
  opacity?: number;
}

/** White Inter 22/600 on the seat colour pill. Overlay only; never blurred. */
export const SeatLabel: React.FC<SeatLabelProps> = ({ seat, text, at, x, y, exitAt, opacity = 1 }) => {
  const f = useCurrentFrame();
  const inP = appear(f, at, 9);
  const outP = exitAt === undefined ? 1 : 1 - appear(f, exitAt, 9);
  const o = inP * outP * opacity;
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) translateY(${(1 - inP) * 8}px)`,
        opacity: o,
        height: 44,
        padding: '0 20px',
        borderRadius: 999,
        background: C.seat[seat],
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: FONT.sans,
        fontSize: 22,
        lineHeight: 1.2,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        zIndex: 50,
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: '#fff', flex: 'none' }} />
      {text}
    </div>
  );
};
