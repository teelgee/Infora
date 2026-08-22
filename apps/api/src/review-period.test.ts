// T-371 — the review period's arithmetic. Pure, so no database: the working-day
// rule is the one part of the period a reader will want to check by hand.
import { describe, expect, it } from 'vitest';
import { addWorkingDays, DEFAULT_REVIEW_PERIOD_DAYS } from './review-period';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('addWorkingDays', () => {
  it('counts from the day after, never the day itself', () => {
    // Monday 2026-08-17 + 1 working day = Tuesday
    expect(iso(addWorkingDays(new Date('2026-08-17T09:00:00Z'), 1))).toBe('2026-08-18');
  });

  it('steps over the weekend', () => {
    // Friday 2026-08-21 + 1 = Monday 2026-08-24
    expect(iso(addWorkingDays(new Date('2026-08-21T09:00:00Z'), 1))).toBe('2026-08-24');
  });

  it('lands the ten-day default two calendar weeks on', () => {
    // Wednesday 2026-08-19 + 10 working days = Wednesday 2026-09-02, which is
    // the date the approved promotion-window mockup shows
    expect(iso(addWorkingDays(new Date('2026-08-19T10:00:00Z'), DEFAULT_REVIEW_PERIOD_DAYS))).toBe(
      '2026-09-02',
    );
  });

  it('never targets a weekend', () => {
    for (let start = 0; start < 7; start += 1) {
      for (let days = 1; days <= 20; days += 1) {
        const from = new Date(Date.UTC(2026, 7, 17 + start, 9));
        const day = addWorkingDays(from, days).getUTCDay();
        expect(day).not.toBe(0);
        expect(day).not.toBe(6);
      }
    }
  });

  it('keeps the time of day, so the target is a moment not a bare date', () => {
    expect(addWorkingDays(new Date('2026-08-17T14:35:00Z'), 3).toISOString()).toBe(
      '2026-08-20T14:35:00.000Z',
    );
  });

  it('treats a zero or negative period as one working day rather than the past', () => {
    expect(iso(addWorkingDays(new Date('2026-08-17T09:00:00Z'), 0))).toBe('2026-08-18');
    expect(iso(addWorkingDays(new Date('2026-08-17T09:00:00Z'), -5))).toBe('2026-08-18');
  });
});
