// T-299 — a validated Lens file rendered as prompt text.
//
// This is the only place a Lens becomes words a model reads, and it is
// deliberately a pure function of the Lens: no store, no slice, no request. It
// composes ON TOP OF the shared core, never in place of it — the caller
// (`composeSystemPrompt` in @infora/capabilities) puts the core first, states
// the precedence explicitly, and then appends this.
//
// What is NOT rendered, and why: `preferred_workers` is a planner hint, not
// something the drafting model can act on, and putting it in a prompt would
// invite the model to reason about capabilities it does not dispatch. It
// arrives at the planner as data when there is a planner (T-266/T-269).
import type { Lens } from '@infora/contracts';

const JARGON: Record<Lens['register']['jargon'], string> = {
  peer: 'Use the field\'s technical vocabulary freely; this reader is a peer.',
  explained: 'Use technical vocabulary, then explain it briefly at first use.',
  avoided: 'Avoid technical vocabulary; find the plain-English equivalent.',
};

const ACRONYMS: Record<Lens['register']['acronyms'], string> = {
  unexpanded: 'Acronyms stand unexpanded.',
  'first-use-expanded': 'Expand each acronym on first use, then use the short form.',
  avoided: 'Avoid acronyms; write the thing out or find a plainer phrase.',
};

const DEPTH: Record<Lens['defaultDepth'], string> = {
  high: 'Depth: high — this reader wants the reasoning, not only the conclusion.',
  medium: 'Depth: medium — the reasoning where it changes the answer, summarised elsewhere.',
  low: 'Depth: low — summary first; detail only where the reader would be misled without it.',
};

const OUTPUT: Record<Lens['defaultOutput'], string> = {
  prose: 'Default shape: prose.',
  table: 'Default shape: a table, with prose only where a table would mislead.',
  'bullet-brief': 'Default shape: a short bulleted brief.',
  'draft-text': 'Default shape: draft text the reader can use directly.',
  'qa-pairs': 'Default shape: question-and-answer pairs.',
};

const CITATIONS: Record<Lens['citationDisplay'], string> = {
  inline: 'Citations sit inline, at the claim they support.',
  footnote: 'Citations sit as footnotes beneath the answer.',
  appendix: 'Citations are collected in an appendix at the end.',
};

/**
 * The overlay for one Lens: register, shape, escalation phrasing and the
 * Lens's own additional prohibitions.
 *
 * `prohibitions` are rendered as ADDITIONAL — the word is doing real work. A
 * Lens cannot subtract from the shared core (the validator refuses a file that
 * tries), and the prompt says so in the same voice, so a model reading only
 * this block cannot infer that the list is exhaustive.
 */
export function composeLensOverlay(lens: Lens): string {
  const parts: string[] = [
    `Write for this reader: ${lens.register.readingLevel}`,
    [JARGON[lens.register.jargon], ACRONYMS[lens.register.acronyms]].join(' '),
    DEPTH[lens.defaultDepth],
    OUTPUT[lens.defaultOutput],
    CITATIONS[lens.citationDisplay],
  ];

  if (lens.answerShape.length > 0) {
    parts.push(
      [
        'Order the answer like this — the first item is what it leads with, and leading with the wrong thing is the difference between an answer that lands and one that has to be re-read:',
        ...lens.answerShape.map((line, at) => `  ${at + 1}. ${line}`),
        'Omit any of these that has no material behind it. Never fill a section to complete the shape.',
      ].join('\n'),
    );
  }

  if (lens.escalationLanguage.length > 0) {
    parts.push(
      [
        'When flagging risk to this reader, phrase it in this register — these are examples of the wording, not a list of the risks worth reporting, which is unchanged:',
        ...lens.escalationLanguage.map((line) => `  - ${line}`),
      ].join('\n'),
    );
  }

  if (lens.prohibitions.length > 0) {
    parts.push(
      [
        'This reader\'s Lens adds these prohibitions to the rules above. They are additional; nothing above is relaxed by them:',
        ...lens.prohibitions.map((line) => `  - ${line}`),
      ].join('\n'),
    );
  }

  return parts.join('\n\n');
}
