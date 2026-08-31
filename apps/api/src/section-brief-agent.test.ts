// T-409 — the agent pane's parser, on T-364's own terms: an assistive agent
// that cannot shape an answer should ASK, not fail the surface the author is
// standing on. Every case below is a way the model can come back wrong, and
// every one of them has to leave the author with something to do next.
import { describe, expect, it } from 'vitest';
import { parseRevision } from './section-brief-agent';

describe('the agent revises one section’s description (T-409)', () => {
  it('takes a revision', () => {
    const parsed = parseRevision('{"brief":"Set out the three constraints in bullets.","followUp":null}');
    expect(parsed.brief).toBe('Set out the three constraints in bullets.');
    expect(parsed.followUp).toBeNull();
  });

  it('unwraps a fenced answer, because a model will fence one', () => {
    expect(parseRevision('```json\n{"brief":"A revised description.","followUp":null}\n```').brief).toBe(
      'A revised description.',
    );
  });

  it('asks rather than failing when it cannot tell what to change', () => {
    for (const answer of ['not json at all', '{"brief":"","followUp":null}', '[]', '']) {
      const parsed = parseRevision(answer);
      expect(parsed.brief).toBeNull();
      expect(parsed.followUp).not.toBeNull();
    }
  });

  it('passes the model’s own question through where it asked one', () => {
    const parsed = parseRevision('{"brief":null,"followUp":"Which constraints do you mean?"}');
    expect(parsed.followUp).toBe('Which constraints do you mean?');
  });

  it('🔒 refuses an answer that drafted the section instead of describing it', () => {
    // the failure worth naming separately: "it wrote the section" is something
    // the author can act on, where a generic failure is not — and a 4,000
    // character "description" reaching the drafting prompt would be a draft
    // written by a model that had not seen a single source
    const parsed = parseRevision(JSON.stringify({ brief: 'x'.repeat(4000), followUp: null }));
    expect(parsed.brief).toBeNull();
    expect(parsed.followUp).toContain('draft of the section');
  });

  it('never returns both a revision and a question', () => {
    const parsed = parseRevision('{"brief":"A revision.","followUp":"And a question?"}');
    // the author asked for a change and got one; a pane showing both would be
    // asking them to decide which of the two answers is the answer
    expect(parsed.brief).toBe('A revision.');
    expect(parsed.followUp).toBeNull();
  });
});
