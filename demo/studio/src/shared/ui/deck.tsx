/**
 * The progress-pack slide deck (video-05 "The deck"; its type sizes win over
 * the master). Slides render at 1600 × 900 native and are shown in a 3 × 2
 * grid at 0.25.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FileText } from 'lucide-react';
import { C, CHART, FONT, SHADOW } from '../theme';
import { appear, type F } from '../motion';
import { Highlight } from '../focus';
import { Badge, type BadgeTone } from './primitives';
import { COMMENTARY, DECK_APP, DECK_FOOTER, ORGS, PROGRAMME, PROJECT, type PackageStatus, type ProgrammeRow } from '../../data/wrenfield';

export type SlideSpec =
  | { kind: 'title'; n: number }
  | {
      kind: 'package';
      n: number;
      row: ProgrammeRow;
      commentary: { progress: string; risk: string; decision: string };
      /** Slide 4: Actual bar amber, forecast delta, "from cost & programme.xlsx". */
      emphasis?: boolean;
      quoteHighlightAt?: F;
      forecastHighlightAt?: F;
    }
  | { kind: 'summary'; n: number };

const TOTAL = 6;
const STATUS_TONE: Record<PackageStatus, BadgeTone> = { 'On track': 'success', 'At risk': 'warning', Behind: 'danger' };
const k = (n: number) => `£${n.toLocaleString('en-GB')}k`;

/** The six slides, from PROGRAMME and COMMENTARY. Pass slide-4 highlight frames. */
export function deckSlides(opts: { quoteHighlightAt?: F; forecastHighlightAt?: F } = {}): SlideSpec[] {
  return [
    { kind: 'title', n: 1 },
    ...PROGRAMME.rows.map((row, i): SlideSpec => {
      const emphasis = row.pkg === 'Ashcombe Brook crossing';
      return {
        kind: 'package',
        n: i + 2,
        row,
        commentary: COMMENTARY[row.pkg],
        emphasis,
        quoteHighlightAt: emphasis ? opts.quoteHighlightAt : undefined,
        forecastHighlightAt: emphasis ? opts.forecastHighlightAt : undefined,
      };
    }),
    { kind: 'summary', n: 6 },
  ];
}

/** Absolute text placed by its baseline (y) — line-height 1, ascent ≈ 0.8 em. */
const At: React.FC<{ x: number; y: number; size: number; w?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ x, y, size, w, style, children }) => (
  <div style={{ position: 'absolute', left: x, top: y - size * 0.8, width: w, fontSize: size, lineHeight: 1, ...style }}>{children}</div>
);

const Micro: React.FC<{ x: number; y: number; children: React.ReactNode }> = ({ x, y, children }) => (
  <At x={x} y={y} size={14} style={{ fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: C.muted }}>
    {children}
  </At>
);

const Footer: React.FC<{ n: number }> = ({ n }) => (
  <>
    <At x={48} y={852} size={16} style={{ color: C.muted }}>
      {DECK_FOOTER}
    </At>
    <At x={1352} y={852} size={16} w={200} style={{ color: C.muted, textAlign: 'right' }}>
      {n} / {TOTAL}
    </At>
  </>
);

/** Horizontal bar pair (planned vs actual) on a 0–100 % track, value labels Inter 24. */
const PairBars: React.FC<{ planned: number; actual: number; actualColour: string; w: number; barH: number; labels?: boolean }> = ({ planned, actual, actualColour, w, barH, labels = true }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: barH * 0.4 }}>
    {[
      { name: 'Planned', v: planned, c: CHART.s2 },
      { name: 'Actual', v: actual, c: actualColour },
    ].map((b) => (
      <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {labels ? <div style={{ width: 110, fontSize: 22, color: C.text2 }}>{b.name}</div> : null}
        <div style={{ width: w, height: barH, background: C.field, borderRadius: 4, position: 'relative', flex: 'none' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w * (b.v / 100), background: b.c, borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{b.v}%</div>
      </div>
    ))}
  </div>
);

export const Slide: React.FC<{ spec: SlideSpec }> = ({ spec }) => {
  const base: React.CSSProperties = { width: 1600, height: 900, background: '#fff', position: 'relative', fontFamily: FONT.sans, color: C.text, overflow: 'hidden' };
  if (spec.kind === 'title') {
    return (
      <div style={base}>
        <div style={{ position: 'absolute', left: 48, top: 48, width: 18, height: 18, borderRadius: 4, background: C.ink }} />
        <At x={96} y={380} size={64} style={{ fontFamily: FONT.serif, fontWeight: 500, letterSpacing: -0.5 }}>
          {PROJECT}
        </At>
        <At x={96} y={460} size={40} style={{ fontFamily: FONT.serif, color: C.muted }}>
          Progress, September 2026
        </At>
        <At x={96} y={520} size={24} style={{ color: C.muted }}>
          Monthly progress pack · {ORGS.calder.name} for {ORGS.trentmoor.name}
        </At>
        <div style={{ position: 'absolute', left: 96, top: 580, width: 96, height: 3, background: C.ink }} />
        <Footer n={spec.n} />
      </div>
    );
  }
  if (spec.kind === 'summary') {
    const decisions = PROGRAMME.rows.map((r) => COMMENTARY[r.pkg].decision).filter((d) => d !== 'None this month.');
    return (
      <div style={base}>
        <At x={48} y={120} size={52} style={{ fontFamily: FONT.serif, fontWeight: 500 }}>
          Summary
        </At>
        <At x={48} y={200} size={30}>
          4 packages · 2 on track · 1 at risk · 1 behind
        </At>
        <At x={48} y={250} size={30}>
          Forecast {k(PROGRAMME.totals.forecast)} against budget {k(PROGRAMME.totals.budget)} (+{PROGRAMME.totals.deltaPct}%)
        </At>
        <div style={{ position: 'absolute', left: 48, top: 320, width: 952, height: 480, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {PROGRAMME.rows.map((r) => (
            <div key={r.pkg} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 230, fontSize: 22, color: C.text2 }}>{r.short}</div>
              <PairBars planned={r.planned} actual={r.actual} actualColour={CHART.s1} w={600} barH={30} labels={false} />
            </div>
          ))}
        </div>
        <Micro x={1060} y={320}>
          Decisions needed ({decisions.length})
        </Micro>
        <div style={{ position: 'absolute', left: 1060, top: 350, width: 492, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {decisions.map((d) => (
            <div key={d} style={{ fontSize: 26, lineHeight: 1.35 }}>
              {d}
            </div>
          ))}
        </div>
        <Footer n={spec.n} />
      </div>
    );
  }
  const { row, commentary, emphasis } = spec;
  const delta = row.forecast - row.budget;
  const forecast = emphasis ? `${k(row.forecast)} (${delta >= 0 ? '+' : '−'}${k(Math.abs(delta))})` : k(row.forecast);
  return (
    <div style={base}>
      <div style={{ position: 'absolute', left: 48, top: 120 - 52 * 0.8, display: 'flex', alignItems: 'baseline', gap: 24 }}>
        <span style={{ fontFamily: FONT.serif, fontSize: 52, fontWeight: 500, lineHeight: 1, letterSpacing: -0.4 }}>{row.pkg}</span>
        <span style={{ transform: 'translateY(-6px)' }}>
          <Badge tone={STATUS_TONE[row.status]} label={row.status} pill size={23} />
        </span>
      </div>
      <div style={{ position: 'absolute', left: 48, top: 200, width: 640 }}>
        <div style={{ fontSize: 22, color: C.text2, fontWeight: 600, marginBottom: 48 }}>Planned vs actual, % complete</div>
        <PairBars planned={row.planned} actual={row.actual} actualColour={emphasis ? CHART.flag : CHART.s1} w={420} barH={64} />
      </div>
      <At x={48} y={610} size={32}>
        Budget {k(row.budget)} · Forecast{' '}
        {emphasis && spec.forecastHighlightAt !== undefined ? <Highlight at={spec.forecastHighlightAt}>{forecast}</Highlight> : emphasis ? <span>{forecast}</span> : forecast}
      </At>
      {emphasis ? (
        <At x={48} y={650} size={20} style={{ color: C.muted }}>
          {DECK_APP.fileLabel}
        </At>
      ) : null}
      <Micro x={760} y={200}>
        Progress
      </Micro>
      <div style={{ position: 'absolute', left: 760, top: 222, width: 792, fontSize: 26, lineHeight: 1.35 }}>{commentary.progress}</div>
      <Micro x={760} y={400}>
        Key risks
      </Micro>
      <div style={{ position: 'absolute', left: 760, top: 422, width: 792 }}>
        <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 34, lineHeight: 1.3, color: C.text }}>
          {spec.quoteHighlightAt !== undefined ? <Highlight at={spec.quoteHighlightAt}>“{commentary.risk}”</Highlight> : <>“{commentary.risk}”</>}
        </div>
        <div style={{ fontSize: 20, color: C.muted, marginTop: 10 }}>— package lead</div>
      </div>
      <Micro x={760} y={600}>
        Decisions needed
      </Micro>
      <div style={{ position: 'absolute', left: 760, top: 622, width: 792, fontSize: 26, lineHeight: 1.35 }}>{commentary.decision}</div>
      <Footer n={spec.n} />
    </div>
  );
};

export interface SlideDeckProps {
  slides: SlideSpec[];
  /** First slide enters here; each next `stagger` frames later (`panel`). */
  at: F;
  stagger?: number;
  layout?: 'grid';
  /** Display scale of each slide (default 0.25 → 400 × 225). */
  scale?: number;
  gap?: number;
}

/** 3 × 2 grid of slide thumbnails (1248 × 474 at 0.25), unpositioned; centre it yourself. */
export const SlideDeck: React.FC<SlideDeckProps> = ({ slides, at, stagger = 5, scale = 0.25, gap = 24 }) => {
  const f = useCurrentFrame();
  const w = 1600 * scale;
  const h = 900 * scale;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${w}px)`, gridAutoRows: `${h}px`, gap }}>
      {slides.map((s, i) => {
        const p = appear(f, at + i * stagger, 9);
        return (
          <div
            key={i}
            data-anchor={`slide-${s.n}`}
            style={{ width: w, height: h, opacity: p, transform: `translateY(${(1 - p) * 24}px)`, boxShadow: SHADOW.pane, borderRadius: 4, overflow: 'hidden' }}
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <Slide spec={s} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * The saved strip (video-05): white pill bar with pane shadow, Inter 22,
 * file-text icon, "Saved as a draft for review", secondary "Download
 * PowerPoint". Screen-size overlay, outside the Camera; centred on (x, y).
 */
export const SavedStrip: React.FC<{ at: F; x?: number; y?: number }> = ({ at, x = 960, y = 1024 }) => {
  const f = useCurrentFrame();
  const p = appear(f, at, 9);
  if (p <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) translateY(${(1 - p) * 12}px)`,
        opacity: p,
        height: 56,
        padding: '0 8px 0 24px',
        borderRadius: 999,
        background: C.pane,
        boxShadow: SHADOW.pane,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: FONT.sans,
        fontSize: 22,
        color: C.text,
        whiteSpace: 'nowrap',
        zIndex: 40,
      }}
    >
      <FileText size={22} strokeWidth={2} color={C.text2} />
      <span style={{ fontWeight: 500 }}>{DECK_APP.savedStrip}</span>
      <span style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: '8px 18px', fontSize: 20, fontWeight: 600, color: C.text2 }}>{DECK_APP.download}</span>
    </div>
  );
};
