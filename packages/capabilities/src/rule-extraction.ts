// T-424 — AN UPLOADED STANDARD BECOMES PROPOSED RULES (ADR-0054 decisions 2, 4
// and 5).
//
// *In plain terms: you upload your writing standard and Infora reads it, pulls
// out the rules it contains, and sorts them by how each one can be enforced —
// including the ones your standard never wrote down for the kind of writing you
// picked. Nothing binds: this produces a list somebody then corrects.*
//
// 🔒 **SPLITTING IS THE WORK, NOT A DETAIL** (decision 6). A clause saying three
// things becomes **three rules**, each atomic and answerable yes or no, because
// two obligations bundled into one rule get conflated by the model that later
// checks against it — and forcing a binary answer per rule is worth roughly
// twenty percentage points of agreement in the published work on rubric-graded
// evaluation. The prompt says so three times and the admission rules cannot
// undo a bundling, so this is the one instruction here that is worth repeating.
//
// 🔒 **THE POINTER COMES FROM OUR OWN COPY, NEVER FROM THE MODEL.** The model
// names a clause by the marker we gave it; the `clauseId` and the wording are
// then taken from the clause we actually loaded. A model-authored "pointer" is
// how a rule ends up quoting a paraphrase as the client's own words — which is
// exactly the guarantee ADR-0048 §5 rests on. An unresolvable marker is a rule
// **discarded and counted**, never repaired. This is `qa_section_check`'s
// admission rule one capability along, and it is the same rule for the same
// reason.
//
// 🔒 **GAP-FILLING IS CODE, AND MARKED AS INFORA'S OWN.** The baseline below is
// a shipped list, not a generation: a "baseline" a model invented per run would
// differ between two clients on the same day and could not honestly be called
// Infora's own. Every baseline rule enters as `infora_proposed`, binds only
// once a person accepts it, and can never claim the client's guide said it.
import type { ExceptedContext, ProposedRule, RuleKind, RuleScope } from '@infora/contracts';
import {
  EXCEPTED_CONTEXTS,
  RULE_ENFORCEMENTS,
  RULE_KINDS,
  RULE_SCOPES,
} from '@infora/contracts';
import type { DocumentLanguage, FindingSeverity, RuleRegister } from '@infora/contracts';

/** One clause of the uploaded standard, as the extraction is shown it. */
export type ExtractableClause = {
  id: string;
  /** the guide's own address — `4.2` — or null where it numbers nothing */
  clause: string | null;
  heading: string | null;
  /** the clause VERBATIM, as loaded. The model never supplies this back */
  content: string;
};

/**
 * The closed list of things a baseline rule is *about*.
 *
 * It exists only during extraction and is stored nowhere. Its whole job is to
 * answer *"is the uploaded guide silent on this?"* mechanically: the model tags
 * each extracted rule with a topic where one applies, and a baseline rule is
 * proposed for a register only where nothing extracted already covers its topic
 * there. **Being wrong costs a duplicate proposal or a missing one**, both of
 * which a person sees on the review screen before anything binds — which is why
 * a model-supplied tag is admissible here where it would not be on a finding.
 */
export const RULE_TOPICS = [
  'active-voice',
  'one-idea-per-paragraph',
  'sentence-length',
  'reading-grade',
  'unexplained-jargon',
  'defined-abbreviations',
  'contractions',
  'date-format',
  'unit-spacing',
  'heading-case',
  'plain-alternatives',
] as const;
export type RuleTopic = (typeof RULE_TOPICS)[number];

/**
 * **Infora's own baseline of good technical writing** (decision 5).
 *
 * Deliberately small. Each entry is a rule a professional editor would apply to
 * an infrastructure deliverable without argument, phrased atomically, and each
 * declares the registers it belongs to — a plain-English rule proposed onto a
 * technical report is noise, and noise is what gets a check switched off.
 */
type BaselineRule = {
  topic: RuleTopic;
  registers: readonly (DocumentLanguage | 'all')[];
  kind: RuleKind;
  statement: string;
  scope: RuleScope;
  exceptedContexts?: readonly ExceptedContext[];
  enforcement?: 'raises_findings' | 'steers_only';
  payload?: ProposedRule['payload'];
};

export const INFORA_BASELINE: readonly BaselineRule[] = [
  {
    topic: 'active-voice',
    registers: ['all'],
    kind: 'judgement',
    statement: 'Write in the active voice where the meaning allows it.',
    scope: 'sentence',
    exceptedContexts: ['quotations', 'references'],
    payload: {
      passExample: 'The contractor installed the barrier.',
      failExample: 'The barrier was installed by the contractor.',
    },
  },
  {
    topic: 'one-idea-per-paragraph',
    registers: ['all'],
    kind: 'judgement',
    statement: 'Each paragraph carries one idea, stated in its first sentence.',
    scope: 'paragraph',
    exceptedContexts: ['quotations', 'code'],
  },
  {
    topic: 'sentence-length',
    registers: ['all'],
    kind: 'measured',
    statement: 'Sentences average no more than 25 words.',
    scope: 'sentence',
    payload: { measure: 'sentence-length', target: 25 },
  },
  {
    topic: 'reading-grade',
    registers: ['simple-english'],
    kind: 'measured',
    statement: 'The text reads at about a grade-10 reading level.',
    scope: 'document',
    payload: { measure: 'reading-grade', target: 10 },
  },
  {
    topic: 'unexplained-jargon',
    registers: ['non-technical', 'simple-english'],
    kind: 'judgement',
    statement: 'Explain a technical term the first time it is used, or replace it.',
    scope: 'paragraph',
    exceptedContexts: ['quotations', 'references'],
  },
  {
    topic: 'defined-abbreviations',
    registers: ['all'],
    kind: 'judgement',
    statement: 'Expand an abbreviation at its first use, then use the short form.',
    scope: 'document',
    exceptedContexts: ['quotations', 'references'],
  },
  {
    topic: 'contractions',
    registers: ['technical', 'non-technical'],
    kind: 'pattern',
    statement: 'Do not use contractions.',
    scope: 'sentence',
    exceptedContexts: ['quotations', 'code'],
    payload: { expression: "\\b\\w+n't\\b|\\b\\w+'(ll|re|ve|s)\\b", caseSensitive: false },
  },
  {
    topic: 'date-format',
    registers: ['all'],
    kind: 'pattern',
    statement: 'Write a date as 12 March 2026, never 12/03/2026.',
    scope: 'sentence',
    exceptedContexts: ['quotations', 'references', 'code'],
    payload: { expression: '\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b', caseSensitive: false },
  },
  {
    topic: 'unit-spacing',
    registers: ['technical'],
    kind: 'pattern',
    statement: 'Leave a space between a number and its unit — 50 m, not 50m.',
    scope: 'sentence',
    exceptedContexts: ['quotations', 'code'],
    payload: { expression: '\\b\\d+(mm|cm|m|km|kg|t|ha|dB|kV|MW)\\b', caseSensitive: true },
  },
  {
    topic: 'heading-case',
    registers: ['all'],
    kind: 'pattern',
    statement: 'Headings are sentence case, not Title Case.',
    scope: 'heading',
    payload: { expression: '\\b[A-Z][a-z]+\\s+[A-Z][a-z]+', caseSensitive: true },
  },
  {
    topic: 'plain-alternatives',
    registers: ['non-technical', 'simple-english'],
    kind: 'term',
    statement: 'Prefer plain words: use “use”, not “utilise”.',
    scope: 'sentence',
    exceptedContexts: ['quotations', 'references'],
    payload: { preferred: 'use', replaces: ['utilise', 'utilize'], definition: 'Plain alternative.' },
  },
];

/**
 * What the extraction model is shown, and what it may answer with.
 *
 * The clause markers are `[C1]`, `[C2]` … and the model returns one of them per
 * rule. It never returns an id, never returns a clause's text, and never
 * returns a rule with no marker: the wording that makes ADR-0048 §5's
 * quotation verbatim comes from our own copy of the clause.
 */
export function composeRuleExtractionPrompt(
  clauses: readonly ExtractableClause[],
  registers: readonly RuleRegister[],
): string {
  return [
    'You are restructuring a written style guide, used by an engineering consultancy on an infrastructure project, into a list of ATOMIC RULES.',
    '',
    'SPLIT. A clause that says three things becomes THREE rules. Every rule must be answerable yes or no about one piece of writing. A rule that bundles two obligations is wrong even if the guide bundled them.',
    'DO NOT INVENT. Every rule must come from a clause below. If the guide does not say it, do not write it.',
    'DO NOT PARAPHRASE INTO VAGUENESS. "Be clear" is not a rule; state the obligation the clause actually imposes.',
    '',
    'Sort each rule by HOW IT CAN BE ENFORCED, which is not what it is about:',
    '  • term — a wording to use and the wordings it replaces (a glossary entry is this).',
    '  • pattern — a convention with no judgement in it: a date form, unit spacing, contractions, heading case. Give a regular expression that FINDS THE BREACH.',
    '  • structure — what a document must contain, and in what order.',
    '  • measured — a number with a target: sentence length, a reading level.',
    '  • judgement — anything a computer cannot settle: prefer the active voice, one idea per paragraph.',
    'If a rule could be enforced by code, it is NOT a judgement rule. Judgement is the expensive kind and the last resort.',
    '',
    'Return ONE JSON object and nothing else:',
    '{"rules": [{',
    '  "clause": "<C# — the clause this rule came from. Required. No rule without one>",',
    '  "kind": "term"|"pattern"|"structure"|"measured"|"judgement",',
    '  "statement": "<the rule in one sentence, as a person would read it>",',
    `  "scope": ${RULE_SCOPES.map((scope) => `"${scope}"`).join('|')},`,
    `  "register": ${[...registers, 'all'].map((register) => `"${register}"`).join('|')},`,
    '  "enforcement": "raises_findings"|"steers_only",',
    '  "excepted_contexts": ["quotations"|"references"|"code"|"headings"],',
    '  "excepted_terms": ["<exact words this rule leaves alone — proper names, defined terms>"],',
    `  "topic": ${RULE_TOPICS.map((topic) => `"${topic}"`).join('|')}|null,`,
    '  "payload": {"preferred": "…", "replaces": ["…"], "definition": "…",',
    '              "expression": "…", "caseSensitive": true|false,',
    '              "requires": ["…"], "measure": "sentence-length"|"reading-grade", "target": 0,',
    '              "passExample": "…", "failExample": "…"}}]}',
    '',
    'On the two fields that decide whether a check is accurate or merely noisy:',
    '  • scope is what the rule applies to, at the smallest honest grain.',
    '  • exceptions are where it does NOT apply. Without them, "use scheme, not project" fires on the Project Board and on every quoted document title, and the consultant switches the check off. Excepted TERMS are exact words; excepted CONTEXTS are places in the document.',
    '  • enforcement is "steers_only" for an aspiration nothing can check — "write with the reader in mind". Marking one enforceable is a silent lie about what the check covers.',
    '',
    `The registers this set must cover: ${registers.join(', ')}. Tag a rule "all" only where it genuinely applies to every one of them.`,
    '',
    'THE STYLE GUIDE.',
    '',
    ...clauses.map(
      (clause, at) =>
        `[C${at + 1}]${clause.clause === null ? '' : ` (${clause.clause})`}${clause.heading === null ? '' : ` ${clause.heading}`}\n${clause.content}`,
    ),
  ].join('\n');
}

export type ExtractionResult = {
  rules: ProposedRule[];
  /** what each admitted rule is ABOUT, and for which register — gap-filling's input */
  covered: { topic: RuleTopic | null; register: RuleRegister }[];
  discarded: { unknownClause: number; unknownKind: number; empty: number };
};

/**
 * THE ADMISSION RULES, in code — `qa_section_check`'s discipline one capability
 * along.
 *
 * Nothing is repaired. A rule naming a clause this run did not show the model
 * is **discarded and counted**, because an admitted rule with a guessed pointer
 * is worse than no rule: it looks checkable, and its findings would quote words
 * the guide never carried.
 */
export function admitExtractedRules(
  clauses: readonly ExtractableClause[],
  registers: readonly RuleRegister[],
  defaultSeverity: FindingSeverity,
  raw: string,
): ExtractionResult {
  const parsed = parseObject(raw);
  const rules: ProposedRule[] = [];
  const covered: { topic: RuleTopic | null; register: RuleRegister }[] = [];
  const discarded = { unknownClause: 0, unknownKind: 0, empty: 0 };
  const allowed = new Set<RuleRegister>([...registers, 'all']);

  const rows = Array.isArray(parsed?.['rules']) ? (parsed['rules'] as unknown[]) : [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const entry = row as Record<string, unknown>;

    const clause = clauses[markerIndex(text(entry['clause']))];
    if (clause === undefined) {
      discarded.unknownClause += 1;
      continue;
    }
    const kind = text(entry['kind']) as RuleKind;
    if (!(RULE_KINDS as readonly string[]).includes(kind)) {
      discarded.unknownKind += 1;
      continue;
    }
    const statement = text(entry['statement']);
    if (statement === '') {
      discarded.empty += 1;
      continue;
    }
    const scope = text(entry['scope']) as RuleScope;
    const register = text(entry['register']) as RuleRegister;
    const enforcement = text(entry['enforcement']);
    const payload = payloadOf(entry['payload']);
    // a pattern rule whose expression will not compile is not a pattern rule.
    // Demoted rather than dropped: the obligation the clause imposes is real
    // and a person can still keep it as a judgement rule on the review screen.
    const kept: RuleKind =
      kind === 'pattern' && !usablePattern(payload.expression) ? 'judgement' : kind;

    const admittedRegister: RuleRegister = allowed.has(register) ? register : 'all';
    rules.push({
      kind: kept,
      // 🔒 always `extracted` here, and the pointer is OURS. The model named a
      // marker; the id and the wording come from the clause we loaded.
      origin: 'extracted',
      statement,
      scope: (RULE_SCOPES as readonly string[]).includes(scope) ? scope : 'sentence',
      exceptedContexts: contextsOf(entry['excepted_contexts']),
      exceptedTerms: termsOf(entry['excepted_terms']),
      register: admittedRegister,
      enforcement: (RULE_ENFORCEMENTS as readonly string[]).includes(enforcement)
        ? (enforcement as ProposedRule['enforcement'])
        : 'raises_findings',
      severity: defaultSeverity,
      payload: kept === 'pattern' ? payload : withoutExpression(payload),
      clauseId: clause.id,
      clauseWording: clause.content,
      clause: clause.clause,
    });
    const topic = text(entry['topic']) as RuleTopic;
    covered.push({
      topic: (RULE_TOPICS as readonly string[]).includes(topic) ? topic : null,
      register: admittedRegister,
    });
  }

  return { rules, covered, discarded };
}

/**
 * The gaps Infora fills (decision 5), **marked as Infora's own**.
 *
 * A baseline rule is proposed for a register only where nothing extracted
 * already covers its topic there. The common real case this exists for is a
 * standard written for public-facing consultation material being used on a
 * technical report: it simply has no phrasing rules for the register in hand,
 * and a set that stayed silent about that would look configured while covering
 * nothing.
 */
export function fillGaps(
  registers: readonly RuleRegister[],
  covered: readonly { topic: RuleTopic | null; register: RuleRegister }[],
  defaultSeverity: FindingSeverity,
): ProposedRule[] {
  const seen = new Set<string>();
  for (const entry of covered) {
    if (entry.topic === null) continue;
    if (entry.register === 'all') for (const each of registers) seen.add(`${entry.topic}:${each}`);
    seen.add(`${entry.topic}:${entry.register}`);
  }

  const proposed: ProposedRule[] = [];
  for (const rule of INFORA_BASELINE) {
    // which of the SELECTED registers this baseline rule is for
    const targets = rule.registers.includes('all')
      ? (['all'] as RuleRegister[])
      : registers.filter((register) => rule.registers.includes(register as DocumentLanguage));
    for (const target of targets) {
      const gap =
        target === 'all'
          ? registers.every((register) => !seen.has(`${rule.topic}:${register}`))
          : !seen.has(`${rule.topic}:${target}`);
      if (!gap) continue;
      proposed.push({
        kind: rule.kind,
        // 🔒 marked as Infora's own, and it can never claim the guide said it:
        // there is no `clauseId`, and the store's CHECK forbids one here
        origin: 'infora_proposed',
        statement: rule.statement,
        scope: rule.scope,
        exceptedContexts: [...(rule.exceptedContexts ?? [])],
        exceptedTerms: [],
        register: target,
        enforcement: rule.enforcement ?? 'raises_findings',
        severity: defaultSeverity,
        payload: { ...(rule.payload ?? {}) },
      });
    }
  }
  return proposed;
}

// ── the small parsing half ──────────────────────────────────────────────────

function parseObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? raw).trim();
  const opened = body.indexOf('{');
  const closed = body.lastIndexOf('}');
  if (opened === -1 || closed <= opened) return null;
  try {
    const parsed: unknown = JSON.parse(body.slice(opened, closed + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** `C7` → 6. Anything else → -1, which resolves to no clause and is discarded. */
function markerIndex(marker: string): number {
  const match = /^C(\d+)$/i.exec(marker.replace(/[[\]]/g, '').trim());
  return match === null ? -1 : Number(match[1]) - 1;
}

function contextsOf(value: unknown): ExceptedContext[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((entry) => text(entry) as ExceptedContext)
        .filter((entry) => (EXCEPTED_CONTEXTS as readonly string[]).includes(entry)),
    ),
  ];
}

function termsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(entry)).filter((entry) => entry !== ''))].slice(0, 64);
}

function payloadOf(value: unknown): ProposedRule['payload'] {
  if (value === null || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const payload: ProposedRule['payload'] = {};
  if (text(raw['preferred']) !== '') payload.preferred = text(raw['preferred']);
  if (Array.isArray(raw['replaces'])) {
    payload.replaces = raw['replaces'].map((entry) => text(entry)).filter((entry) => entry !== '');
  }
  if (text(raw['definition']) !== '') payload.definition = text(raw['definition']);
  if (text(raw['expression']) !== '') payload.expression = text(raw['expression']);
  if (typeof raw['caseSensitive'] === 'boolean') payload.caseSensitive = raw['caseSensitive'];
  if (Array.isArray(raw['requires'])) {
    payload.requires = raw['requires'].map((entry) => text(entry)).filter((entry) => entry !== '');
  }
  const measure = text(raw['measure']);
  if (measure === 'sentence-length' || measure === 'reading-grade') payload.measure = measure;
  if (typeof raw['target'] === 'number' && Number.isFinite(raw['target'])) {
    payload.target = raw['target'];
  }
  if (text(raw['passExample']) !== '') payload.passExample = text(raw['passExample']);
  if (text(raw['failExample']) !== '') payload.failExample = text(raw['failExample']);
  return payload;
}

/**
 * A non-pattern rule keeps no expression. A demoted pattern that kept one would
 * leave an expression in the store that nothing runs — a claim the row makes
 * falsely, and the sort of thing a later matcher picks up by accident.
 */
function withoutExpression(payload: ProposedRule['payload']): ProposedRule['payload'] {
  const rest = { ...payload };
  delete rest.expression;
  delete rest.caseSensitive;
  return rest;
}

/**
 * Whether a proposed expression is one we are willing to run.
 *
 * 🔒 **A model wrote this expression and the matcher will run it over every
 * section of every draft**, so the guard is structural rather than trusting:
 * a bounded length, no nested quantifier (the catastrophic-backtracking shape),
 * and it must compile. A pattern that fails is **demoted to a judgement rule**
 * rather than dropped — the obligation the clause imposed is real, and a person
 * decides on the review screen what to do with it.
 */
export const MAX_PATTERN_LENGTH = 200;

export function usablePattern(expression: string | undefined): boolean {
  if (expression === undefined || expression === '') return false;
  if (expression.length > MAX_PATTERN_LENGTH) return false;
  // a quantified group whose body is itself quantified — `(a+)*`, `(a*)+`,
  // `(\w+\s*)+` — is the shape that backtracks catastrophically
  if (/\([^()]*[+*}][^()]*\)\s*[+*]|\([^()]*[+*}][^()]*\)\{\d+,/.test(expression)) return false;
  try {
    new RegExp(expression, 'u');
    return true;
  } catch {
    return false;
  }
}
