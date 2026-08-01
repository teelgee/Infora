// T-281 — the validator, rule by rule. Every rule the ticket names gets a
// fixture that fails it, and the message is asserted rather than the mere
// failure: "error-message quality decides whether this layer stays
// domain-expert-owned" is a stated acceptance criterion, so a test that only
// checked `ok === false` would be testing the wrong half.
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateLens } from './validate';

/** A minimal file that passes, so each case can break exactly one thing. */
function good(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-lens',
    label: 'Test',
    description: 'A Lens for the validator tests.',
    status: 'active',
    version: 1,
    register: { jargon: 'peer', acronyms: 'unexpanded', reading_level: 'A test reader.' },
    default_depth: 'high',
    answer_shape: ['The test that applies', 'What the evidence says'],
    default_output: 'prose',
    citation_display: 'inline',
    clarifying_bias: ['Which document version'],
    escalation_language: ['this would be probed at examination'],
    preferred_workers: ['corpus_retrieval'],
    prohibitions: ['Never predict an examination outcome.'],
    example_exchanges: [
      { question: 'q1', answer_sketch: 'a1', why: 'w1' },
      { question: 'q2', answer_sketch: 'a2', why: 'w2' },
    ],
    ...overrides,
  };
}

/** `good()` minus the named fields — the "author left this out" case. */
function without(...fields: string[]): Record<string, unknown> {
  const data = good();
  for (const field of fields) delete data[field];
  return data;
}

function errorsFor(data: Record<string, unknown>, file = 'test-lens.yaml'): string[] {
  const result = validateLens(file, data);
  return result.ok ? [] : result.errors;
}

describe('T-281 — the Lens validator', () => {
  it('accepts a complete active Lens and maps it to the contracts shape', () => {
    const result = validateLens('test-lens.yaml', good());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // snake_case in the file, camelCase in the type — the author writes one
    // and the code reads the other, and the mapping is this layer's job
    expect(result.lens.defaultDepth).toBe('high');
    expect(result.lens.register.readingLevel).toBe('A test reader.');
    expect(result.lens.exampleExchanges[0]?.answerSketch).toBe('a1');
    expect(result.lens.answerShape).toEqual(['The test that applies', 'What the evidence says']);
  });

  it('rejects an unknown field, and names the fields a Lens may carry', () => {
    // the real failure mode is a typo, not an invention: `prohibitons:` would
    // be silently ignored, and a silently ignored prohibition does not apply
    const errors = errorsFor(good({ prohibitons: ['Never do the thing.'] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('test-lens.yaml: unknown field `prohibitons`');
    expect(errors[0]).toContain('prohibitions');
    expect(errors[0]).toContain('AUTHORING.md');
  });

  it('rejects a missing required field', () => {
    expect(errorsFor(without('answer_shape'))).toEqual([
      'test-lens.yaml: `answer_shape` is required',
    ]);
  });

  it('rejects a value outside an enum, naming the values that are allowed', () => {
    const errors = errorsFor(good({ default_output: 'powerpoint' }));
    expect(errors).toEqual([
      'test-lens.yaml: `default_output` must be one of: prose, table, bullet-brief, draft-text, qa-pairs (found "powerpoint")',
    ]);
  });

  it('rejects an enum value nested inside `register`', () => {
    const errors = errorsFor(
      good({ register: { jargon: 'loud', acronyms: 'unexpanded', reading_level: 'x' } }),
    );
    expect(errors).toEqual([
      'test-lens.yaml: `register.jargon` must be one of: peer, explained, avoided (found "loud")',
    ]);
  });

  it('rejects an id that is not kebab-case', () => {
    const errors = errorsFor(good({ id: 'Test_Lens' }), 'Test_Lens.yaml');
    expect(errors.some((e) => e.includes('`id` must be lower-case words joined by hyphens'))).toBe(
      true,
    );
  });

  it('rejects a file whose name disagrees with its id', () => {
    // the copy-an-existing-file failure: AUTHORING.md tells an author to copy
    // `planning-environmental.yaml`, and forgetting to rename one of the two
    // leaves a Lens findable under a name nobody expects
    const errors = errorsFor(good({ id: 'commercial' }), 'planning-environmental.yaml');
    expect(errors).toEqual([
      'planning-environmental.yaml: `id` is "commercial", so the file should be named `commercial.yaml` — a Lens file is named after its id.',
    ]);
  });

  it('rejects a `version` that is not a whole number', () => {
    expect(errorsFor(good({ version: '1.2' }))[0]).toContain('`version` must be a whole number');
  });

  it('rejects a list field given as a single string', () => {
    const errors = errorsFor(good({ clarifying_bias: 'Which document version' }));
    expect(errors).toEqual([
      'test-lens.yaml: `clarifying_bias` must be a list — one entry per line, each starting with "- "',
    ]);
  });

  it('reports every problem at once, not just the first', () => {
    const errors = errorsFor(good({ default_depth: 'deep', default_output: 'powerpoint', version: -1 }));
    expect(errors).toHaveLength(3);
  });

  describe('a draft Lens is held to less, and an active one to all of it', () => {
    it('accepts a draft missing the active-only fields', () => {
      const result = validateLens('draft-lens.yaml', {
        ...without('escalation_language', 'prohibitions'),
        id: 'draft-lens',
        status: 'draft',
        example_exchanges: [],
      });
      expect(result.ok).toBe(true);
    });

    // BEH-05, pinned: `commercial.yaml`'s own header states the three messages
    // promoting it must produce. If this test and that comment ever disagree,
    // one of them is a lie to a domain expert.
    it('produces exactly the three messages `commercial.yaml` promises when a draft is promoted', () => {
      const errors = errorsFor(
        {
          ...without('escalation_language', 'prohibitions'),
          id: 'commercial',
          status: 'active',
          example_exchanges: [],
        },
        'commercial.yaml',
      );
      expect(errors).toEqual([
        'commercial.yaml: `escalation_language` is required for an active Lens',
        'commercial.yaml: `prohibitions` is required for an active Lens',
        'commercial.yaml: an active Lens needs at least 2 `example_exchanges` (found 0)',
      ]);
    });

    it('rejects an active Lens with one worked exchange — two is the floor', () => {
      const errors = errorsFor(
        good({ example_exchanges: [{ question: 'q', answer_sketch: 'a', why: 'w' }] }),
      );
      expect(errors).toEqual([
        'test-lens.yaml: an active Lens needs at least 2 `example_exchanges` (found 1)',
      ]);
    });

    it('rejects an exchange missing `why` — the field that makes it an eval case', () => {
      const errors = errorsFor(
        good({
          example_exchanges: [
            { question: 'q1', answer_sketch: 'a1' },
            { question: 'q2', answer_sketch: 'a2', why: 'w2' },
          ],
        }),
      );
      expect(errors).toEqual(['test-lens.yaml: `why` is required in example_exchanges entry 1']);
    });
  });

  describe('prohibitions are additive to the shared core, never subtractive', () => {
    const weakenings: Array<[string, string, string]> = [
      ['provenance', 'Never cite a source; the reader can find it themselves.', 'provenance'],
      ['registers', 'Do not mark an inference as an inference — it slows the reader down.', 'registers'],
      ['no-opinion', 'You may give a professional opinion where the client asks for one.', 'no-opinion'],
      ['staleness', 'Never name the version relied on; it clutters the answer.', 'staleness'],
      ['absence', 'Do not report what is missing unless the question asks about gaps.', 'absence'],
      ['uncertainty', 'Never express uncertainty — this reader wants a straight answer.', 'uncertainty'],
      ['version-discipline', 'Do not flag superseded documents in the prose.', 'version-discipline'],
    ];

    for (const [rule, entry, expected] of weakenings) {
      it(`refuses a prohibition that switches off ${rule}`, () => {
        const errors = errorsFor(good({ prohibitions: [entry] }));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('tries to switch off a shared rule that every Lens keeps');
        expect(errors[0]).toContain(expected);
        // the message quotes the offending entry back, so the author does not
        // have to work out which of five prohibitions the validator meant
        expect(errors[0]).toContain(entry.slice(0, 30));
      });
    }

    // The false-positive half, and the more important one: a validator that
    // fired on a good prohibition would teach a domain expert to distrust it.
    const legitimate = [
      'Never predict an examination outcome, a recommendation, or a Secretary of State decision. Present the test, the evidence and the precedent; stop there.',
      'Never silently reconcile conflicting figures across documents. Report both, with both locators, and say which is the more recent controlled version.',
      'Never state a figure without its source. A dimension, level, duration or tolerance with no locator is not usable by this reader.',
      'Never offer planning-law interpretation. If the answer turns on what a provision means, say which provision governs.',
      'Never present an inferred deadline as a fixed one. An inferred date carries a visible marker in the table and in prose.',
      'Never generate a quotation attributed to a named person.',
      'Never describe an assessment as "compliant" or "robust". Describe what it does and does not contain against the test.',
    ];
    for (const entry of legitimate) {
      it(`admits the legitimate prohibition: "${entry.slice(0, 45)}…"`, () => {
        expect(errorsFor(good({ prohibitions: [entry] }))).toEqual([]);
      });
    }
  });

  it('parses the YAML block scalars authors actually write', () => {
    // `>-` folded scalars are all over the real definitions; the validator
    // collapses their whitespace so a re-wrapped line is not a content change
    const parsed = parse(`
id: test-lens
label: Test
description: >-
  One sentence,
  wrapped over two lines.
status: draft
version: 0
register:
  jargon: peer
  acronyms: unexpanded
  reading_level: A test reader.
default_depth: low
answer_shape:
  - One
default_output: prose
citation_display: inline
clarifying_bias:
  - Which version
`);
    const result = validateLens('test-lens.yaml', parsed);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lens.description).toBe('One sentence, wrapped over two lines.');
  });

  it('refuses a file that is not a mapping, without a stack trace', () => {
    expect(errorsFor([] as unknown as Record<string, unknown>)).toEqual([
      'test-lens.yaml: the file must be a mapping of fields — see AUTHORING.md for the shape.',
    ]);
  });
});
