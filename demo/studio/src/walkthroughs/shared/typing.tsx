/**
 * Typing and streaming (walkthroughs master-plan §2.11).
 *
 * People type with a seeded cadence: per-character gaps from {1,2,2,2,3} f,
 * +4 f after a comma, +8 f after a full stop (or ? !) mid-string. That is
 * ≈ 0.5 characters per frame. The agent never types: it streams at a fixed
 * rate (chat 3 c/f, document prose 4 c/f).
 *
 * Everything is a pure function of the frame, so shot tables can compute
 * end frames up front: `typedEndsAt(text, from, seed)`, `streamEndsAt(text, from, rate)`.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, seeded, type F } from '../../shared';

const GAPS = [1, 2, 2, 2, 3];

/** Frame at which each character of `text` appears (first at `from`). */
export function typingSchedule(text: string, from: F, seed = 1): number[] {
  const rnd = seeded(seed * 7919 + text.length);
  const out: number[] = [];
  let f = from;
  for (let i = 0; i < text.length; i++) {
    if (i > 0) {
      const prev = text[i - 1];
      let gap = GAPS[Math.floor(rnd() * GAPS.length)];
      if (prev === ',' || prev === ';' || prev === ':') gap += 4;
      if (prev === '.' || prev === '?' || prev === '!') gap += 8;
      f += gap;
    }
    out.push(f);
  }
  return out;
}

/** Frame the last character lands. */
export function typedEndsAt(text: string, from: F, seed = 1): F {
  const s = typingSchedule(text, from, seed);
  return s.length ? s[s.length - 1] : from;
}

/** Enter / Send: 8 f after the last character (§2.11). */
export const sendAt = (text: string, from: F, seed = 1): F => typedEndsAt(text, from, seed) + 8;

/** Characters visible at frame f. */
export function typedCountAt(f: number, text: string, from: F, seed = 1): number {
  if (f < from) return 0;
  const s = typingSchedule(text, from, seed);
  let n = 0;
  while (n < s.length && s[n] <= f) n++;
  return n;
}

export const Caret: React.FC<{ visible: boolean; colour?: string; height?: string }> = ({ visible, colour = C.ink, height = '1.15em' }) => (
  <span
    style={{
      display: 'inline-block',
      width: 2,
      height,
      marginLeft: 1,
      marginRight: -3,
      verticalAlign: '-0.2em',
      background: colour,
      opacity: visible ? 1 : 0,
    }}
  />
);

/** Blink 15/15 f from `since`; solid while typing. */
export const caretOn = (f: number, since: number) => Math.floor((f - since) / 15) % 2 === 0;

export interface HumanTypedProps {
  text: string;
  /** First character appears here. */
  from: F;
  seed?: number;
  /** Show the caret (default true). */
  caret?: boolean;
  /** Caret appears (focused, blinking) from here; default `from`. */
  caretFrom?: F;
  /** Caret gone from here; default: last character + 24 f. */
  caretUntil?: F;
  /** Muted placeholder shown while nothing is typed. */
  placeholder?: string;
  style?: React.CSSProperties;
}

/** A person typing into a field, at a believable, seeded cadence. */
export const HumanTyped: React.FC<HumanTypedProps> = ({ text, from, seed = 1, caret = true, caretFrom, caretUntil, placeholder, style }) => {
  const f = useCurrentFrame();
  const sched = typingSchedule(text, from, seed);
  let n = 0;
  while (n < sched.length && sched[n] <= f) n++;
  const end = sched.length ? sched[sched.length - 1] : from;
  const cFrom = caretFrom ?? from;
  const cUntil = caretUntil ?? end + 24;
  const lastKey = n > 0 ? sched[n - 1] : cFrom;
  const typing = n > 0 && n < sched.length;
  const showCaret = caret && f >= cFrom && f < cUntil;
  const solid = typing || f - lastKey < 8;
  return (
    <span style={style}>
      {n === 0 && placeholder ? (
        <>
          {showCaret ? <Caret visible={solid || caretOn(f, cFrom)} /> : null}
          <span style={{ color: C.muted }}>{placeholder}</span>
        </>
      ) : (
        <>
          {text.slice(0, n)}
          {showCaret ? <Caret visible={solid || caretOn(f, lastKey)} /> : null}
        </>
      )}
    </span>
  );
};

// ------------------------------------------------------------------ streaming

export const streamCount = (f: number, from: F, rate = 3) => (f < from ? 0 : Math.floor((f - from + 1) * rate));
/** Frame the last character of a stream lands. */
export const streamEndsAt = (text: string, from: F, rate = 3): F => from + Math.ceil(text.length / rate) - 1;

/** Agent text revealed at a fixed rate: 3 c/f in chat, 4 c/f for document prose. */
export const Streamed: React.FC<{ text: string; from: F; rate?: number; style?: React.CSSProperties }> = ({ text, from, rate = 3, style }) => {
  const f = useCurrentFrame();
  const n = Math.min(text.length, streamCount(f, from, rate));
  if (n <= 0) return null;
  return <span style={style}>{text.slice(0, n)}</span>;
};

/**
 * Timing for cited claims streamed one at a time (§2.11): 4 c/f, a 4 f gap
 * between claims, each pill fading in 2 f after its claim's last character.
 */
export function claimsSchedule(claims: Array<{ text: string }>, from: F, rate = 4, gap = 4) {
  let f = from;
  return claims.map((c) => {
    const start = f;
    const end = streamEndsAt(c.text, start, rate);
    f = end + 1 + gap;
    return { start, end, pillAt: end + 2 };
  });
}
