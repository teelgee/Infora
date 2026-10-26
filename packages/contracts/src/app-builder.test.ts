// T-487 — three small rules in the app builder's contract, each found by the
// T-446 acceptance walk (docs/walks/t446.md):
//
//   - an INSIGHT table may be declared by the agent with no columns (defect 2);
//   - an app with no table or no screen cannot be opened (defect 11);
//   - one answer to "is this row current?" (the recheck's new finding).
//
// The screen grammar, the questions and the rest of the contract are pinned in
// `app-screen.test.ts`.
import { describe, expect, it } from 'vitest';
import {
  builderAgentAnswerSchema,
  calendarKey,
  calendarMonth,
  isCurrentAppRow,
  rowStateLabel,
  publishGateOf,
  type BuilderQuestion,
} from './app-builder';

const answer = (act: unknown) => ({ say: 'Done.', acts: [act], asks: [], proposals: [] });
const COLUMNS = [{ key: 'month', label: 'Month', type: 'text' }];

describe('declaring a table (T-487, walk defect 2)', () => {
  it('lets an insight table arrive with no columns — Infora fixes them, and the agent is told so', () => {
    const parsed = builderAgentAnswerSchema.safeParse(
      answer({ kind: 'declareTable', name: 'Analysis', tableKind: 'insight' }),
    );
    expect(parsed.success).toBe(true);
  });

  it('lets an insight table arrive with an empty list, or with columns that will be ignored', () => {
    for (const columns of [[], COLUMNS]) {
      expect(
        builderAgentAnswerSchema.safeParse(
          answer({ kind: 'declareTable', name: 'Analysis', tableKind: 'insight', columns }),
        ).success,
      ).toBe(true);
    }
  });

  it('still requires at least one column on a DATA table — missing or empty', () => {
    expect(
      builderAgentAnswerSchema.safeParse(answer({ kind: 'declareTable', name: 'Returns', tableKind: 'data' })).success,
    ).toBe(false);
    expect(
      builderAgentAnswerSchema.safeParse(
        answer({ kind: 'declareTable', name: 'Returns', tableKind: 'data', columns: [] }),
      ).success,
    ).toBe(false);
    expect(
      builderAgentAnswerSchema.safeParse(
        answer({ kind: 'declareTable', name: 'Returns', tableKind: 'data', columns: COLUMNS }),
      ).success,
    ).toBe(true);
  });

  it('stays a strict object: a field nobody declared still fails the whole answer, insight or not', () => {
    for (const tableKind of ['insight', 'data']) {
      expect(
        builderAgentAnswerSchema.safeParse(
          answer({ kind: 'declareTable', name: 'T', tableKind, columns: COLUMNS, hasAcceptance: true }),
        ).success,
      ).toBe(false);
    }
  });
});

describe('the publish gate also needs something to open (T-487, walk defect 11)', () => {
  const question: BuilderQuestion = {
    kind: 'contractual-data',
    step: 2,
    subjectId: 't1',
    subjectName: 'Monthly returns',
    question: 'Does “Monthly returns” hold contractual data?',
  };
  const whole = { hasTable: true, hasScreen: true };

  it('is open when every question is answered and there is a table and a screen — the old sentence', () => {
    expect(publishGateOf([], whole)).toEqual({
      open: true,
      questions: [],
      words: 'Every required question has an answer, so this app can be opened.',
    });
  });

  it('an empty app is closed, in words, though no question is pending', () => {
    const gate = publishGateOf([], { hasTable: false, hasScreen: false });
    expect(gate.open).toBe(false);
    expect(gate.words).toBe(
      'This app cannot be opened yet: it has no table for people to fill in and no screen for people to open.',
    );
  });

  it('names the one thing missing', () => {
    expect(publishGateOf([], { hasTable: false, hasScreen: true }).words).toBe(
      'This app cannot be opened yet: it has no table for people to fill in.',
    );
    expect(publishGateOf([], { hasTable: true, hasScreen: false }).words).toBe(
      'This app cannot be opened yet: it has no screen for people to open.',
    );
  });

  it('combines a missing piece with the open questions in ONE sentence', () => {
    expect(publishGateOf([question], { hasTable: true, hasScreen: false })).toMatchObject({
      open: false,
      words:
        'This app cannot be opened yet: it has no screen for people to open, and one question still needs an answer — whether “Monthly returns” holds contractual data.',
    });
  });

  it('keeps the questions-only sentence exactly as it was', () => {
    expect(publishGateOf([question], whole).words).toBe(
      'This app cannot be opened yet: one question still needs an answer — whether “Monthly returns” holds contractual data.',
    );
  });
});

describe('is this row current? (T-487, the recheck’s new finding)', () => {
  const row = {
    retiredAt: null as string | null,
    state: 'accepted' as 'accepted' | 'rejected' | 'superseded' | 'submitted' | 'draft' | null,
    supersededByRowId: null as string | null,
  };

  it('an ordinary row is current — whatever its state, including rejected: a rejection alone does not remove it (T-489 rules on that)', () => {
    for (const state of ['draft', 'submitted', 'accepted', 'rejected', null] as const) {
      expect(isCurrentAppRow({ ...row, state })).toBe(true);
    }
  });

  it('a retired row is not current', () => {
    expect(isCurrentAppRow({ ...row, retiredAt: '2026-10-01T00:00:00.000Z' })).toBe(false);
  });

  it('a superseded row is not current', () => {
    expect(isCurrentAppRow({ ...row, state: 'superseded' })).toBe(false);
  });

  it('a row a later row replaced is not current — even a REJECTED one, whose stored state must stay “rejected”', () => {
    expect(isCurrentAppRow({ ...row, state: 'rejected', supersededByRowId: 'row-2' })).toBe(false);
    expect(isCurrentAppRow({ ...row, state: null, supersededByRowId: 'row-2' })).toBe(false);
  });
});

// ── T-488 — the month reader and the row-state words now live in the contract, so
// the charts, the analysis run and the spreadsheet export all use the same ones ──

describe('the one month reader (T-488)', () => {
  it('reads ISO dates and English month-and-year, and nothing else', () => {
    expect(calendarKey('2026-10')).toBe(20261001);
    expect(calendarKey('October 2026')).toBe(calendarKey('Oct 2026'));
    expect(calendarKey('October')).toBeNull();
    expect(calendarKey('10/11/2026')).toBeNull();
  });

  it('names the calendar month a value falls in, sortably, and in words', () => {
    expect(calendarMonth('2026-10-14')).toEqual({ sort: 202610, label: 'October 2026' });
    expect(calendarMonth('sept 2026')).toEqual({ sort: 202609, label: 'September 2026' });
    expect(calendarMonth('2026-10-14')!.sort).toBe(calendarMonth('October 2026')!.sort);
    expect(calendarMonth('2026-09-30')!.sort).toBeLessThan(calendarMonth('2026-10-01')!.sort);
    expect(calendarMonth('nonsense')).toBeNull();
  });
});

describe('what a row’s state is called (T-488)', () => {
  const base = { retiredAt: null, state: null, supersededByRowId: null } as never;
  const label = (over: Record<string, unknown>) => rowStateLabel({ ...(base as object), ...over } as never);

  it('says Replaced / Retired for earlier rows, and the state for the rest', () => {
    expect(label({})).toBeNull();
    expect(label({ state: 'accepted' })).toBe('Accepted');
    expect(label({ state: 'superseded' })).toBe('Replaced');
    expect(label({ retiredAt: '2026-10-01T00:00:00.000Z', state: 'accepted' })).toBe('Retired');
    expect(label({ state: null, supersededByRowId: 'next' })).toBe('Replaced');
    expect(label({ state: 'rejected', supersededByRowId: 'next' })).toBe('Rejected · replaced');
  });
});
