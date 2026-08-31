// T-280 — `document_builder`: the declaration, and the prompt that turns a
// template plus explicit sources into a draft.
//
// **THE BUILDER DOES NOT RETRIEVE.** `sources` is `{version_ids}`, explicit,
// never "whatever you find": the orchestrator hands it ids it got from
// `corpus_retrieval`. That is not tidiness — it is what keeps the label
// computation TRACTABLE and the manifest HONEST. A builder that chose its own
// sources would be computing a propagation label over a set nobody declared,
// and the manifest would be a description of a search rather than a record of
// what the document rests on.
//
// **The `label` output is not decoration — it is the evidence that propagation
// happened** (finding F2, T-249). A write path that refused correctly and said
// nothing would be indistinguishable, to everyone downstream, from one that
// never checked.
//
// The declaration lives here beside the other workers; the IMPLEMENTATION lives
// in `@infora/orchestration`, because this worker WRITES and `capabilities`
// holds no `Db` by design. That split is the same one the draft leaf already
// makes for the same reason.
import type {
  DocumentLanguage,
  DocumentPurpose,
  DocumentSection,
  DocumentType,
  WorkerDeclaration,
} from '@infora/contracts';
import { STYLE_PRECEDENCE, purposeLabel } from '@infora/contracts';

export const DOCUMENT_BUILDER: WorkerDeclaration = {
  name: 'document_builder',
  purpose:
    'Draft a document into a named template from an explicit set of library sources, recording what each source was used for.',
  tier: 'frontier',
  inputSchema: {
    sections: 'the outline the author composed — a heading and a purpose each',
    brief: 'what this document is for, in the requester’s own words',
    // T-406 (ADR-0053 addendum A1) — the launcher's four answers, declared here
    // because a worker's inputs are its contract with the executor
    purpose: 'what kind of document this is — technical note, planning, internal, external',
    language: 'the register — technical, non-technical or Simple English',
    document_type: 'whole document, chapter or section',
    style_guide_ids:
      'which of the project’s style guides this document is written to; empty is a real answer',
    sources: 'the version ids to draw on — explicit; this worker does not search',
    destination: 'the sandbox this document is written into',
  },
  outputSchema: {
    document_id: 'the sandbox document written, or null where the write was withheld',
    manifest: 'every source used, with what it was used for',
    label: 'the computed access label, the input that set it, and the destination’s',
    withheld: 'claims that resolved to no source and were not written',
    unreachableSources:
      'named sources the gateway did not return — a named document that produced nothing is a failure, never a silence (T-274’s rule)',
  },
  tools: ['template store', 'document store write'],
  reach: 'inherited',
  scopeNote: 'user ∩ project ∩ deliverable visibility, plus write to the named sandbox',
  leaf: true,
  writes: true,
  // a write is never served from a cache: the destination's audience is a live
  // access fact, and a cached label is a cached access decision (T-249)
  cacheable: false,
  externalEgress: false,
  requiresAuthorityShelf: false,
};

/**
 * T-406 — the four launcher answers, as the prompt needs them, plus the style
 * material the drafting call now consumes.
 *
 * **Until T-406 the drafting call read NO style material at all** — project
 * style guides existed only for the checker to mark a finished draft against,
 * which meant the product could tell you that you had broken a rule it had
 * never told the writer about. This closes that: what the checker marks
 * against, the drafting call is now given.
 */
export type DraftingCharacter = {
  purpose: DocumentPurpose;
  language: DocumentLanguage;
  documentType: DocumentType;
  /**
   * The clauses of the guides the author selected, verbatim and in reading
   * order. Empty means either no guide was selected or none is loaded, and the
   * prompt says which — silence would leave the model to assume house style.
   */
  styleClauses: ReadonlyArray<{ clause: string | null; heading: string | null; text: string }>;
  /** whether this project has any style guide loaded at all */
  anyStyleGuideLoaded: boolean;
};

/** How the register reads as an instruction, not as a label. */
const REGISTER_INSTRUCTION: Record<DocumentLanguage, string> = {
  technical:
    'Write in full technical register for a reader in the discipline. Use the discipline’s own vocabulary without glossing it.',
  'non-technical':
    'Write in plain professional English for an informed reader outside the discipline. Where a technical term is unavoidable, say what it means the first time.',
  'simple-english':
    'Write in Simple English: short sentences, one idea each, everyday words wherever an everyday word will do, and any technical term explained in the same sentence.',
};

/** What the document is, as the drafting call needs to hear it. */
const TYPE_INSTRUCTION: Record<DocumentType, string> = {
  'whole-document':
    'This is a whole document. It stands alone and introduces its own subject.',
  chapter:
    'This is a chapter of a larger document. Do not re-introduce the project or restate the document’s overall purpose.',
  section:
    'This is one section of a chapter. Carry no framing of its own — begin at the subject.',
};

/**
 * The system prompt.
 *
 * **T-407 — the outline is the AUTHOR'S, not a template's.** The headings and
 * the per-section purposes travel verbatim, exactly as a template's guidance
 * used to, and are held to the same rule the template authoring guide states:
 * a purpose says what belongs in a section, **never what to conclude**. An
 * outline that told the drafting call what to find would make every document
 * agree with its outline rather than with its sources — which is the failure
 * this whole tool exists to avoid.
 *
 * The source markers are the same `[S#]` convention the draft leaf uses, so the
 * ground-check and the citation resolver need no second parser.
 *
 * 🔒 **THE PRECEDENCE IS A SENTENCE, NOT AN ORDERING** — the same rule
 * `guiding.ts` states for the checker's prompt, and for the same reason: a
 * model reading a house rule and a register instruction that disagree has
 * nothing in the order of them to say which governs. `STYLE_PRECEDENCE` is one
 * exported constant so the prompt, the plan and the tests read the same words.
 */
export function composeDraftingPrompt(
  sections: ReadonlyArray<DocumentSection>,
  brief: string,
  character: DraftingCharacter,
): string {
  return [
    `You are drafting a ${purposeLabel(character.purpose).toLowerCase()}. ${TYPE_INSTRUCTION[character.documentType]}`,
    '',
    `The brief: ${brief}`,
    '',
    REGISTER_INSTRUCTION[character.language],
    '',
    ...styleBlock(character),
    'Write the document under these headings, in this order:',
    // T-408 — the AUTHOR'S corrected description wins, where they gave one.
    // A correction the plan showed and the draft ignored would be the worst of
    // both: a page that invited an edit and a document that did not take it.
    // Where they gave none, the section's purpose stands — the planner's
    // computed description is derived from that same purpose plus boilerplate
    // about register and grounding, both of which this prompt already carries
    // above, and re-injecting them would be saying it twice.
    ...sections.map(
      (section, at) => `  ${at + 1}. ${section.heading} — ${section.brief ?? section.purpose}`,
    ),
    '',
    'Every sentence must rest on one of the numbered sources and carry its marker, e.g. [S2].',
    'Write nothing the sources do not support: a sentence with no source is removed before anyone reads it, so an unsupported sentence is wasted rather than persuasive.',
    'Use the heading text exactly as given, on its own line, before that section’s sentences.',
  ].join('\n');
}

/**
 * The style half, and **its empty cases are stated rather than skipped**.
 *
 * A prompt that simply said nothing about style would leave the model to fall
 * back on whatever house voice it has, and the author would have no way to tell
 * that from a guide having been followed. So: no guide loaded says so, none
 * selected says so, and the difference between the two is kept — one is a
 * project that has not been set up, the other is an author's choice.
 */
function styleBlock(character: DraftingCharacter): string[] {
  if (character.styleClauses.length === 0) {
    return [
      character.anyStyleGuideLoaded
        ? 'No style guide was selected for this document, so follow the register instruction above and ordinary professional convention. Do not invent house rules.'
        : 'This project has no style guide loaded, so follow the register instruction above and ordinary professional convention. Do not invent house rules.',
      '',
    ];
  }
  return [
    'Write to these style-guide clauses, which are the rules this document will be checked against:',
    ...character.styleClauses.map((clause) => {
      const address = [clause.clause, clause.heading].filter(Boolean).join(' ');
      return `  • ${address ? `${address} — ` : ''}${clause.text}`;
    }),
    '',
    STYLE_PRECEDENCE,
    '',
  ];
}
