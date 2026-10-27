/**
 * Clip 05's slide deck: a local, richer take on shared/ui/deck.tsx's Slide so
 * the payoff reads as a real monthly reporting pack (kicker, rules, chart
 * panel with gridlines and legend, cost bars, divided right column, footer
 * rule). Positions follow demo/archive/2026-10-sizzle/plan/video-05-deck-app.md "The deck" (1600 × 900
 * native, 48 px margins, the stated baselines and type sizes).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Badge, C, CHART, FONT, Highlight, SHADOW, appear, contextStyle, type BadgeTone, type F } from '../../shared';
import { COMMENTARY, DECK_APP, DECK_FOOTER, ORGS, PROGRAMME, PROJECT, type PackageStatus, type ProgrammeRow } from '../../data/wrenfield';

export const SLIDE_W = 1600;
export const SLIDE_H = 900;
const TOTAL = 6;
const M = 48;

const STATUS_TONE: Record<PackageStatus, BadgeTone> = { 'On track': 'success', 'At risk': 'warning', Behind: 'danger' };
const STATUS_DOT: Record<PackageStatus, string> = { 'On track': C.success.dot, 'At risk': C.warning.dot, Behind: C.danger.text };
const k = (n: number) => `£${n.toLocaleString('en-GB')}k`;

export type DeckSlideSpec =
  | { kind: 'title'; n: number }
  | { kind: 'package'; n: number; row: ProgrammeRow; emphasis: boolean }
  | { kind: 'summary'; n: number };

export const DECK: DeckSlideSpec[] = [
  { kind: 'title', n: 1 },
  ...PROGRAMME.rows.map((row, i): DeckSlideSpec => ({ kind: 'package', n: i + 2, row, emphasis: row.pkg === 'Ashcombe Brook crossing' })),
  { kind: 'summary', n: 6 },
];

/** Slide-4 beats (body-local frames). */
export interface DeckBeats {
  quoteHighlightAt?: F;
  forecastHighlightAt?: F;
  /** Progress and decision sentences blur from here (one readable line, §4.3). */
  contextFrom?: F;
}

// ------------------------------------------------------------------ helpers

/** Text placed by its baseline (line-height 1, ascent ≈ 0.8 em). */
const At: React.FC<{ x: number; y: number; size: number; w?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ x, y, size, w, style, children }) => (
  <div style={{ position: 'absolute', left: x, top: y - size * 0.8, width: w, fontSize: size, lineHeight: 1, whiteSpace: w ? undefined : 'nowrap', ...style }}>{children}</div>
);

const Micro: React.FC<{ x: number; y: number; w?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, w, children, style }) => (
  <At x={x} y={y} size={14} w={w} style={{ fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: C.muted, ...style }}>
    {children}
  </At>
);

const Rule: React.FC<{ x: number; y: number; w: number; vertical?: boolean; colour?: string }> = ({ x, y, w, vertical, colour = C.border }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: vertical ? 2 : w, height: vertical ? w : 2, background: colour }} />
);

const Kicker: React.FC = () => (
  <>
    <div style={{ position: 'absolute', left: M, top: 44, width: 14, height: 14, borderRadius: 3, background: C.ink }} />
    <At x={M + 26} y={57} size={16} style={{ fontWeight: 500, color: C.muted }}>
      {PROJECT} · Progress, September 2026
    </At>
  </>
);

const Footer: React.FC<{ n: number }> = ({ n }) => (
  <>
    <Rule x={M} y={812} w={SLIDE_W - 2 * M} />
    <At x={M} y={852} size={16} style={{ color: C.muted }}>
      {DECK_FOOTER}
    </At>
    <At x={1152} y={852} size={16} w={400} style={{ color: C.muted, textAlign: 'right' }}>
      <span style={{ fontWeight: 600, color: C.text2 }}>{ORGS.calder.name}</span>
      <span style={{ margin: '0 12px', color: C.faint }}>|</span>
      {n} / {TOTAL}
    </At>
  </>
);

const Swatch: React.FC<{ colour: string; label: string }> = ({ colour, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, color: C.muted, fontWeight: 500 }}>
    <span style={{ width: 14, height: 14, borderRadius: 3, background: colour }} />
    {label}
  </span>
);

/** 0–100 % track with dashed gridlines at 25 / 50 / 75. */
const Track: React.FC<{ w: number; h: number; value: number; colour: string }> = ({ w, h, value, colour }) => (
  <div style={{ width: w, height: h, position: 'relative', flex: 'none' }}>
    <div style={{ position: 'absolute', inset: 0, background: C.sunken, borderRadius: 4 }} />
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (w * value) / 100, background: colour, borderRadius: 4 }} />
  </div>
);

const Gridlines: React.FC<{ left: number; w: number; top: number; h: number; ticks?: boolean }> = ({ left, w, top, h, ticks = true }) => (
  <>
    {[0, 25, 50, 75, 100].map((t) => (
      <React.Fragment key={t}>
        <div
          style={{
            position: 'absolute',
            left: left + (w * t) / 100 - 1,
            top,
            height: h,
            width: 0,
            borderLeft: t === 0 ? `2px solid ${C.faint}` : `2px dashed ${C.borderStrong}`,
          }}
        />
        {ticks ? (
          <div style={{ position: 'absolute', left: left + (w * t) / 100 - 30, top: top + h + 10, width: 60, textAlign: 'center', fontSize: 15, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
            {t}%
          </div>
        ) : null}
      </React.Fragment>
    ))}
  </>
);

// ------------------------------------------------------------------ slides

const base: React.CSSProperties = { width: SLIDE_W, height: SLIDE_H, background: C.pane, position: 'relative', fontFamily: FONT.sans, color: C.text, overflow: 'hidden' };

const TitleSlide: React.FC<{ n: number }> = ({ n }) => (
  <div style={base}>
    <div style={{ position: 'absolute', left: 96, top: 92, width: 22, height: 22, borderRadius: 5, background: C.ink }} />
    <At x={132} y={111} size={22} style={{ fontWeight: 600, color: C.text }}>
      {ORGS.calder.name}
    </At>
    <Micro x={96} y={300}>
      Monthly progress pack
    </Micro>
    <At x={96} y={380} size={64} style={{ fontFamily: FONT.serif, fontWeight: 500, letterSpacing: -0.6 }}>
      {PROJECT}
    </At>
    <At x={96} y={460} size={40} style={{ fontFamily: FONT.serif, color: C.muted }}>
      Progress, September 2026
    </At>
    <At x={96} y={520} size={24} style={{ color: C.muted }}>
      Monthly progress pack · {ORGS.calder.name} for {ORGS.trentmoor.name}
    </At>
    {/* At a glance: the four packages */}
    <Rule x={96} y={620} w={SLIDE_W - 192} />
    <div style={{ position: 'absolute', left: 96, top: 646, width: SLIDE_W - 192, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {PROGRAMME.rows.map((r, i) => (
        <div key={r.pkg} style={{ paddingLeft: i === 0 ? 0 : 28, borderLeft: i === 0 ? undefined : `2px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: C.text }}>{r.short}</div>
          <div>
            <Badge tone={STATUS_TONE[r.status]} label={r.status} pill size={17} />
          </div>
          <div style={{ fontSize: 18, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
            {r.actual}% done · plan {r.planned}%
          </div>
        </div>
      ))}
    </div>
    <Footer n={n} />
  </div>
);

const PackageSlide: React.FC<{ n: number; row: ProgrammeRow; emphasis: boolean; beats: DeckBeats }> = ({ n, row, emphasis, beats }) => {
  const f = useCurrentFrame();
  const c = COMMENTARY[row.pkg];
  const delta = row.forecast - row.budget;
  const forecast = emphasis ? `${k(row.forecast)} (${delta >= 0 ? '+' : '−'}${k(Math.abs(delta))})` : k(row.forecast);
  const variance = row.actual - row.planned;
  const varTone: BadgeTone = variance >= 0 ? 'success' : variance <= -5 ? 'danger' : 'warning';
  const actualColour = emphasis ? CHART.flag : CHART.s1;
  const ctx = beats.contextFrom !== undefined ? contextStyle(f, beats.contextFrom) : {};
  const costMax = Math.max(row.budget, row.forecast) * 1.08;
  return (
    <div style={base}>
      <Kicker />
      {/* Title + status */}
      <div style={{ position: 'absolute', left: M, top: 120 - 52 * 0.8, display: 'flex', alignItems: 'baseline', gap: 24, whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: FONT.serif, fontSize: 52, fontWeight: 500, lineHeight: 1, letterSpacing: -0.4 }}>{row.pkg}</span>
        <span style={{ transform: 'translateY(-6px)' }}>
          <Badge tone={STATUS_TONE[row.status]} label={row.status} pill size={23} />
        </span>
      </div>
      <Rule x={M} y={160} w={SLIDE_W - 2 * M} />

      {/* Chart panel: x 48–688, y 200–560 */}
      <div style={{ position: 'absolute', left: M, top: 200, width: 640, height: 360, background: C.neutral50, borderRadius: 12, boxSizing: 'border-box', padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: C.text2 }}>Planned vs actual, % complete</div>
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 12 }}>
          <Swatch colour={CHART.s2} label="Planned" />
          <Swatch colour={actualColour} label="Actual" />
        </div>
        <div style={{ position: 'absolute', left: 28, top: 124, width: 584, height: 150 }}>
          <Gridlines left={108} w={380} top={-8} h={146} />
          {[
            { name: 'Planned', v: row.planned, c: CHART.s2 },
            { name: 'Actual', v: row.actual, c: actualColour },
          ].map((b, i) => (
            <div key={b.name} style={{ position: 'absolute', left: 0, top: i * 70, height: 52, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 108, fontSize: 20, color: C.text2 }}>{b.name}</div>
              <Track w={380} h={52} value={b.v} colour={b.c} />
              <div style={{ marginLeft: 16, fontSize: 24, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{b.v}%</div>
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', left: 28, bottom: 24, display: 'flex', alignItems: 'center', gap: 12, fontSize: 18, color: C.muted }}>
          Variance to plan
          <Badge tone={varTone} label={`${variance > 0 ? '+' : variance < 0 ? '−' : ''}${Math.abs(variance)} pts`} pill size={17} />
        </div>
      </div>

      {/* Budget line, baseline 610 */}
      <At x={M} y={610} size={32} style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: -0.7 }}>
        Budget {k(row.budget)} · Forecast{' '}
        {emphasis && beats.forecastHighlightAt !== undefined ? (
          <Highlight at={beats.forecastHighlightAt}>
            <span style={{ fontWeight: 600 }}>{forecast}</span>
          </Highlight>
        ) : (
          <span style={{ fontWeight: emphasis ? 600 : 400 }}>{forecast}</span>
        )}
      </At>
      {emphasis ? (
        <At x={M} y={650} size={20} style={{ color: C.muted }}>
          {DECK_APP.fileLabel}
        </At>
      ) : null}

      {/* Cost bars, y 690–790 */}
      <div style={{ position: 'absolute', left: M, top: 690, width: 640, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { name: 'Budget', v: row.budget, c: CHART.s3 },
          { name: 'Forecast', v: row.forecast, c: emphasis ? CHART.flag : CHART.s2 },
        ].map((b) => (
          <div key={b.name} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 108, fontSize: 18, color: C.muted }}>{b.name}</div>
            <div style={{ width: 380, height: 22, background: C.sunken, borderRadius: 4, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (380 * b.v) / costMax, background: b.c, borderRadius: 4 }} />
            </div>
            <div style={{ marginLeft: 16, fontSize: 18, color: C.text2, fontVariantNumeric: 'tabular-nums' }}>{k(b.v)}</div>
          </div>
        ))}
      </div>

      {/* Divider + right column x 760–1552 */}
      <Rule x={736} y={200} w={590} vertical />
      <Micro x={760} y={200}>
        Progress
      </Micro>
      <div style={{ position: 'absolute', left: 760, top: 222, width: 792, fontSize: 26, lineHeight: 1.35, ...ctx }}>{c.progress}</div>
      <Rule x={760} y={366} w={792} />
      <Micro x={760} y={400}>
        Key risks
      </Micro>
      <div style={{ position: 'absolute', left: 760, top: 422, width: 792, display: 'flex', gap: 22 }}>
        <div style={{ width: 4, borderRadius: 2, background: emphasis ? CHART.flag : C.borderStrong, flex: 'none' }} />
        <div>
          <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 34, lineHeight: 1.3, color: C.text }}>
            {emphasis && beats.quoteHighlightAt !== undefined ? <Highlight at={beats.quoteHighlightAt}>“{c.risk}”</Highlight> : <>“{c.risk}”</>}
          </div>
          <div style={{ fontSize: 20, color: C.muted, marginTop: 10 }}>— package lead</div>
        </div>
      </div>
      <Rule x={760} y={566} w={792} />
      <Micro x={760} y={600}>
        Decisions needed
      </Micro>
      <div style={{ position: 'absolute', left: 760, top: 622, width: 792, fontSize: 26, lineHeight: 1.35, color: c.decision === 'None this month.' ? C.muted : C.text, ...ctx }}>
        {c.decision}
      </div>
      <Footer n={n} />
    </div>
  );
};

const SummarySlide: React.FC<{ n: number }> = ({ n }) => {
  const rows = PROGRAMME.rows;
  const decisions = rows.map((r) => ({ r, d: COMMENTARY[r.pkg].decision })).filter((x) => x.d !== 'None this month.');
  const counts = (s: PackageStatus) => rows.filter((r) => r.status === s).length;
  const dot = (s: PackageStatus) => <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 999, background: STATUS_DOT[s], margin: '0 10px 2px 0', verticalAlign: 'middle' }} />;
  const plotL = 230;
  const plotW = 560;
  return (
    <div style={base}>
      <Kicker />
      <At x={M} y={120} size={52} style={{ fontFamily: FONT.serif, fontWeight: 500, letterSpacing: -0.4 }}>
        Summary
      </At>
      <Rule x={M} y={160} w={SLIDE_W - 2 * M} />
      <At x={M} y={212} size={30}>
        4 packages <span style={{ color: C.faint, margin: '0 10px' }}>·</span>
        {dot('On track')}
        {counts('On track')} on track <span style={{ color: C.faint, margin: '0 10px' }}>·</span>
        {dot('At risk')}
        {counts('At risk')} at risk <span style={{ color: C.faint, margin: '0 10px' }}>·</span>
        {dot('Behind')}
        {counts('Behind')} behind
      </At>
      <At x={M} y={262} size={30} style={{ fontVariantNumeric: 'tabular-nums' }}>
        Forecast <span style={{ fontWeight: 600 }}>{k(PROGRAMME.totals.forecast)}</span> against budget {k(PROGRAMME.totals.budget)}{' '}
        <span style={{ color: C.warning.text }}>(+{PROGRAMME.totals.deltaPct}%)</span>
      </At>
      {/* Grouped bars: x 48–1000, y 320–800 */}
      <div style={{ position: 'absolute', left: M, top: 320, width: 952, height: 470, background: C.neutral50, borderRadius: 12 }}>
        <div style={{ position: 'absolute', left: 28, top: 24, fontSize: 22, fontWeight: 600, color: C.text2 }}>Planned vs actual, % complete</div>
        <div style={{ position: 'absolute', right: 28, top: 28, display: 'flex', gap: 22 }}>
          <Swatch colour={CHART.s2} label="Planned" />
          <Swatch colour={CHART.s1} label="Actual" />
        </div>
        <Gridlines left={plotL} w={plotW} top={84} h={330} />
        {rows.map((r, i) => (
          <div key={r.pkg} style={{ position: 'absolute', left: 28, top: 98 + i * 80, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: plotL - 28, fontSize: 20, color: C.text2, fontWeight: 500 }}>{r.short}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Track w={plotW} h={24} value={r.planned} colour={CHART.s2} />
              <Track w={plotW} h={24} value={r.actual} colour={r.status === 'Behind' ? CHART.flag : CHART.s1} />
            </div>
            <div style={{ marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 18, lineHeight: '24px', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: C.muted }}>{r.planned}%</span>
              <span style={{ fontWeight: 600 }}>{r.actual}%</span>
            </div>
          </div>
        ))}
      </div>
      {/* Right column: decisions */}
      <Micro x={1060} y={340}>
        Decisions needed ({decisions.length})
      </Micro>
      <div style={{ position: 'absolute', left: 1060, top: 368, width: 492, display: 'flex', flexDirection: 'column' }}>
        {decisions.map(({ r, d }, i) => (
          <div key={d} style={{ display: 'flex', gap: 18, padding: '22px 0', borderTop: `2px solid ${C.border}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 999, background: C.ink, color: C.pane, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{i + 1}</div>
            <div>
              <div style={{ fontSize: 26, lineHeight: 1.3 }}>{d}</div>
              <div style={{ fontSize: 18, color: C.muted, marginTop: 8 }}>{r.short}</div>
            </div>
          </div>
        ))}
      </div>
      <Footer n={n} />
    </div>
  );
};

export const DeckSlide: React.FC<{ spec: DeckSlideSpec; beats?: DeckBeats }> = ({ spec, beats = {} }) => {
  if (spec.kind === 'title') return <TitleSlide n={spec.n} />;
  if (spec.kind === 'summary') return <SummarySlide n={spec.n} />;
  return <PackageSlide n={spec.n} row={spec.row} emphasis={spec.emphasis} beats={spec.emphasis ? beats : {}} />;
};

/** 3 × 2 grid of thumbnails at `scale` (1248 × 474 at 0.25), unpositioned. */
export const DeckGrid: React.FC<{ at: F; stagger?: number; scale?: number; gap?: number; beats?: DeckBeats }> = ({ at, stagger = 4, scale = 0.25, gap = 24, beats }) => {
  const f = useCurrentFrame();
  const w = SLIDE_W * scale;
  const h = SLIDE_H * scale;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${w}px)`, gridAutoRows: `${h}px`, gap }}>
      {DECK.map((s, i) => {
        const p = appear(f, at + i * stagger, 9);
        return (
          <div key={i} style={{ width: w, height: h, opacity: p, transform: `translateY(${(1 - p) * 24}px)`, boxShadow: SHADOW.pane, borderRadius: 3, overflow: 'hidden', background: C.pane }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <DeckSlide spec={s} beats={beats} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
