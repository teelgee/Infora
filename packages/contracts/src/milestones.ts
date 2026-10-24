// T-481 — milestones on the plan row, and the coverage view (ADR-0008's
// addendum of 2026-10-24).
//
// *In plain terms: a planned document can carry dates by which it should reach
// a status code — "S3 by 30 November". The firm producing the document sets
// them; the client reads them on its schedule, beside a count of where every
// planned document stands. A date that has passed without the document getting
// there is overdue.*
//
// "Met" and "overdue" are **computed when read**, never stored and never set by
// a job: there is no clock (the T-473 pattern). The pure functions below are
// the one place those answers are decided, and the one place the spreadsheet's
// Milestones cell is read and written, so the plan read, the work queue, the
// import and the screens cannot say the same fact differently.
import { z } from 'zod';
import type { Id } from './shared';

/** A day, not an instant: a schedule is kept in days. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'not a real date');

export const milestoneInput = z.object({
  statusCode: z.string().trim().min(1).max(16),
  targetDate: isoDate,
});
export type MilestoneInput = z.infer<typeof milestoneInput>;

/** PUT /containers/:containerId/milestones — the whole set, replacing what was there. */
export const setMilestonesBody = z.object({ milestones: z.array(milestoneInput).max(30) });
export type SetMilestonesBody = z.infer<typeof setMilestonesBody>;

export type PlanMilestone = {
  statusCode: string;
  /** ISO day, `YYYY-MM-DD` */
  targetDate: string;
  /** the row has reached the code, or one listed after it — computed when read */
  met: boolean;
  /** the date has passed and the milestone is not met — computed when read */
  overdue: boolean;
};

/** Today's date in UTC, as the ISO day milestones are compared on. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The one place met and overdue are decided. `codes` is the project's
 * status-code list in the order a document progresses (the National Annex's
 * order), `current` the row's status code now. A milestone is met when the row
 * is at its code or one listed after it; a current code outside the list
 * meets nothing. A date equal to today is not yet overdue. A row whose
 * deliverable has been **accepted** has met every milestone whatever its
 * status-code field says (ADR-0008 addendum, ruling 3): acceptance is the end
 * the codes lead to, and the field is typed by hand.
 */
export function milestoneState(
  milestone: { statusCode: string; targetDate: string },
  current: string | null | undefined,
  codes: readonly string[],
  today: string,
  accepted = false,
): { met: boolean; overdue: boolean } {
  if (accepted) return { met: true, overdue: false };
  const at = current ? codes.indexOf(current) : -1;
  const target = codes.indexOf(milestone.statusCode);
  const met = at >= 0 && target >= 0 && at >= target;
  return { met, overdue: !met && milestone.targetDate < today };
}

/** The Milestones cell as the spreadsheet writes it: `S3 2026-11-30; A1 2027-01-15`. */
export function formatMilestoneCell(milestones: ReadonlyArray<{ statusCode: string; targetDate: string }>): string {
  return milestones.map((m) => `${m.statusCode} ${m.targetDate}`).join('; ');
}

/**
 * Reads a Milestones cell. An empty cell is no milestones. Anything else must
 * be `CODE YYYY-MM-DD` entries separated by `;`, each code in the project's
 * list and appearing once — and a failure says in words which entry and why,
 * so the import can name the row and the cell.
 */
export function parseMilestoneCell(
  cell: string,
  codes: readonly string[],
): { ok: true; milestones: MilestoneInput[] } | { ok: false; problem: string } {
  const text = cell.replace(/\u00a0/g, ' ').trim();
  if (text === '') return { ok: true, milestones: [] };
  const out: MilestoneInput[] = [];
  const seen = new Set<string>();
  for (const part of text.split(';')) {
    const entry = part.trim();
    if (entry === '') continue;
    const bits = entry.split(/\s+/);
    if (bits.length !== 2) {
      return { ok: false, problem: `"${entry}" is not a status code and a date, like "S3 2026-11-30"` };
    }
    const [code, date] = bits as [string, string];
    if (!isoDate.safeParse(date).success) {
      return { ok: false, problem: `"${date}" is not a date written as YYYY-MM-DD (in "${entry}")` };
    }
    if (!codes.includes(code)) {
      return { ok: false, problem: `"${code}" is not one of the project's status codes (in "${entry}")` };
    }
    if (seen.has(code)) return { ok: false, problem: `${code} appears twice` };
    seen.add(code);
    out.push({ statusCode: code, targetDate: date });
  }
  return { ok: true, milestones: out };
}

// ── The coverage view ───────────────────────────────────────────────────────

/** Where a planned document stands, furthest stage that applies. */
export const COVERAGE_STAGES = [
  'planned',
  'bound',
  'frozen',
  'qa_accepted',
  'promoted',
  'in_review',
  'accepted',
] as const;
export type CoverageStage = (typeof COVERAGE_STAGES)[number];
export const coverageStage = z.enum(COVERAGE_STAGES);

/** The words a screen shows for each stage. */
export const COVERAGE_STAGE_LABEL: Record<CoverageStage, string> = {
  planned: 'No draft bound yet',
  bound: 'Draft bound',
  frozen: 'Frozen for internal review',
  qa_accepted: 'Internal review accepted',
  promoted: 'Promoted',
  in_review: 'In review',
  accepted: 'Accepted',
};

export type CoverageRow = { containerId: Id; stage: CoverageStage; overdueMilestones: number };

/**
 * GET /projects/:projectId/plan/coverage — the plan read, counted. Only the
 * live deliverable rows this person's plan read shows. `frozen` and
 * `qa_accepted` appear only on the reader's own organisation's rows: on
 * another organisation's row the producer's internal checks fold into `bound`
 * (ADR-0008's addendum, ruling 4; ADR-0032).
 */
export type GetPlanCoverageResponse = {
  total: number;
  counts: Record<CoverageStage, number>;
  /** milestones overdue across the rows counted */
  overdueMilestones: number;
  /** rows carrying at least one overdue milestone */
  overdueRows: number;
  rows: CoverageRow[];
};

/** The one-line summary the schedule opens with. */
export function coverageSummary(r: Pick<GetPlanCoverageResponse, 'total' | 'counts' | 'overdueMilestones'>): string {
  if (r.total === 0) return 'No planned documents yet';
  const c = r.counts;
  const internal = c.frozen + c.qa_accepted;
  const parts: string[] = [];
  if (c.planned) parts.push(`${c.planned} with no draft bound`);
  if (c.bound + internal) parts.push(`${c.bound + internal} ${c.bound + internal === 1 ? 'draft' : 'drafts'} bound`);
  if (c.promoted) parts.push(`${c.promoted} promoted`);
  if (c.in_review) parts.push(`${c.in_review} in review`);
  if (c.accepted) parts.push(`${c.accepted} accepted`);
  const head = `${r.total} planned ${r.total === 1 ? 'document' : 'documents'}${parts.length ? `: ${parts.join(', ')}` : ''}`;
  return r.overdueMilestones > 0
    ? `${head} · ${r.overdueMilestones} ${r.overdueMilestones === 1 ? 'milestone' : 'milestones'} overdue`
    : head;
}
