/**
 * The caption block, chapter bar and seat tags (walkthroughs master-plan
 * §2.3, §2.4). All of it lives in the caption band (y 969–1080), never over
 * the app.
 */
import React from 'react';
import { interpolateColors, useCurrentFrame } from 'remotion';
import { appear, C, countWords, ease, FONT, type F } from '../../shared';
import { WT_PEOPLE, type WtPersonKey } from '../../data/wrenfield';
import { CAPTION_BAND, type Chapter } from './geometry';

export interface CaptionCue {
  /** Starts fading in here: 9 f BEFORE the action it labels. */
  from: F;
  /** Starts fading out here (6 f). The next cue may start at `to + 3`. */
  to: F;
  /** 1-based chapter; 0 = the glimpse ("Where this ends"). */
  chapter: number;
  /** ≤ 8 words, present tense, hyphens, sentence case, no full stop. */
  line: string;
  /** Who acts (single window only; in split the tags sit over the windows). */
  seat?: WtPersonKey;
  /** Override the label row text (rare). */
  label?: string;
}

export const seatText = (seat: WtPersonKey) => `${WT_PEOPLE[seat].name}, ${WT_PEOPLE[seat].org}`;

/** Dot in the seat colour + "Name, Organisation". 15 px in the caption row, 17 px over split windows. */
export const SeatTag: React.FC<{ seat: WtPersonKey; size?: 15 | 17; style?: React.CSSProperties }> = ({ seat, size = 15, style }) => {
  const big = size === 17;
  const dot = big ? 9 : 8;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: big ? 9 : 8,
        fontFamily: FONT.sans,
        fontSize: size,
        lineHeight: `${size}px`,
        fontWeight: big ? 600 : 500,
        color: big ? C.ink : C.text2,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span style={{ width: dot, height: dot, borderRadius: 999, background: WT_PEOPLE[seat].seatColour, flex: 'none' }} />
      {seatText(seat)}
    </span>
  );
};

const labelOf = (cue: CaptionCue, chapters: Chapter[]) =>
  cue.label ?? (cue.chapter === 0 ? 'Where this ends' : `${cue.chapter} / ${chapters.length} · ${chapters[cue.chapter - 1]?.name ?? ''}`);

/** One cue's opacity and lift at f (in 9 f ease.out with a 6 px rise; out 6 f). */
function cueAnim(f: number, from: F, to: F) {
  const i = appear(f, from, 9, ease.out);
  const o = i * (1 - appear(f, to, 6, ease.linear));
  return { o, dy: (1 - i) * 6 };
}

export const Caption: React.FC<{ cues: CaptionCue[]; chapters: Chapter[] }> = ({ cues, chapters }) => {
  const f = useCurrentFrame();
  const sorted = [...cues].sort((a, b) => a.from - b.from);
  // Label rows: merge neighbouring cues whose label + seat are unchanged, so
  // the row only animates when its text changes (§2.4).
  const rows: Array<{ from: F; to: F; label: string; seat?: WtPersonKey }> = [];
  for (const c of sorted) {
    const label = labelOf(c, chapters);
    const prev = rows[rows.length - 1];
    if (prev && prev.label === label && prev.seat === c.seat && c.from <= prev.to + 6) prev.to = Math.max(prev.to, c.to);
    else rows.push({ from: c.from, to: c.to, label, seat: c.seat });
  }
  return (
    <>
      {rows.map((r, i) => {
        if (f < r.from || f >= r.to + 6) return null;
        const { o, dy } = cueAnim(f, r.from, r.to);
        return (
          <div
            key={`r${i}`}
            style={{
              position: 'absolute',
              left: CAPTION_BAND.x,
              top: CAPTION_BAND.labelTop,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              opacity: o,
              transform: `translateY(${dy}px)`,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                fontFamily: FONT.sans,
                fontSize: 15,
                lineHeight: '15px',
                fontWeight: 600,
                color: C.muted,
                letterSpacing: 0.2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {r.label}
            </span>
            {r.seat ? <SeatTag seat={r.seat} /> : null}
          </div>
        );
      })}
      {sorted.map((c, i) => {
        if (f < c.from || f >= c.to + 6) return null;
        const { o, dy } = cueAnim(f, c.from, c.to);
        return (
          <div
            key={`c${i}`}
            style={{
              position: 'absolute',
              left: CAPTION_BAND.x,
              top: CAPTION_BAND.lineTop,
              maxWidth: 880,
              fontFamily: FONT.sans,
              fontSize: 26,
              lineHeight: '32px',
              fontWeight: 500,
              color: C.ink,
              whiteSpace: 'nowrap',
              opacity: o,
              transform: `translateY(${dy}px)`,
            }}
          >
            {c.line}
          </div>
        );
      })}
    </>
  );
};

// ------------------------------------------------------------------ chapter bar

export interface ChapterBarProps {
  chapters: Chapter[];
  /** Fades in over 12 f from here (default: chapter 1's first frame). */
  showFrom?: F;
}

const MUTED = C.muted; // upcoming
const DONE = C.text2;

export const ChapterBar: React.FC<ChapterBarProps> = ({ chapters, showFrom }) => {
  const f = useCurrentFrame();
  const start = showFrom ?? chapters[0]?.from ?? 0;
  const o = appear(f, start, 12, ease.out);
  if (o <= 0) return null;
  // Text baseline sits on the caption line's baseline (y 1039.5). Item box:
  // 3 px track, 4 px gap (6 px over the cap height), 15 px line.
  const bottom = CAPTION_BAND.baseline + (15 - 12.95);
  return (
    <div
      style={{
        position: 'absolute',
        right: 1920 - 1800,
        top: bottom - 22,
        height: 22,
        maxWidth: 760,
        display: 'flex',
        gap: 28,
        opacity: o,
      }}
    >
      {chapters.map((ch, i) => {
        const inP = appear(f, ch.from, 5, ease.linear); // upcoming → current
        const outP = appear(f, ch.to, 5, ease.linear); // current → done
        const colour = f < ch.to ? interpolateColors(inP, [0, 1], [MUTED, C.ink]) : interpolateColors(outP, [0, 1], [C.ink, DONE]);
        const bold = f < ch.to ? inP : 1 - outP;
        const progress = f < ch.from ? 0 : f >= ch.to ? 1 : (f - ch.from) / (ch.to - ch.from);
        const trackFill = f >= ch.to ? interpolateColors(outP, [0, 1], [C.ink, C.muted]) : C.ink;
        const label = (w: number) => (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontWeight: w }}>
            <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
            <span style={{ fontSize: 15, fontWeight: w }}>{ch.name}</span>
          </span>
        );
        return (
          <div key={ch.name} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 3, borderRadius: 2, background: C.borderStrong, overflow: 'hidden' }}>
              <div style={{ width: `${progress * 100}%`, height: 3, background: trackFill }} />
            </div>
            <div
              style={{
                marginTop: 4,
                display: 'grid',
                fontFamily: FONT.sans,
                lineHeight: '15px',
                color: colour,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ gridArea: '1/1', opacity: 1 - bold }}>{label(500)}</span>
              <span style={{ gridArea: '1/1', opacity: bold }}>{label(600)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ checks

const BANNED = ['real-time', 'realtime', 'verified', 'compliant', 'ai-approved', 'deleted', 'archived', 'template'];

/**
 * Lint a caption list against §2.4 / §6.4: ≤ 8 words, no em or en dash, no
 * full stop, minimum hold, no overlap, no banned words. Returns problems
 * (empty = clean). Call it from a Video and `console.warn` the result.
 */
export function checkCaptions(cues: CaptionCue[]): string[] {
  const out: string[] = [];
  const sorted = [...cues].sort((a, b) => a.from - b.from);
  sorted.forEach((c, i) => {
    const w = countWords(c.line);
    const tag = `caption @${c.from} "${c.line}"`;
    if (w > 8) out.push(`${tag}: ${w} words (max 8)`);
    if (/[—–]/.test(c.line)) out.push(`${tag}: em/en dash (captions use hyphens)`);
    if (/\.$/.test(c.line.trim())) out.push(`${tag}: ends with a full stop`);
    const hold = c.to - c.from;
    const min = Math.max(75, w * 8 + 24);
    if (hold < min) out.push(`${tag}: holds ${hold} f, needs ${min}`);
    for (const b of BANNED) if (c.line.toLowerCase().includes(b)) out.push(`${tag}: banned word "${b}"`);
    const next = sorted[i + 1];
    if (next && next.from < c.to + 3) out.push(`${tag}: next cue starts at ${next.from}, before ${c.to + 3}`);
  });
  return out;
}
