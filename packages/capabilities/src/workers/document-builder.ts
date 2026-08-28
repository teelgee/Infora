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
import type { WorkerDeclaration } from '@infora/contracts';
import type { DocumentTemplate } from './templates';

export const DOCUMENT_BUILDER: WorkerDeclaration = {
  name: 'document_builder',
  purpose:
    'Draft a document into a named template from an explicit set of library sources, recording what each source was used for.',
  tier: 'frontier',
  inputSchema: {
    template_id: 'the outline to draft into (the shipped template set)',
    brief: 'what this document is for, in the requester’s own words',
    sources: 'the version ids to draw on — explicit; this worker does not search',
    destination: 'the sandbox this document is written into',
  },
  outputSchema: {
    document_id: 'the sandbox document written, or null where the write was withheld',
    manifest: 'every source used, with what it was used for',
    label: 'the computed access label, the input that set it, and the destination’s',
    withheld: 'claims that resolved to no source and were not written',
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
 * The system prompt. The template's headings and guidance travel verbatim; the
 * source markers are the same `[S#]` convention the draft leaf uses, so the
 * ground-check and the citation resolver need no second parser.
 */
export function composeTemplatePrompt(template: DocumentTemplate, brief: string): string {
  return [
    `You are drafting a "${template.label}". ${template.description}`,
    '',
    `The brief: ${brief}`,
    '',
    'Write the document under these headings, in this order:',
    ...template.sections.map(
      (section, at) => `  ${at + 1}. ${section.heading} — ${section.guidance}`,
    ),
    '',
    'Every sentence must rest on one of the numbered sources and carry its marker, e.g. [S2].',
    'Write nothing the sources do not support: a sentence with no source is removed before anyone reads it, so an unsupported sentence is wasted rather than persuasive.',
    'Use the heading text exactly as given, on its own line, before that section’s sentences.',
  ].join('\n');
}
