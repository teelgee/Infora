// T-371 (ADR-0005 addendum, 2026-08-22) — the review period's arithmetic, in
// one place because two round-creation paths use it (project promotion and the
// sandbox-scope QA freeze) and a second copy would drift.
//
// WORKING DAYS ARE MONDAY TO FRIDAY, and that is the whole calendar. No holiday
// calendar is modelled anywhere in the system, and a per-jurisdiction one is a
// separate job rather than an implementation guess — a scheme that runs across
// England, Scotland and a Dutch supplier does not share a bank-holiday list, and
// picking one here would silently pick a jurisdiction too.
//
// The result is a GUIDE (ADR-0005): it chases the review group and marks the
// round overdue once passed; it never closes a round or locks commenting, which
// stays the lead reviewer's human act.

/** The default when a project row predates the column — the same ten the
 * migration defaults to, so the two can never disagree. */
export const DEFAULT_REVIEW_PERIOD_DAYS = 10;

/**
 * `days` working days after `from`, at the same time of day.
 *
 * Counting starts the day AFTER `from`: a round submitted on a Monday with a
 * one-day period targets Tuesday, not the Monday it arrived. A period that
 * lands on a weekend is carried to the next weekday by construction, because
 * only weekdays are ever counted.
 */
export function addWorkingDays(from: Date, days: number): Date {
  const target = new Date(from.getTime());
  let remaining = Math.max(1, Math.trunc(days));
  while (remaining > 0) {
    target.setUTCDate(target.getUTCDate() + 1);
    const weekday = target.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return target;
}
