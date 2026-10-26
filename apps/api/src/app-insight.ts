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
import type { AppColumn, AppRowRecord } from '@infora/contracts';
import type { Router } from '@infora/model';

/** Long enough for two real sentences, short enough to refuse an essay. */
const MAX_INSIGHT = 600;

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

export type TableFigures = {
  name: string;
  rows: number;
  /** how many rows each organisation entered, among the ones this person read */
  byOrganisation: Array<{ organisationName: string; rows: number }>;
  /** where the table has an acceptance step, how the rows stand */
  byState: Array<{ state: string; rows: number }>;
  columns: ColumnFigures[];
};

/** Two decimal places, and integers left alone — a run that reports `20.00`
 * tonnes where the sum is 20 reads like a machine rather than a record. */
function tidy(value: number): number {
  return Number.isInteger(value) ? value : Number(value.toFixed(2));
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
  return {
    name: table.name,
    rows: table.rows.length,
    byOrganisation: tally(table.rows.map((row) => row.organisationName)).map(
      ([organisationName, rows]) => ({ organisationName, rows }),
    ),
    byState: table.hasAcceptance
      ? tally(table.rows.map((row) => row.state ?? 'none')).map(([state, rows]) => ({ state, rows }))
      : [],
    columns,
  };
}

/** The figures as the lines the model is shown. Written out here rather than as
 * JSON because the model is being asked for a sentence about them, and a
 * sentence about a JSON document reads like one. */
export function figuresAsText(figures: TableFigures[]): string {
  if (figures.length === 0) return 'There are no rows you can read in this app.';
  return figures
    .map((table) => {
      const lines = [`Table “${table.name}” — ${table.rows} current row(s) readable.`];
      for (const entry of table.byOrganisation) {
        lines.push(`  entered by ${entry.organisationName}: ${entry.rows} row(s)`);
      }
      for (const entry of table.byState) {
        lines.push(`  ${entry.state}: ${entry.rows} row(s)`);
      }
      for (const column of table.columns) {
        lines.push(
          `  ${column.label} — total ${column.total}, average ${column.mean}, lowest ${column.lowest}, highest ${column.highest}, across ${column.count} row(s)`,
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
  'You write ONE short paragraph — two sentences at most — about figures that have already been calculated for you, inside Infora, a platform engineering consultancies use on infrastructure projects.',
  'The figures below were computed by the platform from the rows the person running this app is allowed to read. They are final.',
  'Rules, and they are the whole job:',
  '- Use ONLY the figures you are given. Do not calculate a new one, do not estimate, and do not round differently.',
  '- If a figure you would want is not there, say what is missing rather than supplying it.',
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
    maxTokens: 400,
  });
  const text = result.text.trim();
  // an empty answer is NOT written up as an insight: a row saying nothing, kept
  // as a record with a date and a rows-covered count, would look like a finding
  // that there was nothing to find
  return text === '' ? null : text.slice(0, MAX_INSIGHT);
}
