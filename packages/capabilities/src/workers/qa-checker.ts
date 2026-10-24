// T-310 — THE CHECKER'S MODEL FAMILIES: what one call holds, what it is told,
// and what of its answer is allowed through (ADR-0053 §2, §3).
//
// *In plain terms: three of the checker's five checks need the AI to read
// something. This file is what the AI is shown, and — more importantly — the
// rules that decide which of its answers are kept. A finding that does not
// point at real text in the draft is thrown away. A finding claiming a house
// rule is thrown away unless it names a rule we actually loaded, and the rule's
// words are then taken from our own copy rather than from the AI. A finding
// about the project record is thrown away unless it names a passage this run
// really retrieved.*
//
// 🔒 **THE ADMISSION RULES ARE THE TICKET.** ADR-0048 §2 makes anchoring
// non-optional, §5 makes a quoted rule verbatim, and §7 gives each input its
// own treatment — and none of those survives a model that is trusted to fill
// the fields in. So the model supplies a **quote** and a **marker**, never an
// offset and never a rule's text: an unresolvable quote is a finding with no
// anchor, an unresolvable marker is a finding with no evidence, and both are
// dropped and counted rather than admitted with a plausible blank in them. This
// is `extractor`'s rule — *a row that cites a passage this run did not see is
// not a row* — applied one capability along.
//
// **The grain is per family, not per run** (ADR-0053 §2). `qa_section_check`
// holds one section and everything that section is read against;
// `qa_contradiction_check` holds the section summaries and nothing else;
// `qa_document_check` holds the whole draft and runs no model at all. Three
// capabilities and not one, because ADR-0027 fixes code-or-model **per
// capability at design time** — a single capability spanning arithmetic and a
// model call would have no honest declaration to make.
import { namesRuleOrPassage } from '@infora/contracts';
import type {
  CheckFamily,
  Citation,
  FindingSeverity,
  Id,
  WorkerDeclaration,
} from '@infora/contracts';
import type { DraftFinding, DraftSection } from './qa-sections';
import { anchorInto, checkableText } from './qa-sections';

export const QA_SECTION_CHECK: WorkerDeclaration = {
  name: 'qa_section_check',
  purpose:
    'Read one section of a draft against the style guides that bind it and the project record it rests on, and return anchored findings.',
  tier: 'frontier',
  inputSchema: {
    sandbox_document_id: 'the draft under check',
    section: 'which section of it, by the planner’s own numbering',
    families: 'which of the per-section check families to run (style, corpus_accuracy)',
    depth: 'how hard the corpus check looks — quick or full',
    clause_pass: 'which slice of the style clauses this pass carries, where they did not fit in one',
    disprove: 'T-476 — true when the optional disproving pass is on: each model-read finding is argued against before it is returned',
  },
  outputSchema: {
    findings: 'anchored findings, each with the input it arose from and its evidence',
    withdrawn: 'T-476 — findings the disproving pass withdrew, with its reasoning; present only when the pass ran',
    summary: 'what this section asserts, for the self-contradiction call to compare',
    coverage: 'what this pass actually read — clauses, passages, and what it could not anchor',
  },
  tools: ['project indexes', 'document store read'],
  reach: 'inherited',
  scopeNote: 'user ∩ project ∩ deliverable visibility — resolved inside the gateway call',
  leaf: true,
  writes: false,
  cacheable: false,
  externalEgress: false,
  requiresAuthorityShelf: false,
};

export const QA_CONTRADICTION_CHECK: WorkerDeclaration = {
  name: 'qa_contradiction_check',
  purpose:
    'Compare what a draft’s sections assert against each other and return findings where they disagree.',
  tier: 'frontier',
  inputSchema: {
    sandbox_document_id: 'the draft under check',
    summaries: 'the section summaries the section checks produced as a by-product',
  },
  outputSchema: {
    findings: 'anchored findings, each naming both ends of the contradiction',
    coverage: 'how many summaries were compared, and in how many groups',
  },
  tools: [],
  reach: 'inherited',
  scopeNote: 'nothing is retrieved — the input is the draft’s own summaries',
  leaf: true,
  writes: false,
  cacheable: false,
  externalEgress: false,
  requiresAuthorityShelf: false,
};

export const QA_DOCUMENT_CHECK: WorkerDeclaration = {
  name: 'qa_document_check',
  purpose:
    'Score a draft’s readability against the project’s target, check it for missing template sections and placeholder text, and check that the sources its accepted suggestions cite are still the live current ones.',
  tier: 'triage',
  inputSchema: {
    sandbox_document_id: 'the draft under check',
    template_id: 'the template to check completeness against; absent runs the placeholder half only',
    readability_target: 'the project’s reading-level target',
  },
  outputSchema: {
    findings: 'anchored findings',
    coverage: 'the per-section scores, and which half of the completeness check ran',
  },
  tools: [],
  reach: 'inherited',
  // 🔒 CODE. ADR-0027 fixes this per capability at design time and the executor
  // reads the declaration rather than judging: this capability cannot become a
  // model call by anybody's runtime decision.
  scopeNote: 'nothing is retrieved and no model is called — arithmetic over the draft',
  leaf: true,
  writes: false,
  cacheable: true,
  externalEgress: false,
  requiresAuthorityShelf: false,
};

/**
 * One clause of one style source, as the checker holds it.
 *
 * `scope` is the whole reason this type exists rather than a bare string:
 * a **project** style guide binds every organisation on the project and quoting
 * it across the wall is the point of it, while an **organisation** rulebook is
 * the firm's own IP and a quote from it must never appear on a surface another
 * firm reads (ADR-0053 §9, ADR-0048 §6). The scope travels from here onto the
 * finding's evidence and is what the server's read enforces.
 */
export type StyleClause = {
  scope: 'project' | 'organisation';
  /** the style guide or rulebook this clause came from */
  rulebookRef: string;
  /** the clause address as the source numbers it; null where it has none */
  clause: string | null;
  heading: string | null;
  /** the rule, verbatim, as loaded. The model never supplies this */
  text: string;
};

/** One passage the corpus check was given, with what a Citation needs. */
export type CheckPassage = {
  versionId: Id;
  chunkId: Id | null;
  /** how the document is NAMED — a uuid is not something a reader can act on */
  documentReference: string | null;
  /** the passage as the gateway assembled it: what the model is actually shown */
  text: string;
  citationId: Id;
};

/** One attached document's excerpt (ADR-0022 — never grounds, never cited). */
export type CheckExcerpt = { attachedSourceId: Id; excerpt: string };

export type SectionCheckMaterial = {
  section: DraftSection;
  clauses: readonly StyleClause[];
  passages: readonly CheckPassage[];
  excerpts: readonly CheckExcerpt[];
  families: readonly CheckFamily[];
  /**
   * T-428 — **the accepted JUDGEMENT rules, and only those** (ADR-0054 decision
   * 6). Term, pattern, structure and measured rules never reach a model at all:
   * they are settled in code before this call is made, which is what makes four
   * kinds of five free. A judgement rule arrives as **one atomic statement,
   * answerable yes or no, with its scope bounded**, because two obligations
   * bundled into one rule get conflated and agreement drops sharply.
   */
  judgementRules?: readonly JudgementRule[];
  /**
   * How a judgement rule's id becomes a finding's evidence. Supplied by the
   * caller because only it holds the rule's ORIGIN and the clause store — and
   * because keeping evidence assembly in one function (`evidenceFor`) is what
   * stops a second answer to *does this finding quote the client's guide*.
   */
  judgementEvidence?: (ruleId: string) => import('@infora/contracts').FindingEvidence;
};

/**
 * One judgement rule, as the model is shown it (ADR-0054 decision 6).
 *
 * The examples are optional and carried because they are cheap and they work:
 * one that passes and one that fails pin a statement far better than more words
 * about it. The `id` never reaches the model — the model names a marker, and
 * the rule is resolved from OUR list, which is `qa_section_check`'s existing
 * rule for clauses applied to rules.
 */
export type JudgementRule = {
  id: string;
  statement: string;
  scope: string;
  passExample?: string;
  failExample?: string;
};

/**
 * What the model is told, and the precedence stated in a SENTENCE.
 *
 * ADR-0029's precedence — *the project style guide wins and firm know-how fills
 * in where the project is silent* — is not left to the order the clauses appear
 * in. Ordering is not an instruction: a model reading two conflicting house
 * rules has nothing in the order to tell it which one governs, which is the
 * same argument `guiding.ts` makes about the draft prompt and the same reason
 * ADR-0048's channel mislabel mattered at all.
 */
export function composeSectionCheckPrompt(material: SectionCheckMaterial): string {
  const wantsStyle = material.families.includes('style');
  const wantsCorpus = material.families.includes('corpus_accuracy');
  const judgement = wantsStyle ? (material.judgementRules ?? []) : [];
  const lines: string[] = [
    'You are checking one section of a draft written by a professional engineer or consultant.',
    'You report DEFECTS. You never grade the document, never give a verdict on it, and never rewrite it wholesale.',
    '',
    'Return ONE JSON object and nothing else:',
    '{"summary": "<one sentence: what this section ASSERTS, in facts and figures>",',
    ' "findings": [{"family": "style"|"corpus_accuracy",',
    '   "quote": "<text copied EXACTLY from the section — this is how the finding is anchored>",',
    '   "defect": "<what is wrong, as a defect and never a verdict>",',
    '   "severity": "required"|"advisory",',
    '   "rule": "<R# or J# — required for a style finding, else null>",',
    '   "source": "<S# or A# — required for a corpus_accuracy finding, else null>",',
    '   "replacement": "<the text you propose in place of the quote, or null>"}]}',
    '',
    'Rules that decide whether a finding is kept at all:',
    '  • `quote` must appear in the section EXACTLY as written there. A quote that does not is discarded.',
    '  • a style finding must name an R# or a J# from the rules below. Do not invent a rule and do not paraphrase one.',
    '  • answer each J# rule about this section as a yes or no. Report a finding ONLY where the section breaks it, and only where you can quote the words that break it.',
    '  • a corpus_accuracy finding must name an S# or A# from the material below. If the record says nothing about a statement, raise nothing — silence is not a finding.',
    '  • `severity` is `required` when the draft is wrong, unsupported, or contradicts something it is bound by; `advisory` when a reviewer may reasonably decline it.',
    '',
  ];

  if (wantsStyle && material.clauses.length > 0) {
    lines.push(
      'THE RULES THIS SECTION IS BOUND BY.',
      'Where a project rule and a firm rule conflict, THE PROJECT RULE GOVERNS, and the firm’s rules apply where the project’s are silent.',
      '',
    );
    for (const [nth, clause] of material.clauses.entries()) {
      const address = clause.clause === null ? '' : ` ${clause.clause}`;
      const whose = clause.scope === 'project' ? 'project style guide' : 'firm rulebook';
      lines.push(`[R${nth + 1}] (${whose}${address}) ${clause.text}`);
    }
    lines.push('');
  }

  if (wantsCorpus && (material.passages.length > 0 || material.excerpts.length > 0)) {
    lines.push('THE PROJECT RECORD, as retrieved for this section.', '');
    for (const [nth, passage] of material.passages.entries()) {
      lines.push(
        `[S${nth + 1}] (${passage.documentReference ?? 'library document'}) ${passage.text}`,
      );
    }
    for (const [nth, excerpt] of material.excerpts.entries()) {
      lines.push(`[A${nth + 1}] (attached by the user — not a project source) ${excerpt.excerpt}`);
    }
    lines.push('');
  }

  // T-428 — the judgement rules, ONE ATOMIC STATEMENT EACH, with the scope the
  // rule declares. Four of the five kinds are settled in code and never appear
  // here at all, which is the cost saving decision 4 predicts made visible: this
  // block is the only part of a style guide that still costs a call.
  if (judgement.length > 0) {
    lines.push(
      'THE JUDGEMENT RULES THIS SECTION IS BOUND BY. Each is one statement, answerable yes or no.',
      '',
    );
    for (const [nth, rule] of judgement.entries()) {
      lines.push(`[J${nth + 1}] (applies to each ${rule.scope}) ${rule.statement}`);
      if (rule.passExample !== undefined) lines.push(`      passes: ${rule.passExample}`);
      if (rule.failExample !== undefined) lines.push(`      fails: ${rule.failExample}`);
    }
    lines.push('');
  }

  lines.push('THE SECTION UNDER CHECK.', '', checkableText(material.section.text));
  return lines.join('\n');
}

/**
 * Why a section check's suggested findings were not kept.
 *
 * `noRuleOrPassage` (T-476) is a finding that named neither a rule nor a
 * passage; `withdrawn` (T-476, ADR-0053 A9) is one the optional disproving pass
 * argued wrong. The first three are counted into the coverage sentence's
 * "discarded for not pointing at real text or a real source"; the last is said
 * in its own words, because a withdrawn finding was real text and a real source
 * that the model, asked to argue the other side, talked itself out of.
 */
export type SectionDiscards = {
  unanchored: number;
  unknownRule: number;
  unknownSource: number;
  noRuleOrPassage: number;
  withdrawn: number;
};

/** What a section check returns, before anything is stored. */
export type SectionCheckResult = {
  findings: DraftFinding[];
  /** rides free as a by-product — the self-contradiction call's whole input */
  summary: string;
  coverage: {
    clausesRead: number;
    passagesRead: number;
    excerptsRead: number;
    /** findings the model produced that the admission rules refused, and why */
    discarded: SectionDiscards;
  };
};

/**
 * THE ADMISSION RULES, in code.
 *
 * Everything a finding needs that the model could get wrong is resolved here
 * against what the run actually holds. Nothing is repaired: a finding that
 * fails a rule is **discarded and counted**, because an admitted finding with a
 * guessed anchor or an invented rule is worse than no finding — it looks
 * checkable.
 */
export function admitSectionFindings(
  content: string,
  material: SectionCheckMaterial,
  raw: string,
): SectionCheckResult {
  const parsed = parseObject(raw);
  const discarded: SectionDiscards = {
    unanchored: 0,
    unknownRule: 0,
    unknownSource: 0,
    noRuleOrPassage: 0,
    withdrawn: 0,
  };
  const findings: DraftFinding[] = [];
  // T-476 — THE FIRST GATE. A finding that names neither a rule nor a passage is
  // dropped here and counted, so the writer's refusal is the backstop and never
  // the only gate. Everything this function raises is a model's reading, which
  // is also what the optional disproving pass is offered to.
  const raise = (finding: DraftFinding) => {
    const raised: DraftFinding = { ...finding, modelRaised: true };
    if (!namesRuleOrPassage(raised)) {
      discarded.noRuleOrPassage += 1;
      return;
    }
    findings.push(raised);
  };

  const rows = Array.isArray(parsed?.['findings']) ? (parsed['findings'] as unknown[]) : [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const entry = row as Record<string, unknown>;
    const family = text(entry['family']);
    if (family !== 'style' && family !== 'corpus_accuracy') continue;
    if (!material.families.includes(family)) continue;

    const anchor = anchorInto(content, material.section, text(entry['quote']));
    if (anchor === null) {
      discarded.unanchored += 1;
      continue;
    }
    const defect = text(entry['defect']);
    if (defect === '') continue;
    const severity: FindingSeverity = entry['severity'] === 'advisory' ? 'advisory' : 'required';
    const replacement = text(entry['replacement']);

    if (family === 'style') {
      // T-428 — a style finding may now name a JUDGEMENT RULE as well as a
      // clause, and the same admission rule governs both: an unresolvable
      // marker is a finding with no evidence, so it is dropped and counted
      // rather than admitted with a plausible blank in it.
      const marker = text(entry['rule']);
      const rule = (material.judgementRules ?? [])[markerIndex(marker, 'J')];
      if (rule !== undefined) {
        raise({
          checkFamily: 'style',
          anchor,
          defect,
          severity,
          // 🔒 supplied by the CALLER, from the accepted rule's own origin —
          // never by the model, and never assembled here. `evidenceFor` in
          // `rule-matcher.ts` is the one place a rule becomes evidence.
          evidence: material.judgementEvidence!(rule.id),
          ...(replacement !== '' && { replacement }),
        });
        continue;
      }
      const clause = material.clauses[markerIndex(marker, 'R')];
      if (clause === undefined) {
        discarded.unknownRule += 1;
        continue;
      }
      raise({
        checkFamily: 'style',
        anchor,
        defect,
        severity,
        // 🔒 THE QUOTE COMES FROM OUR OWN COPY OF THE CLAUSE, never from the
        // model. ADR-0048 §5 admits a verbatim quote precisely because it is
        // verbatim; a model-authored "quote" of a rule is a paraphrase wearing
        // quotation marks, and it would be unfalsifiable on screen.
        evidence: {
          input: 'rulebook',
          clause: clause.clause ?? clause.heading ?? 'unnumbered clause',
          quote: clause.text,
          rulebookRef: clause.rulebookRef,
          scope: clause.scope === 'project' ? 'project' : 'organisation',
        },
        ...(replacement !== '' && { replacement }),
      });
      continue;
    }

    const marker = text(entry['source']);
    const attached = material.excerpts[markerIndex(marker, 'A')];
    const passage = material.passages[markerIndex(marker, 'S')];
    if (attached !== undefined) {
      raise({
        checkFamily: 'corpus_accuracy',
        anchor,
        defect,
        severity,
        // ADR-0022 — never grounds, never cited. There is no Citation in this
        // shape to reach for, which is the type carrying the ruling.
        evidence: {
          input: 'attached',
          attachedSourceId: attached.attachedSourceId,
          excerpt: attached.excerpt,
        },
        ...(replacement !== '' && { replacement }),
      });
      continue;
    }
    if (passage === undefined) {
      discarded.unknownSource += 1;
      continue;
    }
    raise({
      checkFamily: 'corpus_accuracy',
      anchor,
      defect,
      severity,
      evidence: { input: 'corpus', citations: [citationOf(passage)] },
      ...(replacement !== '' && { replacement }),
    });
  }

  return {
    findings,
    summary: text(parsed?.['summary']),
    coverage: {
      clausesRead: material.clauses.length,
      passagesRead: material.passages.length,
      excerptsRead: material.excerpts.length,
      discarded,
    },
  };
}

/**
 * A finding from the corpus cites normally (ADR-0048 §7) — the same `Citation`
 * shape any other grounded claim carries, resolving to a locator inside the
 * source document. `documentReference` falls back to the version id only where
 * the library holds no reference for the document, because a citation with no
 * name on it is one a reader cannot act on.
 */
function citationOf(passage: CheckPassage): Citation {
  return {
    id: passage.citationId,
    ...(passage.chunkId !== null && { chunkId: passage.chunkId }),
    source: {
      versionId: passage.versionId,
      documentReference: passage.documentReference ?? passage.versionId,
    },
  };
}

// ── SELF-CONTRADICTION ──────────────────────────────────────────────────────

export type SectionSummary = { section: number; heading: string | null; summary: string };

/**
 * The one call, over the summaries (ADR-0053 §2).
 *
 * One call rather than one per section because each section's call already
 * returned a short summary of what that section asserts as a by-product — so
 * the comparison rides free, and the whole-document view that no per-section
 * call can have is bought for a single extra call rather than for N².
 */
export function composeContradictionPrompt(summaries: readonly SectionSummary[]): string {
  return [
    'Below are one-sentence summaries of what each section of one document asserts.',
    'Find places where two sections DISAGREE with each other — a figure that changes, a conclusion reversed, a commitment stated one way and then another.',
    'Report nothing where they merely differ in subject. Two sections saying different things about different topics is a document, not a contradiction.',
    '',
    'Return ONE JSON object and nothing else:',
    '{"findings": [{"section": <number>, "other_section": <number>,',
    '  "defect": "<what the two say, and why they cannot both hold>",',
    '  "severity": "required"|"advisory"}]}',
    '',
    ...summaries.map((entry) =>
      `[${entry.section}] ${entry.heading === null ? '' : `${entry.heading} — `}${entry.summary}`,
    ),
  ].join('\n');
}

/**
 * Admission for the contradiction call: **both ends must be real sections**,
 * and both are anchored.
 *
 * A contradiction naming only one of its two ends is half a finding — the
 * reviewer is told a conflict exists and left to find the other side, which is
 * exactly the friction ADR-0048 §2 made anchoring non-optional to remove.
 */
export function admitContradictionFindings(
  content: string,
  sections: readonly DraftSection[],
  raw: string,
): { findings: DraftFinding[]; discarded: number } {
  const parsed = parseObject(raw);
  const byIndex = new Map(sections.map((section) => [section.index, section]));
  const findings: DraftFinding[] = [];
  let discarded = 0;

  const rows = Array.isArray(parsed?.['findings']) ? (parsed['findings'] as unknown[]) : [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const entry = row as Record<string, unknown>;
    const here = byIndex.get(number(entry['section']));
    const there = byIndex.get(number(entry['other_section']));
    const defect = text(entry['defect']);
    if (here === undefined || there === undefined || here === there || defect === '') {
      discarded += 1;
      continue;
    }
    const anchor = anchorInto(content, here, headOf(here));
    const otherAnchor = anchorInto(content, there, headOf(there));
    if (anchor === null || otherAnchor === null) {
      discarded += 1;
      continue;
    }
    const contradiction: DraftFinding = {
      checkFamily: 'self_contradiction',
      anchor,
      defect,
      severity: entry['severity'] === 'advisory' ? 'advisory' : 'required',
      evidence: {
        input: 'draft',
        basis:
          there.heading === null
            ? `section ${there.index} of this draft`
            : `“${there.heading}”, section ${there.index} of this draft`,
        otherAnchor,
      },
      modelRaised: true,
    };
    if (!namesRuleOrPassage(contradiction)) {
      discarded += 1;
      continue;
    }
    findings.push(contradiction);
  }
  return { findings, discarded };
}

/** A section's heading line, or its first non-empty line — something to anchor on. */
function headOf(section: DraftSection): string {
  for (const line of section.text.split('\n')) if (line.trim() !== '') return line.trim();
  return '';
}

// ── THE DISPROVING PASS (T-476, ADR-0053 addendum A9) ───────────────────────
//
// *In plain terms: an optional second look. For each finding the AI raised by
// reading, it is asked a different question — "show me why this is wrong" —
// with the same text and the same rule or passage in front of it. If it can
// make the case, the finding is withdrawn before anyone sees it; the reason it
// gave is kept on the run, and the result says how many were withdrawn.*
//
// 🔒 **IT ONLY EVER REMOVES.** The pass cannot add, reword or re-anchor a
// finding, and an answer that is not exactly the expected shape leaves the
// finding standing — an unreadable answer is not an argument. Only the
// findings that rest on a model's reading are put to it; a finding settled in
// code is exact, and arguing with arithmetic would be theatre.

export type DisproveInput = {
  /** the section the finding sits in, exactly as the section check read it */
  sectionText: string;
  finding: Pick<DraftFinding, 'checkFamily' | 'defect' | 'anchor'>;
  /** the rule, clause or passage the finding rests on, in words */
  basis: string;
};

export function composeDisprovePrompt(input: DisproveInput): string {
  return [
    'You are testing a finding that an earlier reader raised against a draft. Your job is to argue that the finding is WRONG, using only the text below.',
    'If, after trying honestly, you cannot make the case, say that the finding holds. Do not soften a finding that holds, and do not invent a reason.',
    '',
    'Return ONE JSON object and nothing else:',
    '{"holds": true|false, "reasoning": "<one or two sentences: why it is wrong, or why you could not show it wrong>"}',
    '',
    `THE FINDING (${input.finding.checkFamily}): ${input.finding.defect}`,
    `THE TEXT IT POINTS AT: “${input.finding.anchor.verbatim}”`,
    '',
    'WHAT THE FINDING RESTS ON.',
    input.basis,
    '',
    'THE SECTION IT SITS IN.',
    '',
    checkableText(input.sectionText),
  ].join('\n');
}

/**
 * What the pass said: withdrawn only on an unambiguous `holds: false` with a
 * reason written down. Anything else — no JSON, no reason, `holds: true` — and
 * the finding stands.
 */
export function parseDisproveVerdict(raw: string): { withdrawn: boolean; reasoning: string } {
  const parsed = parseObject(raw);
  const reasoning = text(parsed?.['reasoning']);
  if (parsed?.['holds'] === false && reasoning !== '') return { withdrawn: true, reasoning };
  return { withdrawn: false, reasoning };
}

/**
 * The words for what a finding rests on, read off the material the section
 * check was given — the same rule or passage the first reader had, nothing more.
 */
export function disproveBasisOf(finding: DraftFinding, material: SectionCheckMaterial): string {
  const { evidence } = finding;
  if (evidence.input === 'rulebook') return `The rule (${evidence.clause}): ${evidence.quote}`;
  if (evidence.input === 'attached') return `An attached document says: ${evidence.excerpt}`;
  if (evidence.input === 'corpus') {
    const ids = new Set(evidence.citations.map((citation) => citation.id));
    const read = material.passages.filter((passage) => ids.has(passage.citationId));
    return read.length === 0
      ? 'A passage of the project record (not available to re-read).'
      : read.map((passage) => `The record says: ${passage.text}`).join('\n');
  }
  const rule = (material.judgementRules ?? []).find((candidate) => candidate.id === evidence.ruleId);
  return rule === undefined ? evidence.basis : `The rule: ${rule.statement}`;
}

// ── the small honest parsers ────────────────────────────────────────────────

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const number = (value: unknown): number =>
  typeof value === 'number' ? value : Number.parseInt(String(value), 10);

/** `S3` → 2, and anything else → -1, which resolves to `undefined` in an array. */
function markerIndex(marker: string, prefix: 'R' | 'S' | 'A' | 'J'): number {
  const match = new RegExp(`^\\[?${prefix}(\\d+)\\]?$`).exec(marker.trim());
  return match === null ? -1 : Number.parseInt(match[1]!, 10) - 1;
}

/**
 * The model's JSON, or nothing.
 *
 * A response that is not one object is not repaired and not partially read: a
 * checker that guessed at a malformed answer would report findings nobody made,
 * and the coverage statement can say a pass returned nothing far more honestly
 * than the findings list can carry an invention.
 */
function parseObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(raw.slice(start, end + 1));
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
