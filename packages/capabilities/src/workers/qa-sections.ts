// T-310 — HOW A DRAFT IS CUT INTO SECTIONS, and the two check families that
// are arithmetic rather than AI (ADR-0053 §2).
//
// *In plain terms: before the checker can read a document a section at a time,
// something has to decide where the sections are — and it has to decide the
// same way every time, or the plan shown before the run would not describe the
// run. That is this file. It also holds the two checks that involve no AI at
// all: how hard each section is to read, and whether anything the template
// expects is missing or still says "TBC".*
//
// 🔒 **EVERYTHING HERE IS DETERMINISTIC, AND THAT IS LOAD-BEARING RATHER THAN
// TIDY.** ADR-0053 §4 rules the planner code because a model-decided run shape
// would make the same document produce different plans on different days,
// losing the one guarantee (same inputs, same steps, same order) a declared
// workflow is sold on. The planner's *width* is the section count, so a section
// splitter that consulted a model would move the non-determinism one file
// along and leave the guarantee just as gone. T-336's planner-determinism test
// runs through here.
//
// **Two of the five families cost nothing** (ADR-0053 §2), and under ADR-0027
// they are *doing* steps: classified at design time, deterministic, and
// incapable of the failure mode a model has. A checker described as "N model
// calls" was describing half of itself.
import type {
  CheckFamily,
  FindingSeverity,
  Locator,
} from '@infora/contracts';
import { DEFAULT_READABILITY_TARGET, parseGapLine } from '@infora/contracts';
import type { DocumentTemplate } from './templates';

/**
 * One section of a draft, with the offsets everything else anchors against.
 *
 * `start` and `end` are character offsets into the document's own `content`,
 * because that is what `Locator.span` means everywhere else in the system
 * (T-271). A section that carried its text and not its offsets would force
 * every anchor to be searched for a second time, and a search that found the
 * wrong occurrence would produce a mark on the wrong paragraph.
 */
export type DraftSection = {
  /** 1-based, and the number the plan and the findings both speak in */
  index: number;
  /** the heading line as the draft writes it; null where the draft has none */
  heading: string | null;
  start: number;
  end: number;
  /** the section's text INCLUDING its heading line, exactly as stored */
  text: string;
};

/**
 * T-475 — a text with every gap-marker line blanked out, keeping the length (and
 * so every offset). A gap is the draft saying "the record does not give this";
 * it is never a sentence to be checked as a claim, a heading, placeholder text
 * or reading-ease prose. Every model-facing and every counting read of a
 * section goes through this.
 */
export function checkableText(text: string): string {
  return text
    .split('\n')
    .map((line) => (parseGapLine(line.replace(/\r$/, '')) === null ? line : ' '.repeat(line.length)))
    .join('\n');
}

/** Longest a line can be and still be read as a heading rather than a sentence. */
const HEADING_MAX = 120;
/** A markdown heading, whatever the draft's other conventions are. */
const ATX = /^#{1,6}\s+\S/;
/** A line ending like this is a sentence, not a heading. */
const SENTENCE_END = /[.,;:!?]$/;

/**
 * Cut a draft into sections, deterministically.
 *
 * **A heading is either an ATX heading, or a short line that opens a block** —
 * one preceded by a blank line (or the start of the document), not ending in
 * sentence punctuation, and short enough to be a title. That covers both the
 * shape `document_builder` writes (`heading\n\nbody`) and the far more common
 * one a person types (`heading\nbody`).
 *
 * ⚠ **The blank line BELOW was a condition and is deliberately not one.** It
 * was written against the builder's own output and fails on ordinary prose: a
 * numbered heading with its paragraph starting on the next line — which is how
 * most real chapters are written — was read as body text, so a whole document
 * became one section and the per-section fan-out never fired. Found by running
 * the planner over the walkthrough's own draft.
 *
 * **A draft with no headings is ONE section, and that is honest rather than a
 * fallback.** It is also what makes ADR-0053 §4's *short document → one pass,
 * all checks together* fall out of the same code path as the fan-out, instead
 * of being a special case somebody has to remember to write.
 */
export function splitIntoSections(content: string): DraftSection[] {
  const lines = content.split('\n');

  // offset of the first character of each line, so a heading's position is
  // arithmetic rather than a second search
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }

  const isHeading = (index: number): boolean => {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (parseGapLine(trimmed) !== null) return false; // T-475 — a gap is never a heading
    if (ATX.test(trimmed)) return true;
    if (trimmed.length > HEADING_MAX) return false;
    if (SENTENCE_END.test(trimmed)) return false;
    const before = index === 0 ? '' : lines[index - 1]!.trim();
    // opens a block: blank above, or the very top. A short unpunctuated line in
    // the MIDDLE of a paragraph is a wrapped line, not a heading.
    return before === '';
  };

  const starts = lines.map((_, index) => index).filter(isHeading);
  if (starts.length === 0) {
    return content.trim() === ''
      ? []
      : [{ index: 1, heading: null, start: 0, end: content.length, text: content }];
  }

  const sections: DraftSection[] = [];
  // anything before the first heading is a section in its own right — a
  // preamble dropped on the floor is material the run did not read while
  // reporting that it read the document
  if (starts[0]! > 0 && content.slice(0, offsets[starts[0]!]!).trim() !== '') {
    sections.push({
      index: 1,
      heading: null,
      start: 0,
      end: offsets[starts[0]!]!,
      text: content.slice(0, offsets[starts[0]!]!),
    });
  }
  for (const [nth, line] of starts.entries()) {
    const start = offsets[line]!;
    const next = starts[nth + 1];
    const end = next === undefined ? content.length : offsets[next]!;
    sections.push({
      index: sections.length + 1,
      heading: lines[line]!.trim().replace(/^#+\s*/, ''),
      start,
      end,
      text: content.slice(start, end),
    });
  }
  return sections;
}

/**
 * A `Locator` for a quote, resolved against the document's real text.
 *
 * 🔒 **THE MODEL SUPPLIES A QUOTE AND NEVER AN OFFSET**, which is what makes an
 * anchor unforgeable: a quote that is not in the section resolves to nothing
 * and its finding is dropped (ADR-0048 §2 — a finding that does not point into
 * the text is a report, not a tool). `verbatim` is then read back out of the
 * document rather than copied from the model, so the mark and the text under it
 * cannot disagree even by a space.
 *
 * `page` is absent, and that is not an omission: a sandbox document has no
 * pagination to derive one from (T-328's own note on the field).
 */
export function anchorInto(content: string, section: DraftSection, quote: string): Locator | null {
  const needle = quote.trim();
  if (needle === '') return null;
  const within = section.text.indexOf(needle);
  if (within === -1) return null;
  const start = section.start + within;
  const end = start + needle.length;
  return {
    span: { start, end },
    // `paragraph` is the count of newlines before the span, which is the
    // derivation used everywhere else (T-271)
    paragraph: countNewlines(content, start),
    verbatim: content.slice(start, end),
  };
}

function countNewlines(text: string, before: number): number {
  let count = 0;
  for (let at = 0; at < before; at += 1) if (text[at] === '\n') count += 1;
  return count;
}

// ── THE CODE FAMILIES ───────────────────────────────────────────────────────

/**
 * What a code family produces before anything is stored: everything a finding
 * needs except the ids only a store can mint.
 */
export type DraftFinding = {
  checkFamily: CheckFamily;
  anchor: Locator;
  defect: string;
  severity: FindingSeverity;
  evidence: import('@infora/contracts').FindingEvidence;
  /**
   * The text this finding proposes in place of `anchor.verbatim`, where it
   * proposes anything. It becomes a **Suggestion** at the store (ADR-0048 §3),
   * and `classifyFix` decides at that same boundary whether it may be accepted
   * in bulk — never the model (ADR-0053 §6).
   */
  replacement?: string;
};

export type ReadabilityScore = { section: number; heading: string | null; grade: number };

/**
 * READABILITY — arithmetic, per section, against a project target, **never
 * pass/fail** (ADR-0053 §2).
 *
 * Flesch–Kincaid scores technical infrastructure prose badly by construction:
 * *"groundwater vulnerability"* is four syllables of ordinary domain
 * vocabulary, and a document written correctly for its audience will score
 * badly all the way through. So this reports **outliers against the draft's own
 * median as well as the target**, and every finding is `advisory` and states
 * all three numbers. A reader can then see the difference between *this section
 * is denser than the rest of your document* and *your document reads like
 * this*, which a threshold alone destroys.
 *
 * The scores are returned **whether or not anything is flagged**, because the
 * coverage statement (ADR-0053 §5) has to be able to say the family ran.
 */
export function readabilityCheck(
  content: string,
  sections: readonly DraftSection[],
  target: number = DEFAULT_READABILITY_TARGET,
): { scores: ReadabilityScore[]; findings: DraftFinding[] } {
  const scores = sections.map((section) => ({
    section: section.index,
    heading: section.heading,
    grade: fleschKincaidGrade(checkableText(section.text)),
  }));
  if (scores.length === 0) return { scores, findings: [] };

  const median = medianOf(scores.map((score) => score.grade));
  const findings: DraftFinding[] = [];
  for (const [nth, score] of scores.entries()) {
    // BOTH conditions, deliberately: above the project's target AND denser than
    // the rest of this draft. Either alone flags a whole correctly-written
    // technical document, which is a verdict rather than a finding.
    if (score.grade <= target || score.grade <= median + 2) continue;
    const section = sections[nth]!;
    const anchor = anchorInto(content, section, firstLine(section));
    if (anchor === null) continue;
    findings.push({
      checkFamily: 'readability',
      anchor,
      severity: 'advisory',
      defect:
        `This section reads at about grade ${score.grade.toFixed(1)}, against the project’s ` +
        `target of ${target} and a median of ${median.toFixed(1)} across the rest of the draft. ` +
        `It is denser than the document around it rather than dense throughout.`,
      evidence: {
        input: 'draft',
        basis: `the project’s grade-${target} reading target, and this draft’s own median of ${median.toFixed(1)}`,
      },
    });
  }
  return { scores, findings };
}

/** Placeholder text, as it is actually left behind in drafts. */
const PLACEHOLDERS = [
  /\bTBC\b/g,
  /\bTBD\b/g,
  /\bTODO\b/g,
  /\bXXX+\b/g,
  /\?{3,}/g,
  /\[[^\]\n]{0,60}\]/g,
  /<insert[^>\n]{0,60}>/gi,
  /\blorem ipsum\b/gi,
];

export type CompletenessCoverage = {
  /** null where the run named no template — the half that did not run */
  missingSections: string[] | null;
  placeholders: number;
};

/**
 * COMPLETENESS — missing template sections and placeholder text (ADR-0053 §2).
 * Code, and no model call anywhere in it.
 *
 * **The template half is optional and its absence is stated, never assumed
 * away.** A sandbox document does not record the template it was drafted into,
 * and a run given none can still do the placeholder half honestly — so it does
 * that half and reports that the other did not run. Silently reporting
 * "complete" for a document nothing was compared against is the exact failure
 * ADR-0053 §5 exists to prevent, arriving through a fourth door.
 */
export function completenessCheck(
  content: string,
  sections: readonly DraftSection[],
  template?: DocumentTemplate,
): { coverage: CompletenessCoverage; findings: DraftFinding[] } {
  const findings: DraftFinding[] = [];
  const first = sections[0];

  let missingSections: string[] | null = null;
  if (template !== undefined) {
    const present = new Set(
      sections
        .map((section) => section.heading?.trim().toLowerCase())
        .filter((heading): heading is string => heading !== undefined && heading !== ''),
    );
    missingSections = template.sections
      .filter((section) => !present.has(section.heading.trim().toLowerCase()))
      .map((section) => section.heading);
    // A missing section has no span of its own to point at — it is not there.
    // It anchors at the head of the draft, which is where a reader must start
    // to fix it, and the defect names what is absent.
    if (first !== undefined) {
      for (const heading of missingSections) {
        const anchor = anchorInto(content, first, firstLine(first));
        if (anchor === null) continue;
        findings.push({
          checkFamily: 'completeness',
          anchor,
          severity: 'required',
          defect: `The draft has no section headed “${heading}”, which the ${template.label} template expects.`,
          evidence: {
            input: 'draft',
            basis: `the ${template.label} template’s “${heading}” section`,
          },
        });
      }
    }
  }

  let placeholders = 0;
  for (const section of sections) {
    for (const pattern of PLACEHOLDERS) {
      pattern.lastIndex = 0;
      for (const match of checkableText(section.text).matchAll(pattern)) {
        const found = match[0];
        // a bracketed citation-looking marker is placeholder-shaped and so is a
        // real cross-reference; the anchor and the words let the reviewer judge,
        // and the severity says it is theirs to judge
        const anchor = anchorInto(content, section, found);
        if (anchor === null) continue;
        placeholders += 1;
        findings.push({
          checkFamily: 'completeness',
          anchor,
          severity: 'required',
          defect: `“${found}” reads as placeholder text left in the draft.`,
          evidence: { input: 'draft', basis: 'placeholder text left in the draft' },
        });
      }
    }
  }

  return { coverage: { missingSections, placeholders }, findings };
}

/** The section's heading line, or its first non-empty line — something real to anchor on. */
function firstLine(section: DraftSection): string {
  for (const line of section.text.split('\n')) {
    if (line.trim() !== '') return line.trim();
  }
  return '';
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Flesch–Kincaid grade level: `0.39·(words/sentence) + 11.8·(syllables/word) − 15.59`.
 *
 * The syllable count is the standard vowel-group heuristic. It is approximate
 * and it is **deterministic**, which is the property that matters: an
 * approximate number that is the same every time can be compared across
 * sections and across runs, and an exact one that is not cannot.
 */
export function fleschKincaidGrade(text: string): number {
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  if (words.length === 0) return 0;
  const sentences = Math.max(1, (text.match(/[.!?](\s|$)/g) ?? []).length);
  const syllables = words.reduce((sum, word) => sum + syllablesIn(word), 0);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  // rounded to one place at the boundary rather than at every comparison, so
  // the number a finding states and the number the comparison used are one
  return Math.round(Math.max(0, grade) * 10) / 10;
}

function syllablesIn(word: string): number {
  const lower = word.toLowerCase().replace(/[^a-z]/g, '');
  if (lower.length === 0) return 0;
  if (lower.length <= 3) return 1;
  const trimmed = lower
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) ?? []).length);
}
