// T-443 — **what a run actually does**: the figures, computed in code, and the
// one sentence the model is asked for (ADR-0056 §3).
//
// *In plain terms: when somebody presses Run, Infora reads the rows that person
// is allowed to read, works out the numbers itself, and then asks the model to
// write one sentence about those numbers. The model never sees a row and never
// produces a figure. What comes back is kept as a row in the app's insight
// table.*
//
// 🔒 **THE NUMBERS ARE COMPUTED HERE AND THE MODEL WRITES ONLY THE SENTENCE.**
// This is the landscape's one trusted pattern (T-437) and ADR-0056 §3's rule.
// `figuresFor` is arithmetic over rows that have already been through
// `canReadAppRow`; `writeInsightSentence` is handed the RESULT of that
// arithmetic as text and nothing else. There is no path in this file by which a
// row's values reach a model, which is also why a land register's landowner
// names cannot leave through an insight: the model is shown counts, sums,
// averages and extremes, plus the column labels and the organisation names
// already on the rows the runner may read.
//
// 🔒 **THE RUN READS THROUGH THE ROWS PATH, NOT A QUERY OF ITS OWN.** The
// caller (`apps.ts`) reaches every table with `reachTable` and lists with
// `listRows` — the same two functions the rows screen and the export use. A
// second query here would be a second place the read predicate could be got
// wrong, which ADR-0056's research says every app-builder incident had in
// common. So "a run by a person who cannot see a shared table's rows covers
// only their own" is a consequence rather than a promise: this file is handed
// the rows that person received.
import { calendarMonth, notYetAcceptedCount } from '@infora/contracts';
import type { AppColumn, AppRowRecord } from '@infora/contracts';
import type { Router } from '@infora/model';

/** Long enough for a short paragraph — a few sentences about the whole, the
 * months and the organisations — and short enough to refuse an essay. */
const MAX_INSIGHT = 1500;

/** The model's budget for it; about four times `MAX_INSIGHT` in characters would
 * be generous, so a reply that still runs out is cut by `wholeSentences`, never
 * stored mid-word. */
const INSIGHT_MAX_TOKENS = 700;

/** One covered table, as the run received it. */
export type CoveredTable = {
  name: string;
  columns: AppColumn[];
  hasAcceptance: boolean;
  rows: AppRowRecord[];
};

/** The arithmetic for one number column, over the rows this person received. */
export type ColumnFigures = {
  label: string;
  count: number;
  total: number;
  mean: number;
  lowest: number;
  highest: number;
};

/** One number column's total over some of the rows — the same arithmetic as
 * `ColumnFigures.total`, for one month or one organisation. */
export type ColumnTotal = { label: string; total: number };

export type TableFigures = {
  name: string;
  rows: number;
  /** how many rows each organisation entered, among the ones this person read,
   * with each number column's total over that organisation's rows (T-488) */
  byOrganisation: Array<{ organisationName: string; rows: number; totals: ColumnTotal[] }>;
  /**
   * T-488 — the same figures per calendar month, earliest first, when the table
   * has a column that says which month a row is about: a `date` column, or a
   * `text` column whose every value reads as a date or a month (the reader the
   * charts order by — `calendarMonth`). Null when it has none.
   */
  byMonth: { columnLabel: string; months: Array<{ month: string; rows: number; totals: ColumnTotal[] }> } | null;
  /**
   * T-489 — how many of the counted rows are still awaiting the client's decision
   * (`draft` or `submitted`). They are in every figure, because they are the best
   * there is so far, and the run says so. Zero on a table with no acceptance step.
   */
  notYetAccepted: number;
  /** whether the table has an acceptance step — the note about rejected rows is
   * only true (and only said) where there is one */
  hasAcceptance: boolean;
  /** where the table has an acceptance step, how the rows stand */
  byState: Array<{ state: string; rows: number }>;
  columns: ColumnFigures[];
};

/** Two decimal places, and integers left alone — a run that reports `20.00`
 * tonnes where the sum is 20 reads like a machine rather than a record. */
function tidy(value: number): number {
  return Number.isInteger(value) ? value : Number(value.toFixed(2));
}

/** Each number column's total over just these rows; a column with no number in
 * them is left out, as in `figuresFor`. */
function totalsOver(columns: AppColumn[], rows: AppRowRecord[]): ColumnTotal[] {
  const out: ColumnTotal[] = [];
  for (const column of columns) {
    if (column.type !== 'number') continue;
    const values = rows
      .map((row) => row.values[column.key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) continue;
    out.push({ label: column.label, total: tidy(values.reduce((sum, value) => sum + value, 0)) });
  }
  return out;
}

/**
 * The column that says which month a row is about, if the table has one: the
 * first `date` column with at least one date in it, else the first `text` column
 * whose every non-empty value reads as a date or a month. Rows whose value does
 * not read are simply not in any month.
 */
function monthColumn(table: CoveredTable): AppColumn | null {
  for (const column of table.columns) {
    const values = table.rows.map((row) => row.values[column.key]).filter((v) => v !== undefined && v !== null && v !== '');
    const reads = values.map((value) => calendarMonth(String(value)));
    if (column.type === 'date' && reads.some((read) => read !== null)) return column;
    if (column.type === 'text' && values.length > 0 && reads.every((read) => read !== null)) return column;
  }
  return null;
}

function tally(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * The figures for one table — **every one of them arithmetic over the rows that
 * were handed in**, which are the rows the running person may read.
 *
 * A column with no numeric value in any readable row produces no figures at
 * all rather than a row of zeroes: zero and "nothing entered" are different
 * statements, and an insight built on the first when the second is true is the
 * kind of quiet misreport a dashboard is worst at.
 */
export function figuresFor(table: CoveredTable): TableFigures {
  const columns: ColumnFigures[] = [];
  for (const column of table.columns) {
    if (column.type !== 'number') continue;
    const values = table.rows
      .map((row) => row.values[column.key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) continue;
    const total = values.reduce((sum, value) => sum + value, 0);
    columns.push({
      label: column.label,
      count: values.length,
      total: tidy(total),
      mean: tidy(total / values.length),
      lowest: tidy(Math.min(...values)),
      highest: tidy(Math.max(...values)),
    });
  }
  const byMonthColumn = monthColumn(table);
  let byMonth: TableFigures['byMonth'] = null;
  if (byMonthColumn !== null) {
    const groups = new Map<number, { label: string; rows: AppRowRecord[] }>();
    for (const row of table.rows) {
      const read = calendarMonth(String(row.values[byMonthColumn.key] ?? ''));
      if (read === null) continue;
      const group = groups.get(read.sort) ?? { label: read.label, rows: [] };
      group.rows.push(row);
      groups.set(read.sort, group);
    }
    byMonth = {
      columnLabel: byMonthColumn.label,
      months: [...groups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, group]) => ({
          month: group.label,
          rows: group.rows.length,
          totals: totalsOver(table.columns, group.rows),
        })),
    };
  }
  return {
    name: table.name,
    rows: table.rows.length,
    byOrganisation: tally(table.rows.map((row) => row.organisationName)).map(
      ([organisationName, rows]) => ({
        organisationName,
        rows,
        totals: totalsOver(
          table.columns,
          table.rows.filter((row) => row.organisationName === organisationName),
        ),
      }),
    ),
    byMonth,
    notYetAccepted: notYetAcceptedCount(table.rows),
    hasAcceptance: table.hasAcceptance,
    byState: table.hasAcceptance
      ? tally(table.rows.map((row) => row.state ?? 'none')).map(([state, rows]) => ({ state, rows }))
      : [],
    columns,
  };
}

function totalsText(totals: ColumnTotal[]): string {
  return totals.length === 0 ? '' : ` — ${totals.map((t) => `${t.label} total ${t.total}`).join('; ')}`;
}

/** The figures as the lines the model is shown. Written out here rather than as
 * JSON because the model is being asked for a sentence about them, and a
 * sentence about a JSON document reads like one. */
export function figuresAsText(figures: TableFigures[]): string {
  if (figures.length === 0) return 'There are no rows you can read in this app.';
  return figures
    .map((table) => {
      const lines = [`Table “${table.name}” — ${table.rows} counted row(s) readable.`];
      // T-489 — what is NOT in the figures, and what is in them but not yet final
      // (ADR-0056's fifth addendum, ruling 4). Rejected and replaced rows never
      // count; the rows still waiting for the client do.
      if (table.hasAcceptance) {
        lines.push('  Rows the client rejected, and rows a later row replaced, are not counted anywhere below.');
      }
      if (table.notYetAccepted > 0) {
        lines.push(
          `  Includes ${table.notYetAccepted} not yet accepted — rows still waiting for the client's decision, counted in every figure below, which may change.`,
        );
      }
      // T-488 — per organisation and per month, beside the whole-column totals.
      // Both are sums over the same current rows this person may read.
      lines.push('  PER ORGANISATION (the organisation that entered the rows):');
      for (const entry of table.byOrganisation) {
        lines.push(`    ${entry.organisationName}: ${entry.rows} row(s)${totalsText(entry.totals)}`);
      }
      if (table.byMonth !== null) {
        lines.push(`  PER MONTH (by “${table.byMonth.columnLabel}”, earliest first):`);
        for (const entry of table.byMonth.months) {
          lines.push(`    ${entry.month}: ${entry.rows} row(s)${totalsText(entry.totals)}`);
        }
      }
      lines.push('  WHOLE TABLE:');
      for (const entry of table.byState) {
        lines.push(`    ${entry.state}: ${entry.rows} row(s)`);
      }
      for (const column of table.columns) {
        lines.push(
          `    ${column.label} — total ${column.total}, average ${column.mean}, lowest ${column.lowest}, highest ${column.highest}, across ${column.count} row(s)`,
        );
      }
      return lines.join('\n');
    })
    .join('\n');
}

/**
 * What the model is told. **It is asked for prose about arithmetic somebody
 * else did**, and told so in as many words — the figures are given, they are
 * final, and inventing one is the single thing it must not do.
 */
const INSIGHT_SYSTEM = [
  'You write ONE short paragraph — four sentences at most — about figures that have already been calculated for you, inside Infora, a platform engineering consultancies use on infrastructure projects.',
  'The figures below were computed by the platform from the rows the person running this app is allowed to read. They are final. Beside the totals for the whole table you are given the same figures PER MONTH (where the table says which month a row is about) and PER ORGANISATION: use them to say how the months compare and how the organisations compare, not only what the totals are.',
  'Rules, and they are the whole job:',
  '- Use ONLY the figures you are given. Do not calculate a new one, do not estimate, and do not round differently.',
  '- If a figure you would want is not there, say what is missing rather than supplying it.',
  '- If the figures say some rows are "not yet accepted", say so in plain words — for example "includes 3 not yet accepted" — because those figures are still waiting for the client and may change. Say nothing about rows the figures do not count.',
  '- Plain English for a reader who is not an engineer. No headings, no bullet points, no markdown, no JSON.',
  '- Never say who should do anything, and never say the analysis is complete or approved. You are describing a set of rows at a moment, not signing anything off.',
  '- You have not seen any row, any document or any person’s name beyond the organisation names in the figures, and you do not pretend to have.',
].join('\n');

/**
 * Ask for the sentence.
 *
 * **The builder's own analysis prompt is passed through as the builder wrote
 * it** — it is what step 6 exists to collect — but it is presented as *what
 * this firm asked the analysis to say*, not as instructions that outrank the
 * rules above. A prompt is the builder's request for emphasis; it is not a
 * lever on what data the run reached, because the run had already read
 * everything it was going to read before this function was called.
 */
export async function writeInsightSentence(
  router: Router,
  input: { appName: string; analysisPrompt: string | null; figures: TableFigures[] },
): Promise<string | null> {
  const asked =
    input.analysisPrompt === null || input.analysisPrompt.trim() === ''
      ? 'Nobody wrote a particular instruction for this analysis, so simply say what the figures show.'
      : `The person who built this app asked the analysis to say: ${input.analysisPrompt.trim()}`;
  const result = await router.chat('draft', {
    system: INSIGHT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [`The app is called: ${input.appName}`, '', figuresAsText(input.figures), '', asked].join(
          '\n',
        ),
      },
    ],
    maxTokens: INSIGHT_MAX_TOKENS,
  });
  const text = result.text.trim();
  // an empty answer is NOT written up as an insight: a row saying nothing, kept
  // as a record with a date and a rows-covered count, would look like a finding
  // that there was nothing to find
  // the model ran out of room when it was allowed exactly as many tokens as it used
  const ranOut = result.usage.tokensCompletion >= INSIGHT_MAX_TOKENS;
  return text === '' ? null : wholeSentences(text, MAX_INSIGHT, ranOut);
}

/**
 * T-488 (walk defect 9) — **text is never cut off mid-word or mid-sentence.**
 *
 * The analysis used to be sliced at a fixed length and could stop in the middle
 * of a word. Now a reply that fits and was finished by the model is kept as it
 * is; one that runs past `max`, or that the model ran out of room for
 * (`ranOut`: it used every token it was allowed), is trimmed back to the last
 * complete sentence. If there is no sentence end to trim back to, it is trimmed
 * to the last whole word and marked with “…”, so a reader can tell it was cut.
 */
export function wholeSentences(text: string, max: number, ranOut = false): string {
  const trimmed = text.trim();
  const fits = trimmed.length <= max;
  if (fits && !ranOut) return trimmed;
  // the character after the window must be a space for the window to end cleanly
  const window = fits ? trimmed : trimmed.slice(0, max);
  const cleanEnd = fits || /\s/.test(trimmed[max]!) || /\s$/.test(window);
  // a sentence end: . ! or ? (and any closing quote or bracket), then a space or
  // the end — so "3.5" and "Ltd." mid-number do not count
  const ends = [...window.matchAll(/[.!?]["'”’)\]]*(?=\s|$)/g)];
  const last = ends.at(-1);
  if (last !== undefined) {
    const stop = last.index + last[0].length;
    // the window's own end is a sentence end only when it is a clean end
    if (stop < window.length || cleanEnd) return window.slice(0, stop).trim();
    const earlier = ends.at(-2);
    if (earlier !== undefined) return window.slice(0, earlier.index + earlier[0].length).trim();
  }
  // no sentence to fall back on: whole words, marked
  // (a reply that stopped short with no full stop may have stopped mid-word, so
  // its last word is dropped; a cut that fell exactly between words keeps it)
  const words = !fits && cleanEnd ? window : window.replace(/\s+\S*$/, '');
  return `${words.replace(/[\s,;:–—-]+$/, '')}…`;
}
