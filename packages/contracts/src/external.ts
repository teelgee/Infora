// Contracts §1b — untrusted external content (T-250, finding F3).
//
// THE BARRIER IS A TYPE, NOT A RULE. `web_research` (T-279) reads public web
// pages; a prompt injection in a fetched page is a live threat, and the whole
// safety case is that the worker holding the injected text never holds corpus
// data. That case cannot rest on a convention, because a convention is one
// helpful refactor away from gone.
//
// So an external source is a DIFFERENT TYPE from an AssembledItem, structurally
// incompatible with it, and **there is no conversion function anywhere in this
// repository**. Writing one is the thing code review exists to catch, and
// packages/external/fixtures holds files that must fail to compile, checked on
// every build, so the mistake is not expressible rather than merely discouraged.
//
// The orchestrator is the only place the two ever meet, and it meets them as
// two separate fields — never a shared context window (docs/build/plan.md — Slice Ask Wave 3).
import type { Id } from './shared';

/**
 * A public web source, returned by `web_research` and by nothing else.
 *
 * `trust` is a constant, never computed: there is no publisher reputable
 * enough for fetched text to become corpus content, because the property that
 * matters is not the publisher's honesty but that the text was never subject
 * to the project's access control.
 */
export type ExternalSource = {
  url: string;
  publisher: string;
  title: string;
  publishedDate: string | null;
  retrievedAt: string;
  excerpt: string;
  relevance: string;
  trust: 'external-untrusted';
};

/**
 * What a reader sees a claim rest on. The four registers are rendered visibly
 * differently — by chip shape and colour, never by tooltip (docs/build/plan.md — Slice Ask Wave 8,
 * T-296): a reader skim-reading must be able to tell a web source from a
 * project document without hovering.
 */
export type CitationRegister = 'record' | 'inference' | 'authority' | 'external';

/**
 * A user-pinned `web` attached source is a POINTER — a URL or query the user
 * typed, stored in `attached_sources.ref` and read by nothing (ADR-0022 as
 * built, unchanged by the 2026-07-29 carve-out: web *research* results are
 * citable in the external register; user-pinned web attached sources are not).
 *
 * The kind was reserved in the schema before anything enforced what could be
 * done with it. This is that enforcement, stated in the type system: the only
 * type that can ever carry fetched web content is ExternalSource above, and it
 * cannot enter assembly. A pinned pointer is not content.
 */
export type PinnedWebPointer = { attachedSourceId: Id; ref: string };
