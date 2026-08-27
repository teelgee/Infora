// T-308 acceptance — the loader, and the property the ticket exists for:
// a clause must be quotable VERBATIM and addressable by the number the manual
// gives it (ADR-0048 §5). A rulebook chunked for steer alone would satisfy the
// guiding channel and leave that ruling unimplementable at the surface.
import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker';
import { parseRulebook } from './rulebook';

const MANUAL = [
  'Ashcombe Drafting Manual',
  'This manual applies to every report issued in the firm’s name.',
  '',
  '4. Style',
  'Write for the consenting authority, not for the client.',
  '',
  '4.2 Voice',
  'Avoid the passive voice. Name who did the thing.',
  '',
  '4.2.1 Exceptions',
  'The passive is acceptable where the actor is genuinely unknown.',
  '',
  '12.4.7. Cross-references',
  'Refer to a chapter by its number and title.',
].join('\n');

describe('the clause is the unit, not the chunk', () => {
  it('addresses a rule by the number the manual gives it', () => {
    const { clauses, labelled } = parseRulebook(MANUAL);
    expect(clauses.map((c) => c.clause)).toEqual([null, '4', '4.2', '4.2.1', '12.4.7']);
    expect(labelled).toBe(4);
    const voice = clauses.find((c) => c.clause === '4.2')!;
    expect(voice.heading).toBe('Voice');
    // the sentence ADR-0048 §5 has to be able to write
    expect(voice.content).toContain('Avoid the passive voice.');
  });

  it('stores the clause VERBATIM — its span is a real slice of the source', () => {
    const { clauses } = parseRulebook(MANUAL);
    for (const clause of clauses) {
      expect(MANUAL.slice(clause.start, clause.end)).toBe(clause.content);
    }
    // total: every character lands in exactly one clause, so a quote sits
    // where it says it does
    expect(clauses.map((c) => c.content).join('')).toBe(MANUAL);
  });

  it('is NOT what the chunker would have produced — the difference is the ticket', () => {
    const chunks = chunkText(MANUAL);
    // the chunker rejoins sentences with a single space, so its output is not
    // a substring of its own source; quoting from it would produce a rule the
    // manual does not literally contain
    const rewritten = chunks.filter((c) => MANUAL.slice(c.start, c.end) !== c.content);
    expect(rewritten.length).toBeGreaterThan(0);
    // and it carries no clause address at all: there is nowhere for "§4.2" to
    // come from once the text has been packed to a size cap
    expect(Object.keys(chunks[0]!)).not.toContain('clause');
  });
});

describe('what the loader refuses to invent', () => {
  it('gives the preamble no number rather than guessing one', () => {
    const { clauses } = parseRulebook(MANUAL);
    expect(clauses[0]!.clause).toBeNull();
    expect(clauses[0]!.content).toContain('Ashcombe Drafting Manual');
  });

  it('accepts an unnumbered manual as one unlabelled clause, and says so', () => {
    const parsed = parseRulebook('Keep it short. Say who did what.\n');
    expect(parsed.clauses).toHaveLength(1);
    expect(parsed.clauses[0]!.clause).toBeNull();
    // the honest report: nothing in here can ever be quoted with a reference
    expect(parsed.labelled).toBe(0);
  });

  it('does not split on a number that merely ends a sentence (T-307’s lesson)', () => {
    const text = 'The barrier is 3 m. The level is 54. Design accordingly.\n';
    const { clauses } = parseRulebook(text);
    expect(clauses).toHaveLength(1);
    expect(clauses[0]!.clause).toBeNull();
  });

  it('reads a § the manual wrote, and does not store it', () => {
    const { clauses } = parseRulebook('§4.2 Voice\nAvoid the passive.\n');
    expect(clauses[0]!.clause).toBe('4.2');
  });

  it('is deterministic — the same manual loads the same way twice', () => {
    expect(parseRulebook(MANUAL)).toEqual(parseRulebook(MANUAL));
  });
});
