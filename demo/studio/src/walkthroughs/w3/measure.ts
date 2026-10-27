/**
 * W3 text measurement (local). Several W3 beats need to know where a word or a
 * pill lands after wrapping, at render time, so cursors can be authored onto
 * them and the canvas can follow-scroll while the suggestion streams:
 *   - the follow-scroll (`scroll = max(0, revealedBottom − 776)`, §3.7 / 4.5),
 *   - the claim-3 pill Nadia hovers, the callout's ✓ Accept,
 *   - "dewatering" in the accepted paragraph (the selection drag),
 *   - the composer's line count (where the chips sit), the comment cards.
 *
 * It measures with a canvas 2D context in the loaded faces (Inter, Source
 * Serif 4, JetBrains Mono) and wraps greedily the way Chrome does for this
 * copy: breaks at spaces, after an en/em dash, and after a hyphen followed by
 * a letter. Pure and deterministic once the fonts are ready (Video waits).
 */
import { FONT } from '../../shared';

export type Family = 'sans' | 'serif' | 'mono';

export interface TextStyle {
  size: number;
  weight?: number;
  family?: Family;
  /** px letter-spacing (uppercase micro labels). */
  ls?: number;
  upper?: boolean;
}

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

/** Width of `text` in px. */
export function tw(text: string, st: TextStyle): number {
  const fam = FONT.family[st.family ?? 'sans'];
  const s = st.upper ? text.toUpperCase() : text;
  const k = `${fam}|${st.size}|${st.weight ?? 400}|${st.ls ?? 0}|${s}`;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return s.length * st.size * 0.5;
  ctx.font = `${st.weight ?? 400} ${st.size}px "${fam}"`;
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  c.letterSpacing = `${st.ls ?? 0}px`;
  const w = ctx.measureText(s).width;
  cache.set(k, w);
  return w;
}

/** A run of text, or an atomic inline box (a pill), in a flowed paragraph. */
export type Part = { text: string; st: TextStyle; tag?: string } | { box: number; tag?: string };

export interface Placed {
  tag?: string;
  /** The word (text parts) — '' for boxes. */
  word: string;
  line: number;
  x0: number;
  x1: number;
}

interface Word {
  w: number;
  space: number;
  tag?: string;
  word: string;
  hard?: boolean;
}

/** Split text into break-separated words (spaces; after – —; after - before a letter). */
function words(text: string, st: TextStyle, tag: string | undefined, out: Word[], pendingSpace: { v: number }) {
  const sp = tw(' ', st);
  const lines = text.split('\n');
  lines.forEach((ln, li) => {
    if (li > 0) {
      out.push({ w: 0, space: 0, word: '', hard: true, tag });
      pendingSpace.v = 0;
    }
    const runs = ln.split(/( +)/);
    for (const r of runs) {
      if (r === '') continue;
      if (/^ +$/.test(r)) {
        pendingSpace.v += sp * r.length;
        continue;
      }
      // break opportunities inside a run
      const pieces: string[] = [];
      let cur = '';
      for (let i = 0; i < r.length; i++) {
        cur += r[i];
        const ch = r[i];
        const next = r[i + 1];
        if (next !== undefined && (ch === '–' || ch === '—' || (ch === '-' && /[A-Za-z]/.test(next) && i > 0))) {
          pieces.push(cur);
          cur = '';
        }
      }
      if (cur) pieces.push(cur);
      pieces.forEach((p, i) => {
        out.push({ w: tw(p, st), space: i === 0 ? pendingSpace.v : 0, tag, word: p });
        if (i === 0) pendingSpace.v = 0;
      });
    }
  });
}

/** Greedy line layout of parts in `maxW`. */
export function flow(parts: Part[], maxW: number): { lines: number; placed: Placed[]; lastX: number } {
  const ws: Word[] = [];
  const pending = { v: 0 };
  for (const p of parts) {
    if ('box' in p) {
      ws.push({ w: p.box, space: pending.v, tag: p.tag, word: '' });
      pending.v = 0;
    } else words(p.text, p.st, p.tag, ws, pending);
  }
  const placed: Placed[] = [];
  let line = 0;
  let x = 0;
  let has = false;
  for (const w of ws) {
    if (w.hard) {
      line++;
      x = 0;
      has = false;
      continue;
    }
    if (has && x + w.space + w.w > maxW + 0.01) {
      line++;
      x = 0;
    } else if (has) x += w.space;
    placed.push({ tag: w.tag, word: w.word, line, x0: x, x1: x + w.w });
    x += w.w;
    has = true;
  }
  return { lines: line + 1, placed, lastX: x };
}

/** Number of lines `text` takes in `maxW`. */
export const lineCount = (text: string, st: TextStyle, maxW: number) => (text === '' ? 1 : flow([{ text, st }], maxW).lines);
