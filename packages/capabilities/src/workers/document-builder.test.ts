// T-406 — THE DRAFTING PROMPT NOW CARRIES STYLE AND REGISTER, AND THAT IS
// ASSERTED RATHER THAN ASSUMED.
//
// *In plain terms: until this ticket, the thing that wrote a draft was never
// shown the project's writing rules. They existed only for the checker, which
// meant the product could tell you that you had broken a rule it had never
// told the writer about. These tests are the proof that the rules now reach
// the writer — the board's word for it was "asserted, not assumed", and a
// prompt is exactly the kind of thing that goes quietly wrong while every
// other test stays green.*
import { describe, expect, it } from 'vitest';
import { STYLE_PRECEDENCE } from '@infora/contracts';
import { composeTemplatePrompt } from './document-builder';
import type { DocumentTemplate } from './templates';

const template: DocumentTemplate = {
  id: 'technical-note',
  version: 1,
  label: 'Technical note',
  description: 'A short note answering one question.',
  sections: [
    { id: 'purpose', heading: 'Purpose', guidance: 'Say what this answers.' },
    { id: 'evidence', heading: 'The evidence', guidance: 'Set out what the record says.' },
  ],
};

const character = (over: Partial<Parameters<typeof composeTemplatePrompt>[2]> = {}) => ({
  purpose: 'technical-note' as const,
  language: 'technical' as const,
  documentType: 'whole-document' as const,
  styleClauses: [],
  anyStyleGuideLoaded: false,
  ...over,
});

const prompt = (over: Partial<Parameters<typeof composeTemplatePrompt>[2]> = {}) =>
  composeTemplatePrompt(template, 'does the baseline support the assessment?', character(over));

describe('the drafting prompt consumes the style guides (T-406)', () => {
  const clauses = [
    { clause: '4.2', heading: 'Terminology', text: 'Write “made ground”, never “fill”.' },
    { clause: null, heading: null, text: 'Do not use the first person.' },
  ];

  it('carries every selected clause verbatim, with its address where it has one', () => {
    const html = prompt({ styleClauses: clauses, anyStyleGuideLoaded: true });
    expect(html).toContain('Write “made ground”, never “fill”.');
    expect(html).toContain('4.2 Terminology');
    // a clause with no number is carried anyway rather than dropped — an
    // unlabelled rule is still a rule, it simply cannot be quoted by number
    expect(html).toContain('Do not use the first person.');
  });

  it('states the ruled precedence in the same words the plan uses', () => {
    // ADR-0053 addendum A1. One exported constant, so the prompt and the plan
    // cannot drift into two resolutions of the same conflict.
    expect(prompt({ styleClauses: clauses, anyStyleGuideLoaded: true })).toContain(
      STYLE_PRECEDENCE,
    );
  });

  it('tells the difference between no guide selected and no guide loaded', () => {
    expect(prompt({ anyStyleGuideLoaded: true })).toContain('No style guide was selected');
    expect(prompt({ anyStyleGuideLoaded: false })).toContain('has no style guide loaded');
    // and in BOTH empty cases it forbids improvising a house style, which is
    // what a prompt silent on style would leave the model doing
    expect(prompt({ anyStyleGuideLoaded: true })).toContain('Do not invent house rules');
    expect(prompt({ anyStyleGuideLoaded: false })).toContain('Do not invent house rules');
  });

  it('states no precedence when there is nothing to resolve', () => {
    expect(prompt()).not.toContain(STYLE_PRECEDENCE);
  });
});

describe('the drafting prompt carries the register and the type (T-406)', () => {
  it('turns each register into an instruction, not a label', () => {
    expect(prompt({ language: 'technical' })).toContain('full technical register');
    expect(prompt({ language: 'non-technical' })).toContain('plain professional English');
    expect(prompt({ language: 'simple-english' })).toContain('short sentences');
  });

  it('tells a chapter and a section not to introduce what they are part of', () => {
    expect(prompt({ documentType: 'whole-document' })).toContain('stands alone');
    expect(prompt({ documentType: 'chapter' })).toContain('Do not re-introduce the project');
    expect(prompt({ documentType: 'section' })).toContain('begin at the subject');
  });

  it('names the kind of document it is writing', () => {
    expect(prompt({ purpose: 'external-document' })).toContain('external document');
    expect(prompt({ purpose: 'planning-document' })).toContain('planning document');
  });

  it('keeps everything the prompt already guaranteed', () => {
    // the grounding instructions are the reason this worker is trustworthy at
    // all; a style rewrite that lost one of them would look like a success
    const html = prompt();
    expect(html).toContain('carry its marker');
    expect(html).toContain('Write nothing the sources do not support');
    expect(html).toContain('Use the heading text exactly as given');
    expect(html).toContain('The evidence — Set out what the record says.');
  });
});
