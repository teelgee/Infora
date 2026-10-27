/**
 * S8 · Rachel's `Supplier KPI returns` (RULED returns-app-two-seats.html screen
 * 2, re-cast; VISION polish: tiles, charts, the 90% flag, the count-up; BUILT
 * acceptance and run mechanics). Order tiles → table → charts → insight (D-1).
 * Totals count ACCEPTED rows only.
 *
 * One body, three uses:
 *   layout 'full'    the 1536 plate (ch 5–6, glimpse, close), page y = native y
 *   layout 'narrow'  the split right window (628 content) — and, with `empty`,
 *                    the builder's live preview (scaled ≈ 0.525)
 * Every coordinate below is page y (native y at scroll 0) and x from the
 * content column's left edge (342 full, 88 narrow).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { MoreHorizontal } from 'lucide-react';
import { C, CHART, FONT, RADIUS, Shimmer, appear, ease, ui, type F } from '../../shared';
import { WT_KPI_STATES, WT_RUN, WT_TOOLS } from '../../data/wrenfield';
import { Btn, StatusPill, Streamed } from '../shared';
import { Micro, prog } from './kit';

const K = WT_KPI_STATES;
const D = WT_TOOLS.dashboard;
const CH = K.charts;

// ------------------------------------------------------------------ geometry

export const FULL = {
  x0: 342,
  w: 1056,
  h1: 97,
  sub: 144,
  tiles: { y: 196, h: 92, w: 252, gap: 16, cols: 4 },
  table: 300,
  strip: 76,
  charts: 552,
  chartH: 200,
  insight: 764,
  insightH: 84,
  runsLabel: 872,
  runs: 888,
  keepLabel: 1036,
  keep: 1052,
  /** Column x (from x0) and right-aligned numeric edges. */
  col: { month: 16, org: 110, due: 422, onTime: 502, ncrs: 572, carbon: 652, state: 676, actions: 898 },
} as const;

export const NARROW = {
  x0: 88,
  w: 628,
  h1: 97,
  sub: 144,
  tiles: { y: 210, h: 88, w: 306, gap: 16, cols: 2 },
  table: 406,
  strip: 76,
  charts: 658,
  chartH: 180,
  insight: 1050,
  insightH: 72,
  col: { month: 12, org: 82, due: 268, onTime: 324, ncrs: 372, carbon: 428, state: 440, actions: 0 },
} as const;

type Geo = typeof FULL | typeof NARROW;

// ------------------------------------------------------------------ data

const ROWS = D.rows;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface KpiDashboardProps {
  layout: 'full' | 'narrow';
  /** The builder preview: no returns, placeholders. Blocks fade in 4 f apart from `fillAt`. */
  empty?: boolean;
  fillAt?: F;
  /** Preview: the dashed 90% line and its badge appear (the full dashboard always has them). */
  flagAt?: F;
  /** Sam submits (state S) and Rachel accepts (state A). */
  submittedAt?: F;
  acceptedAt?: F;
  countFrom?: F;
  rowHoverFrom?: F;
  rowAcceptPressAt?: F;
  stripOpenAt?: F;
  stripAcceptHoverFrom?: F;
  stripAcceptPressAt?: F;
  /** The run: the card says Working…, then the meta line, then the sentences stream (4 c/f). */
  run?: { workingAt: F; metaAt: F; streamAt: F };
  keep?: { hoverFrom: F; pressAt: F; noticeAt: F };
  scrollY?: number;
}

// ------------------------------------------------------------------ small parts

const Abs: React.FC<{ g: Geo; x: number; y: number; w?: number; h?: number; o?: number; children: React.ReactNode; a?: string; style?: React.CSSProperties }> = ({ g, x, y, w, h, o = 1, children, a, style }) =>
  o <= 0 ? null : (
    <div data-w4={a} style={{ position: 'absolute', left: g.x0 + x, top: y, width: w, height: h, boxSizing: 'border-box', opacity: o, ...style }}>
      {children}
    </div>
  );

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, position: 'relative', overflow: 'hidden', ...style }}>
    {children}
  </div>
);

/** Two faces crossfading at `at` (ui, 5 f). */
const Flip: React.FC<{ a: React.ReactNode; b: React.ReactNode; at?: F }> = ({ a, b, at }) => {
  const f = useCurrentFrame();
  if (at === undefined || f < at) return <>{a}</>;
  const p = ui(f, at);
  if (p >= 1) return <>{b}</>;
  return (
    <span style={{ display: 'inline-grid' }}>
      <span style={{ gridArea: '1/1', opacity: 1 - p }}>{a}</span>
      <span style={{ gridArea: '1/1', opacity: p }}>{b}</span>
    </span>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode; sub: React.ReactNode; h: number; size?: number }> = ({ label, value, sub, h, size = 30 }) => (
  <div style={{ height: h, boxSizing: 'border-box', background: C.sunken, borderRadius: RADIUS.lg, padding: '11px 16px 0' }}>
    <div style={{ fontSize: 12.5, lineHeight: '16px', color: C.muted, fontWeight: 500 }}>{label}</div>
    <div style={{ fontFamily: FONT.serif, fontSize: size, lineHeight: '34px', fontWeight: 500, color: C.text, marginTop: 2, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.2 }}>{value}</div>
    <div style={{ fontSize: 12, lineHeight: '14px', color: C.muted, marginTop: 3 }}>{sub}</div>
  </div>
);

const ChartTitle: React.FC<{ title: string; right?: React.ReactNode; sub?: React.ReactNode }> = ({ title, right, sub }) => (
  <div style={{ position: 'absolute', left: 16, right: 14, top: 13 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{title}</span>
      {right ? <span style={{ marginLeft: 'auto' }}>{right}</span> : null}
    </div>
    {sub ? <div style={{ marginTop: 5, height: 20, display: 'flex', alignItems: 'center' }}>{sub}</div> : null}
  </div>
);

// ------------------------------------------------------------------ charts (SVG, native px)


/**
 * A chart label as HTML, placed by its baseline like SVG <text>. (SVG text
 * repainted stale positions in long renders, so every chart label is HTML.)
 */
const Lbl: React.FC<{ x: number; y: number; anchor?: 'start' | 'middle' | 'end'; size: number; colour: string; weight?: number; children: React.ReactNode }> = ({ x, y, anchor = 'start', size, colour, weight = 400, children }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y - size * 0.8,
      transform: anchor === 'middle' ? 'translateX(-50%)' : anchor === 'end' ? 'translateX(-100%)' : undefined,
      fontFamily: FONT.sans,
      fontSize: size,
      lineHeight: `${size}px`,
      fontWeight: weight,
      color: colour,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </div>
);

const PLOT_TOP = 62;
/** Plot height for a card of height h (200 → 88). */
const plotH = (h: number) => h - 112;

/** Bar chart: on time by supplier, %. `values[i]` null = no accepted return (a muted dash at the baseline). */
const BarChart: React.FC<{ w: number; h?: number; values: Array<number | null>; flagO: number; empty?: boolean; labelSize?: number }> = ({ w, h = 200, values, flagO, empty, labelSize = 11 }) => {
  const PLOT_H = plotH(h);
  const left = 40;
  const right = w - 18;
  const pw = right - left;
  const y = (v: number) => PLOT_TOP + PLOT_H * (1 - v / 100);
  const n = CH.bars.length;
  const slot = pw / n;
  const bw = Math.min(40, slot * 0.5);
  const cxOf = (i: number) => left + slot * (i + 0.5);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        {[0, 50, 100].map((g) => (
          <line key={g} x1={left} x2={right} y1={y(g)} y2={y(g)} stroke={g === 0 ? C.borderStrong : C.border} strokeWidth={1} />
        ))}
        {CH.bars.map((b, i) => {
          const v = values[i];
          const flagged = 'flagged' in b && b.flagged && !empty;
          if (empty) {
            const ph = [62, 48, 74, 56][i];
            return <rect key={b.label} x={cxOf(i) - bw / 2} y={y(ph)} width={bw} height={y(0) - y(ph)} rx={3} fill={C.borderStrong} opacity={0.4} />;
          }
          if (v === null) return null;
          return <rect key={b.label} x={cxOf(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, y(0) - y(v))} rx={3} fill={flagged ? CHART.flag : CHART.s1} />;
        })}
        {flagO > 0 ? <line x1={left} x2={right} y1={y(90)} y2={y(90)} stroke={CHART.flag} strokeWidth={1.2} strokeDasharray="4 3" opacity={flagO} /> : null}
      </svg>
      {[0, 50, 100].map((g) => (
        <Lbl key={g} x={left - 8} y={y(g) + 3.5} anchor="end" size={10.5} colour={C.muted}>
          {g}
        </Lbl>
      ))}
      {empty
        ? null
        : CH.bars.map((b, i) => {
            const v = values[i];
            const flagged = 'flagged' in b && b.flagged;
            return (
              <React.Fragment key={b.label}>
                {v === null ? (
                  <Lbl x={cxOf(i)} y={y(0) - 5} anchor="middle" size={labelSize} colour={C.muted}>
                    —
                  </Lbl>
                ) : v > 4 ? (
                  <Lbl x={cxOf(i)} y={y(v) - 5} anchor="middle" size={labelSize} colour={flagged ? C.warning.text : C.text} weight={600}>
                    {Math.round(v)}
                  </Lbl>
                ) : null}
                <Lbl x={cxOf(i)} y={y(0) + 17} anchor="middle" size={labelSize} colour={C.text2}>
                  {b.label}
                </Lbl>
                {flagged ? (
                  <Lbl x={cxOf(i)} y={y(0) + 30} anchor="middle" size={labelSize - 1} colour={C.warning.text}>
                    {CH.barUnder}
                  </Lbl>
                ) : null}
              </React.Fragment>
            );
          })}
      {flagO > 0 ? (
        <div style={{ opacity: flagO }}>
          <Lbl x={right + 3} y={y(90) + 3.5} size={10} colour={C.warning.text} weight={600}>
            90%
          </Lbl>
        </div>
      ) : null}
    </div>
  );
};

/** Line chart: carbon by month (accepted rows only), with a least-squares trend. */
const LineChart: React.FC<{ w: number; h?: number; values: number[]; empty?: boolean; labelSize?: number }> = ({ w, h = 200, values, empty, labelSize = 11 }) => {
  const PLOT_H = plotH(h);
  const left = 40;
  const right = w - 22;
  const pw = right - left;
  const y = (v: number) => PLOT_TOP + PLOT_H * (1 - v / 200);
  const x = (i: number) => left + (pw * (i + 0.5)) / values.length;
  const months = ['Jun', 'Jul', 'Aug', 'Sep'];
  const n = values.length;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  const slope = values.reduce((a, v, i) => a + (i - mx) * (v - my), 0) / values.reduce((a, _, i) => a + (i - mx) ** 2, 0);
  const trend = (i: number) => my + slope * (i - mx);
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        {[0, 100, 200].map((g) => (
          <line key={g} x1={left} x2={right} y1={y(g)} y2={y(g)} stroke={g === 0 ? C.borderStrong : C.border} strokeWidth={1} />
        ))}
        {empty ? (
          <path d={`M${x(0)},${y(70)} L${x(1)},${y(82)} L${x(2)},${y(66)} L${x(3)},${y(76)}`} fill="none" stroke={C.borderStrong} strokeWidth={2} opacity={0.6} />
        ) : (
          <>
            <line x1={x(0)} x2={x(n - 1)} y1={y(trend(0))} y2={y(trend(n - 1))} stroke={CHART.trend} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
            <path d={path} fill="none" stroke={CHART.s1} strokeWidth={2} strokeLinejoin="round" />
            {values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={CHART.s1} stroke={C.pane} strokeWidth={1.5} />
            ))}
          </>
        )}
      </svg>
      {[0, 100, 200].map((g) => (
        <Lbl key={g} x={left - 8} y={y(g) + 3.5} anchor="end" size={10.5} colour={C.muted}>
          {g}
        </Lbl>
      ))}
      {empty
        ? null
        : values.map((v, i) => (
            <Lbl key={i} x={x(i)} y={y(v) - 9} anchor="middle" size={labelSize} colour={C.text} weight={600}>
              {Math.round(v)}
            </Lbl>
          ))}
      {months.map((m, i) => (
        <Lbl key={m} x={x(i)} y={y(0) + 17} anchor="middle" size={labelSize} colour={C.text2}>
          {m}
        </Lbl>
      ))}
    </div>
  );
};

const SWATCH = [CHART.s1, CHART.s2, CHART.s3, CHART.s4];

/** Donut: local spend by supplier (Ashcombe, Netherfold, Plant Hire, Wrenbrook). */
const Donut: React.FC<{ d: number; ring: number; values: number[]; centre: React.ReactNode; empty?: boolean }> = ({ d, ring, values, centre, empty }) => {
  const r = d / 2 - ring / 2;
  const c = 2 * Math.PI * r;
  const total = values.reduce((a, b) => a + b, 0);
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: d, height: d }}>
      <svg width={d} height={d} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={d / 2} cy={d / 2} r={r} fill="none" stroke={C.borderStrong} strokeWidth={ring} opacity={empty ? 0.5 : 1} />
        {empty
          ? null
          : values.map((v, i) => {
              const len = total ? (v / total) * c : 0;
              const gap = len > 2 ? 1.5 : 0;
              const el = (
                <circle
                  key={i}
                  cx={d / 2}
                  cy={d / 2}
                  r={r}
                  fill="none"
                  stroke={SWATCH[i]}
                  strokeWidth={ring}
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += len;
              return el;
            })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.serif, fontSize: d > 110 ? 20 : 17, fontWeight: 500, color: C.text }}>
        {centre}
      </div>
    </div>
  );
};

const Legend: React.FC<{ rows: Array<{ name: string; value: string; i: number }>; size?: number; w: number }> = ({ rows, size = 11.5, w }) => (
  <div style={{ width: w, display: 'grid', gap: 7 }}>
    {rows.map((r) => (
      <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: size, color: C.text2, whiteSpace: 'nowrap' }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: SWATCH[r.i], boxShadow: r.i === 3 ? `inset 0 0 0 1px ${CHART.s4Outline}` : undefined, flex: 'none' }} />
        {r.name}
        <span style={{ marginLeft: 'auto', color: C.text, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{r.value}</span>
      </div>
    ))}
  </div>
);

const Empty: React.FC<{ text: string; top: number }> = ({ text, top }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top, textAlign: 'center', fontSize: 12, color: C.muted }}>{text}</div>
);

// ------------------------------------------------------------------ the body

export const KpiBody: React.FC<KpiDashboardProps> = (p) => {
  const f = useCurrentFrame();
  const g: Geo = p.layout === 'full' ? FULL : NARROW;
  const full = p.layout === 'full';
  const empty = !!p.empty;
  /** Preview: block i fades in at fillAt + 4i. */
  const blk = (i: number) => (empty && p.fillAt !== undefined ? ui(f, p.fillAt + 4 * i) : 1);

  const submitted = p.submittedAt !== undefined && f >= p.submittedAt;
  const accepted = p.acceptedAt !== undefined && f >= p.acceptedAt;
  const cu = p.countFrom === undefined ? 0 : appear(f, p.countFrom, K.countUpFrames, ease.out);
  const counted = p.countFrom !== undefined && f >= p.countFrom;

  // Strip: open (5 f) at stripOpenAt, pushes the charts down 76 over the next 12 f; closes on acceptance.
  const stripOpen = p.stripOpenAt !== undefined && f >= p.stripOpenAt && !(p.acceptedAt !== undefined && f >= p.acceptedAt + 6);
  const stripO = p.stripOpenAt === undefined ? 0 : ui(f, p.stripOpenAt) * (p.acceptedAt === undefined ? 1 : 1 - ui(f, p.acceptedAt));
  const push =
    p.stripOpenAt === undefined
      ? 0
      : g.strip * (prog(f, p.stripOpenAt + 5, p.stripOpenAt + 17, ease.out) - (p.acceptedAt === undefined ? 0 : prog(f, p.acceptedAt, p.acceptedAt + 12, ease.inOut)));

  // ---- tiles
  const T = K.tileLabels;
  const onTimeVal = counted ? `${Math.round(lerp(66, 93, cu))} of ${Math.round(lerp(74, 102, cu))}` : K.before.onTime.value;
  const carbonVal = counted ? `${Math.round(lerp(569, 630, cu))} tCO2e` : K.before.carbon.value;
  const tiles: Array<{ label: string; value: React.ReactNode; sub: React.ReactNode }> = empty
    ? [T.september, T.awaiting, T.onTime, T.carbon].map((l) => ({ label: l, value: <span style={{ color: C.faint }}>{CH.empty.tile}</span>, sub: CH.empty.tileSub }))
    : [
        {
          label: T.september,
          value: <Flip a={K.before.september.value} b={K.submitted.september.value} at={p.submittedAt} />,
          sub: <Flip a={K.before.september.sub} b={K.submitted.september.sub} at={p.submittedAt} />,
        },
        {
          label: T.awaiting,
          value: <Flip a={<Flip a={K.before.awaiting.value} b={K.submitted.awaiting.value} at={p.submittedAt} />} b={K.accepted.awaiting.value} at={p.acceptedAt} />,
          sub: <Flip a={<Flip a={K.before.awaiting.sub} b={K.submitted.awaiting.sub} at={p.submittedAt} />} b={K.accepted.awaiting.sub} at={p.acceptedAt} />,
        },
        { label: T.onTime, value: onTimeVal, sub: K.before.onTime.sub },
        { label: T.carbon, value: carbonVal, sub: <Flip a={K.before.carbon.sub} b={K.accepted.carbon.sub} at={p.countFrom} /> },
      ];

  // ---- chart values (accepted rows only)
  const nfBar = accepted ? lerp(0, 96, cu) : null;
  const bars: Array<number | null> = [nfBar, 85, 95, 92];
  const sep = counted ? lerp(K.before.sepCarbon, K.accepted.sepCarbon, cu) : K.before.sepCarbon;
  const line = [171, 163, 154, sep];
  const nfSpend = counted ? lerp(0, 84200, cu) : 0;
  const spend = [126500, nfSpend, 38900, 22400];
  const centreK = Math.round((126500 + nfSpend + 38900 + 22400) / 1000);
  const flagO = empty ? (p.flagAt === undefined ? 0 : ui(f, p.flagAt)) : 1;

  // ---- table rows
  const c = g.col;
  const rowH = 44;
  const rowsTop = g.table + 32 + 24;
  const nfState = accepted ? 'A' : submitted ? 'S' : 'B';
  const rowHover = p.rowHoverFrom !== undefined && f >= p.rowHoverFrom && !accepted;

  const stateCell = (tone: 'neutral' | 'warning' | 'success', label: string, stamp?: string) => (
    <div style={{ lineHeight: '15px' }}>
      <StatusPill tone={tone} label={label} size={12} dot style={{ marginLeft: -10 }} />
      {stamp ? <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1, whiteSpace: 'nowrap' }}>{stamp}</div> : null}
    </div>
  );

  const Row: React.FC<{ i: number; children: React.ReactNode; fill?: boolean }> = ({ i, children, fill }) => (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: rowsTop + rowH * i - g.table,
        height: rowH,
        borderTop: i === 0 ? undefined : `1px solid ${C.borderSubtle}`,
        background: fill ? C.neutral50 : undefined,
        fontSize: full ? 13.5 : 12.5,
        color: C.text,
      }}
    >
      {children}
    </div>
  );

  const cell = (x: number, w: number, node: React.ReactNode, right = false, top = 0): React.ReactNode => (
    <div style={{ position: 'absolute', left: right ? x - w : x, width: w, top, height: rowH, display: 'flex', alignItems: 'center', justifyContent: right ? 'flex-end' : 'flex-start', fontVariantNumeric: 'tabular-nums' }}>
      {node}
    </div>
  );

  const orgCell = (org: string, person?: string) => (
    <div style={{ lineHeight: '15px', minWidth: 0, width: '100%' }}>
      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{org}</div>
      {person ? <div style={{ fontSize: full ? 12 : 11.5, color: C.muted, whiteSpace: 'nowrap' }}>{person}</div> : null}
    </div>
  );

  const orgW = c.due - 44 - c.org - 8;
  const numCells = (r: { due: number; onTime: number; ncrs: number; carbon: number }) => (
    <>
      {cell(c.due, 44, r.due, true)}
      {cell(c.onTime, 56, r.onTime, true)}
      {cell(c.ncrs, 48, r.ncrs, true)}
      {cell(c.carbon, 56, r.carbon, true)}
    </>
  );

  const nf = ROWS[0];
  const nfRow = (
    <Row i={0} fill={nfState === 'S' || rowHover}>
      {cell(c.month, 80, 'Sep 2026')}
      {cell(c.org, orgW, orgCell(nf.org, nfState === 'B' ? undefined : nf.person))}
      {nfState === 'B' ? (
        cell(c.due - 44, 200, <span style={{ color: C.muted }}>{K.before.netherfoldRow.cells}</span>)
      ) : (
        <div style={{ opacity: p.submittedAt !== undefined ? ui(f, p.submittedAt) : 1 }}>{numCells(nf)}</div>
      )}
      {cell(
        c.state,
        210,
        nfState === 'B'
          ? stateCell('neutral', K.before.netherfoldRow.state)
          : nfState === 'S'
            ? stateCell('warning', K.submitted.netherfoldRow.state, K.submitted.netherfoldRow.stamp)
            : stateCell('success', K.accepted.netherfoldRow.state, K.accepted.netherfoldRow.stamp),
      )}
      {full && nfState === 'S' ? (
        <div style={{ position: 'absolute', left: c.actions, top: 0, height: rowH, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span data-w4="dash-row-accept" style={{ display: 'inline-flex' }}>
            <Btn variant="primary" label="Accept" pressAt={p.rowAcceptPressAt} hover={rowHover && p.rowAcceptPressAt !== undefined && f >= p.rowAcceptPressAt - 8} style={{ padding: '5px 14px' }} />
          </span>
          <Btn variant="secondary" label="Reject" style={{ padding: '5px 14px' }} />
        </div>
      ) : null}
    </Row>
  );

  // ---- insight
  const run = p.run;
  const working = run && f >= run.workingAt && f < run.metaAt;
  const ran = run && f >= run.metaAt;
  const text = WT_RUN.sentences.join(' ');

  const ix = 0;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1536, fontFamily: FONT.sans, color: C.text }}>
      {/* header */}
      <Abs g={g} x={0} y={g.h1} o={blk(0)}>
        <div style={{ fontFamily: FONT.serif, fontSize: 29, fontWeight: 500, lineHeight: '38px', letterSpacing: 0.1, whiteSpace: 'nowrap' }}>{D.title}</div>
      </Abs>
      <Abs g={g} x={0} y={g.sub} w={full ? 780 : g.w} o={blk(0)}>
        <div style={{ fontSize: 13, lineHeight: full ? '20px' : '19px', color: C.muted }}>{D.sub}</div>
      </Abs>

      {/* tiles */}
      {tiles.map((t, i) => {
        const col = i % g.tiles.cols;
        const rowN = Math.floor(i / g.tiles.cols);
        return (
          <Abs key={t.label} g={g} x={col * (g.tiles.w + g.tiles.gap)} y={g.tiles.y + rowN * (g.tiles.h + 8)} w={g.tiles.w} o={blk(1)} a={`tile-${i}`}>
            <Tile label={t.label} value={t.value} sub={t.sub} h={g.tiles.h} size={full ? 30 : 28} />
          </Abs>
        );
      })}

      {/* the returns table (+ confirm strip) */}
      <Abs g={g} x={0} y={g.table} w={g.w} h={236 + push} o={blk(2)} a="dash-table">
        <Card>
          <div style={{ position: 'absolute', left: 16, right: 16, top: 0, height: 32, display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{D.table}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>{empty ? '' : D.tableSub}</span>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 32, height: 24, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.neutral50 }}>
            {(
              [
                [c.month, 'Month', false],
                [c.org, 'Organisation', false],
                [c.due, 'Due', true],
                [c.onTime, 'On time', true],
                [c.ncrs, 'NCRs', true],
                [c.carbon, 'Carbon', true],
                [c.state, 'State', false],
              ] as Array<[number, string, boolean]>
            ).map(([x, l, r]) => (
              <div key={l} style={{ position: 'absolute', left: r ? x - 80 : x, width: r ? 80 : undefined, textAlign: r ? 'right' : 'left', top: 6 }}>
                <Micro style={{ fontSize: full ? 10.5 : 10 }}>{l}</Micro>
              </div>
            ))}
          </div>
          {empty ? (
            <div style={{ position: 'absolute', left: 16, top: 60 + 16, fontSize: 13, color: C.muted }}>{CH.empty.table}</div>
          ) : (
            <>
              {nfRow}
              {ROWS.slice(1).map((r, i) => (
                <Row key={r.org} i={i + 1}>
                  {cell(c.month, 80, 'Sep 2026')}
                  {cell(c.org, orgW, orgCell(r.org, r.person))}
                  {numCells(r)}
                  {cell(c.state, 210, stateCell('success', 'Accepted', 'stamp' in r ? r.stamp : undefined))}
                </Row>
              ))}
            </>
          )}
          {full && stripOpen ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 236,
                height: g.strip,
                background: C.neutral50,
                borderTop: `1px solid ${C.border}`,
                opacity: stripO,
              }}
            >
              <div style={{ position: 'absolute', left: 16, top: 11, width: 692, fontSize: 13, lineHeight: '18px', color: C.text2 }}>
                <b style={{ color: C.text }}>{D.confirmHead}</b> {D.confirmBody}
              </div>
              <div style={{ position: 'absolute', left: 744, top: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span data-w4="dash-strip-accept" style={{ display: 'inline-flex' }}>
                  <Btn
                    variant="primary"
                    label={D.confirmButtons[0]}
                    pressAt={p.stripAcceptPressAt}
                    hover={p.stripAcceptHoverFrom !== undefined && f >= p.stripAcceptHoverFrom}
                    style={{ padding: '5px 16px' }}
                  />
                </span>
                <Btn variant="secondary" label={D.confirmButtons[1]} style={{ padding: '5px 12px' }} />
                <Btn variant="quiet" label={D.confirmButtons[2]} />
              </div>
            </div>
          ) : null}
        </Card>
      </Abs>

      {/* charts */}
      {full ? (
        <>
          <Abs g={g} x={0} y={g.charts + push} w={350} h={g.chartH} o={blk(3)} a="chart-bar">
            <Card>
              <ChartTitle title={CH.bar} sub={<StatusPill tone="warning" label={CH.barFlag} size={11.5} />} />
              <BarChart w={350} values={bars} flagO={flagO} />
            </Card>
          </Abs>
          <Abs g={g} x={366} y={g.charts + push} w={340} h={g.chartH} o={blk(4)}>
            <Card>
              <ChartTitle title={CH.line} sub={<span style={{ fontSize: 12, color: C.muted }}>{CH.lineSub}</span>} />
              <LineChart w={340} values={line} />
            </Card>
          </Abs>
          <Abs g={g} x={722} y={g.charts + push} w={334} h={g.chartH} o={blk(5)}>
            <Card>
              <ChartTitle title={CH.donut} />
              <div style={{ position: 'absolute', left: 16, top: 52 }}>
                <Donut d={124} ring={22} values={spend} centre={`£${centreK}k`} />
              </div>
              <div style={{ position: 'absolute', left: 158, top: 72 }}>
                <Legend
                  w={160}
                  rows={[
                    { name: D.donutLegend[0][0], value: D.donutLegend[0][1], i: 0 },
                    { name: D.donutLegend[1][0], value: counted ? `£${Math.round(nfSpend).toLocaleString('en-GB')}` : '—', i: 1 },
                    { name: D.donutLegend[2][0], value: D.donutLegend[2][1], i: 2 },
                    { name: D.donutLegend[3][0], value: D.donutLegend[3][1], i: 3 },
                  ]}
                />
              </div>
            </Card>
          </Abs>
        </>
      ) : (
        <>
          <Abs g={g} x={0} y={g.charts} w={g.w} h={g.chartH} o={blk(3)} a="chart-bar">
            <Card>
              <ChartTitle title={CH.bar} sub={!empty || flagO > 0 ? <span style={{ opacity: flagO }}><StatusPill tone="warning" label={CH.barFlag} size={11.5} /></span> : undefined} />
              <BarChart w={g.w} h={g.chartH} values={empty ? [null, null, null, null] : bars} flagO={flagO} empty={empty} />
              {empty ? <Empty text={CH.empty.chart} top={PLOT_TOP + plotH(g.chartH) / 2 - 8} /> : null}
            </Card>
          </Abs>
          <Abs g={g} x={0} y={g.charts + g.chartH + 16} w={306} h={g.chartH} o={blk(4)}>
            <Card>
              <ChartTitle title={CH.line} sub={<span style={{ fontSize: 12, color: C.muted }}>{CH.lineSub}</span>} />
              <LineChart w={306} h={g.chartH} values={line} empty={empty} />
              {empty ? <Empty text={CH.empty.chart} top={PLOT_TOP + plotH(g.chartH) / 2 - 8} /> : null}
            </Card>
          </Abs>
          <Abs g={g} x={322} y={g.charts + g.chartH + 16} w={306} h={g.chartH} o={blk(5)}>
            <Card>
              <ChartTitle title={CH.donut} />
              <div style={{ position: 'absolute', left: 16, top: 50 }}>
                <Donut d={100} ring={18} values={spend} centre={empty ? '' : `£${centreK}k`} empty={empty} />
              </div>
              {empty ? (
                <div style={{ position: 'absolute', left: 136, top: 92, fontSize: 12, color: C.muted }}>{CH.empty.chart}</div>
              ) : (
                <div style={{ position: 'absolute', left: 132, top: 64 }}>
                  <Legend
                    w={152}
                    size={11}
                    rows={D.donutLegend.map(([n, v], i) => ({ name: n, value: i === 1 && !counted ? '—' : v, i }))}
                  />
                </div>
              )}
            </Card>
          </Abs>
        </>
      )}

      {/* the latest insight */}
      <Abs g={g} x={ix} y={g.insight + push} w={g.w} h={g.insightH} o={blk(6)} a="dash-insight">
        <div style={{ height: '100%', boxSizing: 'border-box', background: C.sunken, borderRadius: RADIUS.lg, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: C.info.text }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: C.info.text }} />
              {WT_RUN.insightLabel}
            </span>
            {ran ? <span style={{ fontSize: 12, color: C.muted, opacity: ui(f, run!.metaAt), overflow: 'hidden', textOverflow: 'ellipsis' }}>{WT_RUN.insightMeta}</span> : null}
            {ran ? (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: C.info.text, textDecoration: 'underline', textUnderlineOffset: 2, opacity: ui(f, run!.metaAt) }}>{WT_RUN.allRuns}</span>
            ) : null}
          </div>
          <div style={{ marginTop: 6, fontSize: 14, lineHeight: '20px', color: C.text, maxWidth: full ? 1000 : g.w }}>
            {working ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: C.text2 }}>Working…</span>
                <Shimmer w={360} h={9} />
              </div>
            ) : ran ? (
              <Streamed text={text} from={run!.streamAt} rate={4} />
            ) : (
              <span style={{ fontSize: 13, color: C.muted }}>{CH.empty.insight}</span>
            )}
          </div>
        </div>
      </Abs>

      {/* below the fold: runs and keep (full only) */}
      {full ? (
        <>
          <Abs g={g} x={0} y={FULL.runsLabel + push}>
            <Micro>{D.runsLabel}</Micro>
          </Abs>
          <Abs g={g} x={0} y={FULL.runs + push} w={g.w} h={116}>
            <Card style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 12.5, lineHeight: '17px', color: C.muted, maxWidth: 900 }}>{D.runsSub}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '210px 130px 140px 120px 170px 1fr', marginTop: 10, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                {D.runsColumns.map((h) => (
                  <Micro key={h}>{h}</Micro>
                ))}
              </div>
              {ran ? (
                <div style={{ display: 'grid', gridTemplateColumns: '210px 130px 140px 120px 170px 1fr', paddingTop: 9, fontSize: 13, opacity: ui(f, run!.metaAt), fontVariantNumeric: 'tabular-nums' }}>
                  {WT_RUN.row.map((v, i) => (
                    <span key={i}>{v}</span>
                  ))}
                </div>
              ) : (
                <div style={{ paddingTop: 9, fontSize: 13, color: C.muted }}>{D.noRuns}</div>
              )}
            </Card>
          </Abs>
          <Abs g={g} x={0} y={FULL.keepLabel + push}>
            <Micro>{D.keepSection}</Micro>
          </Abs>
          <Abs g={g} x={0} y={FULL.keep + push} w={g.w} h={180}>
            <div style={{ height: '100%', boxSizing: 'border-box', background: C.sunken, borderRadius: RADIUS.lg, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, lineHeight: '19px', color: C.text2, maxWidth: 860 }}>
                {D.keepBody.split('No rows travel')[0]}
                <b style={{ color: C.text }}>No rows travel</b>
                {D.keepBody.split('No rows travel')[1]}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text2, marginTop: 10 }}>{D.keepLabel}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 5 }}>
                <div style={{ width: 400, height: 32, boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 8, background: C.pane, fontSize: 13, display: 'flex', alignItems: 'center', padding: '0 12px' }}>{D.keepValue}</div>
                <span data-w4="dash-keep" style={{ display: 'inline-flex' }}>
                  <Btn
                    variant="primary"
                    label={D.keepButton}
                    pressAt={p.keep?.pressAt}
                    hover={p.keep !== undefined && f >= p.keep.hoverFrom && f < p.keep.pressAt + 6}
                    style={{ padding: '6px 16px' }}
                  />
                </span>
              </div>
              {p.keep && f >= p.keep.noticeAt ? (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.success.text, opacity: ui(f, p.keep.noticeAt) }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: C.success.dot }} />
                  {D.keepNotice}
                </div>
              ) : null}
            </div>
          </Abs>
        </>
      ) : null}
    </div>
  );
};

/** The narrow topbar's collapsed actions (VISION: the three header actions fold into `⋯` at narrow width). */
export const MoreButton: React.FC = () => (
  <span style={{ width: 28, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.text2 }}>
    <MoreHorizontal size={16} strokeWidth={1.8} />
  </span>
);
