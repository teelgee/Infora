// T-428 — FOUR KINDS OF FIVE STOP COSTING A MODEL CALL (ADR-0054 decisions 4
// and 6).
//
// *In plain terms: the writing check gets cheaper and more certain, because
// most of a style guide's rules can now be settled by ordinary code. A rule
// about a word, a date format or a sentence length is arithmetic; only a rule
// needing judgement — "prefer the active voice" — costs a call to the AI.*
//
// 🔒 **SCOPE AND EXCEPTIONS ARE HONOURED, OR THE CHECK GETS SWITCHED OFF.**
// Without them, *use "scheme", not "project"* fires on **the Project Board** and
// on every quoted document title, and the consultant turns the terminology
// check off — which is the whole reason ADR-0054 decision 4 gives exceptions two
// typed halves. The masking pass below is where that promise is kept: excepted
// contexts are blanked out of the text before any rule looks at it, and excepted
// terms are blanked out per rule.
//
// 🔒 **THE MASK PRESERVES OFFSETS.** Every excepted span is replaced with the
// same number of spaces rather than removed, so a match's index into the masked
// text is its index into the real text — which is what lets a finding anchor at
// T-271's locator grain without a second search that could find the wrong
// occurrence.
//
// 🔒 **A FINDING'S EVIDENCE FOLLOWS THE RULE'S ORIGIN, AND ONLY THAT** (decision
// 3). An **extracted** rule quotes the client's guide, byte for byte, out of the
// clause it points at. A **typed** or **Infora-proposed** rule has no client
// wording and its finding says what it rests on instead — because an invented
// quotation is worse than an absent one, and on screen the two look identical.
//
// 🔒 **ADR-0053 §2's CHECK FAMILIES DO NOT CHANGE.** The kinds route into them:
// term, pattern and judgement report through **style**, structure through
// **completeness**, measured through **readability** (scored, outliers flagged,
// never pass/fail). A sixth family would have been the easy move and it would
// have made the launcher's switches stop matching the ADR.
import type {
  CheckFamily,
  ExceptedContext,
  FindingEvidence,
  FindingSeverity,
  RuleKind,
  RuleOrigin,
  RuleRegister,
  RuleScope,
} from '@infora/contracts';
import type { DraftFinding, DraftSection } from './workers/qa-sections';
import { anchorInto } from './workers/qa-sections';
import { usablePattern } from './rule-extraction';

/**
 * One accepted rule, as the checker holds it.
 *
 * `clauseWording` and `styleGuideId` are present exactly when the origin is
 * `extracted`, because that is the pointer ADR-0048 §5's quotation resolves
 * through. The type does not enforce the pairing — the store's CHECK does — but
 * `evidenceFor` below reads them together and never separately.
 */
export type AcceptedRule = {
  id: string;
  kind: RuleKind;
  origin: RuleOrigin;
  statement: string;
  scope: RuleScope;
  exceptedContexts: readonly ExceptedContext[];
  exceptedTerms: readonly string[];
  register: RuleRegister;
  enforcement: 'raises_findings' | 'steers_only';
  severity: FindingSeverity;
  payload: {
    preferred?: string;
    replaces?: string[];
    definition?: string;
    expression?: string;
    caseSensitive?: boolean;
    requires?: string[];
    measure?: 'sentence-length' | 'reading-grade';
    target?: number;
    passExample?: string;
    failExample?: string;
  };
  /** the style guide this rule's set belongs to — the finding's `rulebookRef` */
  styleGuideId: string;
  /** extracted only: the guide's own address for the clause, or null */
  clause?: string | null;
  /** extracted only: the clause VERBATIM. This is what a finding quotes */
  clauseWording?: string;
};

/** Which check family a kind reports through. ADR-0053 §2 is unchanged. */
export const FAMILY_OF_KIND: Record<RuleKind, CheckFamily> = {
  term: 'style',
  pattern: 'style',
  judgement: 'style',
  structure: 'completeness',
  measured: 'readability',
};

/**
 * The evidence a finding from this rule carries.
 *
 * 🔒 **This is the whole of decision 3, in one function**, and it is deliberately
 * the only place a rule becomes evidence. An extracted rule quotes the clause's
 * stored text — never `statement`, which is Infora's restructuring of it. A
 * typed or Infora-proposed rule gets `draft` evidence, whose `basis` is *a
 * statement, never a link*: there is nothing external to point at, and a source
 * chip on a rule the client's guide never carried would be the render lie
 * ADR-0048 §5 forbids in the other direction.
 *
 * ⚠ **`draft` is used here for a third case** beyond the two T-310 named
 * (self-contradiction, and the draft against its own template). It is the
 * honest shape rather than a new one: `FindingInput` is a fixed union, widening
 * it is an owner decision, and `DraftEvidence` already means *measured against
 * something stated, with nothing to cite*. Recorded here and in
 * `contracts/finding.ts` rather than left for a reader to infer.
 */
export function evidenceFor(rule: AcceptedRule): FindingEvidence {
  if (rule.origin === 'extracted' && rule.clauseWording !== undefined) {
    return {
      input: 'rulebook',
      clause: rule.clause ?? 'unnumbered clause',
      // 🔒 the client's own words, out of our own copy of their document
      quote: rule.clauseWording,
      rulebookRef: rule.styleGuideId,
      // a project style guide's scope is the project, so a quoted clause is
      // shareable across the wall — that is the point of it (ADR-0053 §9)
      scope: 'project',
    };
  }
  return {
    input: 'draft',
    basis:
      rule.origin === 'typed'
        ? `a rule typed onto this project’s writing standard: “${rule.statement}”`
        : `a rule Infora proposed and this project accepted: “${rule.statement}”`,
  };
}

/** Whether a rule can raise a finding at all (decision 4). */
export const raisesFindings = (rule: AcceptedRule) => rule.enforcement === 'raises_findings';

/**
 * The rules a code pass runs, and the rules the model is asked about.
 *
 * `steers_only` rules are in **neither**: they improve the writing and generate
 * no noise nobody can act on, which is what marking them enforceable would have
 * been a silent lie about.
 */
export const deterministicRules = (rules: readonly AcceptedRule[]) =>
  rules.filter((rule) => raisesFindings(rule) && (rule.kind === 'term' || rule.kind === 'pattern'));

export const judgementRules = (rules: readonly AcceptedRule[]) =>
  rules.filter((rule) => raisesFindings(rule) && rule.kind === 'judgement');

export const structureRules = (rules: readonly AcceptedRule[]) =>
  rules.filter((rule) => raisesFindings(rule) && rule.kind === 'structure');

export const measuredRules = (rules: readonly AcceptedRule[]) =>
  rules.filter((rule) => raisesFindings(rule) && rule.kind === 'measured');

// ── the masking pass ────────────────────────────────────────────────────────

/** A fenced code block, or an inline span between backticks. */
const CODE = /```[\s\S]*?```|`[^`\n]*`/g;
/** Anything between quotation marks, straight or curly. */
const QUOTATION = /“[^”\n]*”|"[^"\n]*"|‘[^’\n]*’/g;
/** A bracketed or parenthesised aside — where a document title or a citation sits. */
const REFERENCE = /\[[^\]\n]*\]|\([^)\n]*\)/g;

/**
 * Blank out every excepted context, **preserving length**.
 *
 * Spaces rather than deletion, so an index into the mask is an index into the
 * real text. This is the cheapest correct answer and it is the same one the
 * spike's own analysis reaches for our matcher: masking, where the evaluated
 * external engine would use negated scopes.
 */
export function maskContexts(
  text: string,
  section: DraftSection,
  contexts: readonly ExceptedContext[],
): string {
  let masked = text;
  const blank = (pattern: RegExp) => {
    masked = masked.replace(pattern, (match) => ' '.repeat(match.length));
  };
  if (contexts.includes('code')) blank(CODE);
  if (contexts.includes('quotations')) blank(QUOTATION);
  if (contexts.includes('references')) blank(REFERENCE);
  if (contexts.includes('headings') && section.heading !== null) {
    // the section's own heading line, wherever it sits in the section's text
    const at = masked.indexOf(section.heading);
    if (at !== -1) {
      masked = `${masked.slice(0, at)}${' '.repeat(section.heading.length)}${masked.slice(at + section.heading.length)}`;
    }
  }
  return masked;
}

/**
 * Blank out this rule's excepted terms, **preserving length**.
 *
 * 🔒 This is the honest mechanism for proper names: *the Project Board* is
 * spared because somebody named it, not because software guessed it was a name
 * — which is the finding the Vale spike named as mattering most, and the reason
 * exceptions are two typed halves rather than one mixed list.
 */
export function maskTerms(text: string, terms: readonly string[]): string {
  let masked = text;
  for (const term of terms) {
    if (term.trim() === '') continue;
    let at = masked.toLowerCase().indexOf(term.toLowerCase());
    while (at !== -1) {
      masked = `${masked.slice(0, at)}${' '.repeat(term.length)}${masked.slice(at + term.length)}`;
      at = masked.toLowerCase().indexOf(term.toLowerCase(), at + term.length);
    }
  }
  return masked;
}

/**
 * Which parts of a section a rule of this scope may fire in, as spans of the
 * masked text.
 *
 * ADR-0053's *the unit of work is a property of each check* applied one level
 * down, at rule grain. `document`, `section`, `paragraph` and `sentence` all
 * admit the whole of a section's text — the grain is what the FINDING is about,
 * not what the matcher may read — while `heading`, `list`, `caption` and
 * `table` narrow to the lines that are one.
 */
export function scopedLines(
  text: string,
  section: DraftSection,
  scope: RuleScope,
): { start: number; end: number }[] {
  if (scope === 'document' || scope === 'section' || scope === 'paragraph' || scope === 'sentence') {
    return [{ start: 0, end: text.length }];
  }
  const spans: { start: number; end: number }[] = [];
  let at = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const isHeading =
      trimmed !== '' &&
      (/^#{1,6}\s+\S/.test(trimmed) ||
        (section.heading !== null && trimmed === section.heading.trim()));
    const isList = /^\s*([-*+•]|\d+[.)])\s+\S/.test(line);
    const isCaption = /^\s*(figure|table|plate)\s+\d+/i.test(line);
    const isTable = line.includes('|') && line.trim().startsWith('|');
    const wanted =
      (scope === 'heading' && isHeading) ||
      (scope === 'list' && isList) ||
      (scope === 'caption' && isCaption) ||
      (scope === 'table' && isTable);
    if (wanted) spans.push({ start: at, end: at + line.length });
    at += line.length + 1;
  }
  return spans;
}

// ── the two code passes over one section ────────────────────────────────────

/**
 * Run every term and pattern rule over one section, in code.
 *
 * **No model, no network, no cost.** A term finding carries a `replacement`, so
 * `classifyFix` at the store admits it to ADR-0053 §6's bulk lane — fifty-five
 * identical capitalisations are one decision applied fifty-five times. A
 * **pattern** finding deliberately carries none: a pattern says what is wrong
 * and not what to write, and a fix nobody proposed cannot be accepted in bulk.
 */
export function applyRulesToSection(
  content: string,
  section: DraftSection,
  rules: readonly AcceptedRule[],
): DraftFinding[] {
  const findings: DraftFinding[] = [];
  for (const rule of deterministicRules(rules)) {
    const masked = maskTerms(
      maskContexts(section.text, section, rule.exceptedContexts),
      rule.exceptedTerms,
    );
    const spans = scopedLines(masked, section, rule.scope);
    const hits = rule.kind === 'term' ? termHits(masked, rule) : patternHits(masked, rule);
    for (const hit of hits) {
      if (!spans.some((span) => hit.start >= span.start && hit.end <= span.end)) continue;
      // the anchor is cut from the REAL text at the mask's own offsets — the
      // mask is only ever used to decide where a rule may look
      const verbatim = section.text.slice(hit.start, hit.end);
      const anchor = anchorInto(content, section, verbatim);
      if (anchor === null) continue;
      findings.push({
        checkFamily: FAMILY_OF_KIND[rule.kind],
        anchor,
        severity: rule.severity,
        defect: hit.defect,
        evidence: evidenceFor(rule),
        ...(hit.replacement !== undefined && { replacement: hit.replacement }),
      });
    }
  }
  return findings;
}

type Hit = { start: number; end: number; defect: string; replacement?: string };

/** A term rule: the wordings it replaces, found whole-word. */
function termHits(masked: string, rule: AcceptedRule): Hit[] {
  const preferred = rule.payload.preferred ?? '';
  const hits: Hit[] = [];
  for (const wording of rule.payload.replaces ?? []) {
    if (wording.trim() === '') continue;
    const flags = rule.payload.caseSensitive === true ? 'gu' : 'giu';
    let pattern: RegExp;
    try {
      pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(wording)}(?![\\p{L}\\p{N}])`, flags);
    } catch {
      continue;
    }
    for (const match of masked.matchAll(pattern)) {
      // already the preferred wording, exactly: there is nothing to change, and
      // a finding here would be the false positive that gets a check turned off
      if (match[0] === preferred) continue;
      hits.push({
        start: match.index,
        end: match.index + match[0].length,
        defect:
          preferred === ''
            ? `“${match[0]}” is not the wording this project’s rules use.`
            : `This project’s rules use “${preferred}”, not “${match[0]}”.`,
        // a replacement makes this a MECHANICAL fix at the store — the same
        // substitution, applied consistently, displayable in one line
        ...(preferred !== '' && { replacement: preferred }),
      });
    }
  }
  return hits;
}

/**
 * A pattern rule: the expression, re-guarded here.
 *
 * 🔒 **Guarded at the run as well as at the save.** A pattern was checked when
 * it was accepted, but the check that matters is the one immediately before the
 * expression runs over somebody's draft — a rule set can outlive the code that
 * accepted it, and this is the loop that would hang.
 */
function patternHits(masked: string, rule: AcceptedRule): Hit[] {
  if (!usablePattern(rule.payload.expression)) return [];
  let pattern: RegExp;
  try {
    pattern = new RegExp(rule.payload.expression!, rule.payload.caseSensitive === true ? 'gu' : 'giu');
  } catch {
    return [];
  }
  const hits: Hit[] = [];
  for (const match of masked.matchAll(pattern)) {
    if (match[0] === '') continue;
    hits.push({
      start: match.index,
      end: match.index + match[0].length,
      // a pattern rule says what is wrong; it does not write the replacement,
      // so this finding is per-mark and never bulk-acceptable
      defect: rule.statement,
    });
  }
  // a rule that matches everything is a rule somebody mis-wrote, and reporting
  // two hundred findings from one of them is how the whole check gets ignored
  return hits.slice(0, MAX_HITS_PER_RULE);
}

/** How many times one rule may fire in one section before it is capped. */
export const MAX_HITS_PER_RULE = 50;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── the two whole-document passes ───────────────────────────────────────────

/**
 * Structure rules, over the draft's own headings — routed through
 * **completeness**, which is where "what a document must contain" already lives.
 */
export function applyStructureRules(
  content: string,
  sections: readonly DraftSection[],
  rules: readonly AcceptedRule[],
): DraftFinding[] {
  const first = sections[0];
  if (first === undefined) return [];
  const present = new Set(
    sections
      .map((section) => section.heading?.trim().toLowerCase())
      .filter((heading): heading is string => heading !== undefined && heading !== ''),
  );
  const findings: DraftFinding[] = [];
  for (const rule of structureRules(rules)) {
    for (const required of rule.payload.requires ?? []) {
      if (present.has(required.trim().toLowerCase())) continue;
      // a missing section has no span of its own — it is not there — so it
      // anchors at the head of the draft, which is where a reader must start
      const anchor = anchorInto(content, first, first.text.split('\n')[0] ?? '');
      if (anchor === null) continue;
      findings.push({
        checkFamily: 'completeness',
        anchor,
        severity: rule.severity,
        defect: `The draft has no section headed “${required}”, which this project’s rules require.`,
        evidence: evidenceFor(rule),
      });
    }
  }
  return findings;
}

/**
 * Measured rules — routed through **readability**, and therefore **scored with
 * outliers flagged, never pass/fail** (ADR-0053 §2, unchanged).
 *
 * That constraint is why a measured rule's finding is always `advisory`
 * whatever severity the rule carries: Flesch–Kincaid scores technical
 * infrastructure prose badly by construction, and a `required` finding off a
 * number would be a verdict the system is not entitled to give (ADR-0048 §3).
 */
export function applyMeasuredRules(
  content: string,
  sections: readonly DraftSection[],
  rules: readonly AcceptedRule[],
  grade: (text: string) => number,
): DraftFinding[] {
  const findings: DraftFinding[] = [];
  for (const rule of measuredRules(rules)) {
    const target = rule.payload.target;
    if (target === undefined) continue;
    for (const section of sections) {
      const measured =
        rule.payload.measure === 'reading-grade'
          ? grade(section.text)
          : longestSentenceWords(section.text);
      if (measured <= target) continue;
      const anchor = anchorInto(content, section, section.text.split('\n')[0] ?? '');
      if (anchor === null) continue;
      findings.push({
        checkFamily: 'readability',
        anchor,
        // 🔒 never `required` — see the block above
        severity: 'advisory',
        defect:
          rule.payload.measure === 'reading-grade'
            ? `This section reads at about grade ${measured.toFixed(1)}, against this project’s target of ${target}.`
            : `The longest sentence in this section runs to ${measured} words, against this project’s target of ${target}.`,
        evidence: evidenceFor(rule),
      });
    }
  }
  return findings;
}

function longestSentenceWords(text: string): number {
  let longest = 0;
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = sentence.trim().split(/\s+/).filter((word) => word !== '').length;
    if (words > longest) longest = words;
  }
  return longest;
}
