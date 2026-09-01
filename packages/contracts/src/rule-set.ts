// T-423 — A STYLE GUIDE'S RULES, TYPED (ADR-0054 decisions 2–5).
//
// *In plain terms: a style guide used to be a document the checker read as
// prose. It is now also a list of rules — each one small enough to answer yes
// or no, each saying what it applies to and where it does not, and each marked
// with where it came from. This file is that list's shape.*
//
// 🔒 **RULES ARE TYPED BY HOW THEY ARE ENFORCED, NOT BY WHAT THEY ARE ABOUT**
// (decision 4). A taxonomy by subject — tone, punctuation, grammar — reads
// tidily and tells the machine nothing, because "tone" holds both a rule a
// computer settles instantly and a rule needing judgement. Sorting by
// enforcement fixes three things at once: what a check costs, how reliable it
// is, and whether its fix reaches ADR-0053 §6's bulk lane.
//
// 🔒 **THE CLAUSE STORE IS NOT REPLACED.** An extracted rule POINTS AT the
// clause it came from (`clauseId`), because ADR-0048 §5's verbatim quotation
// resolves through it: a finding quotes the words the client's guide really
// carries, not Infora's restructuring of them. The pointer is non-null exactly
// when the origin is `extracted`, and the store carries that as a CHECK rather
// than as a convention.

import type { DocumentLanguage } from './creator';
import type { FindingSeverity } from './finding';
import type { Id } from './shared';

/**
 * The five kinds, and **four of them never reach a model** (decision 4).
 *
 * | Kind | What it holds | Enforced by |
 * | --- | --- | --- |
 * | `term` | a wording to use, the wordings it replaces, a plain definition | code — exact match |
 * | `pattern` | a convention with no judgement in it | code — pattern with exceptions |
 * | `structure` | what a document must contain, and in what order | code — against the outline |
 * | `measured` | a number with a target | code — arithmetic |
 * | `judgement` | anything a computer cannot settle | **a model call — the only kind that costs one** |
 *
 * **The glossary is the `term` kind, not a separate store.** Giving it one
 * would have produced two answers to what a writing rule is.
 */
export const RULE_KINDS = ['term', 'pattern', 'structure', 'measured', 'judgement'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

/**
 * Where a rule came from, and there are exactly three (decision 3).
 *
 * Once Infora restructures a written standard, the rule the checker enforces is
 * no longer the words the client wrote. ADR-0048 §5 lets a finding quote a rule
 * verbatim; a machine paraphrase quoted as the client's rule would make that
 * guarantee false while looking identical on screen. So the origin **decides
 * the finding's evidence treatment** rather than merely labelling a row.
 */
export const RULE_ORIGINS = [
  /** lifted from the uploaded standard — and it keeps a pointer to the wording */
  'extracted',
  /** somebody typed it. It has no client wording, and its findings say so */
  'typed',
  /** Infora's own baseline, marked as Infora's own, binding only once accepted */
  'infora_proposed',
] as const;
export type RuleOrigin = (typeof RULE_ORIGINS)[number];

/**
 * What a rule applies to — ADR-0053's *the unit of work is a property of each
 * check* applied one level down, at rule grain, which is what lets the planner
 * batch correctly.
 *
 * *(Amended in review 2026-09-01 on T-430's evaluation: `paragraph` and `list`
 * added — the ruled vocabulary omitted `paragraph` while decision 4's own
 * example rule, "one idea per paragraph", needs it. The names deliberately
 * match the document-part vocabulary the evaluated external engine also uses,
 * which is what keeps a later engine swap a swap.)*
 */
export const RULE_SCOPES = [
  'document',
  'section',
  'paragraph',
  'sentence',
  'heading',
  'list',
  'caption',
  'table',
] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

/**
 * Where a rule does not apply — **the first of two typed halves**.
 *
 * An enumerated set, deliberately: a context is a place in the document, and it
 * maps onto a masking pass in our own matcher (and onto negated scopes in the
 * engine the spike evaluated). *(Split from a single mixed field in review
 * 2026-09-01, on T-430's named "finding that matters most": one field would have
 * made a later engine adoption a migration of every accepted rule, and "proper
 * names" as a context would require a detector nobody has built.)*
 */
export const EXCEPTED_CONTEXTS = ['quotations', 'references', 'code', 'headings'] as const;
export type ExceptedContext = (typeof EXCEPTED_CONTEXTS)[number];

/**
 * The register a rule applies to — **`DOCUMENT_LANGUAGES` plus `all`, and this
 * is a decision rather than a detail** (decision 5, owner-ruled).
 *
 * A rule tagged with a word the creator's launcher does not use **can never
 * match a document**, so gap-filling would fail silently — which is the failure
 * mode ADR-0054 refuses everywhere else. *Public communications* is Simple
 * English. **Purpose is deliberately not a second axis**: it would double every
 * rule's applicability and the review screen with it, and no client has asked.
 */
export type RuleRegister = DocumentLanguage | 'all';

/**
 * Whether a rule raises findings or only steers drafting (decision 4).
 *
 * Real standards contain aspirations — *write with the reader in mind* — that
 * cannot be checked. Marked `steers_only` they improve the writing and generate
 * no noise nobody can act on. Marking them enforceable would be a silent lie
 * about what the check covers, which is the thing ADR-0053 §5 exists to prevent.
 */
export const RULE_ENFORCEMENTS = ['raises_findings', 'steers_only'] as const;
export type RuleEnforcement = (typeof RULE_ENFORCEMENTS)[number];

/**
 * The kind-specific half of a rule.
 *
 * Held as one loose record on the wire and as `jsonb` in the store rather than
 * as five columns, because four of the five are used by exactly one matcher
 * each; five sparse column families would be a schema describing the union
 * badly. What is NOT in here is anything every rule carries — the statement,
 * the scope, the exceptions and the register are columns, because every read of
 * the set filters or groups on them.
 */
export type RulePayload = {
  /** `term` — the wording to use */
  preferred?: string;
  /** `term` — the wordings it replaces */
  replaces?: string[];
  /** `term` — a plain definition, which is what makes the glossary a glossary */
  definition?: string;
  /** `pattern` — the expression the matcher runs, and whether case matters */
  expression?: string;
  caseSensitive?: boolean;
  /** `structure` — the headings a document must carry, in order */
  requires?: string[];
  /** `measured` — what is counted, and the number it is counted against */
  measure?: 'sentence-length' | 'reading-grade';
  target?: number;
  /** `judgement` — one example that passes and one that fails (decision 6) */
  passExample?: string;
  failExample?: string;
};

/**
 * One rule, as it is read back.
 *
 * `clauseWording` is the **client's own words**, resolved through `clauseId` on
 * the server. It is present exactly when the origin is `extracted`, and it is
 * what a finding quotes — never `statement`, which is Infora's restructuring of
 * it (decision 3).
 */
export type StyleRule = {
  id: Id;
  ordinal: number;
  kind: RuleKind;
  origin: RuleOrigin;
  /** the rule in one sentence, as the review screen and the brief read it */
  statement: string;
  scope: RuleScope;
  exceptedContexts: ExceptedContext[];
  /** exact words and phrases the rule leaves alone — the honest proper-name mechanism */
  exceptedTerms: string[];
  register: RuleRegister;
  enforcement: RuleEnforcement;
  severity: FindingSeverity;
  payload: RulePayload;
  /** the clause this rule was extracted from — present only for `extracted` */
  clauseId?: Id;
  /** that clause's own address, e.g. `4.2`; null where the guide numbers nothing */
  clause?: string | null;
  /** that clause VERBATIM — what a finding quotes (ADR-0048 §5) */
  clauseWording?: string;
};

/**
 * A rule as it is PROPOSED — before anything binds (decisions 2 and 3).
 *
 * The same shape minus everything only a saved version can have. It is
 * deliberately not `StyleRule` with optional ids: a proposed rule has no id,
 * cannot be quoted, and cannot be run against anything, and a type that let one
 * be mistaken for the other is exactly how something unaccepted ends up binding
 * somebody.
 */
export type ProposedRule = {
  kind: RuleKind;
  origin: RuleOrigin;
  statement: string;
  scope: RuleScope;
  exceptedContexts: ExceptedContext[];
  exceptedTerms: string[];
  register: RuleRegister;
  enforcement: RuleEnforcement;
  severity: FindingSeverity;
  payload: RulePayload;
  /** the clause it came from — required when the origin is `extracted` */
  clauseId?: Id;
  /** the clause's own wording, for the review screen to show beside the rule */
  clauseWording?: string;
  clause?: string | null;
};

/**
 * One saved version of a rule set — **an amendment is a new version**, on
 * T-397's retire-never-edit precedent (decision 2).
 *
 * The stored rule text is what past findings quoted, so a version is immutable
 * once saved and the store enforces that with a trigger rather than a habit.
 */
export type RuleSetVersion = {
  id: Id;
  styleGuideId: Id;
  version: number;
  acceptedBy: { userId: Id; name: string };
  acceptedAt: string;
  /**
   * The judgement rules compiled once, at save (decision 6, T-429). **Readable
   * by the owner's super user** — it costs nothing to show, because the brief
   * is compiled at save time regardless, and it is the only way to see what the
   * drafting model is actually told.
   */
  draftingBrief: string;
  rules: StyleRule[];
};

/** Where a proposal stands (T-426). A declined one records no reason. */
export const PROPOSAL_STATES = ['pending', 'accepted', 'declined'] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

/**
 * A proposal — anyone on the project may make one; the owner's super user
 * decides (decision 2).
 *
 * 🔒 **Visible to its author, that person's own organisation, and the owner
 * organisation — never to another firm on the project.** A rival learning which
 * rules a competitor is arguing about is the ethical-wall breach nobody thinks
 * of as crossing the wall (ADR-0048 §6's precedent). The read enforces it; this
 * type carries no organisation field, because a second answer to "whose is
 * this" is a wall with one bug (`Finding`'s own rule, one store along).
 */
export type RuleProposal = {
  id: Id;
  state: ProposalState;
  rule: ProposedRule;
  /** the rule this would change, where it changes one rather than adding one */
  supersedesRuleId?: Id;
  proposedBy: { userId: Id; name: string };
  proposedAt: string;
  /** who accepted or declined it. Null while pending — and there is no reason field */
  decidedBy: { userId: Id; name: string } | null;
  decidedAt: string | null;
};

/**
 * What extraction reports, at upload (T-424).
 *
 * 🔒 **`withWording` is the honest number** — how many proposed rules carry a
 * pointer back to the client's own words, the way T-308's rulebook loader
 * reports how many clauses can be quoted by number. A set where it is zero is
 * one whose findings can never quote the guide, and the person who uploaded the
 * document should learn that now rather than from a finding that reads oddly
 * six weeks later.
 */
export type ExtractionReport = {
  clausesRead: number;
  proposed: number;
  withWording: number;
  /** how many Infora proposed because the uploaded guide was silent, per register */
  gapFilled: number;
  /**
   * Set when the upload produced nothing at all. **Said at upload rather than
   * left to produce an empty set that looks configured** — an empty rule set is
   * indistinguishable on screen from a standard that genuinely says nothing.
   */
  nothingExtracted: string | null;
};
