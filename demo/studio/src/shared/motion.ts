/**
 * Easing and timing helpers (master-plan §4.5). Everything is a pure function
 * of the frame: no Math.random, no Date.
 */
import { Easing, interpolate } from 'remotion';

export type F = number;
type EaseFn = (t: number) => number;

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  linear: (t: number) => t,
} as const;
export type EaseName = keyof typeof ease;

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0 → 1 over `dur` frames from `at` (default the `panel` 9 f, ease.out). */
export function appear(f: number, at: F, dur = 9, easing: EaseFn = ease.out): number {
  if (dur <= 0) return f >= at ? 1 : 0;
  return interpolate(f, [at, at + dur], [0, 1], { ...CLAMP, easing });
}

/** 1 → 0 over `dur` frames from `at`. */
export function vanish(f: number, at: F, dur = 9, easing: EaseFn = ease.out): number {
  return 1 - appear(f, at, dur, easing);
}

/** Clamped interpolate between two frames. */
export function between(f: number, [a, b]: [F, F], [from, to]: [number, number], easing: EaseFn = ease.inOut): number {
  if (b <= a) return f >= b ? to : from;
  return interpolate(f, [a, b], [from, to], { ...CLAMP, easing });
}

/** Clamped multi-key interpolate (keys ascending). */
export function keyed(f: number, frames: F[], values: number[], easing: EaseFn = ease.inOut): number {
  return interpolate(f, frames, values, { ...CLAMP, easing });
}

/** Minimum readable hold (§4.3): words × 8 f, or × 4 f for a recap or label. */
export const holdFor = (words: number, recap = false) => words * (recap ? 4 : 8);

/** The `ui` transition: linear over 5 f. */
export const ui = (f: number, at: F) => appear(f, at, 5, ease.linear);

/** Characters revealed for agent text (3 chars/frame, §4.5). */
export const agentChars = (f: number, at: F, rate = 3) => Math.max(0, Math.floor((f - at + 1) * rate));

/** Frames an agent line takes to reveal at 3 chars/frame. */
export const agentRevealFrames = (text: string, rate = 3) => Math.ceil(text.length / rate);

/** `press` (§4.5): scale 1 → 0.97 → 1 over 3 f from `at`. */
export function pressScale(f: number, at: F | undefined): number {
  if (at === undefined) return 1;
  return interpolate(f, [at, at + 1, at + 3], [1, 0.97, 1], CLAMP);
}

/** Deterministic PRNG (mulberry32) for seeded Greek widths. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable numeric hash of a string (for default seeds). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Word count per §4.3 rule 6: dashes, "·" and "✓" are not words. */
export function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((w) => w && !/^[—–\-·✓]+$/.test(w)).length;
}
