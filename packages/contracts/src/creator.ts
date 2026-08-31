// T-406 — THE DOCUMENT CREATOR'S FOUR QUESTIONS (ADR-0053 addendum A1,
// owner-ruled 2026-08-31).
//
// *In plain terms: the creator's first screen used to ask for a "shape", which
// meant picking one of two document templates. It now asks four plain
// questions instead — what kind of document this is, what language it should
// be written in, which of the project's style guides apply, and whether you
// are writing a whole document, a chapter or a section. Those four answers
// travel with the run and shape the drafting.*
//
// **`shape` is retired as a term and as a mechanism.** The word survives
// nowhere: not as a control, not as a field, not as a label. The two shipped
// templates survive only as **optional starting outlines** for the sections
// step (T-407), which is a different thing wearing a different name.
//
// This lives in `contracts` rather than beside the planner because **the
// launcher renders it** and a surface sees `contracts` and `ui` alone — the
// same reason `checker.ts`'s families live here. A catalogue the launcher
// cannot name is a set of answers nobody can give.
//
// 🔒 **THE ANSWERS ARE RUN PARAMETERS, NOT INSTRUCTIONS TO A PLANNER.** They
// are recorded on the run and carried into the manifest, and the step list is
// computed in code from them (ADR-0053 §4). Same answers, same steps — which
// is the whole of what a *declared* workflow is sold on.

/**
 * What kind of document this is. It sets the register's floor and the audience,
 * and — with `type` below — is what the drafting call is told it is writing.
 *
 * The four are the owner's own words from the ruling, kept verbatim rather than
 * generalised: *technical note*, *planning document*, *internal document*,
 * *external document*. The last two are about **who reads it**, not about what
 * is in it, and that is deliberate — a note written for a client's engineer and
 * the same note written for a regulator are not the same document.
 */
export const DOCUMENT_PURPOSES = [
  'technical-note',
  'planning-document',
  'internal-document',
  'external-document',
] as const;
export type DocumentPurpose = (typeof DOCUMENT_PURPOSES)[number];

/**
 * The language register. **This is the answer that wins on register** when it
 * disagrees with a style guide (A1's ruled precedence, restated in the plan).
 */
export const DOCUMENT_LANGUAGES = ['technical', 'non-technical', 'simple-english'] as const;
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number];

/**
 * Whole document, chapter or section. It changes what the drafting call thinks
 * it is producing: a chapter does not open by introducing the project, and a
 * section does not carry the chapter's own framing.
 */
export const DOCUMENT_TYPES = ['whole-document', 'chapter', 'section'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type CreatorOption<T extends string> = {
  value: T;
  /** what a consultant would call it */
  label: string;
  /** what choosing it does, in the words the launcher shows */
  description: string;
};

export const DOCUMENT_PURPOSE_CATALOGUE: readonly CreatorOption<DocumentPurpose>[] = [
  {
    value: 'technical-note',
    label: 'Technical note',
    description: 'A short, self-contained answer to one technical question from the record.',
  },
  {
    value: 'planning-document',
    label: 'Planning document',
    description: 'Sets out what will be done, by whom and when, rather than what was found.',
  },
  {
    value: 'internal-document',
    label: 'Internal document',
    description: 'Written for your own firm. It may reason aloud and leave questions open.',
  },
  {
    value: 'external-document',
    label: 'External document',
    description:
      'Written to leave your firm. Every statement stands on its own and nothing is left half-said.',
  },
];

export const DOCUMENT_LANGUAGE_CATALOGUE: readonly CreatorOption<DocumentLanguage>[] = [
  {
    value: 'technical',
    label: 'Technical',
    description: 'Full technical vocabulary, for a reader in the discipline.',
  },
  {
    value: 'non-technical',
    label: 'Non-technical',
    description: 'Plain professional English for an informed reader outside the discipline.',
  },
  {
    value: 'simple-english',
    label: 'Simple English',
    description: 'Short sentences and everyday words, for the widest possible readership.',
  },
];

export const DOCUMENT_TYPE_CATALOGUE: readonly CreatorOption<DocumentType>[] = [
  {
    value: 'whole-document',
    label: 'Whole document',
    description: 'Stands alone, and introduces its own subject.',
  },
  {
    value: 'chapter',
    label: 'Chapter',
    description: 'Part of a larger document. It does not re-introduce the project.',
  },
  {
    value: 'section',
    label: 'Section',
    description: 'Part of a chapter. It carries no framing of its own.',
  },
];

export const DEFAULT_DOCUMENT_PURPOSE: DocumentPurpose = 'technical-note';
export const DEFAULT_DOCUMENT_LANGUAGE: DocumentLanguage = 'technical';
export const DEFAULT_DOCUMENT_TYPE: DocumentType = 'whole-document';

/**
 * 🔒 **THE RULED PRECEDENCE, IN ONE SENTENCE, AND IT GOES ON THE PLAN.**
 *
 * A1: *"a style guide wins on terms and vocabulary; the author's Language
 * answer wins on register — and the plan states both"*. It is stated rather
 * than merely applied because a resolution the user discovers in the output is
 * one they cannot argue with beforehand. Exported as one constant so the
 * prompt, the plan and any test are reading the same words: a second copy is
 * how two copies start disagreeing.
 */
export const STYLE_PRECEDENCE =
  'Where a style guide and the language you chose disagree, the guide wins on terms and vocabulary and your language answer wins on register.';

export function purposeLabel(value: DocumentPurpose): string {
  return DOCUMENT_PURPOSE_CATALOGUE.find((option) => option.value === value)!.label;
}

export function languageLabel(value: DocumentLanguage): string {
  return DOCUMENT_LANGUAGE_CATALOGUE.find((option) => option.value === value)!.label;
}

export function typeLabel(value: DocumentType): string {
  return DOCUMENT_TYPE_CATALOGUE.find((option) => option.value === value)!.label;
}
