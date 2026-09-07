// T-443 — the arithmetic half of a run, as a unit (ADR-0056 §3).
//
// **The figures are the part that must not be wrong, and they are the part a
// model never touches.** So they are tested here without a database and without
// a router: given rows, these are the numbers. The route-level suite
// (`apps.test.ts`) then proves the same numbers reach an insight row through
// the real predicate, driven as each party.
import { describe, expect, it } from 'vitest';
import type { AppColumn, AppRowRecord } from '@infora/contracts';
import { figuresAsText, figuresFor, writeInsightSentence } from './app-insight';
import { fakeRouter } from './test-router';

const columns: AppColumn[] = [
  { key: 'month', label: 'Month', type: 'text', required: true },
  { key: 'landfill', label: 'Waste to landfill (t)', type: 'number', required: true },
  { key: 'note', label: 'Note', type: 'text', required: false },
];

function row(over: Partial<AppRowRecord> & { values: Record<string, unknown> }): AppRowRecord {
  return {
    id: `row-${Math.random()}`,
    appTableId: 'table-1',
    organisationId: 'org-b',
    organisationName: 'Calder & Hale',
    enteredByName: 'Eleanor Price',
    enteredAt: '2026-09-01T09:00:00.000Z',
    state: 'submitted',
    decidedByName: null,
    decidedAt: null,
    rejectionReason: null,
    supersedesRowId: null,
    supersededByRowId: null,
    previousVersionId: null,
    retiredAt: null,
    mayEdit: false,
    maySubmit: false,
    mayDecide: false,
    mayCorrect: false,
    mayRetire: false,
    ...over,
  };
}

const table = (rows: AppRowRecord[], hasAcceptance = true) => ({
  name: 'Monthly returns',
  columns,
  hasAcceptance,
  rows,
});

describe('the figures a run reports are arithmetic over the rows it was handed', () => {
  it('totals, averages and extremes each number column, and counts by organisation and state', () => {
    const figures = figuresFor(
      table([
        row({ values: { month: 'August', landfill: 12.4 } }),
        row({ values: { month: 'September', landfill: 7.6 }, state: 'accepted' }),
        row({
          values: { month: 'October', landfill: 20 },
          organisationId: 'org-c',
          organisationName: 'Redgate Ecology',
          state: 'accepted',
        }),
      ]),
    );
    expect(figures.rows).toBe(3);
    expect(figures.columns).toEqual([
      {
        label: 'Waste to landfill (t)',
        count: 3,
        total: 40,
        mean: 13.33,
        lowest: 7.6,
        highest: 20,
      },
    ]);
    expect(figures.byOrganisation).toEqual([
      { organisationName: 'Calder & Hale', rows: 2 },
      { organisationName: 'Redgate Ecology', rows: 1 },
    ]);
    expect(figures.byState).toEqual([
      { state: 'accepted', rows: 2 },
      { state: 'submitted', rows: 1 },
    ]);
  });

  it('reports NO figures for a column nothing numeric was entered into — zero and “nothing” are different statements', () => {
    const figures = figuresFor(table([row({ values: { month: 'August' } })]));
    expect(figures.columns).toEqual([]);
    expect(figures.rows).toBe(1);
  });

  it('says nothing about states on a table with no acceptance step', () => {
    const figures = figuresFor(table([row({ values: { month: 'August', landfill: 1 }, state: null })], false));
    expect(figures.byState).toEqual([]);
  });

  it('is blind to rows it was not handed — which is what narrows a run to one firm', () => {
    // the route hands in what `canReadAppRow` allowed; a run by a firm that can
    // read one row reports one row, with no branch of its own
    const one = figuresFor(table([row({ values: { month: 'August', landfill: 12.4 } })]));
    expect(one.rows).toBe(1);
    expect(one.columns[0]!.total).toBe(12.4);
  });
});

describe('what the model is asked for, and what it is shown', () => {
  it('🔒 shows the model the FIGURES and no row — no value of a non-number column reaches it', () => {
    const figures = [
      figuresFor(
        table([
          row({ values: { month: 'August', landfill: 12.4, note: 'Landowner Mrs Ivy Hartnell disputes the access' } }),
        ]),
      ),
    ];
    const shown = figuresAsText(figures);
    expect(shown).toContain('Monthly returns');
    expect(shown).toContain('total 12.4');
    // the free-text column is not a number column, so no value of it is
    // computed and none of it is shown — which is how a land register's
    // landowner names stay out of a model call
    expect(shown).not.toContain('Ivy Hartnell');
    expect(shown).not.toContain('August');
  });

  it('asks for one sentence about figures somebody else calculated, and passes the builder’s prompt through', async () => {
    let seenSystem = '';
    let seenPrompt = '';
    const router = fakeRouter((system, prompt) => {
      seenSystem = system;
      seenPrompt = prompt;
      return 'Two firms returned this month; waste to landfill totalled 40 tonnes.';
    });
    const sentence = await writeInsightSentence(router, {
      appName: 'Sustainability returns',
      analysisPrompt: 'Say which organisations have not returned.',
      figures: [figuresFor(table([row({ values: { month: 'August', landfill: 40 } })]))],
    });
    expect(sentence).toBe('Two firms returned this month; waste to landfill totalled 40 tonnes.');
    expect(seenSystem).toContain('already been calculated');
    expect(seenSystem).toContain('Do not calculate a new one');
    expect(seenPrompt).toContain('Say which organisations have not returned.');
    expect(seenPrompt).toContain('total 40');
  });

  it('writes no insight at all when the model says nothing — an empty record would read as a finding', async () => {
    const sentence = await writeInsightSentence(fakeRouter('   '), {
      appName: 'Sustainability returns',
      analysisPrompt: null,
      figures: [],
    });
    expect(sentence).toBeNull();
  });
});
