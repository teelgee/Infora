// T-473 — currency on reference material (ADR-0011's addendum of 2026-10-24,
// ruling 4).
//
// *In plain terms: a standard the project relies on records who last confirmed
// it is still the right one to rely on, when, and when it should be checked
// again. A document nobody has confirmed keeps being read — and every citation
// of it says so. When the re-check date passes, the owner's work queue says
// that too.*
//
// "Overdue" is **computed when the document is read** (`recheck_due_at <=
// now`), never stored and never set by a job: there is no clock. The same
// answer therefore goes on every citation of the document at the moment it is
// looked at — and is never written onto the citation row, because the
// document's currency changes after the run that cited it.
import { z } from 'zod';
import type { Id } from './shared';

export type CurrencyState = 'confirmed' | 'unconfirmed' | 'overdue';

export type Currency = {
  state: CurrencyState;
  /** the person who last confirmed it, by name; null when nobody has */
  confirmedBy: string | null;
  confirmedAt: string | null;
  /** when the next check falls due; null when nobody has confirmed it */
  recheckDue: string | null;
};

/**
 * The one place the state is decided. `now` is a parameter so a test can move
 * the clock without sleeping; production passes the current time at the moment
 * of the read. A due date exactly equal to now counts as due.
 */
export function currencyOf(
  fact: { confirmedBy: string | null; confirmedAt: Date | null; recheckDue: Date | null },
  now: Date,
): Currency {
  if (fact.confirmedAt === null) {
    return { state: 'unconfirmed', confirmedBy: null, confirmedAt: null, recheckDue: null };
  }
  const overdue = fact.recheckDue !== null && fact.recheckDue.getTime() <= now.getTime();
  return {
    state: overdue ? 'overdue' : 'confirmed',
    confirmedBy: fact.confirmedBy,
    confirmedAt: fact.confirmedAt.toISOString(),
    recheckDue: fact.recheckDue?.toISOString() ?? null,
  };
}

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * The words every surface uses for a document that is not currently confirmed —
 * the source card, the library row, the document page — or null when there is
 * nothing to say. One function, so the sentence cannot differ between screens.
 */
export function currencyWords(currency: Currency | null | undefined): string | null {
  if (currency === null || currency === undefined) return null;
  if (currency.state === 'unconfirmed') {
    return 'Not confirmed current — nobody has checked this document is still the one to rely on';
  }
  if (currency.state === 'overdue') {
    const due = currency.recheckDue === null ? '' : ` since ${day(currency.recheckDue)}`;
    const by =
      currency.confirmedAt === null
        ? ''
        : ` — confirmed current${currency.confirmedBy === null ? '' : ` by ${currency.confirmedBy}`} on ${day(currency.confirmedAt)}`;
    return `Re-check overdue${due}${by}`;
  }
  return null;
}

/** The short title of the small mark on a citation chip, or null when it carries none. */
export function currencyMarkTitle(currency: Currency | null | undefined): string | null {
  if (currency === null || currency === undefined) return null;
  if (currency.state === 'unconfirmed') return 'Not confirmed current';
  if (currency.state === 'overdue') return 'Re-check overdue';
  return null;
}

// POST /containers/:containerId/confirm-current — the owner's super user says
// "this is still the one to rely on". Sets who, when, and the next due date
// (now plus the interval for the document's type). No body.
// GET  /containers/:containerId/currency — the same answer, plus the interval
// that the next confirmation will apply, for the document page's card.
// 404 on a deliverable (its currency is its acceptance) and on anything the
// reader cannot see.
export type GetContainerCurrencyResponse = {
  currency: Currency;
  /** months the next confirmation will run for (the type's interval, else the fallback) */
  intervalMonths: number;
};
export type ConfirmCurrentResponse = GetContainerCurrencyResponse;

// GET/PATCH /projects/:projectId/recheck-defaults — the intervals. PATCH is the
// owner's super user. A row with `termId: null` is the project-wide fallback.
export type RecheckDefault = {
  termId: Id | null;
  /** the document type's label, or "Any other document" for the fallback */
  label: string;
  intervalMonths: number;
};
export type GetRecheckDefaultsResponse = { defaults: RecheckDefault[] };
export const patchRecheckDefaultsBody = z.object({
  defaults: z
    .array(z.object({ termId: z.uuid().nullable(), intervalMonths: z.number().int().min(1).max(240) }))
    .min(1),
});
export type PatchRecheckDefaultsBody = z.infer<typeof patchRecheckDefaultsBody>;
