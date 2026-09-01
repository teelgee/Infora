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

// ── T-407 — THE OUTLINE IS COMPOSED (ADR-0053 addendum A1) ──────────────────
//
// *In plain terms: the outline no longer arrives ready-made from a template.
// The author builds it — add a section, say what it should contain ("an
// introductory section setting out X, Y and Z"), add the next. A template can
// still be chosen as a starting point, and choosing one fills the sections in
// so they can be edited or thrown away, but it never locks anything.*
//
// This is T-335's own spec coming back through the front door, **as re-cut by
// A1**: sections carry a purpose each, and **source binding stays
// whole-document** — the per-section binding half of T-335's spec is
// superseded, and the walkthrough's gap card closes to this design rather than
// to the old one.

/**
 * One section of the outline the author composed.
 *
 * `heading` is what a reader sees at the top of the section. `purpose` is what
 * the author says belongs in it — **scope, never a conclusion**, which is the
 * same rule a template's per-part guidance has always been held to: an outline
 * that told the drafting call what to find would make every document agree
 * with its outline rather than with its sources.
 */
export type DocumentSection = {
  heading: string;
  purpose: string;
  /**
   * T-408 (ADR-0053 addendum A2) — **the author's own words for what will be
   * written into this section**, replacing the one the planner computed.
   *
   * 🔒 **A BRIEF IS A PARAMETER, AND THE STEP LIST IS NOT.** This is the whole
   * of A2. The plan page shows a proposed document — an overview, then a short
   * description per section — and the author corrects any of those
   * descriptions before accepting. What they are editing is *this field*: one
   * more input to a plan that is still computed in code from its inputs. The
   * step list underneath regenerates and is editable by nobody, human or
   * model, so §4's guarantee (same inputs, same steps) holds and §12 is not
   * reopened.
   *
   * Absent means "the planner's own description stands", which is different
   * from an empty string and is why it is optional rather than defaulted.
   */
  brief?: string;
  /**
   * T-412 — the parts nested under this section, **one level deep**.
   *
   * Absent and empty mean the same thing here and both are ordinary: most
   * sections have no sub-sections. The type is `DocumentSubSection`, which
   * carries no nesting of its own — that is where V1's one-level rule is
   * enforced. See the block at the foot of this file.
   */
  subSections?: DocumentSubSection[];
};

/**
 * A starting outline this deployment carries — a template, as A1 leaves them:
 * **a seed, never a lock**. Choosing one pre-fills sections whose purposes are
 * its per-part guidance; every one of them can then be edited, reordered or
 * removed, and the author can start from nothing instead.
 */
export type StartingOutline = {
  id: string;
  label: string;
  description: string;
  sections: DocumentSection[];
};

export type ListStartingOutlinesResponse = { items: StartingOutline[] };

/**
 * T-408 (ADR-0053 addendum A2) — **the proposed document**: what the plan page
 * shows above the step list.
 *
 * *In plain terms: before anything runs, you read the document you are about
 * to get — a short overview of the instructions as a whole, then section by
 * section a short description of what will be written into each. Anything that
 * is wrong you correct there and then, and the plan redraws.*
 *
 * Computed in code from the run's parameters, like everything else in a plan.
 * `edited` says which descriptions the author (or the agent, T-409) replaced,
 * so a page that has been corrected does not read as one the planner wrote.
 */
export type ProposedDocument = {
  overview: string;
  /**
   * The outline **read flat**, parents before their children (T-412) — which
   * is also the order the document will carry them in. `depth` is 0 for a
   * section and 1 for a sub-section, so the page can show a sub-section under
   * its parent without a second traversal of its own; the index of an entry
   * here is the index a correction comes back on (`withBriefAt`).
   */
  sections: Array<{ heading: string; brief: string; edited: boolean; depth: 0 | 1 }>;
};

// ── T-412 — A SECTION CAN CARRY SUB-SECTIONS ────────────────────────────────
//
// *In plain terms: while composing the outline, an "add sub-section" under any
// section creates a nested part. A sub-section is a section of its own — it
// gets its own description on the plan, its own heading in the document, its
// own row in the manifest, and it is counted in both coverage sentences. What
// it also has, and a top-level section does not, is a parent.*
//
// 🔒 **ONE LEVEL, ENFORCED BY THE TYPE RATHER THAN BY A CHECK.** V1 allows a
// section to carry sub-sections and a sub-section to carry nothing. That is
// why `DocumentSubSection` is a separate type instead of `DocumentSection`
// recursing into itself: a recursive type would make "one level" a rule
// somebody has to remember at every site that reads an outline, and the first
// site to forget would produce a document with a depth the splitter, the
// manifest and the coverage count were never written for.
//
// 🔒 **EVERYTHING THAT COUNTS AN OUTLINE COUNTS IT FLAT.** The board's words:
// *the coverage sentence counts what the outline holds, at whatever depth*. So
// there is exactly one flattening — `flattenOutline` below — and the splitter,
// the manifest, the two coverage sentences, the plan's proposed document and
// the drafting prompt all read it. A second traversal written somewhere else
// is how two counts of one outline start disagreeing.

/**
 * A part nested under a section. The same three fields a section has, and
 * deliberately no `subSections` of its own — see the one-level lock above.
 */
export type DocumentSubSection = {
  heading: string;
  purpose: string;
  /** T-408's brief, at this depth too — a sub-section is separately drafted */
  brief?: string;
};

/**
 * One entry of an outline read flat, in the order the document will carry it:
 * a section, then its own sub-sections, then the next section.
 *
 * `parentHeading` is what makes a sub-section a section *with a parent* rather
 * than just another section: the manifest names it as "Parent — Child" so a
 * reader can find it, and the document writes it under its parent's heading.
 */
export type OutlineEntry = {
  heading: string;
  purpose: string;
  brief?: string;
  /** 0 for a section, 1 for a sub-section */
  depth: 0 | 1;
  /** null at depth 0 */
  parentHeading: string | null;
  /** the index of this entry's section in the top-level list */
  sectionIndex: number;
  /** null at depth 0; the index within the parent's `subSections` otherwise */
  subSectionIndex: number | null;
};

/**
 * 🔒 **THE ONE FLATTENING.** Reading order, parents before their children.
 *
 * Every counter, splitter and prompt in the creator goes through this function
 * rather than walking `sections` itself. A run's outline has one shape and one
 * length; two traversals is how a plan that promised four sections comes back
 * having written three and calls it a coverage statement.
 */
export function flattenOutline(sections: ReadonlyArray<DocumentSection>): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  sections.forEach((section, sectionIndex) => {
    entries.push({
      heading: section.heading,
      purpose: section.purpose,
      ...(section.brief !== undefined && { brief: section.brief }),
      depth: 0,
      parentHeading: null,
      sectionIndex,
      subSectionIndex: null,
    });
    (section.subSections ?? []).forEach((sub, subSectionIndex) => {
      entries.push({
        heading: sub.heading,
        purpose: sub.purpose,
        ...(sub.brief !== undefined && { brief: sub.brief }),
        depth: 1,
        parentHeading: section.heading,
        sectionIndex,
        subSectionIndex,
      });
    });
  });
  return entries;
}

/**
 * How a manifest and a plan name a sub-section: **under its parent**.
 *
 * `2025 survey` is a heading three sections of one outline could share;
 * `Baseline — 2025 survey` is the one a reader can find in the document. A
 * top-level section is named by itself, unchanged, so nothing about the flat
 * case moves.
 */
export function outlineEntryName(entry: OutlineEntry): string {
  return entry.parentHeading === null ? entry.heading : `${entry.parentHeading} — ${entry.heading}`;
}

/**
 * Set the brief at one **flattened** position, returning a new outline.
 *
 * The plan's proposed document is a flat list, so the surface's "correct this
 * description" arrives as a flat index — and T-409's agent revision goes
 * through the very same function, which is the guarantee A2 rests on: there is
 * one door into a brief, at every depth. An index outside the outline returns
 * the outline unchanged rather than throwing; a plan and a surface that have
 * drifted apart is a bug to see on screen, not a crash.
 */
export function withBriefAt(
  sections: ReadonlyArray<DocumentSection>,
  index: number,
  brief: string | undefined,
): DocumentSection[] {
  const target = flattenOutline(sections)[index];
  if (target === undefined) return [...sections];
  return sections.map((section, sectionIndex) => {
    if (sectionIndex !== target.sectionIndex) return section;
    if (target.subSectionIndex === null) return setBrief(section, brief);
    return {
      ...section,
      subSections: (section.subSections ?? []).map((sub, subIndex) =>
        subIndex === target.subSectionIndex ? setBrief(sub, brief) : sub,
      ),
    };
  });
}

/**
 * One part with its brief set, or **removed** where none was given.
 *
 * Removed rather than set to `undefined`, because absent is a meaning here:
 * *"the planner's own description stands"*. A key present and holding
 * `undefined` would survive `JSON.stringify` as nothing and survive a
 * structural comparison as something, which is precisely the kind of
 * difference the two-doors-one-plan test exists to catch.
 */
function setBrief<T extends { brief?: string }>(part: T, brief: string | undefined): T {
  const next = { ...part };
  delete next.brief;
  return brief === undefined ? next : { ...next, brief };
}
