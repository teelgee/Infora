/**
 * Dashboard tiles and charts at native size (master-plan §4.6 chart palette,
 * §5.4; video-04 "Dashboard"): KpiTile, BarChart, LineChart, PieChart,
 * InsightCard, DataTable, Dashboard.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, CHART, FONT, RADIUS, SHADOW, TYPE } from '../theme';
import { appear, ease, ui, type F } from '../motion';
import { Greek, GreekText } from '../focus';
import { Badge, MicroLabel } from './primitives';
import type { DashboardData } from '../../data/wrenfield';

const GROW = 17; // tiles count up / bars grow over 17 f (692–709)

/** Count every number in a string up from 0 by progress p, keeping its format. */
export function countString(s: string, p: number): string {
  if (p >= 1) return s;
  return s.replace(/(?<![A-Za-z])\d[\d,]*(\.\d+)?/g, (m) => {
    const n = parseFloat(m.replace(/,/g, ''));
    const dec = m.includes('.') ? m.split('.')[1].length : 0;
    const v = n * p;
    const str = dec ? v.toFixed(dec) : Math.round(v).toString();
    return m.includes(',') ? Number(str).toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : str;
  });
}

const cardStyle = (w?: number, h?: number): React.CSSProperties => ({
  width: w,
  height: h,
  background: C.pane,
  borderRadius: RADIUS.card,
  boxShadow: SHADOW.soft,
  padding: 12,
  boxSizing: 'border-box',
  fontFamily: FONT.sans,
  overflow: 'hidden',
  position: 'relative',
});

const ChartTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode; empty?: boolean }> = ({ children, right, empty }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 18 }}>
    <div style={{ fontSize: TYPE.label, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {empty ? <Greek lines={1} lineHeight={14} widths={[0.6]} style={{ width: 120 }} /> : children}
    </div>
    {right ? <div style={{ marginLeft: 'auto', flex: 'none' }}>{right}</div> : null}
  </div>
);

// ------------------------------------------------------------------ KpiTile

export interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  /** Fade in (`ui`) at this frame. */
  at?: F;
  /** Count the value's numbers up over 17 f from here. */
  countFrom?: F;
  valueSize?: 29 | 52;
  /** "—" and the empty sub ("no returns yet"). */
  empty?: boolean;
  w?: number;
  h?: number;
}

export const KpiTile: React.FC<KpiTileProps> = ({ label, value, sub, at, countFrom, valueSize = 29, empty = false, w = 242, h }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  const p = countFrom === undefined ? 1 : appear(f, countFrom, GROW, ease.out);
  // Before the count starts the tile reads "—", never "0 of 0" (a broken-looking empty dashboard).
  const pending = countFrom !== undefined && f < countFrom;
  const height = h ?? (valueSize === 52 ? 96 : 72);
  return (
    <div style={{ ...cardStyle(w, height), opacity: o, padding: valueSize === 52 ? '12px 14px' : '10px 12px' }}>
      <div style={{ fontSize: TYPE.label, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</div>
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: valueSize,
          lineHeight: 1.1,
          fontWeight: 500,
          color: empty || pending ? C.faint : C.text,
          marginTop: valueSize === 52 ? 6 : 3,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: -0.3,
          whiteSpace: 'nowrap',
        }}
      >
        {empty || pending ? '—' : <TileValue text={countString(value, p)} size={valueSize} />}
      </div>
      {empty ? (
        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>no returns yet</div>
      ) : sub && valueSize !== 52 ? (
        <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2, whiteSpace: 'nowrap' }}>{sub}</div>
      ) : null}
    </div>
  );
};

/** Figures at full size; words and units ("of", "tCO2e") smaller and secondary. */
const TileValue: React.FC<{ text: string; size: number }> = ({ text, size }) => (
  <>
    {text.split(' ').map((tok, i) => {
      const fig = /^[£$]?[\d,.]+%?$/.test(tok);
      return (
        <React.Fragment key={i}>
          {i > 0 ? ' ' : null}
          <span style={fig ? undefined : { fontSize: size * 0.52, color: C.text2, fontFamily: FONT.sans, fontWeight: 500, letterSpacing: 0 }}>{tok}</span>
        </React.Fragment>
      );
    })}
  </>
);

// ------------------------------------------------------------------ BarChart

export interface BarChartProps {
  title: string;
  data: Array<{ label: string; value: number; flag?: { at: F; badge: string } }>;
  max: number;
  unit?: string;
  at?: F;
  /** Bars grow over 17 f from here (default: at). */
  growFrom?: F;
  /** Faint placeholder bars at 40 %, no labels. */
  empty?: boolean;
  /** A warning Badge in the chart header. */
  flagRule?: { label: string; at: F };
  w?: number;
  h?: number;
}

/** Vertical bars, series 1 ink; a flagged bar turns `#c4901f` at its frame. */
export const BarChart: React.FC<BarChartProps> = ({ title, data, max, unit = '', at, growFrom, empty = false, flagRule, w = 250, h = 190 }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  const g = growFrom === undefined ? (at === undefined ? 1 : appear(f, at, GROW, ease.out)) : appear(f, growFrom, GROW, ease.out);
  const plotH = h - 24 - 18 - 30 - (flagRule && f >= flagRule.at ? 0 : 0);
  const flagged = data.find((d) => d.flag && f >= d.flag.at);
  const n = empty ? 4 : data.length;
  const barW = Math.min(36, (w - 24 - (n - 1) * 12) / Math.max(n, 1));
  return (
    <div style={{ ...cardStyle(w, h), opacity: o }}>
      <ChartTitle empty={empty}>{title}</ChartTitle>
      <div style={{ height: 18, marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
        {flagRule && f >= flagRule.at ? <Badge tone="warning" label={flagRule.label} pill at={flagRule.at} size={9} /> : null}
        {flagged?.flag && !(flagRule && f >= flagRule.at) ? <Badge tone="warning" label={flagged.flag.badge} at={flagged.flag.at} size={9} /> : null}
      </div>
      <div style={{ position: 'relative', height: plotH, borderBottom: `1px solid ${C.borderStrong}`, display: 'flex', alignItems: 'flex-end', justifyContent: n === 1 ? 'flex-start' : 'space-around', gap: 12, padding: '0 6px' }}>
        {[0.5, 1].map((gl) => (
          <div key={gl} style={{ position: 'absolute', left: 0, right: 0, bottom: plotH * gl - 0.5, height: 1, background: C.border }} />
        ))}
        {(empty ? [0.4, 0.4, 0.4, 0.4] : data.map((d) => d.value / max)).map((v, i) => {
          const d = data[i];
          const isFlag = !empty && d?.flag && f >= d.flag.at;
          const fp = isFlag ? ui(f, d.flag!.at) : 0;
          return (
            <div key={i} style={{ width: barW, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
              {!empty ? (
                <div style={{ fontSize: 10, fontWeight: 600, color: isFlag ? C.warning.text : C.text, marginBottom: 2, opacity: g > 0.6 ? 1 : 0, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(d.value * g)}
                  {unit}
                </div>
              ) : null}
              <div
                style={{
                  width: barW,
                  height: plotH * v * (empty ? 1 : g) - (empty ? 0 : 14),
                  borderRadius: '3px 3px 0 0',
                  background: empty ? C.borderStrong : isFlag ? mix(CHART.s1, CHART.flag, fp) : CHART.s1,
                  opacity: empty ? 0.4 : 1,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: n === 1 ? 'flex-start' : 'space-around', gap: 12, padding: '4px 6px 0' }}>
        {(empty ? ['', '', '', ''] : data.map((d) => d.label)).map((l, i) => (
          <div key={i} style={{ width: Math.max(barW, 44), textAlign: 'center', fontSize: 9.5, color: C.muted, whiteSpace: 'nowrap', marginLeft: n === 1 ? -4 : 0 }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
};

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

// ------------------------------------------------------------------ LineChart

export interface LineChartProps {
  title: string;
  points: Array<{ label: string; value: number }>;
  /** Dashed least-squares trend line. */
  trend?: boolean;
  at?: F;
  /** Line draws over 17 f from here (default: at). */
  drawFrom?: F;
  empty?: boolean;
  min?: number;
  max?: number;
  w?: number;
  h?: number;
}

export const LineChart: React.FC<LineChartProps> = ({ title, points, trend = false, at, drawFrom, empty = false, min, max, w = 250, h = 190 }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  const p = empty ? 1 : drawFrom === undefined ? (at === undefined ? 1 : appear(f, at, GROW, ease.out)) : appear(f, drawFrom, GROW, ease.out);
  const pw = w - 24;
  const ph = h - 24 - 20 - 28;
  const vals = points.map((d) => d.value);
  const lo = min ?? Math.floor((Math.min(...vals) * 0.85) / 10) * 10;
  const hi = max ?? Math.ceil((Math.max(...vals) * 1.05) / 10) * 10;
  const xs = points.map((_, i) => 14 + (i * (pw - 28)) / Math.max(1, points.length - 1));
  const ys = vals.map((v) => ph - ((v - lo) / (hi - lo)) * (ph - 10));
  const path = xs.map((x, i) => `${i ? 'L' : 'M'}${x},${ys[i]}`).join(' ');
  let len = 0;
  for (let i = 1; i < xs.length; i++) len += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  // Trend (least squares).
  const n = vals.length;
  const mx = (n - 1) / 2;
  const my = vals.reduce((a, b) => a + b, 0) / n;
  const slope = vals.reduce((a, v, i) => a + (i - mx) * (v - my), 0) / vals.reduce((a, _, i) => a + (i - mx) ** 2, 0);
  const ty = (i: number) => ph - ((my + slope * (i - mx) - lo) / (hi - lo)) * (ph - 10);
  return (
    <div style={{ ...cardStyle(w, h), opacity: o }}>
      <ChartTitle empty={empty}>{title}</ChartTitle>
      <svg width={pw} height={ph} style={{ marginTop: 20, overflow: 'visible' }}>
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={0} x2={pw} y1={ph - g * (ph - 10)} y2={ph - g * (ph - 10)} stroke={g === 0 ? C.borderStrong : C.border} strokeWidth={1} />
        ))}
        {empty ? (
          <path d={`M14,${ph * 0.45} C${pw * 0.35},${ph * 0.3} ${pw * 0.6},${ph * 0.65} ${pw - 14},${ph * 0.5}`} fill="none" stroke={C.borderStrong} strokeWidth={3} opacity={0.4} strokeLinecap="round" />
        ) : (
          <>
            {trend ? (
              <line x1={xs[0]} y1={ty(0)} x2={xs[n - 1]} y2={ty(n - 1)} stroke={CHART.trend} strokeWidth={1.2} strokeDasharray="3 3" opacity={p} />
            ) : null}
            <path d={path} fill="none" stroke={CHART.s1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
            {xs.map((x, i) => (
              <g key={i} opacity={p >= (i / Math.max(1, n - 1)) * 0.98 ? 1 : 0}>
                <circle cx={x} cy={ys[i]} r={3} fill={C.pane} stroke={CHART.s1} strokeWidth={1.8} />
                <text x={x} y={ys[i] - 8} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={C.text} fontFamily={FONT.sans}>
                  {vals[i]}
                </text>
              </g>
            ))}
          </>
        )}
      </svg>
      <div style={{ position: 'relative', height: 14, marginTop: 4 }}>
        {!empty
          ? points.map((d, i) => (
              <span key={i} style={{ position: 'absolute', left: xs[i], transform: 'translateX(-50%)', fontSize: 9.5, color: C.muted }}>
                {d.label}
              </span>
            ))
          : null}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ PieChart

export interface PieChartProps {
  title: string;
  data: Array<{ label: string; value: number }>;
  at?: F;
  donut?: boolean;
  centre?: string;
  empty?: boolean;
  w?: number;
  h?: number;
}

const PIE = [CHART.s1, CHART.s2, CHART.s3, CHART.s4];

export const PieChart: React.FC<PieChartProps> = ({ title, data, at, donut = true, centre, empty = false, w = 226, h = 190 }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  const p = empty ? 1 : at === undefined ? 1 : appear(f, at, GROW, ease.out);
  const r = Math.min(w - 24, h - 60) / 2;
  const cx = (w - 24) / 2;
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  let acc = 0;
  const arcs = data.map((d, i) => {
    const a0 = (acc / total) * Math.PI * 2 * p - Math.PI / 2;
    acc += d.value;
    const a1 = (acc / total) * Math.PI * 2 * p - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = r + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = r + r * Math.sin(a1);
    const full = data.length === 1;
    return full ? (
      <circle key={i} cx={cx} cy={r} r={r} fill={PIE[0]} />
    ) : (
      <path key={i} d={`M${cx},${r} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`} fill={PIE[i % 4]} stroke={i === 3 ? CHART.s4Outline : C.pane} strokeWidth={i === 3 ? 1 : 1.5} />
    );
  });
  return (
    <div style={{ ...cardStyle(w, h), opacity: o }}>
      <ChartTitle empty={empty}>{title}</ChartTitle>
      <svg width={w - 24} height={r * 2} style={{ marginTop: 14, display: 'block' }}>
        {empty ? <circle cx={cx} cy={r} r={r} fill={C.borderStrong} opacity={0.4} /> : arcs}
        {donut ? <circle cx={cx} cy={r} r={r * 0.6} fill={C.pane} /> : null}
        {donut && centre && !empty ? (
          <text x={cx} y={r + 5} textAnchor="middle" fontFamily={FONT.serif} fontSize={15} fontWeight={500} fill={C.text}>
            {centre}
          </text>
        ) : null}
      </svg>
    </div>
  );
};

// ------------------------------------------------------------------ InsightCard

export interface InsightCardProps {
  /** Legible label, e.g. "Written 1 Oct · from accepted returns only". */
  label: string;
  /** The paragraph's sentences (or one string). */
  text: string | readonly string[];
  /** The only sentence ever sharp. */
  focalSentence: string;
  /** Greek'd meta line under the label. */
  meta?: string;
  at?: F;
  /** Focal sentence Greek'd until this frame (then sharp, with a Highlight). */
  focalFrom?: F;
  /** Empty state: a muted label instead (e.g. "No runs yet"). */
  empty?: string;
  w?: number;
  h?: number;
}

export const InsightCard: React.FC<InsightCardProps> = ({ label, text, focalSentence, meta, at, focalFrom, empty, w = 750, h = 96 }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  const sentences = typeof text === 'string' ? [text] : text;
  const sharp = focalFrom === undefined || f >= focalFrom;
  return (
    <div style={{ ...cardStyle(w, h), opacity: o, background: C.sunken, boxShadow: 'none', padding: '10px 14px' }}>
      {empty ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: TYPE.ui, color: C.muted }}>{empty}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <MicroLabel style={{ color: C.text2 }}>Insight</MicroLabel>
            <span style={{ fontSize: TYPE.label, color: C.muted, fontWeight: 500 }}>{label}</span>
          </div>
          {meta ? (
            <div style={{ fontSize: 9.5, marginTop: 2 }}>
              <GreekText text={meta} greek />
            </div>
          ) : null}
          <div style={{ fontFamily: FONT.serif, fontSize: 13, lineHeight: 1.5, color: C.prose, marginTop: 5 }}>
            {sentences.map((s, i) => (
              <React.Fragment key={i}>
                {s === focalSentence ? (
                  <span
                    style={{
                      background: sharp ? C.warning.tint : undefined,
                      borderRadius: 3,
                      padding: '0 2px',
                      color: C.text,
                    }}
                  >
                    <GreekText text={s} greek={!sharp} />
                  </span>
                ) : (
                  <GreekText text={s} greek />
                )}
                {i < sentences.length - 1 ? ' ' : null}
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ DataTable

export interface DataTableProps {
  title?: string;
  columns: Array<{ key: string; label: string; align?: 'left' | 'right'; width?: number | string }>;
  rows: Array<Record<string, React.ReactNode>>;
  /** Rows fade in from here, `stagger` frames apart. */
  revealFrom?: F;
  stagger?: number;
  /** Shown as one muted row when there are no rows. */
  emptyText?: string;
  rowHeight?: number;
  w?: number;
}

export const DataTable: React.FC<DataTableProps> = ({ title, columns, rows, revealFrom, stagger = 3, emptyText, rowHeight = 28, w }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ ...cardStyle(w), padding: '8px 12px' }}>
      {title ? <div style={{ fontSize: TYPE.label, fontWeight: 600, marginBottom: 2 }}>{title}</div> : null}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? 'left',
                  fontSize: 9,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: C.muted,
                  fontWeight: 700,
                  padding: '5px 6px',
                  borderBottom: `1px solid ${C.border}`,
                  width: c.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && emptyText ? (
            <tr>
              <td colSpan={columns.length} style={{ height: rowHeight, color: C.muted, padding: '0 6px', fontSize: TYPE.label }}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} style={{ opacity: revealFrom === undefined ? 1 : ui(f, revealFrom + i * stagger) }}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      height: rowHeight,
                      boxSizing: 'border-box',
                      padding: '0 6px',
                      borderBottom: `1px solid ${C.borderSubtle}`,
                      textAlign: c.align ?? 'left',
                      color: C.text,
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

// ------------------------------------------------------------------ Dashboard

export interface DashboardProps {
  seat: 'client' | 'supplier';
  data: DashboardData;
  /** Empty state: tiles "—", placeholder charts, "No runs yet", "No returns yet". */
  empty?: boolean;
  /** 'payoff' = the two-seat cover crop: header + tiles + a full-width bar chart, 620 × 468, type sized for ~1.4×. */
  crop?: 'full' | 'payoff';
  /** Blocks enter (`ui`) from here, 4 f apart (tiles, bar, line, donut, insight, table). */
  at?: F;
  /** Tiles count up and bars grow over 17 f from here. */
  countFrom?: F;
  /** Flag-rule badge (from the user's change) appears at this frame. */
  flagRuleAt?: F;
  /** The flagged bar turns amber with its badge at this frame. */
  flagAt?: F;
  /** Insight focal sentence Greek'd until here. */
  insightFocalFrom?: F;
  /** Header label override (e.g. "Preview · no returns yet" lives outside). */
  style?: React.CSSProperties;
}

/** The supplier-KPI dashboard: 774 × 640 native grid (video-04). */
export const Dashboard: React.FC<DashboardProps> = ({ seat, data, empty = false, crop = 'full', at, countFrom, flagRuleAt, flagAt, insightFocalFrom, style }) => {
  const step = (i: number) => (at === undefined ? undefined : at + i * 4);
  if (crop === 'payoff') return <PayoffDashboard data={data} at={at} countFrom={countFrom} flagRuleAt={flagRuleAt} flagAt={flagAt} style={style} />;
  const W = 774;
  const H = 640;
  return (
    <div style={{ width: W, height: H, background: C.pane, borderRadius: RADIUS.pane, padding: '24px 12px', boxSizing: 'border-box', fontFamily: FONT.sans, overflow: 'hidden', ...style }}>
      <div style={{ height: 40, padding: '0 2px' }}>
        <div style={{ fontFamily: FONT.serif, fontSize: 24, fontWeight: 500, lineHeight: 1.05, color: C.text }}>{data.title}</div>
        <div style={{ fontSize: TYPE.label, color: C.muted, marginTop: 3 }}>{data.label}</div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        {data.tiles.map((t) => (
          <KpiTile key={t.label} label={t.label} value={t.value} sub={t.sub} at={step(0)} countFrom={countFrom} valueSize={29} empty={empty} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <BarChart
          title={data.bars.title}
          max={data.bars.max}
          data={data.bars.data.map((d) => ({
            label: d.label,
            value: d.value,
            flag: d.flagged && flagAt !== undefined ? { at: flagAt, badge: 'Under 90% on time' } : undefined,
          }))}
          at={step(1)}
          growFrom={countFrom}
          empty={empty}
          flagRule={flagRuleAt !== undefined ? { label: 'Flags under 90% on time', at: flagRuleAt } : undefined}
        />
        <LineChart title={data.line.title} points={data.line.points} trend at={step(2)} drawFrom={countFrom} empty={empty} />
        <PieChart title={data.donut.title} data={data.donut.data} centre={data.donut.centre} at={step(3)} empty={empty} />
      </div>
      <div style={{ marginTop: 12 }}>
        {seat === 'client' && data.insight && !empty ? (
          <InsightCard
            label={data.insight.label}
            meta={data.insight.meta}
            text={data.insight.sentences}
            focalSentence={data.insight.focal}
            at={step(4)}
            focalFrom={insightFocalFrom}
          />
        ) : empty ? (
          <InsightCard label="" text="" focalSentence="" at={step(4)} empty="No runs yet" />
        ) : (
          // A supplier seat never sees Trentmoor's insight (it names other suppliers).
          <div style={{ height: 96 }} />
        )}
      </div>
      <div style={{ marginTop: 12, opacity: 1 }}>
        <DashTable data={data} empty={empty} at={step(5)} />
      </div>
    </div>
  );
};

const DashTable: React.FC<{ data: DashboardData; empty: boolean; at?: F }> = ({ data, empty, at }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  return (
    <div style={{ opacity: o }}>
      <DataTable
        title={empty ? undefined : data.table.title}
        w={750}
        rowHeight={21}
        columns={[
          { key: 'org', label: 'Organisation', width: '38%' },
          { key: 'due', label: 'Due', align: 'right' },
          { key: 'onTime', label: 'On time', align: 'right' },
          { key: 'ncrs', label: 'NCRs', align: 'right' },
          { key: 'safety', label: 'Safety', align: 'right' },
          { key: 'carbon', label: 'Carbon', align: 'right' },
          { key: 'state', label: 'State', align: 'right' },
        ]}
        emptyText="No returns yet"
        rows={
          empty
            ? []
            : data.table.rows.map((r) => ({
                ...r,
                state: <Badge tone="success" label={r.state} size={10} />,
              }))
        }
      />
    </div>
  );
};

// ------------------------------------------------------------------ the payoff crop

/** Native size of the payoff crop. At Float scale 1.4 it is 868 × 655 on screen. */
export const PAYOFF_CROP = { w: 620, h: 468 } as const;

/**
 * The two-seat payoff (video-04 shot 10, the LinkedIn cover frame): a crop
 * re-laid for reading at ~1.4×, so the key labels land at ≥ 21 px on screen
 * and the values at ≥ 50 px. Tiles read "—" until the count starts. The bar
 * chart takes the full width; a seat with one supplier gets one centred bar.
 */
const PayoffDashboard: React.FC<{
  data: DashboardData;
  at?: F;
  countFrom?: F;
  flagRuleAt?: F;
  flagAt?: F;
  style?: React.CSSProperties;
}> = ({ data, at, countFrom, flagRuleAt, flagAt, style }) => {
  const f = useCurrentFrame();
  const step = (i: number) => (at === undefined ? 1 : ui(f, at + i * 4));
  const p = countFrom === undefined ? 1 : appear(f, countFrom, GROW, ease.out);
  const pending = countFrom !== undefined && f < countFrom;
  const ruleOn = flagRuleAt !== undefined && f >= flagRuleAt;
  const pad = 18;
  const inner = PAYOFF_CROP.w - pad * 2;
  const chartH = 236;
  const plotH = 132;
  const threshold = 90;
  return (
    <div
      style={{
        width: PAYOFF_CROP.w,
        height: PAYOFF_CROP.h,
        background: C.pane,
        borderRadius: RADIUS.pane,
        padding: `20px ${pad}px`,
        boxSizing: 'border-box',
        fontFamily: FONT.sans,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ height: 56 }}>
        <div style={{ fontFamily: FONT.serif, fontSize: 27, fontWeight: 500, lineHeight: 1.05, color: C.text, whiteSpace: 'nowrap' }}>{data.title}</div>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 5, whiteSpace: 'nowrap' }}>{data.label}</div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 14, opacity: step(0) }}>
        {data.tiles.map((t, i) => (
          <div key={t.label} style={{ ...cardStyle(undefined, 108), flex: i === 2 ? '1.25 1 0' : '1 1 0', padding: '14px 14px' }}>
            <div style={{ fontSize: 15, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>{t.label}</div>
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: 38,
                lineHeight: 1.1,
                fontWeight: 500,
                color: pending ? C.faint : C.text,
                marginTop: 10,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: -0.3,
                whiteSpace: 'nowrap',
              }}
            >
              {pending ? '—' : <TileValue text={countString(t.value, p)} size={38} />}
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...cardStyle(inner, chartH), marginTop: 14, padding: '14px 16px', opacity: step(1) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 26 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>{data.bars.title}</div>
          {ruleOn ? (
            <div style={{ marginLeft: 'auto', flex: 'none' }}>
              <Badge tone="warning" label="Flags under 90% on time" pill at={flagRuleAt} size={13.5} />
            </div>
          ) : null}
        </div>
        <div style={{ position: 'relative', height: plotH + 26, marginTop: 8 }}>
          {/* the plot: baseline at plotH + 26 (value labels sit above the bars) */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 26, height: plotH, borderBottom: `1px solid ${C.borderStrong}` }}>
            {[0.5, 1].map((gl) => (
              <div key={gl} style={{ position: 'absolute', left: 0, right: 0, bottom: plotH * gl - 0.5, height: 1, background: C.border }} />
            ))}
            {ruleOn ? (
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: (plotH * threshold) / data.bars.max, borderTop: `1.5px dashed ${CHART.flag}`, opacity: ui(f, flagRuleAt!) }} />
            ) : null}
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: plotH + 26, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around' }}>
            {data.bars.data.map((d) => {
              const isFlag = !!d.flagged && flagAt !== undefined && f >= flagAt;
              const fp = isFlag ? ui(f, flagAt!) : 0;
              return (
                <div key={d.label} style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: isFlag ? C.warning.text : C.text, marginBottom: 2, padding: '0 5px', borderRadius: 4, background: C.pane, opacity: p > 0.6 ? 1 : 0, fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(d.value * p)}%
                  </div>
                  <div
                    style={{
                      width: 64,
                      height: (plotH * d.value * p) / data.bars.max,
                      borderRadius: '4px 4px 0 0',
                      background: isFlag ? mix(CHART.s1, CHART.flag, fp) : CHART.s1,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 6 }}>
          {data.bars.data.map((d) => (
            <div key={d.label} style={{ width: 84, textAlign: 'center', fontSize: 16, color: C.text2, fontWeight: 500, whiteSpace: 'nowrap' }}>
              {d.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
