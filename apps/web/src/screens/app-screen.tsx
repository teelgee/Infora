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
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AppColumn,
  AppRowRecord,
  AppScreen,
  AppScreenBlock,
  AppState,
  AppTableRecord,
  DecideAppRowBody,
} from '@infora/contracts';
import {
  calendarKey,
  isCountedAppRow,
  isCurrentAppRow,
  notYetAcceptedCount,
  notYetAcceptedLine,
  parseAppScreen,
  rowMonth,
  rowStateLabel,
} from '@infora/contracts';
import { Badge, Button, Card, Field, SectionLabel, Table, TextInput } from '@infora/ui';
import { api } from '../api';
import { inputTypeFor } from './shared';

export { calendarKey };

export { rowStateLabel };

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

/**
 * T-489 — **what a figure counts** (ADR-0056's fifth addendum, ruling 4). The
 * `total`, `count` and chart blocks add up COUNTED rows: current, and not
 * rejected (`isCountedAppRow`, the contracts' one predicate, also used by the
 * analysis run). A return still waiting for the client's decision counts, and a
 * plain line under the figure says how many (`notYetAcceptedLine`). The row
 * table below still lists every row it did, rejected ones with their state.
 */
function NotYetAccepted(props: { rows: AppRowRecord[] }) {
  const line = notYetAcceptedLine(notYetAcceptedCount(props.rows));
  return line === null ? null : <p className="field-hint">{line}</p>;
}

/**
 * T-489 — how a chart is grouped, in the words the builder's panel shows:
 * "by organisation" for a chart grouped by the entering organisation (ADR-0056's
 * fifth addendum, ruling 1), otherwise "by <the column's label>".
 */
export function chartGroupingWords(
  block: Extract<AppScreenBlock, { kind: 'barChart' | 'lineChart' | 'pieChart' }>,
  table: AppTableRecord,
): string {
  if (block.categoryColumn === undefined) return 'by organisation';
  return `by ${table.columns.find((column) => column.key === block.categoryColumn)?.label ?? block.categoryColumn}`;
}

/** One block, drawn. Every branch renders text as text. */
export function ScreenBlock(props: {
  block: AppScreenBlock;
  table: AppTableRecord;
  rows: AppRowRecord[];
  onEnter: (values: Record<string, unknown>) => void;
  pending: boolean;
  /** T-489 — records the client's decision on a row; the row table offers
   * Accept and Reject only on a row the server flagged `mayDecide`, and only
   * when this is given */
  onDecide?: (row: AppRowRecord, body: DecideAppRowBody) => Promise<void>;
}) {
  const { block, table, rows } = props;
  const label = (key: string) => table.columns.find((column) => column.key === key)?.label ?? key;
  const counted = rows.filter(isCountedAppRow);

  if (block.kind === 'heading') return <SectionLabel>{block.text}</SectionLabel>;
  if (block.kind === 'paragraph') return <p className="page-sub">{block.text}</p>;

  if (block.kind === 'count') {
    return (
      <>
        <p className="page-sub">
          {block.label}: <strong>{counted.length}</strong>
        </p>
        <NotYetAccepted rows={counted} />
      </>
    );
  }

  if (block.kind === 'total') {
    // the sum of what THIS viewer received — never a figure computed elsewhere
    // and handed down, which would be a number about rows they cannot read
    const total = counted.reduce((sum, row) => {
      const value = row.values[block.columnKey];
      return typeof value === 'number' ? sum + value : sum;
    }, 0);
    return (
      <>
        <p className="page-sub">
          {block.label}: <strong>{formatFigure(total, isMoneyLabel(label(block.columnKey)))}</strong>
        </p>
        <NotYetAccepted rows={counted} />
      </>
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
    return <ScreenChart block={block} rows={counted} table={table} />;
  }

  return (
    <ScreenRowTable block={block} rows={rows} label={label} columns={table.columns} {...(props.onDecide && { onDecide: props.onDecide })} />
  );
}

/**
 * T-489 — what a row is called in the words of the decision buttons: "return
 * from Redgate Ecology, October 2026". The month is read from the row's own
 * values with the same reader the charts order by (`calendarMonth`); a row with
 * no readable month is "row from Redgate Ecology".
 */
export function decisionSubject(row: AppRowRecord, columns: readonly AppColumn[]): string {
  // the same function the home page's "your … return was rejected" reads
  const month = rowMonth(columns, row.values);
  return month !== null ? `return from ${row.organisationName}, ${month.label}` : `row from ${row.organisationName}`;
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
  /** the table's declared columns, so a row's month is read from its date and
   * text columns exactly as the home page's rejection sentence reads it */
  columns?: readonly AppColumn[];
  showEarlier?: boolean;
  /** T-489 — the client's Accept or Reject on a row (ADR-0056's fifth addendum,
   * ruling 2). Offered ONLY on a row the server flagged `mayDecide`, so the
   * people the opened table already offers the decision to are the only ones who
   * see it here; this screen decides nothing for itself. */
  onDecide?: (row: AppRowRecord, body: DecideAppRowBody) => Promise<void>;
  /** the row whose rejection reason box is open at the start — like
   * `showEarlier`, it exists so the open state can be drawn, and tested, without
   * a browser; the block itself never passes it */
  startRejecting?: string;
}) {
  const { block } = props;
  const [revealed, setRevealed] = useState(props.showEarlier ?? false);
  // T-489 — the row whose rejection is being worded, and what has been typed
  const [rejecting, setRejecting] = useState<string | null>(props.startRejecting ?? null);
  const [reason, setReason] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const current = props.rows.filter(isCurrentAppRow);
  const earlier = props.rows.filter((row) => !isCurrentAppRow(row));
  const shown = revealed ? [...current, ...earlier] : current;
  const decidable = props.onDecide !== undefined && shown.some((row) => row.mayDecide);
  const width =
    block.columnKeys.length + (block.showOrganisation ? 1 : 0) + (block.showState ? 1 : 0) + (decidable ? 1 : 0);

  const decide = async (row: AppRowRecord, body: DecideAppRowBody) => {
    if (props.onDecide === undefined) return;
    setDeciding(true);
    setDecisionNotice(null);
    try {
      await props.onDecide(row, body);
      setRejecting(null);
      setReason('');
    } catch {
      setDecisionNotice(
        body.decision === 'accept' ? 'That could not be accepted.' : 'That could not be rejected.',
      );
    } finally {
      setDeciding(false);
    }
  };

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
              {decidable && <th>Decision</th>}
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
                const what = decisionSubject(row, props.columns ?? []);
                return (
                  <Fragment key={row.id}>
                    <tr style={isEarlier ? { opacity: 0.55 } : undefined} data-earlier={isEarlier ? 'true' : undefined}>
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
                      {decidable && (
                        <td>
                          {props.onDecide !== undefined && row.mayDecide && (
                            <div className="shelf-head" style={{ gap: 6 }}>
                              <Button
                                size="sm"
                                disabled={deciding}
                                aria-label={`Accept the ${what}`}
                                onClick={() => void decide(row, { decision: 'accept' })}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="quiet"
                                disabled={deciding}
                                aria-label={`Reject the ${what}`}
                                onClick={() => {
                                  setRejecting(row.id);
                                  setReason('');
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                    {rejecting === row.id && row.mayDecide && (
                      <tr>
                        <td colSpan={width}>
                          <Field
                            label={`Why is the ${what} being rejected?`}
                            hint="The organisation that submitted it reads this on the row. A rejection has to say why."
                          >
                            <TextInput value={reason} onChange={setReason} />
                          </Field>
                          <div className="shelf-head" style={{ gap: 6 }}>
                            <Button
                              size="sm"
                              disabled={deciding || reason.trim() === ''}
                              aria-label={`Confirm the rejection of the ${what}`}
                              onClick={() => void decide(row, { decision: 'reject', reason: reason.trim() })}
                            >
                              Reject
                            </Button>
                            <Button size="sm" variant="quiet" onClick={() => setRejecting(null)}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </Table>
      {decisionNotice !== null && <p className="page-sub">{decisionNotice}</p>}
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
//
// T-488 — eight inks (`--chart-1` … `--chart-8`, both palettes), so a pie of up
// to eight slices never repeats a colour; past that the smallest slices are
// grouped as "Other" (`pieSlices`) rather than the list wrapping round.
export const CHART_INK = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--chart-${n})`);

/** Does a column's label say its figures are money in pounds? Decided from the
 * label alone — the screen grammar has no field for a unit, and gains none. */
export function isMoneyLabel(label: string): boolean {
  return /£|gbp|pounds/i.test(label);
}

const FIGURE_FORMAT = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

/** A figure as a person reads it: thousands separators, at most two decimals,
 * no trailing zeroes, and a leading £ on money ("£12,400", "-£1,200.50"). */
export function formatFigure(value: number, money = false): string {
  const digits = FIGURE_FORMAT.format(Math.abs(value));
  const negative = value < 0 && digits !== '0';
  return `${negative ? '-' : ''}${money ? '£' : ''}${digits}`;
}

/**
 * Show every k-th category label, k computed from the room each one has: the
 * widest label's estimated width (a 10px label is about 6px a character)
 * against the width of one slot. 1 means every label fits.
 */
export function labelStride(labels: string[], slotWidth: number, fontSize = 10): number {
  const widest = labels.reduce((most, label) => Math.max(most, label.length), 0) * fontSize * 0.6 + 6;
  return Math.max(1, Math.ceil(widest / Math.max(slotWidth, 1)));
}

/** Where to centre a label on its slot without letting it run off either edge of
 * the drawing: a label near the first or last slot is nudged inwards by the
 * amount it would have overhung (about 6px a character at 10px). */
export function labelCentre(centre: number, label: string, left: number, right: number, fontSize = 10): number {
  const half = (label.length * fontSize * 0.6) / 2;
  return Math.min(Math.max(centre, left + half), right - half);
}

/** Three to five round numbers within [low, high] for a value scale ("0, 5,000,
 * 10,000, 15,000"), or just the one when the range is flat. */
export function valueTicks(low: number, high: number): number[] {
  if (!(high > low)) return [low];
  const span = high - low;
  for (const intervals of [4, 3, 5]) {
    const magnitude = 10 ** Math.floor(Math.log10(span / intervals));
    for (const factor of [1, 2, 2.5, 5, 10]) {
      const step = factor * magnitude;
      const ticks: number[] = [];
      for (let v = Math.ceil(low / step - 1e-9) * step; v <= high + step * 1e-9; v += step) {
        ticks.push(Number(v.toFixed(10)));
      }
      if (ticks.length >= 3 && ticks.length <= 5) return ticks;
    }
  }
  return [low, high];
}

/** The slices a pie draws: at most `max` of them. Past that, the smallest are
 * added together as one "Other" slice, and the larger ones keep their order. */
export function pieSlices(series: ChartSlice[], max = CHART_INK.length): ChartSlice[] {
  if (series.length <= max) return series;
  const keep = new Set(
    series
      .map((slice, index) => ({ index, value: slice.value }))
      .sort((a, b) => b.value - a.value || a.index - b.index)
      .slice(0, max - 1)
      .map((entry) => entry.index),
  );
  const rest = series.filter((_, index) => !keep.has(index));
  return [
    ...series.filter((_, index) => keep.has(index)),
    { label: 'Other', value: Number(rest.reduce((sum, slice) => sum + slice.value, 0).toFixed(4)) },
  ];
}

/** One bar, point or slice: a category, and the sum of the value column over
 * the rows in it. In calendar order when the category column is a date (or text
 * that is all dates or months), otherwise first-seen, and the group for a row
 * that left the category empty ("—") last. */
export type ChartSlice = { label: string; value: number };

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

/**
 * T-489 — **a chart grouped by the entering organisation** (ADR-0056's fifth
 * addendum, ruling 1): one group per organisation, the value column added up
 * over that organisation's rows, in alphabetical order so the chart does not
 * shuffle as rows arrive.
 *
 * *In plain terms: "electricity by contractor".* The organisation's name is on
 * every row this viewer received (`organisationName`) — nothing new is fetched,
 * and a viewer only ever sees the organisations whose rows they may read — so
 * the chart shows nothing the row table's Organisation column does not. The
 * rows handed in are already the COUNTED ones. A row whose value is not a
 * number contributes nothing, as in `chartSeries`.
 */
export function organisationSeries(rows: AppRowRecord[], valueColumn: string): ChartSlice[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const value = row.values[valueColumn];
    totals.set(
      row.organisationName,
      (totals.get(row.organisationName) ?? 0) + (typeof value === 'number' && Number.isFinite(value) ? value : 0),
    );
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en-GB'))
    .map(([label, value]) => ({ label, value: Number(value.toFixed(4)) }));
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

function ChartFrame(props: { label: string; notYetAccepted?: number; children: React.ReactNode }) {
  const line = notYetAcceptedLine(props.notYetAccepted ?? 0);
  return (
    <div className="app-chart">
      <p className="page-sub">{props.label}</p>
      {props.children}
      {line !== null && <p className="field-hint">{line}</p>}
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
  // T-489 — grouped by the entering organisation, or by a declared column
  const series =
    block.categoryColumn === undefined
      ? organisationSeries(props.rows, block.valueColumn)
      : chartSeries(
          props.rows,
          block.categoryColumn,
          block.valueColumn,
          props.table.columns.find((column) => column.key === block.categoryColumn)?.type,
        );
  if (series.length === 0) return <NothingToDraw label={block.label} />;
  // the rows handed in are the counted ones; some may still await a decision
  const notYetAccepted = notYetAcceptedCount(props.rows);

  const W = 360;
  const H = 180;
  const PAD_B = 22;
  const top = 12;
  // T-488 — figures print with thousands separators, and with a £ when the value
  // column's own label says money
  const money = isMoneyLabel(props.table.columns.find((column) => column.key === block.valueColumn)?.label ?? '');
  const fmt = (value: number) => formatFigure(value, money);
  const values = series.map((slice) => slice.value);
  const highest = Math.max(...values, 0);
  const lowest = Math.min(...values, 0);
  const span = highest - lowest || 1;
  const y = (value: number) => top + (H - PAD_B - top) * (1 - (value - lowest) / span);

  if (block.kind === 'pieChart') {
    const slices = pieSlices(series);
    const total = slices.reduce((sum, slice) => sum + Math.max(slice.value, 0), 0);
    if (total <= 0) return <NothingToDraw label={block.label} />;
    const cx = 90;
    const cy = 90;
    const r = 74;
    let angle = -Math.PI / 2;
    const wedges = slices.map((slice, index) => {
      const sweep = (Math.max(slice.value, 0) / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += sweep;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const large = sweep > Math.PI ? 1 : 0;
      // a single category is a whole circle, and an arc from a point to itself
      // draws nothing — so it is drawn as a circle instead
      const whole = slices.length === 1 || sweep >= Math.PI * 2 - 1e-9;
      return { slice, index, x1, y1, x2, y2, large, whole };
    });
    return (
      <ChartFrame label={block.label} notYetAccepted={notYetAccepted}>
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
          {slices.map((slice, index) => (
            <g key={slice.label}>
              <rect
                x={190}
                y={18 + index * 18}
                width={10}
                height={10}
                fill={CHART_INK[index % CHART_INK.length]}
              />
              <text x={206} y={27 + index * 18} fontSize="11" fill="var(--ink-soft)">
                {`${slice.label.length > 22 ? `${slice.label.slice(0, 21)}…` : slice.label} — ${fmt(slice.value)}`}
              </text>
            </g>
          ))}
        </svg>
      </ChartFrame>
    );
  }

  // the line chart carries a value scale down its left edge, so it needs room
  // for the widest tick label; the bar chart prints its values on the bars
  const ticks = block.kind === 'lineChart' ? valueTicks(lowest, highest) : [];
  const PAD_L =
    block.kind === 'lineChart'
      ? 8 + Math.max(...ticks.map((value) => fmt(value).length)) * 6
      : 8;
  const step = (W - PAD_L - 8) / Math.max(series.length, 1);
  // every k-th category label, so neighbours never overprint
  const labelEvery = labelStride(
    series.map((slice) => slice.label),
    step,
  );

  if (block.kind === 'barChart') {
    const base = y(Math.max(lowest, 0) === 0 && lowest < 0 ? 0 : lowest);
    const valueEvery = labelStride(
      series.map((slice) => fmt(slice.value)),
      step,
    );
    return (
      <ChartFrame label={block.label} notYetAccepted={notYetAccepted}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={block.label}>
          <title>{block.label}</title>
          <line x1={PAD_L} y1={base} x2={W - 8} y2={base} stroke="var(--hairline)" />
          {series.map((slice, index) => {
            const height = Math.abs(base - y(slice.value));
            return (
              <g key={slice.label}>
                <title>{`${slice.label}: ${fmt(slice.value)}`}</title>
                <rect
                  x={PAD_L + index * step + step * 0.2}
                  y={Math.min(base, y(slice.value))}
                  width={step * 0.6}
                  height={Math.max(height, 1)}
                  fill={CHART_INK[0]}
                />
                {index % labelEvery === 0 && (
                  <text
                    x={labelCentre(PAD_L + index * step + step / 2, slice.label, 0, W)}
                    y={H - 8}
                    fontSize="10"
                    textAnchor="middle"
                    fill="var(--muted)"
                  >
                    {slice.label}
                  </text>
                )}
                {index % valueEvery === 0 && (
                  <text
                    x={labelCentre(PAD_L + index * step + step / 2, fmt(slice.value), 0, W)}
                    y={Math.min(base, y(slice.value)) - 3}
                    fontSize="10"
                    textAnchor="middle"
                    fill="var(--ink-soft)"
                  >
                    {fmt(slice.value)}
                  </text>
                )}
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
    <ChartFrame label={block.label} notYetAccepted={notYetAccepted}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={block.label}>
        <title>{block.label}</title>
        {/* the value scale: light gridlines, each with its figure */}
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD_L}
              y1={y(value)}
              x2={W - 8}
              y2={y(value)}
              stroke={value === 0 ? 'var(--muted)' : 'var(--hairline)'}
              strokeWidth={1}
            />
            <text x={PAD_L - 4} y={y(value) + 3} fontSize="10" textAnchor="end" fill="var(--muted)">
              {fmt(value)}
            </text>
          </g>
        ))}
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
            >
              <title>{`${slice.label}: ${fmt(slice.value)}`}</title>
            </circle>
            {index % labelEvery === 0 && (
              <text
                x={labelCentre(PAD_L + index * step + step / 2, slice.label, 0, W)}
                y={H - 8}
                fontSize="10"
                textAnchor="middle"
                fill="var(--muted)"
              >
                {slice.label}
              </text>
            )}
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
            type={inputTypeFor(column.type)}
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

  // T-489 — the client's decision, through the existing decide route, then the
  // rows are read again so the figures beside it move at once
  const decide = async (row: AppRowRecord, body: DecideAppRowBody) => {
    await api.decideAppRow(row.id, body);
    load();
    props.onChanged?.();
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
            onDecide={decide}
          />
        ))
      )}
      {notice !== null && <p className="page-sub">{notice}</p>}
    </Card>
  );
}
