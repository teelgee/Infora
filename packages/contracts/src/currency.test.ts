// T-473 — the state is decided at the moment of the read, and the words are one
// function, so no two screens can say the same fact differently.
import { describe, expect, it } from 'vitest';
import { currencyMarkTitle, currencyOf, currencyWords } from './currency';

const NOW = new Date('2026-10-24T12:00:00Z');

describe('currencyOf', () => {
  it('is unconfirmed when nobody has confirmed it — with no name, date or due date', () => {
    expect(currencyOf({ confirmedBy: null, confirmedAt: null, recheckDue: null }, NOW)).toEqual({
      state: 'unconfirmed',
      confirmedBy: null,
      confirmedAt: null,
      recheckDue: null,
    });
  });

  it('is confirmed while the due date is ahead, and overdue the moment it has passed — including exactly now', () => {
    const fact = (due: string) => ({ confirmedBy: 'Rachel Bowen', confirmedAt: new Date('2025-10-24T00:00:00Z'), recheckDue: new Date(due) });
    expect(currencyOf(fact('2026-10-24T12:00:01Z'), NOW).state).toBe('confirmed');
    expect(currencyOf(fact('2026-10-24T12:00:00Z'), NOW).state).toBe('overdue');
    expect(currencyOf(fact('2026-08-24T00:00:00Z'), NOW)).toMatchObject({ state: 'overdue', confirmedBy: 'Rachel Bowen' });
    // the same stored fact, read a year later, is a different answer: nothing is stored as a state
    expect(currencyOf(fact('2027-01-01T00:00:00Z'), NOW).state).toBe('confirmed');
    expect(currencyOf(fact('2027-01-01T00:00:00Z'), new Date('2027-02-01T00:00:00Z')).state).toBe('overdue');
  });
});

describe('currencyWords and the mark', () => {
  it('says nothing for a confirmed document or a deliverable', () => {
    const confirmed = currencyOf({ confirmedBy: 'R', confirmedAt: new Date('2026-10-01'), recheckDue: new Date('2027-10-01') }, NOW);
    expect(currencyWords(confirmed)).toBeNull();
    expect(currencyWords(null)).toBeNull();
    expect(currencyWords(undefined)).toBeNull();
    expect(currencyMarkTitle(confirmed)).toBeNull();
  });

  it('says what an unconfirmed document is, in plain words', () => {
    const c = currencyOf({ confirmedBy: null, confirmedAt: null, recheckDue: null }, NOW);
    expect(currencyWords(c)).toBe('Not confirmed current — nobody has checked this document is still the one to rely on');
    expect(currencyMarkTitle(c)).toBe('Not confirmed current');
  });

  it('says when an overdue re-check fell due, and who confirmed it when', () => {
    const c = currencyOf(
      { confirmedBy: 'Rachel Bowen', confirmedAt: new Date('2025-08-24T00:00:00Z'), recheckDue: new Date('2026-08-24T00:00:00Z') },
      NOW,
    );
    expect(currencyWords(c)).toBe('Re-check overdue since 24 Aug 2026 — confirmed current by Rachel Bowen on 24 Aug 2025');
    expect(currencyMarkTitle(c)).toBe('Re-check overdue');
    // a confirmer who has since left the project is not invented
    expect(currencyWords({ ...c, confirmedBy: null })).toBe('Re-check overdue since 24 Aug 2026 — confirmed current on 24 Aug 2025');
  });
});
