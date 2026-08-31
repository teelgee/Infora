// T-309 — the planner, on its own. It is CODE (ADR-0053 §4), so its whole
// claim is testable without a database, a model or a run: the same inputs
// produce the same plan, every time, and the price is honest about what it does
// not know.
import { describe, expect, it } from 'vitest';
import type { DocumentSection, Workflow } from '@infora/contracts';
import { STYLE_PRECEDENCE } from '@infora/contracts';
import { coverageAfter, coverageBefore, planDocumentCreation } from './tool-plan';

// T-407 — the outline the AUTHOR composed. A template is a starting point the
// surface copies from; nothing template-shaped reaches the planner any more.
const sections: DocumentSection[] = [
  { heading: 'Purpose', purpose: 'why' },
  { heading: 'The evidence', purpose: 'what' },
];

const workflow: Workflow = {
  id: 'document-creation',
  version: 1,
  label: 'Create a document',
  description: 'draft into a template',
  status: 'active',
  parameters: [],
  outputSchema: { document_id: 'the document' },
  steps: [{ id: 'build', stage: 'present', worker: 'document_builder', inputs: {}, dependsOn: [] }],
  requiresWorkers: ['document_builder'],
  writes: 'sandbox_document',
  labelPropagation: 'refuse',
};

const plan = (overrides: Partial<Parameters<typeof planDocumentCreation>[0]> = {}) =>
  planDocumentCreation({
    workflow,
    sections,
    brief: 'does the baseline support the assessment?',
    sourceCount: 3,
    purpose: 'technical-note',
    language: 'technical',
    documentType: 'whole-document',
    styleGuideCount: 0,
    draftModelId: 'a-model',
    rates: { 'a-model': { promptPerMTok: 3, completionPerMTok: 15 } },
    tokenLimit: 12000,
    ...overrides,
  });

describe('the document creator’s plan is computed in code (T-309, ADR-0053 §4)', () => {
  it('is identical for identical inputs — the guarantee a declared workflow is sold on', () => {
    // if a model decided the run's shape, the same document would produce
    // different plans on different days and this would not hold
    expect(plan()).toEqual(plan());
  });

  it('prices the drafting step against the model that would serve it', () => {
    const priced = plan();
    expect(priced.cost.priced).toBe(true);
    expect(priced.cost.total).toBeGreaterThan(0);
    expect(priced.steps[0]!.estimate.tokensCompletion).toBe(700); // 2 sections
  });

  it('AN UNPRICED MODEL IS `null`, and the total refuses to be a number', () => {
    // T-254: zero is a price, null is nobody priced it. A total summed over an
    // unpriced step would be a partial figure wearing a total's name.
    const unpriced = plan({ rates: undefined });
    expect(unpriced.steps[0]!.estimate.cost).toBeNull();
    expect(unpriced.cost).toEqual({ total: null, priced: false });
  });

  it('caps the prompt estimate at the assembly budget — it cannot describe a call that cannot happen', () => {
    const enormous = plan({ sourceCount: 10_000 });
    expect(enormous.steps[0]!.estimate.tokensPrompt).toBe(12000);
  });

  it('refuses IN THE PLAN when nothing is bound to draft from', () => {
    // ADR-0053 §5 — the pathological case, said before any spend rather than as
    // a caveat under an empty document
    expect(plan({ sourceCount: 0 }).refusal).toContain('No sources are bound');
    expect(plan().refusal).toBeNull();
  });
});

// T-406 (ADR-0053 addendum A1) — the plan SAYS what the run will do that the
// step list cannot show, and states the ruled precedence before the click.
describe('the plan states the four answers and the style precedence (T-406)', () => {
  it('says what it is writing, in which register', () => {
    const notes = plan({
      purpose: 'external-document',
      language: 'simple-english',
      documentType: 'chapter',
    }).notes!;
    expect(notes[0]).toContain('an external document');
    expect(notes[0]).toContain('chapter');
    expect(notes[0]).toContain('Simple English');
  });

  it('states the RULED PRECEDENCE when guides are selected, in the shared words', () => {
    const notes = plan({ styleGuideCount: 2 }).notes!;
    expect(notes.join(' ')).toContain('2 project style guides');
    // the one exported constant the drafting prompt also uses — a second copy
    // is how two copies start resolving the conflict differently
    expect(notes.join(' ')).toContain(STYLE_PRECEDENCE);
  });

  it('says so when none was selected rather than falling silent', () => {
    const notes = plan({ styleGuideCount: 0 }).notes!;
    expect(notes.join(' ')).toContain('No style guide was selected');
    // nothing to resolve, so no resolution is asserted
    expect(notes.join(' ')).not.toContain(STYLE_PRECEDENCE);
  });

  it('is still identical for identical answers — the declared guarantee holds', () => {
    const answers = { purpose: 'planning-document' as const, styleGuideCount: 1 };
    expect(plan(answers)).toEqual(plan(answers));
  });
});

// T-408 (ADR-0053 addendum A2) — the plan proposes a document, and what the
// author edits is a PARAMETER. The determinism test is the load-bearing one:
// it is the whole reason a brief may be conversationally revised at all.
describe('the plan is the proposed document (T-408)', () => {
  it('states the overarching instructions, then one description per section', () => {
    const proposal = plan().proposal!;
    expect(proposal.overview).toContain('does the baseline support the assessment?');
    expect(proposal.overview).toContain('2 sections');
    expect(proposal.overview).toContain('3 bound sources');
    expect(proposal.sections.map((section) => section.heading)).toEqual([
      'Purpose',
      'The evidence',
    ]);
    // a computed description says what will go in, and the constraint every
    // sentence in it is held to
    expect(proposal.sections[0]!.brief).toContain('why.');
    expect(proposal.sections[0]!.brief).toContain('anything the record does not support is left out');
  });

  it('takes the author’s own wording over its own, and says which is which', () => {
    const edited = plan({
      sections: [
        { heading: 'Purpose', purpose: 'why', brief: 'No — set out X in bullets.' },
        { heading: 'The evidence', purpose: 'what' },
      ],
    }).proposal!;
    expect(edited.sections[0]!.brief).toBe('No — set out X in bullets.');
    expect(edited.sections[0]!.edited).toBe(true);
    // 🔒 and the OTHER section is untouched — editing one description does not
    // redraw the rest
    expect(edited.sections[1]!.brief).toBe(plan().proposal!.sections[1]!.brief);
    expect(edited.sections[1]!.edited).toBe(false);
  });

  it('🔒 regenerates the STEP LIST from the new brief and leaves it computed', () => {
    // ADR-0053 §12 is not reopened: a brief is one more input, and the steps
    // are what the inputs produce. Editing a brief must change the plan
    // WITHOUT any hand-editing of a step ever having happened.
    const before = plan();
    const after = plan({
      sections: [
        { heading: 'Purpose', purpose: 'why', brief: 'Something else entirely.' },
        { heading: 'The evidence', purpose: 'what' },
      ],
    });
    expect(after.steps).toEqual(before.steps);
    expect(after.proposal!.sections[0]!.brief).not.toBe(before.proposal!.sections[0]!.brief);
  });

  // T-409's cross-door claim — an agent tweak and a hand edit produce one
  // plan — is NOT tested here, because at this layer it cannot be: the planner
  // sees a brief, never a door, so any two calls with the same literal are the
  // determinism test below wearing a stronger name (a first version of this
  // suite did exactly that, caught in review). The real assertion runs the
  // actual agent endpoint and parse path: document-creation.test.ts, T-409.
  it('is identical for identical parameters, briefs included', () => {
    const params = {
      sections: [
        { heading: 'Purpose', purpose: 'why', brief: 'A corrected description.' },
        { heading: 'The evidence', purpose: 'what' },
      ],
    };
    expect(plan(params)).toEqual(plan(params));
  });
});

describe('coverage is stated twice, in the same shape (ADR-0053 §5)', () => {
  it('before the run: what it WILL cover', () => {
    expect(coverageBefore(2, 3)).toBe('2 sections · 3 bound sources · 1 drafting pass');
    // singular, because a coverage sentence that reads wrongly is one nobody
    // trusts the numbers in
    expect(coverageBefore(2, 1)).toBe('2 sections · 1 bound source · 1 drafting pass');
  });

  it('after it: what it DID, and the absences the document itself cannot show', () => {
    expect(
      coverageAfter({
        sectionsWritten: 1,
        sectionsPlanned: 2,
        sourcesUsed: 1,
        sourcesBound: 3,
        unreachableSources: 1,
        withheld: 2,
        outsideOutline: 0,
      }),
    ).toBe(
      '1 of 2 sections written · 1 of 3 bound sources used · 1 drafting pass · 1 named source the library did not return · 2 sentences withheld for resting on no source',
    );
  });

  // T-402 — the defect this clause exists for: a run whose prose matched no
  // heading reported a section written into a document with none. The
  // corrected sentence says zero sections and says where the words went,
  // in the shape the checker states its discards.
  it('states material written outside the outline rather than counting it as a section', () => {
    expect(
      coverageAfter({
        sectionsWritten: 0,
        sectionsPlanned: 4,
        sourcesUsed: 1,
        sourcesBound: 1,
        unreachableSources: 0,
        withheld: 0,
        outsideOutline: 3,
      }),
    ).toBe(
      '0 of 4 sections written · 1 of 1 bound sources used · 1 drafting pass · 3 sentences written outside the outline and left out of the document',
    );
  });

  it('says it in the singular when one sentence fell outside', () => {
    expect(
      coverageAfter({
        sectionsWritten: 2,
        sectionsPlanned: 2,
        sourcesUsed: 1,
        sourcesBound: 1,
        unreachableSources: 0,
        withheld: 0,
        outsideOutline: 1,
      }),
    ).toBe(
      '2 of 2 sections written · 1 of 1 bound sources used · 1 drafting pass · 1 sentence written outside the outline and left out of the document',
    );
  });

  it('says nothing about absences there were none of', () => {
    expect(
      coverageAfter({
        sectionsWritten: 2,
        sectionsPlanned: 2,
        sourcesUsed: 3,
        sourcesBound: 3,
        unreachableSources: 0,
        withheld: 0,
        outsideOutline: 0,
      }),
    ).toBe('2 of 2 sections written · 3 of 3 bound sources used · 1 drafting pass');
  });
});
