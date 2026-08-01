// Contracts — the Lens (T-281; CONTEXT.md; docs/build/plan.md, Wave 4).
//
// A Lens is HOW AN ANSWER READS, never what a user can reach. It changes
// register, depth, ordering and follow-ups; it changes no permission, no
// corpus and no source set. "Role" is taken (Membership role, ADR-0015/0016),
// so the persona is a Lens — and nothing here may be implemented as a `role`
// field.
//
// The shape lives in contracts because three layers need it and none of them
// may depend on each other: `@infora/lenses` loads and validates the files,
// the API carries `lensId` on a run and echoes the picker's options, and the
// web surface renders the chip. What is deliberately ABSENT is any field a
// reach control could hide in — no scope, no filter, no corpus, no visibility.
// A Lens that could narrow retrieval would be a security control wearing a
// preference's clothes, and the signature test in `@infora/lenses` pins that.

export type LensStatus = 'active' | 'draft'; // draft loads in non-production only
export type LensJargon = 'peer' | 'explained' | 'avoided';
export type LensAcronyms = 'unexpanded' | 'first-use-expanded' | 'avoided';
export type LensDepth = 'high' | 'medium' | 'low';
export type LensOutput = 'prose' | 'table' | 'bullet-brief' | 'draft-text' | 'qa-pairs';
export type LensCitationDisplay = 'inline' | 'footnote' | 'appendix';

export type LensRegister = {
  jargon: LensJargon;
  acronyms: LensAcronyms;
  readingLevel: string; // who this reader is and what they already know
};

// 2–3 worked pairs per active Lens. They become behaviour eval cases (T-282),
// which is what keeps a register difference from being cosmetic.
export type LensExampleExchange = {
  question: string;
  answerSketch: string;
  why: string;
};

export type Lens = {
  id: string; // kebab-case, never reused
  label: string;
  description: string;
  status: LensStatus;
  version: number; // bumped on any change; recorded per request on the plan
  register: LensRegister;
  defaultDepth: LensDepth;
  answerShape: string[]; // ORDERED — the first entry is what the answer leads with
  defaultOutput: LensOutput;
  citationDisplay: LensCitationDisplay;
  clarifyingBias: string[]; // ORDERED — the priority ambiguities get asked about
  escalationLanguage: string[]; // phrasing for risk; never whether risk is reported
  preferredWorkers: string[]; // a RANKING HINT for the planner, never an entitlement
  prohibitions: string[]; // ADDITIVE to the shared core, never subtractive
  exampleExchanges: LensExampleExchange[];
};

// What the picker needs and nothing more — the surface never receives the
// prohibitions or the worked exchanges, which are prompt material.
export type LensSummary = Pick<Lens, 'id' | 'label' | 'description' | 'version'>;
