// T-475 — the gap marker, and passage authorship (ADR-0048's amendment of
// 2026-10-24, ADR-0049 §7 as amended; CONTEXT.md **Gap marker**).
//
// *In plain terms: where the record could not support a sentence, the draft
// says so in the text itself, on a line of its own — "[Gap: the record does not
// give the made-ground thickness per parcel]" — instead of staying silent. It
// shows in the editor, in read views and in exports; the Checks tab counts it;
// promotion is refused while one is open.*
//
// **A gap is a line, not a node.** The structured text is a plain string — there
// is no node model to add a "gap node" to — so the marker is a convention in the
// text, recognised by ONE function (`gapMarkers`) that every consumer shares:
// the editor's mirror layer, the read-view renderer, the exported renditions,
// the checker's section splitter and the promotion gate. A person may type one;
// it is text, and it counts the same.
//
// **Authorship is read, not stored.** The record keeps no link from a passage to
// the suggestion it came from, so `provenance` is computed when asked, by exact
// match of a paragraph against the accepted (or edited) suggestions. A paragraph
// edited after acceptance honestly falls to "written by hand". That is the limit.
import type { Id } from './shared';

/** One whole line: `[Gap: <text>]`, nothing else on it. Anything inline in a
 * sentence, an empty marker, or a different word is a look-alike and ignored. */
const GAP_LINE = /^[ \t]*\[Gap:[ \t]*([^\n]*?)[ \t]*\][ \t]*$/;

export type GapMarker = {
  /** what the record does not give, as written */
  text: string;
  /** the line's offsets in the content (end is exclusive, the newline not included) */
  start: number;
  end: number;
  /** 1-based line number, for a jump-to that does not need the offsets */
  line: number;
};

/** The text of a single line if it is a gap marker, else null. */
export function parseGapLine(line: string): string | null {
  const match = GAP_LINE.exec(line);
  if (match === null) return null;
  const text = match[1]!.trim();
  return text === '' ? null : text;
}

/** Every gap marker in a text, in order. THE one place a gap is recognised. */
export function gapMarkers(content: string): GapMarker[] {
  const found: GapMarker[] = [];
  let start = 0;
  let line = 1;
  for (const raw of content.split('\n')) {
    const text = parseGapLine(raw.replace(/\r$/, ''));
    if (text !== null) found.push({ text, start, end: start + raw.replace(/\r$/, '').length, line });
    start += raw.length + 1;
    line += 1;
  }
  return found;
}

/**
 * The line the drafting chain writes for a claim the ground-check withheld. The
 * wording is the withheld claim's own — never a model's invention — flattened to
 * one line and with its brackets softened so it cannot close the marker early.
 */
export function gapLineFor(withheldClaim: string): string {
  const flat = withheldClaim
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:\-–—]+/, '') // a claim split off a marker can start on stray punctuation
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/"/g, "'") // the line quotes the claim in double quotes, so none may sit inside
    .trim();
  const clipped = flat.length > 220 ? `${flat.slice(0, 217).trimEnd()}…` : flat;
  // a quotation of a REJECTED proposal: the author sees what was unsupported,
  // and the line can never be read as a statement of fact
  return `[Gap: the record does not support "${clipped === '' ? 'a claim' : clipped}"]`;
}

/**
 * A text with every gap-marker line blanked to spaces, keeping the length and so
 * every offset. A gap line quotes a sentence the record REJECTED; it must never
 * enter the search index, so ingest chunks this and never the raw text.
 */
export function blankGapLines(text: string): string {
  return text
    .split('\n')
    .map((line) => (parseGapLine(line.replace(/\r$/, '')) === null ? line : ' '.repeat(line.length)))
    .join('\n');
}

// ── Paragraphs, and who wrote them ─────────────────────────────────────────

export type Paragraph = { text: string; start: number; end: number };

/** Paragraphs as the editor shows them: blocks separated by a blank line.
 * Offsets index the original content; the text is trimmed. */
export function paragraphsOf(content: string): Paragraph[] {
  const out: Paragraph[] = [];
  const separator = /\n[ \t]*\n/g;
  let from = 0;
  const push = (to: number) => {
    const raw = content.slice(from, to);
    const text = raw.trim();
    if (text !== '') {
      const lead = raw.length - raw.trimStart().length;
      out.push({ text, start: from + lead, end: from + lead + text.length });
    }
  };
  for (let m = separator.exec(content); m !== null; m = separator.exec(content)) {
    push(m.index);
    from = m.index + m[0].length;
  }
  push(content.length);
  return out;
}

export type PassageOrigin = 'agent' | 'hand';

export type PassageProvenance = {
  /** the paragraph's offsets in the current content */
  start: number;
  end: number;
  origin: PassageOrigin;
  /** agent: the run that drafted it, and who accepted it and when */
  runId: Id | null;
  draftedAt: string | null;
  acceptedByName: string | null;
  acceptedAt: string | null;
  /** the person accepted it after editing the proposal */
  edited: boolean;
  /** hand: who last saved the document, and when */
  savedByName: string | null;
  savedAt: string | null;
};

export type DocumentProvenanceResponse = { documentId: Id; passages: PassageProvenance[] };

const day = (iso: string | null) => (iso === null ? null : iso.slice(0, 10));

/** The one sentence a person reads — the editor's hover card and the export
 * appendix both use it, so the two never word the same fact differently. */
export function provenanceStatement(
  p: PassageProvenance,
  /** the export appendix names the run in full; the hover card abbreviates it */
  opts: { fullRunId?: boolean } = {},
): string {
  if (p.origin === 'agent') {
    const run =
      p.runId === null ? 'a run' : `run ${opts.fullRunId === true ? p.runId : p.runId.slice(0, 8)}`;
    const drafted = day(p.draftedAt) === null ? '' : ` on ${day(p.draftedAt)}`;
    const who = p.acceptedByName ?? 'a participant';
    const when = day(p.acceptedAt) === null ? '' : ` on ${day(p.acceptedAt)}`;
    return p.edited
      ? `Drafted by the agent in ${run}${drafted}, edited and accepted by ${who}${when}`
      : `Drafted by the agent in ${run}${drafted}, accepted by ${who}${when}`;
  }
  const who = p.savedByName ?? 'an unrecorded participant';
  const when = day(p.savedAt) === null ? '' : ` on ${day(p.savedAt)}`;
  // the person who saved the paragraph into the form it holds now (the history
  // is walked back while this exact text is still there), not the document's last saver
  return `Written by hand — by ${who}${when}`;
}
