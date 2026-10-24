// T-481 — met and overdue are decided in one place, and the spreadsheet cell
// round-trips.
import { describe, expect, it } from 'vitest';
import {
  coverageSummary,
  formatMilestoneCell,
  milestoneState,
  parseMilestoneCell,
  setMilestonesBody,
  utcDay,
} from './milestones';

const CODES = ['S0', 'S1', 'S2', 'S3', 'S4', 'A1'];

describe('milestoneState', () => {
  const m = { statusCode: 'S3', targetDate: '2026-11-30' };
  it('is met at the code or any code listed after it', () => {
    expect(milestoneState(m, 'S3', CODES, '2027-01-01')).toEqual({ met: true, overdue: false });
    expect(milestoneState(m, 'A1', CODES, '2027-01-01')).toEqual({ met: true, overdue: false });
  });
  it('is not met before the code, and overdue once the day has passed', () => {
    expect(milestoneState(m, 'S1', CODES, '2026-11-30')).toEqual({ met: false, overdue: false });
    expect(milestoneState(m, 'S1', CODES, '2026-12-01')).toEqual({ met: false, overdue: true });
    expect(milestoneState(m, null, CODES, '2026-12-01')).toEqual({ met: false, overdue: true });
  });
  it('meets nothing from a current code outside the list', () => {
    expect(milestoneState(m, 'ZZ', CODES, '2026-01-01')).toEqual({ met: false, overdue: false });
    expect(milestoneState(m, 'ZZ', CODES, '2027-01-01')).toEqual({ met: false, overdue: true });
  });
  it('an accepted row has met every milestone, whatever its status code says', () => {
    const a1 = { statusCode: 'A1', targetDate: '2020-01-01' };
    expect(milestoneState(a1, 'S1', CODES, '2027-01-01', true)).toEqual({ met: true, overdue: false });
    expect(milestoneState(a1, null, CODES, '2027-01-01', true)).toEqual({ met: true, overdue: false });
    expect(milestoneState(a1, 'S1', CODES, '2027-01-01', false)).toEqual({ met: false, overdue: true });
  });
  it('reads the same stored fact differently on a different day', () => {
    expect(milestoneState(m, 'S2', CODES, '2026-11-01').overdue).toBe(false);
    expect(milestoneState(m, 'S2', CODES, '2026-12-15').overdue).toBe(true);
    expect(utcDay(new Date('2026-12-15T23:59:59Z'))).toBe('2026-12-15');
  });
});

describe('the Milestones cell', () => {
  it('round-trips', () => {
    const ms = [
      { statusCode: 'S3', targetDate: '2026-11-30' },
      { statusCode: 'A1', targetDate: '2027-01-15' },
    ];
    expect(formatMilestoneCell(ms)).toBe('S3 2026-11-30; A1 2027-01-15');
    expect(parseMilestoneCell(formatMilestoneCell(ms), CODES)).toEqual({ ok: true, milestones: ms });
    expect(parseMilestoneCell('  ', CODES)).toEqual({ ok: true, milestones: [] });
  });
  it('refuses a malformed entry, an unknown code, a bad date and a repeat, in words', () => {
    expect(parseMilestoneCell('S3', CODES)).toMatchObject({ ok: false, problem: expect.stringContaining('"S3"') });
    expect(parseMilestoneCell('S3 30/11/2026', CODES)).toMatchObject({ ok: false, problem: expect.stringContaining('YYYY-MM-DD') });
    expect(parseMilestoneCell('S3 2026-02-30', CODES)).toMatchObject({ ok: false });
    expect(parseMilestoneCell('Q9 2026-11-30', CODES)).toMatchObject({ ok: false, problem: expect.stringContaining('status codes') });
    expect(parseMilestoneCell('S3 2026-11-30; S3 2026-12-30', CODES)).toMatchObject({ ok: false, problem: 'S3 appears twice' });
  });
  it('the write body demands real days', () => {
    expect(setMilestonesBody.safeParse({ milestones: [{ statusCode: 'S3', targetDate: '2026-11-30' }] }).success).toBe(true);
    expect(setMilestonesBody.safeParse({ milestones: [{ statusCode: 'S3', targetDate: '2026-13-01' }] }).success).toBe(false);
  });
});

describe('coverageSummary', () => {
  it('says it in one line', () => {
    const counts = { planned: 3, bound: 6, frozen: 0, qa_accepted: 0, promoted: 0, in_review: 1, accepted: 30 };
    expect(coverageSummary({ total: 40, counts, overdueMilestones: 2 })).toBe(
      '40 planned documents: 3 with no draft bound, 6 drafts bound, 1 in review, 30 accepted · 2 milestones overdue',
    );
    expect(coverageSummary({ total: 0, counts, overdueMilestones: 0 })).toBe('No planned documents yet');
  });
});
