// T-442 — **the generated screen, drawn** (ADR-0056 §11).
//
// *In plain terms: this is where an app's own screen appears — the form a
// contractor fills in, the dashboard the client reads. The builder's agent
// wrote a short list of parts, and this file draws them.*
//
// 🔒 **THIS MODULE HAS NO OUTWARD REACH, AND A GUARD IN `pnpm run check` KEEPS
// IT THAT WAY.** `scripts/source-rules.mjs` rule 4 fences this exact file: no
// `fetch`, no socket, no markup that could carry a URL, nothing that evaluates
// text as code. ADR-0056 §11 rules that a generated screen runs in the viewer's
// browser, calls Infora's API as the viewer, holds no secret and reaches no
// outside system — and this is the half of that guarantee a grammar alone
// cannot give. The other half is the grammar itself
// (`packages/contracts/src/app-builder.ts`), whose nine block shapes have no
// field that could hold a URL, an endpoint or a key. The three chart blocks
// T-443 added are drawn here as SVG shapes over the rows this viewer received —
// no image, no external chart library, nothing that fetches a thing.
//
// So: a generated screen's ONLY data source is the row list this file asks
// `AppTableRows`' own route for, through the typed API, as the viewer.
//
// 🔒 **NO PERMISSION IS COMPUTED HERE, AND NO ROW IS SELECTED HERE.** The rows
// arrive already decided by `canReadAppRow`; the totals below are sums of what
// arrived. That is what makes one screen behave as two — Nadia at Redgate sees
// her firm's returns, Rachel at Trentmoor sees every firm's — with no branch in
// this file and no `viewer` prop anywhere in it.
//
// **The parts are drawn plainly, in the kit.** T-441's precedent: the approved
// drawing is the acts and the states, and the plain kit is how they are
// rendered. A generated screen that could bring its own styling would be a
// second design system nobody reviewed.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppColumn, AppRowRecord, AppScreen, AppScreenBlock, AppState, AppTableRecord } from '@infora/contracts';
import { isCurrentAppRow, parseAppScreen } from '@infora/contracts';
import { Badge, Button, Card, Field, SectionLabel, Table, TextInput } from '@infora/ui';
import { api } from '../api';

const ROW_STATE_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  // T-487 — "Replaced", not "Superseded": the word a person reads for a row
  // that a later row (a correction, or a newer import) has taken the place of
  superseded: 'Replaced',
};

/**
 * What the State column says of a row. A withdrawn row is "Retired"; a row a
 * later row took the place of is "Replaced" — and a REJECTED row a correction
 * replaced is "Rejected · replaced", because its stored state stays `rejected`
 * to keep the reason (drawer 9's CHECK) while the screen still has to say it is
 * no longer the figure that stands.
 */
export function rowStateLabel(row: AppRowRecord): string | null {
  if (row.retiredAt !== null) return 'Retired';
  if (row.state === null) return row.supersededByRowId !== null ? 'Replaced' : null;
  const base = ROW_STATE_LABEL[row.state] ?? row.state;
  return row.supersededByRowId !== null && row.state !== 'superseded' ? `${base} · replaced` : base;
}

/**
 * Read a stored screen back for one table.
 *
 * Refuses on the way in as well as on the way out: a screen naming a column the
 * table no longer declares is not drawn at all. A builder who retires a column
 * out from under a published screen is told the screen needs redrawing, which
 * is honest; a screen quietly rendering an empty column is not.
 */
export function screenFor(source: string | null, table: AppTableRecord): AppScreen | null {
  return parseAppScreen(
    source,
    table.columns.map((column) => column.key),
  );
}

/*
 * T-452 — **a figure is drawn from CURRENT rows only**: not withdrawn, not
 * replaced. A replaced row is the history of a figure somebody corrected, and a
 * retired one was withdrawn by its own organisation; counting either beside its
 * replacement double-counts. It mattered little while corrections were rare,
 * and it is every month once a table refills from a spreadsheet (ADR-0059):
 * each import supersedes the last, so a chart over every row would grow by a
 * whole report a month.
 *
 * T-487 — the predicate itself moved to `isCurrentAppRow` in the contracts, one
 * copy shared with the analysis run (and widened to rows that have a successor,
 * so a corrected REJECTED return is counted once). And the row table no longer
 * lists history by default: it shows the current rows, with the earlier ones one
 * click away — a table that listed 35 rows for 9 months contradicted the total
 * and the charts beside it.
 *
 * This is not an access decision and narrows nothing the viewer could read —
 * every row here already arrived through `canReadAppRow`.
 */

/** One block, drawn. Every branch renders text as text. */
export function ScreenBlock(props: {
  block: AppScreenBlock;
  table: AppTableRecord;
  rows: AppRowRecord[];
  onEnter: (values: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const { block, table, rows } = props;
  const label = (key: string) => table.columns.find((column) => column.key === key)?.label ?? key;
  const current = rows.filter(isCurrentAppRow);

  if (block.kind === 'heading') return <SectionLabel>{block.text}</SectionLabel>;
  if (block.kind === 'paragraph') return <p className="page-sub">{block.text}</p>;

  if (block.kind === 'count') {
    return (
      <p className="page-sub">
        {block.label}: <strong>{current.length}</strong>
      </p>
    );
  }

  if (block.kind === 'total') {
    // the sum of what THIS viewer received — never a figure computed elsewhere
    // and handed down, which would be a number about rows they cannot read
    const total = current.reduce((sum, row) => {
      const value = row.values[block.columnKey];
      return typeof value === 'number' ? sum + value : sum;
    }, 0);
    return (
      <p className="page-sub">
        {block.label}: <strong>{Number.isInteger(total) ? total : total.toFixed(2)}</strong>
      </p>
    );
  }

  if (block.kind === 'rowForm') {
    return (
      <ScreenForm
        block={block}
        table={table}
        onEnter={props.onEnter}
        pending={props.pending}
        label={label}
      />
    );
  }

  if (block.kind === 'barChart' || block.kind === 'lineChart' || block.kind === 'pieChart') {
    return <ScreenChart block={block} rows={current} table={table} />;
  }

  return <ScreenRowTable block={block} rows={rows} label={label} />;
}

/**
 * The row table block — **current rows by default, history one click away**
 * (T-487, walk defect 4).
 *
 * *In plain terms: the table shows the rows that count. If earlier rows exist —
 * ones a correction or a newer spreadsheet replaced, or ones their organisation
 * withdrew — one button under the table shows them, greyed and marked, and
 * hides them again.*
 *
 * "Nothing entered yet" is said only when there is nothing at all, current or
 * earlier. `showEarlier` sets the opening state; the block itself never passes
 * it, so a screen always opens collapsed — it exists so the open state can be
 * drawn, and tested, without a browser.
 */
export function ScreenRowTable(props: {
  block: Extract<AppScreenBlock, { kind: 'rowTable' }>;
  rows: AppRowRecord[];
  label: (key: string) => string;
  showEarlier?: boolean;
}) {
  const { block } = props;
  const [revealed, setRevealed] = useState(props.showEarlier ?? false);
  const current = props.rows.filter(isCurrentAppRow);
  const earlier = props.rows.filter((row) => !isCurrentAppRow(row));
  const shown = revealed ? [...current, ...earlier] : current;
  const width = block.columnKeys.length + (block.showOrganisation ? 1 : 0) + (block.showState ? 1 : 0);
  return (
    <>
      <Table>
        <table>
          <thead>
            <tr>
              {block.showOrganisation && <th>Organisation</th>}
              {block.columnKeys.map((key) => (
                <th key={key}>{props.label(key)}</th>
              ))}
              {block.showState && <th>State</th>}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={width}>
                  <span className="page-sub">
                    {earlier.length === 0 ? 'Nothing entered yet.' : 'No current rows.'}
                  </span>
                </td>
              </tr>
            ) : (
              shown.map((row) => {
                const isEarlier = !isCurrentAppRow(row);
                const state = rowStateLabel(row);
                return (
                  <tr key={row.id} style={isEarlier ? { opacity: 0.55 } : undefined} data-earlier={isEarlier ? 'true' : undefined}>
                    {block.showOrganisation && <td>{row.organisationName}</td>}
                    {block.columnKeys.map((key, index) => (
                      <td key={key}>
                        {formatValue(row.values[key])}
                        {/* a table that does not show the State column still has
                            to mark a row that no longer counts */}
                        {isEarlier && !block.showState && index === 0 && (
                          <>
                            {' '}
                            <Badge tone="neutral">{state ?? 'Replaced'}</Badge>
                          </>
                        )}
                      </td>
                    ))}
                    {block.showState && (
                      <td>
                        {state === null ? (
                          <span className="page-sub">—</span>
                        ) : (
                          <Badge
                            tone={
                              !isEarlier && row.state === 'accepted'
                                ? 'success'
                                : row.state === 'rejected' && !isEarlier
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {state}
                          </Badge>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Table>
      {earlier.length > 0 && (
        <Button variant="quiet" size="sm" onClick={() => setRevealed((open) => !open)}>
          {revealed
            ? 'Hide earlier rows'
            : `Show ${earlier.length} earlier ${earlier.length === 1 ? 'row' : 'rows'}`}
        </Button>
      )}
    </>
  );
}

// ── T-443's three charts, drawn from the rows this viewer received ──────────
//
// 🔒 **NO IMAGE, NO CHART LIBRARY, NO OUTWARD REACH.** These are SVG shapes
// computed in this file from `rows` — the same array the table block draws and
// the total block sums, already decided by `canReadAppRow` before it arrived.
// A charting dependency would be a second thing rendering an app's data, and
// (on a page whose whole guarantee is that it fetches nothing) a second thing
// that could. Rule 4 of `scripts/source-rules.mjs` fences the file either way:
// no attribute below can carry an address, and nothing here turns text into
// code — the shapes take numbers this file computed and colours it named.
//
// **The colours come from the design tokens** (`packages/ui/src/styles.css`),
// so a chart follows the light and dark palettes like everything else and a
// generated screen still cannot bring styling of its own — the block has no
// field for a colour, and this list is Infora's.
const CHART_INK = ['var(--accent)', 'var(--authority)', 'var(--amber)', 'var(--danger)'];

/** One bar, point or slice: a category, and the sum of the value column over
 * the rows in it. In calendar order when the category column is a date (or text
 * that is all dates or months), otherwise first-seen, and the group for a row
 * that left the category empty ("—") last. */
export type ChartSlice = { label: string; value: number };

const MONTHS = [
  ['jan', 'january'],
  ['feb', 'february'],
  ['mar', 'march'],
  ['apr', 'april'],
  ['may', 'may'],
  ['jun', 'june'],
  ['jul', 'july'],
  ['aug', 'august'],
  ['sep', 'september', 'sept'],
  ['oct', 'october'],
  ['nov', 'november'],
  ['dec', 'december'],
];

/**
 * Where a category value falls on the calendar, as a sortable number — or null
 * when it does not read as a date or a month at all.
 *
 * Reads exactly these shapes, and guesses at nothing else: ISO `2026-10` and
 * `2026-10-01` (a time after the day is ignored), and an English month name
 * with its year — "October 2026", "Oct 2026", case-insensitive. A bare "October"
 * is not read (which year?), and neither is "10/11/2026" (whose day comes
 * first?): a value this does not understand sends the whole column back to
 * first-seen order rather than ordering it wrongly.
 */
export function calendarKey(raw: string): number | null {
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ].*)?$/.exec(text);
  if (iso !== null) {
    const month = Number(iso[2]);
    const day = iso[3] === undefined ? 1 : Number(iso[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return Number(iso[1]) * 10000 + month * 100 + day;
  }
  const named = /^([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(text);
  if (named !== null) {
    const name = named[1]!.toLowerCase();
    const index = MONTHS.findIndex((forms) => forms.includes(name));
    if (index !== -1) return Number(named[2]) * 10000 + (index + 1) * 100 + 1;
  }
  return null;
}

/**
 * Group the rows this viewer received by one column and add up another.
 *
 * A row whose value is not a number contributes nothing — the same rule the
 * `total` block follows. A category with no numeric rows at all still appears,
 * at zero, because "this month, nothing" is a fact a dashboard should show.
 *
 * **Order (T-487, walk defect 5).** Rows arrive oldest-entered first, so a
 * returns table whose October return was entered before its May one drew
 * October first — and a line chart and its trend line through months out of
 * order say something false. When the grouping column is declared `date`, the
 * groups are ordered by date, earliest first. When it is `text` and EVERY
 * non-empty value reads as a date or a month, the same. Anything else — a
 * category like "Waste" or "Energy" — keeps the order it was first seen, which
 * is the order a person entered it. The column's TYPE is passed in, from the
 * table's declaration: it is never guessed from the column's key. The empty
 * group ("—") goes last either way.
 */
export function chartSeries(
  rows: AppRowRecord[],
  categoryColumn: string,
  valueColumn: string,
  categoryType?: AppColumn['type'],
): ChartSlice[] {
  const order: string[] = [];
  const totals = new Map<string, number>();
  for (const row of rows) {
    const raw = row.values[categoryColumn];
    const key = raw === undefined || raw === null || raw === '' ? '—' : String(raw);
    if (!totals.has(key)) {
      totals.set(key, 0);
      order.push(key);
    }
    const value = row.values[valueColumn];
    if (typeof value === 'number' && Number.isFinite(value)) {
      totals.set(key, totals.get(key)! + value);
    }
  }
  const named = order.filter((label) => label !== '—');
  const keys = new Map(named.map((label) => [label, calendarKey(label)]));
  const ordered =
    categoryType === 'date' || (categoryType === 'text' && named.length > 0 && named.every((label) => keys.get(label) !== null))
      ? // earliest first; a date column's value that is not a date follows the
        // dated ones in the order seen; Array.sort is stable, so ties keep it too
        [...named].sort((a, b) => {
          const ka = keys.get(a) ?? null;
          const kb = keys.get(b) ?? null;
          if (ka === null && kb === null) return 0;
          if (ka === null) return 1;
          if (kb === null) return -1;
          return ka - kb;
        })
      : named;
  const withEmpty = order.includes('—') ? [...ordered, '—'] : ordered;
  return withEmpty.map((label) => ({ label, value: Number(totals.get(label)!.toFixed(4)) }));
}

/** The straight line of best fit through the points, as (first, last) values.
 * Least squares over the point index — which is what a trend over an ordered
 * category column means. Null when there is nothing to fit. */
export function trendLine(values: number[]): { first: number; last: number } | null {
  const n = values.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let top = 0;
  let bottom = 0;
  for (let i = 0; i < n; i++) {
    top += (i - meanX) * (values[i]! - meanY);
    bottom += (i - meanX) ** 2;
  }
  if (bottom === 0) return null;
  const slope = top / bottom;
  return { first: meanY - slope * meanX, last: meanY + slope * (n - 1 - meanX) };
}

/** A number as a chart label reads it: at most two decimals, and no trailing
 * zeroes — `12.40` on an axis reads as a precision the return did not claim. */
function tick(value: number): string {
  return String(Number(value.toFixed(2)));
}

function ChartFrame(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="app-chart">
      <p className="page-sub">{props.label}</p>
      {props.children}
    </div>
  );
}

function NothingToDraw(props: { label: string }) {
  return (
    <ChartFrame label={props.label}>
      <p className="page-sub">Nothing to draw yet.</p>
    </ChartFrame>
  );
}

/** The three charts. One component, because they share the series and differ
 * only in the shapes drawn over it. */
export function ScreenChart(props: {
  block: Extract<AppScreenBlock, { kind: 'barChart' | 'lineChart' | 'pieChart' }>;
  rows: AppRowRecord[];
  /** the table the rows belong to — the grouping column's declared TYPE decides
   * whether its groups are put in calendar order */
  table: AppTableRecord;
}) {
  const { block } = props;
  const series = chartSeries(
    props.rows,
    block.categoryColumn,
    block.valueColumn,
    props.table.columns.find((column) => column.key === block.categoryColumn)?.type,
  );
  if (series.length === 0) return <NothingToDraw label={block.label} />;

  const W = 360;
  const H = 180;
  const PAD_L = 8;
  const PAD_B = 22;
  const top = 12;
  const values = series.map((slice) => slice.value);
  const highest = Math.max(...values, 0);
  const lowest = Math.min(...values, 0);
  const span = highest - lowest || 1;
  const y = (value: number) => top + (H - PAD_B - top) * (1 - (value - lowest) / span);

  if (block.kind === 'pieChart') {
    const total = values.reduce((sum, value) => sum + Math.max(value, 0), 0);
    if (total <= 0) return <NothingToDraw label={block.label} />;
    const cx = 90;
    const cy = 90;
    const r = 74;
    let angle = -Math.PI / 2;
    const wedges = series.map((slice, index) => {
      const sweep = (Math.max(slice.value, 0) / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += sweep;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const large = sweep > Math.PI ? 1 : 0;
      // a single category is a whole circle, and an arc from a point to itself
      // draws nothing — so it is drawn as a circle instead
      const whole = series.length === 1 || sweep >= Math.PI * 2 - 1e-9;
      return { slice, index, x1, y1, x2, y2, large, whole };
    });
    return (
      <ChartFrame label={block.label}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={block.label}>
          <title>{block.label}</title>
          {wedges.map((wedge) =>
            wedge.whole ? (
              <circle key={wedge.slice.label} cx={cx} cy={cy} r={r} fill={CHART_INK[0]} />
            ) : (
              <path
                key={wedge.slice.label}
                d={`M ${cx} ${cy} L ${wedge.x1.toFixed(2)} ${wedge.y1.toFixed(2)} A ${r} ${r} 0 ${wedge.large} 1 ${wedge.x2.toFixed(2)} ${wedge.y2.toFixed(2)} Z`}
                fill={CHART_INK[wedge.index % CHART_INK.length]}
                stroke="var(--panel)"
              />
            ),
          )}
          {series.map((slice, index) => (
            <g key={slice.label}>
              <rect
                x={190}
                y={18 + index * 18}
                width={10}
                height={10}
                fill={CHART_INK[index % CHART_INK.length]}
              />
              <text x={206} y={27 + index * 18} fontSize="11" fill="var(--ink-soft)">
                {`${slice.label} — ${tick(slice.value)}`}
              </text>
            </g>
          ))}
        </svg>
      </ChartFrame>
    );
  }

  const step = (W - PAD_L * 2) / Math.max(series.length, 1);

  if (block.kind === 'barChart') {
    const base = y(Math.max(lowest, 0) === 0 && lowest < 0 ? 0 : lowest);
    return (
      <ChartFrame label={block.label}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={block.label}>
          <title>{block.label}</title>
          <line x1={PAD_L} y1={base} x2={W - PAD_L} y2={base} stroke="var(--hairline)" />
          {series.map((slice, index) => {
            const height = Math.abs(base - y(slice.value));
            return (
              <g key={slice.label}>
                <rect
                  x={PAD_L + index * step + step * 0.2}
                  y={Math.min(base, y(slice.value))}
                  width={step * 0.6}
                  height={Math.max(height, 1)}
                  fill={CHART_INK[0]}
                />
                <text
                  x={PAD_L + index * step + step / 2}
                  y={H - 8}
                  fontSize="10"
                  textAnchor="middle"
                  fill="var(--muted)"
                >
                  {slice.label}
                </text>
                <text
                  x={PAD_L + index * step + step / 2}
                  y={Math.min(base, y(slice.value)) - 3}
                  fontSize="10"
                  textAnchor="middle"
                  fill="var(--ink-soft)"
                >
                  {tick(slice.value)}
                </text>
              </g>
            );
          })}
        </svg>
      </ChartFrame>
    );
  }

  const points = series
    .map((slice, index) => `${(PAD_L + index * step + step / 2).toFixed(2)},${y(slice.value).toFixed(2)}`)
    .join(' ');
  const trend = block.showTrend ? trendLine(values) : null;
  return (
    <ChartFrame label={block.label}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={block.label}>
        <title>{block.label}</title>
        <line x1={PAD_L} y1={y(Math.min(lowest, 0))} x2={W - PAD_L} y2={y(Math.min(lowest, 0))} stroke="var(--hairline)" />
        <polyline points={points} fill="none" stroke={CHART_INK[0]} strokeWidth="2" />
        {trend !== null && (
          <line
            x1={PAD_L + step / 2}
            y1={y(trend.first)}
            x2={PAD_L + (series.length - 1) * step + step / 2}
            y2={y(trend.last)}
            stroke={CHART_INK[1]}
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        )}
        {series.map((slice, index) => (
          <g key={slice.label}>
            <circle
              cx={PAD_L + index * step + step / 2}
              cy={y(slice.value)}
              r={3}
              fill={CHART_INK[0]}
            />
            <text
              x={PAD_L + index * step + step / 2}
              y={H - 8}
              fontSize="10"
              textAnchor="middle"
              fill="var(--muted)"
            >
              {slice.label}
            </text>
          </g>
        ))}
      </svg>
      {trend !== null && (
        <p className="page-sub">
          The dashed line is the straight-line trend through these points, drawn by Infora from the
          rows above — not a forecast, and not the model's opinion.
        </p>
      )}
    </ChartFrame>
  );
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** The form part. It enters a row through the ordinary row route — the same one
 * the plain rows screen uses — so nothing about a generated screen is a second
 * way into the store. */
function ScreenForm(props: {
  block: Extract<AppScreenBlock, { kind: 'rowForm' }>;
  table: AppTableRecord;
  onEnter: (values: Record<string, unknown>) => void;
  pending: boolean;
  label: (key: string) => string;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const columns = props.block.columnKeys.map(
    (key) => props.table.columns.find((column) => column.key === key)!,
  );

  const enter = () => {
    const values: Record<string, unknown> = {};
    for (const column of columns) {
      const raw = (draft[column.key] ?? '').trim();
      if (raw === '') continue;
      values[column.key] =
        column.type === 'number'
          ? Number(raw)
          : column.type === 'boolean'
            ? raw.toLowerCase() === 'yes' || raw === 'true'
            : raw;
    }
    props.onEnter(values);
    setDraft({});
  };

  return (
    <div>
      {columns.map((column) => (
        <Field key={column.key} label={props.label(column.key)}>
          <TextInput
            value={draft[column.key] ?? ''}
            onChange={(next) => setDraft((prev) => ({ ...prev, [column.key]: next }))}
          />
        </Field>
      ))}
      <Button onClick={enter} disabled={props.pending}>
        {props.block.submitLabel}
      </Button>
    </div>
  );
}

/**
 * A whole published screen, opened by whoever the API offered it to.
 *
 * The interface list this comes from is narrowed SERVER-SIDE (`apps.ts`,
 * `openableInterfaces`): a screen this person may not open never reached the
 * browser, so there is no decision left for this component to make.
 */
export function GeneratedScreen(props: {
  source: string | null;
  table: AppTableRecord;
  appState: AppState;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<AppRowRecord[] | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const screen = useMemo(() => screenFor(props.source, props.table), [props.source, props.table]);

  const load = useCallback(() => {
    void api.appRows(props.table.id).then(
      (res) => setRows(res.items),
      // a failed read is not an empty table: drawing "nothing entered yet" off a
      // request that did not answer is a claim we cannot make
      () => setRows(null),
    );
  }, [props.table.id]);
  useEffect(load, [load]);

  const enter = async (values: Record<string, unknown>) => {
    setPending(true);
    setNotice(null);
    try {
      await api.enterAppRow(props.table.id, { values, submit: props.table.hasAcceptance });
      load();
      props.onChanged?.();
    } catch {
      setNotice('That could not be entered. Check the figures and try again.');
    } finally {
      setPending(false);
    }
  };

  if (screen === null) {
    return (
      <Card>
        <p className="page-sub">
          This screen has not been drawn yet, or it names a column the table no longer has. Its
          builder can redraw it in the app builder.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      {rows === null ? (
        <p className="page-sub">Loading…</p>
      ) : (
        screen.blocks.map((block, index) => (
          <ScreenBlock
            key={index}
            block={block}
            table={props.table}
            rows={rows}
            onEnter={(values) => void enter(values)}
            pending={pending || props.appState !== 'open'}
          />
        ))
      )}
      {notice !== null && <p className="page-sub">{notice}</p>}
    </Card>
  );
}
