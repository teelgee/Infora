/**
 * The hero composer and the phrase lift (master-plan §5.3).
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ArrowUp } from 'lucide-react';
import { C, FONT, SHADOW } from './theme';
import { appear, ease, pressScale, type F } from './motion';
import { Highlight } from './focus';
import { typedCount } from './cursor';
import { AgentGlyph, Chip } from './ui/primitives';

// ------------------------------------------------------------------ PromptHero

export interface PromptHeroProps {
  placeholder?: string;
  /** The prompt, typed from typeFrom to typeTo. */
  text: string;
  typeFrom: F;
  typeTo: F;
  /** Keyboard send: the send circle presses (no cursor). */
  sendAt?: F;
  author?: { name: string; org: string };
  /** Phrases wiped with Highlight at `at`; each becomes a PhraseLift source `id`. */
  highlights?: Array<{ phrase: string; at: F; id: string }>;
  /** Chips under the composer (22 px); the first `activeChip` is filled. */
  chips?: string[];
  activeChip?: string;
  /** Montage: a chip-style phrase after the text that swaps (4 f crossfade). */
  swapChip?: Array<{ text: string; from: F }>;
  /** Entry frame: scale 0.94 → 1 and fade over 9 f. */
  at?: F;
  /** Centre point (default 960, 540). */
  x?: number;
  y?: number;
  width?: number;
  /** Hide the send button (the Montage). */
  hideSend?: boolean;
  /** Caret colour/visibility. */
  caret?: boolean;
}

interface Seg {
  text: string;
  hl?: { at: F; id: string };
}

function segmentText(text: string, highlights: PromptHeroProps['highlights'] = []): Seg[] {
  const marks = highlights
    .map((h) => ({ ...h, idx: text.indexOf(h.phrase) }))
    .filter((h) => h.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  const segs: Seg[] = [];
  let cur = 0;
  for (const m of marks) {
    if (m.idx < cur) continue;
    if (m.idx > cur) segs.push({ text: text.slice(cur, m.idx) });
    segs.push({ text: m.phrase, hl: { at: m.at, id: m.id } });
    cur = m.idx + m.phrase.length;
  }
  if (cur < text.length) segs.push({ text: text.slice(cur) });
  return segs;
}

/**
 * Composer 1360 px wide, sunken, radius 20, popout shadow, `✦`, Inter 44 /
 * 1.35, padding 40, 64 px send circle. Rendered in screen px (no Float).
 */
export const PromptHero: React.FC<PromptHeroProps> = ({
  placeholder = '',
  text,
  typeFrom,
  typeTo,
  sendAt,
  author,
  highlights,
  chips,
  activeChip,
  swapChip,
  at,
  x = 960,
  y = 540,
  width = 1360,
  hideSend = false,
  caret = true,
}) => {
  const f = useCurrentFrame();
  const inP = at === undefined ? 1 : appear(f, at, 9);
  const n = typedCount(f, text, typeFrom, typeTo);
  const segs = segmentText(text, highlights);
  const showPlaceholder = n === 0 && !swapChip;
  const typing = f >= typeFrom && f < typeTo;
  const caretOn = caret && !swapChip && f >= typeFrom - 2 && (sendAt === undefined || f < sendAt) && (typing || Math.floor(f / 15) % 2 === 0);
  const sendReady = n > 0;

  let shown = 0;
  const body = segs.map((s, i) => {
    const take = Math.max(0, Math.min(s.text.length, n - shown));
    shown += s.text.length;
    if (take === 0) return null;
    const t = s.text.slice(0, take);
    return s.hl && take === s.text.length ? (
      <Highlight key={i} at={s.hl.at} id={s.hl.id}>
        {t}
      </Highlight>
    ) : (
      <span key={i}>{t}</span>
    );
  });

  // Montage swap chip.
  let swap: React.ReactNode = null;
  if (swapChip && swapChip.length) {
    swap = (
      <span style={{ display: 'inline-grid', verticalAlign: 'baseline' }}>
        {swapChip.map((c, i) => {
          const next = swapChip[i + 1];
          const o = (i === 0 ? 1 : appear(f, c.from, 4, ease.linear)) * (next ? 1 - appear(f, next.from, 4, ease.linear) : 1);
          return (
            <span
              key={c.text}
              style={{
                gridArea: '1/1',
                opacity: o,
                background: C.warning.tint,
                borderRadius: 14,
                padding: '0 16px',
                whiteSpace: 'nowrap',
                justifySelf: 'start',
              }}
            >
              {c.text}
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        transform: `translate(-50%, -50%) scale(${0.94 + 0.06 * inP})`,
        opacity: inP,
        fontFamily: FONT.sans,
      }}
    >
      {author ? (
        <div style={{ fontSize: 22, color: C.muted, marginBottom: 20, paddingLeft: 8, fontWeight: 500 }}>
          {author.name} · {author.org}
        </div>
      ) : null}
      <div
        style={{
          background: C.sunken,
          borderRadius: 20,
          boxShadow: SHADOW.popout,
          padding: 40,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 28,
          boxSizing: 'border-box',
        }}
      >
        <AgentGlyph size={34} style={{ marginTop: 13 }} />
        <div style={{ flex: 1, fontSize: 44, lineHeight: 1.35, color: C.text, minHeight: 44 * 1.35 }}>
          {showPlaceholder ? (
            <span style={{ color: C.muted }}>
              {caretOn ? <CaretBar /> : null}
              {placeholder}
            </span>
          ) : (
            <>
              {body}
              {swapChip ? ' ' : null}
              {swap}
              {caretOn ? <CaretBar /> : null}
            </>
          )}
        </div>
        {hideSend ? null : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              alignSelf: 'flex-end',
              background: sendReady ? C.ink : C.faint,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
              transform: `scale(${pressScale(f, sendAt)})`,
              boxShadow: sendAt !== undefined && f >= sendAt && f < sendAt + 4 ? 'inset 0 2px 6px rgba(0,0,0,0.4)' : undefined,
            }}
          >
            <ArrowUp size={30} color="#fff" strokeWidth={2.4} />
          </div>
        )}
      </div>
      {chips && chips.length ? (
        <div style={{ display: 'flex', gap: 12, marginTop: 20, paddingLeft: 8 }}>
          {chips.map((c) => (
            <Chip key={c} label={c} active={c === activeChip} size={22} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const CaretBar: React.FC = () => (
  <span style={{ display: 'inline-block', width: 3, height: '1.1em', background: C.ink, verticalAlign: '-0.2em', marginRight: 2 }} />
);

// ------------------------------------------------------------------ PhraseLift

export interface PhraseLiftProps {
  /** Source anchor id (a PromptHero highlight id). */
  id: string;
  from: F;
  dur?: number;
  /** Target anchor id, e.g. "step-5" (StepRail exposes `step-n`). */
  target: string;
  /** Final scale relative to the source (default: measured from target font size, else 0.5). */
  endScale?: number;
  /** Land on the target's own line, or just below it (the summary slot; default). */
  landing?: 'on' | 'below';
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface LiftState {
  src?: Rect;
  dst?: Rect;
  text: string;
  font: string;
  weight: string;
  srcPx: number;
  dstPx?: number;
}

/**
 * A copy of the phrase flies from its highlight rect to a StepRail row
 * (scale 1 → ~0.5, ease.inOut, 4 px blur in flight) and resolves into the row
 * (crossfade over the last 6 f). Place it at the top level of the body,
 * outside any Camera; it measures anchors live in the DOM each frame.
 */
export const PhraseLift: React.FC<PhraseLiftProps> = ({ id, from, dur = 20, target, endScale, landing = 'below' }) => {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const root = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<LiftState | null>(null);
  const active = f >= from - 1 && f <= from + dur;

  useLayoutEffect(() => {
    if (!active || !root.current) return;
    const r = root.current.getBoundingClientRect();
    const k = r.width / width;
    const doc = root.current.ownerDocument;
    const rel = (el: Element): Rect => {
      const b = el.getBoundingClientRect();
      return { x: (b.left - r.left) / k, y: (b.top - r.top) / k, w: b.width / k, h: b.height / k };
    };
    const srcEl = doc.querySelector(`[data-anchor="${id}"]`);
    const dstEl = doc.querySelector(`[data-anchor="${target}"]`);
    const next: LiftState = { ...(st ?? { text: '', font: FONT.sans, weight: '400', srcPx: 44 }) };
    if (srcEl) {
      const cs = getComputedStyle(srcEl);
      const he = srcEl as HTMLElement;
      const layoutW = he.offsetWidth || 1;
      const rect = rel(srcEl);
      next.src = rect;
      next.text = srcEl.textContent ?? '';
      next.font = cs.fontFamily;
      next.weight = cs.fontWeight;
      next.srcPx = parseFloat(cs.fontSize) * (rect.w / layoutW || 1);
    }
    if (dstEl) {
      const cs = getComputedStyle(dstEl);
      const he = dstEl as HTMLElement;
      const rect = rel(dstEl);
      next.dst = rect;
      next.dstPx = parseFloat(cs.fontSize) * (rect.w / (he.offsetWidth || 1) || 1);
    }
    const same =
      st &&
      JSON.stringify([st.src, st.dst, st.text, st.srcPx, st.dstPx]) === JSON.stringify([next.src, next.dst, next.text, next.srcPx, next.dstPx]);
    if (!same) setSt(next);
  });

  return (
    <AbsoluteFill ref={root} style={{ pointerEvents: 'none', zIndex: 60 }}>
      {active && st?.src && st.dst && f >= from ? <Flyer f={f} from={from} dur={dur} st={st} endScale={endScale} landing={landing} /> : null}
    </AbsoluteFill>
  );
};

const Flyer: React.FC<{ f: number; from: F; dur: number; st: LiftState; endScale?: number; landing: 'on' | 'below' }> = ({ f, from, dur, st, endScale, landing }) => {
  const t = ease.inOut(Math.min(1, Math.max(0, (f - from) / dur)));
  const src = st.src!;
  const dst = st.dst!;
  const s1 = endScale ?? (st.dstPx ? st.dstPx / st.srcPx : 0.5);
  const s = 1 + (s1 - 1) * t;
  const x = src.x + (dst.x - src.x) * t;
  const dstY = landing === 'below' ? dst.y + dst.h * 1.45 : dst.y + dst.h / 2;
  const y = src.y + src.h / 2 + (dstY - (src.y + src.h / 2)) * t;
  const blur = 4 * Math.sin(Math.PI * t);
  const fade = 1 - Math.min(1, Math.max(0, (f - (from + dur - 6)) / 6));
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transformOrigin: '0 50%',
        transform: `translateY(-50%) scale(${s})`,
        fontFamily: st.font,
        fontWeight: st.weight as React.CSSProperties['fontWeight'],
        fontSize: st.srcPx,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        color: C.text,
        background: C.warning.tint,
        borderRadius: 6,
        padding: '0 4px',
        marginLeft: -4,
        filter: `blur(${blur}px)`,
        opacity: fade,
        boxShadow: SHADOW.popout,
      }}
    >
      {st.text}
    </div>
  );
};
