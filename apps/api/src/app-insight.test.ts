// T-443 — the arithmetic half of a run, as a unit (ADR-0056 §3).
//
// **The figures are the part that must not be wrong, and they are the part a
// model never touches.** So they are tested here without a database and without
// a router: given rows, these are the numbers. The route-level suite
// (`apps.test.ts`) then proves the same numbers reach an insight row through
// the real predicate, driven as each party.
import { describe, expect, it } from 'vitest';
import type { AppColumn, AppRowRecord } from '@infora/contracts';
import { figuresAsText, figuresFor, wholeSentences, writeInsightSentence } from './app-insight';
import { Router, SELF_HOSTED_UK } from '@infora/model';
import type { ChatAdapter } from '@infora/model';
import { FAKE_EMBED_DIMENSIONS, FAKE_EMBED_MODEL, fakeRouter, fakeVector } from './test-router';

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
      { organisationName: 'Calder & Hale', rows: 2, totals: [{ label: 'Waste to landfill (t)', total: 20 }] },
      { organisationName: 'Redgate Ecology', rows: 1, totals: [{ label: 'Waste to landfill (t)', total: 20 }] },
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

  it('🔒 the planted name stays out of what the ROUTER actually receives', async () => {
    // added in review 2026-09-07: the test above asserts on figuresAsText's
    // return value, which cannot catch a leak through the surrounding prompt —
    // this one captures the words the router was sent and searches those
    let seenSystem = '';
    let seenPrompt = '';
    const router = fakeRouter((system, prompt) => {
      seenSystem = system;
      seenPrompt = prompt;
      return 'One firm returned this month.';
    });
    await writeInsightSentence(router, {
      appName: 'Sustainability returns',
      analysisPrompt: 'Say whether returns are on track.',
      figures: [
        figuresFor(
          table([
            row({ values: { month: 'August', landfill: 12.4, note: 'Landowner Mrs Ivy Hartnell disputes the access' } }),
          ]),
        ),
      ],
    });
    expect(seenPrompt).toContain('total 12.4');
    expect(`${seenSystem} ${seenPrompt}`).not.toContain('Ivy Hartnell');
    expect(`${seenSystem} ${seenPrompt}`).not.toContain('disputes the access');
    expect(`${seenSystem} ${seenPrompt}`).not.toContain('August');
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

// ── T-488 (walk defect 9) — the analysis is given figures per month and per
// organisation, and is never cut off mid-word ────────────────────────────────

describe('figures per month and per organisation (T-488)', () => {
  const dated: AppColumn[] = [
    { key: 'when', label: 'Return date', type: 'date', required: true },
    { key: 'landfill', label: 'Waste to landfill (t)', type: 'number', required: true },
  ];
  const datedTable = (rows: AppRowRecord[]) => ({ name: 'Returns', columns: dated, hasAcceptance: false, rows });

  it('groups a date column by calendar month, earliest first, with each number column’s total', () => {
    const figures = figuresFor(
      datedTable([
        row({ values: { when: '2026-10-14', landfill: 5 } }),
        row({ values: { when: '2026-09-02', landfill: 2 } }),
        row({ values: { when: '2026-10-30', landfill: 1.5 }, organisationName: 'Redgate Ecology' }),
        row({ values: { when: 'not a date', landfill: 99 } }),
      ]),
    );
    expect(figures.byMonth).toEqual({
      columnLabel: 'Return date',
      months: [
        { month: 'September 2026', rows: 1, totals: [{ label: 'Waste to landfill (t)', total: 2 }] },
        { month: 'October 2026', rows: 2, totals: [{ label: 'Waste to landfill (t)', total: 6.5 }] },
      ],
    });
  });

  it('reads a text column as months only when every value reads as one — the chart ordering’s reader', () => {
    const textual = (months: string[]) =>
      figuresFor(
        table(months.map((month) => row({ values: { month, landfill: 1 } }))),
      );
    expect(textual(['October 2026', 'Sep 2026', '2026-08']).byMonth?.months.map((m) => m.month)).toEqual([
      'August 2026',
      'September 2026',
      'October 2026',
    ]);
    // one value that does not read sends the whole column back to “no months”
    expect(textual(['October 2026', 'Waste']).byMonth).toBeNull();
    // a bare month name is not read (which year?), exactly as the charts do not
    expect(textual(['August', 'September']).byMonth).toBeNull();
  });

  it('gives each organisation’s rows and totals, over the rows it was handed', () => {
    const figures = figuresFor(
      table([
        row({ values: { month: 'August 2026', landfill: 10 } }),
        row({ values: { month: 'September 2026', landfill: 5 } }),
        row({ values: { month: 'August 2026', landfill: 7 }, organisationName: 'Redgate Ecology' }),
      ]),
    );
    expect(figures.byOrganisation).toEqual([
      { organisationName: 'Calder & Hale', rows: 2, totals: [{ label: 'Waste to landfill (t)', total: 15 }] },
      { organisationName: 'Redgate Ecology', rows: 1, totals: [{ label: 'Waste to landfill (t)', total: 7 }] },
    ]);
  });

  it('the prompt the model receives carries a per-month block and a per-organisation block, beside the whole table', async () => {
    let seenSystem = '';
    let seenPrompt = '';
    const router = fakeRouter((system, prompt) => {
      seenSystem = system;
      seenPrompt = prompt;
      return 'Waste fell in September.';
    });
    await writeInsightSentence(router, {
      appName: 'Returns',
      analysisPrompt: null,
      figures: [
        figuresFor(
          table([
            row({ values: { month: 'September 2026', landfill: 5 } }),
            row({ values: { month: 'August 2026', landfill: 10 } }),
            row({ values: { month: 'August 2026', landfill: 7 }, organisationName: 'Redgate Ecology' }),
          ]),
        ),
      ],
    });
    expect(seenPrompt).toContain('PER ORGANISATION');
    expect(seenPrompt).toContain('Calder & Hale: 2 row(s) — Waste to landfill (t) total 15');
    expect(seenPrompt).toContain('Redgate Ecology: 1 row(s) — Waste to landfill (t) total 7');
    expect(seenPrompt).toContain('PER MONTH');
    // earliest first
    expect(seenPrompt.indexOf('August 2026: 2 row(s) — Waste to landfill (t) total 17')).toBeGreaterThan(-1);
    expect(seenPrompt.indexOf('August 2026:')).toBeLessThan(seenPrompt.indexOf('September 2026:'));
    expect(seenPrompt).toContain('WHOLE TABLE');
    expect(seenPrompt).toContain('total 22, average 7.33');
    // and the instruction says it now has these breakdowns
    expect(seenSystem).toContain('PER MONTH');
    expect(seenSystem).toContain('PER ORGANISATION');
  });

  it('a table with no month column shows no month block', () => {
    const text = figuresAsText([figuresFor(table([row({ values: { month: 'Waste', landfill: 1 } })]))]);
    expect(text).toContain('PER ORGANISATION');
    expect(text).not.toContain('PER MONTH');
  });
});

describe('the analysis is never cut off mid-word or mid-sentence (T-488)', () => {
  it('leaves a reply that ends on a sentence exactly as it is', () => {
    const text = 'Waste fell by a fifth in September. Redgate Ecology returned late.';
    expect(wholeSentences(text, 600)).toBe(text);
  });

  it('trims a reply the model ran out of room for back to the last whole sentence', () => {
    expect(wholeSentences('Waste fell by a fifth in September. Redgate Ecology returned la', 600, true)).toBe(
      'Waste fell by a fifth in September.',
    );
  });

  it('leaves a short reply the model finished alone, even if it is not a sentence', () => {
    expect(wholeSentences('INSIGHT: 1 rows, total 4.6', 600)).toBe('INSIGHT: 1 rows, total 4.6');
  });

  it('trims a reply longer than the limit to the last sentence that fits, never inside a word or a decimal', () => {
    const text = 'Waste to landfill totalled 12.5 tonnes in August. It rose to 20.25 tonnes in September. Calder and Hale supplied most of it.';
    const cut = wholeSentences(text, 70);
    expect(cut).toBe('Waste to landfill totalled 12.5 tonnes in August.');
    // a limit that lands inside “20.25” still ends on a sentence
    for (let max = 20; max < text.length; max++) {
      const out = wholeSentences(text, max);
      expect(text.startsWith(out.replace(/…$/, ''))).toBe(true);
      expect(out.endsWith('.') || out.endsWith('…')).toBe(true);
      // never inside a decimal: what follows a trimmed full stop is a space (or nothing)
      if (out.endsWith('.')) expect(text[out.length] === undefined || text[out.length] === ' ').toBe(true);
    }
  });

  it('with no sentence to fall back on, stops at the last whole word and says so with “…”', () => {
    expect(wholeSentences('Calder and Hale returned the most waste across the whole of the scheme this', 40)).toBe(
      'Calder and Hale returned the most waste…',
    );
    expect(wholeSentences('Waste fell by a fifth in Septem', 600, true)).toBe('Waste fell by a fifth in…');
  });

  it('a long scripted reply is stored by the writer ending on a whole sentence', async () => {
    const long = `${'Waste to landfill was steady across the scheme. '.repeat(40)}And then it began to`;
    const sentence = await writeInsightSentence(fakeRouter(long), {
      appName: 'Returns',
      analysisPrompt: null,
      figures: [],
    });
    expect(sentence!.length).toBeLessThanOrEqual(1500);
    expect(sentence!.endsWith('scheme.')).toBe(true);
  });
});

describe('a reply the model ran out of room for (T-488)', () => {
  it('is trimmed back to its last whole sentence when the model used every token it was allowed', async () => {
    const chat: ChatAdapter = {
      modelId: 'fake-chat',
      attributes: SELF_HOSTED_UK,
      chat: () =>
        Promise.resolve({
          text: 'Waste fell in September. Calder and Hale returned the most of it, and Redgate Ecol',
          model: { id: 'fake-chat', version: 'fake-chat-1' },
          usage: { tokensPrompt: 500, tokensCompletion: 700 },
        }),
    };
    const router = new Router(chat, {
      modelId: FAKE_EMBED_MODEL,
      dimensions: FAKE_EMBED_DIMENSIONS,
      attributes: SELF_HOSTED_UK,
      embed: (texts) =>
        Promise.resolve({
          embeddings: texts.map(fakeVector),
          model: { id: FAKE_EMBED_MODEL, version: 'fake-1' },
          usage: { tokens: 0 },
        }),
    });
    const sentence = await writeInsightSentence(router, { appName: 'Returns', analysisPrompt: null, figures: [] });
    expect(sentence).toBe('Waste fell in September.');
  });
});
