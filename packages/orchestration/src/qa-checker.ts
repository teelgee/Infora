// T-310 — THE CHECKER'S THREE CAPABILITIES, wired to the stores they read.
//
// *In plain terms: this is the half of the QA checker that fetches things — the
// draft out of the working area, the writing rules the project and the firm
// have loaded, and the passages of the project record a section needs to be
// checked against. What it does with them, and which of the AI's answers it
// keeps, is next door in `@infora/capabilities`.*
//
// The split is `document_builder`'s exactly: the declaration, the prompt and
// the admission rules sit beside the other workers, and only the half that
// touches a store lives here, because `capabilities` holds no `Db` by design.
//
// **THREE CAPABILITIES, ONE PER GRAIN** (ADR-0053 §2): `qa_section_check` holds
// one section and everything it is read against, `qa_contradiction_check` holds
// the section summaries and nothing else, and `qa_document_check` holds the
// whole draft and calls no model at all. ADR-0027 fixes code-or-model per
// capability at design time, so the arithmetic families could not share a
// capability with a model call and still have an honest declaration.
//
// 🔒 **NO CAPABILITY HERE HAS A SECOND PATH TO THE CORPUS.** Every passage
// comes through the one assembly gateway, which resolves project scope, library
// membership, record state, the grounding acceptance code, current version, the
// pinned embedding model and per-deliverable visibility as SQL pre-filters in
// the same query that fetches the text (ADR-0028 §4). The style guides are read
// through `@infora/knowledge`'s own two reads, which key on the project and the
// requester's organisation respectively and add no wall predicate of their own.
import { eq } from 'drizzle-orm';
import type {
  Assemble,
  AssembledItem,
  CheckFamily,
  CorpusDepth,
  Id,
} from '@infora/contracts';
import { DEFAULT_READABILITY_TARGET } from '@infora/contracts';
import {
  admitContradictionFindings,
  admitSectionFindings,
  applyMeasuredRules,
  applyRulesToSection,
  applyStructureRules,
  completenessCheck,
  composeContradictionPrompt,
  measuredRules,
  structureRules,
  composeSectionCheckPrompt,
  evidenceFor,
  fleschKincaidGrade,
  judgementRules,
  raisesFindings,
  readabilityCheck,
  splitIntoSections,
} from '@infora/capabilities';
import type {
  AcceptedRule,
  CheckExcerpt,
  CheckPassage,
  CompletenessCoverage,
  DraftFinding,
  DraftSection,
  ReadabilityScore,
  SectionSummary,
  StyleClause,
  TemplateRegistry,
} from '@infora/capabilities';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { readAcceptedRules } from '@infora/data';
import { guidingStyleGuide, informingRules } from '@infora/knowledge';
import { costOf } from '@infora/model';
import type { ModelIdentity, ModelRates, Router } from '@infora/model';

export type CheckAudit = {
  model: ModelIdentity;
  usage: { tokensPrompt: number; tokensCompletion: number; cost: number | null };
};

export class UnknownDraftSection extends Error {
  constructor(section: number, of: number) {
    super(`this draft has ${of} section${of === 1 ? '' : 's'} and the plan named section ${section}`);
    this.name = 'UnknownDraftSection';
  }
}

/** The whole draft, read once, with its sections resolved deterministically. */
async function readDraft(db: Db, sandboxDocumentId: Id) {
  const [document] = await db
    .select({
      id: s.sandboxDocuments.id,
      content: s.sandboxDocuments.content,
      projectId: s.sandboxDocuments.projectId,
    })
    .from(s.sandboxDocuments)
    .where(eq(s.sandboxDocuments.id, sandboxDocumentId))
    .limit(1);
  if (document === undefined) return null;
  return { ...document, sections: splitIntoSections(document.content) };
}

/**
 * Both style sources, in the order precedence runs (ADR-0029, ADR-0053 §3).
 *
 * The project's guide first and the firm's after it, because *the project style
 * guide wins and firm know-how fills in where the project is silent*. The order
 * is not what carries the ruling — the prompt states the precedence in a
 * sentence, because ordering is not an instruction — but a prompt that listed
 * them the other way round would be arguing with its own sentence.
 *
 * ⚠ **The scope travels with each clause**, and it is what makes a quoted
 * project rule shareable and a quoted firm rule org-private (ADR-0053 §9).
 */
export async function readStyleClauses(
  db: Db,
  projectId: Id,
  organisationId: Id,
  /**
   * T-428 — **guides whose rules the run is applying instead** (ADR-0054). A
   * guide that has been restructured into accepted rules is read as those rules
   * and must NOT also arrive as prose: the model would then be asked to judge a
   * clause a code pass has already settled, at a cost, and possibly to a
   * different answer. A guide with no accepted set is untouched and behaves
   * exactly as it did before this ticket — which is why the exclusion is a
   * parameter rather than a rewrite.
   */
  asRules: readonly string[] = [],
): Promise<StyleClause[]> {
  const asClause = (scope: 'project' | 'organisation') => (item: AssembledItem): StyleClause => ({
    scope,
    rulebookRef: item.rule?.rulebookRef ?? '',
    clause: item.rule?.clause ?? null,
    heading: item.rule?.heading ?? null,
    text: item.content,
  });
  const structured = new Set(asRules);
  const project = (await guidingStyleGuide(db, projectId))
    .filter((item) => !structured.has(item.rule?.rulebookRef ?? ''))
    .map(asClause('project'));
  // 🔒 the firm's rulebook is UNTOUCHED and stays prose. ADR-0054 leaves
  // "whether the firm's own manual gets the same extract-and-accept treatment"
  // explicitly open and no ticket assumes it, so nothing here quietly decides it.
  const firm = (await informingRules(db, organisationId)).map(asClause('organisation'));
  return [...project, ...firm];
}

/**
 * T-428 — every accepted rule that binds this project, as the matcher holds it.
 *
 * A thin adaptation of the store's own row: the checker needs the rule's origin
 * and, for an extracted rule, the clause wording — which the store already
 * resolves, out of our own copy of the client's document.
 */
export async function readRulesForCheck(db: Db, projectId: Id): Promise<AcceptedRule[]> {
  const rows = await readAcceptedRules(db, projectId);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as AcceptedRule['kind'],
    origin: row.origin as AcceptedRule['origin'],
    statement: row.statement,
    scope: row.scope as AcceptedRule['scope'],
    exceptedContexts: row.exceptedContexts as AcceptedRule['exceptedContexts'],
    exceptedTerms: row.exceptedTerms,
    register: row.register as AcceptedRule['register'],
    enforcement: row.enforcement as AcceptedRule['enforcement'],
    severity: row.severity as AcceptedRule['severity'],
    payload: row.payload as AcceptedRule['payload'],
    styleGuideId: row.styleGuideId,
    clause: row.clause,
    ...(row.clauseWording !== null && { clauseWording: row.clauseWording }),
  }));
}

/**
 * The slice of the clauses one pass carries (ADR-0053 §5).
 *
 * 🔒 **SPLIT RATHER THAN DROP.** The built channel merge drops the
 * lowest-priority channel first — correct for an Ask answer, where losing some
 * steer degrades tone, and **wrong for a checker, whose silence is a claim**. A
 * style guide that will not fit alongside a section is run over that section in
 * two passes, half the clauses each: it costs another call and it covers the
 * whole manual. The context limit stops being a silent truncator and becomes
 * something the plan routes around. The passes are computed by T-336's planner;
 * this is where one of them is taken.
 */
export function clauseSlice(
  clauses: readonly StyleClause[],
  pass?: { index: number; of: number },
): StyleClause[] {
  if (pass === undefined || pass.of <= 1) return [...clauses];
  const size = Math.ceil(clauses.length / pass.of);
  return clauses.slice(pass.index * size, (pass.index + 1) * size);
}

export type QaSectionCheckInput = {
  sandboxDocumentId: Id;
  /**
   * 1-based, the number the plan and the findings both speak in — and **0
   * means the whole draft**, which is the short shape (ADR-0053 §4). Reading
   * everything in one call is not a section that happens to be big; it is the
   * shape in which self-contradiction comes free, because one reader genuinely
   * sees the lot.
   */
  section: number;
  families: readonly CheckFamily[];
  depth: CorpusDepth;
  /** which slice of the style clauses this pass carries */
  clausePass?: { index: number; of: number };
  /** ADR-0022's working set: never grounds, never cited. Supplied by the run */
  excerpts?: readonly CheckExcerpt[];
  /**
   * Library documents the run was narrowed to (ADR-0053 §3, `Q-028`'s
   * **explicit** case: a scope selected pre-retrieval, recorded on the plan,
   * visible to the user). **Empty means the whole access-resolved library**,
   * which is the default — never "nothing".
   */
  scopeVersionIds?: readonly Id[];
};

export type QaSectionCheckOutput = {
  section: number;
  findings: DraftFinding[];
  /** rides free — the self-contradiction call's whole input */
  summary: string;
  coverage: {
    clausesRead: number;
    clausesTotal: number;
    /** T-428 — how many accepted rules this run could apply, of how many exist */
    rulesApplied: number;
    rulesTotal: number;
    passagesRead: number;
    excerptsRead: number;
    assertionsSearched: number | null;
    discarded: { unanchored: number; unknownRule: number; unknownSource: number };
  };
  audit?: CheckAudit;
};

/** How many assertions a `full` corpus check will search for, per section. */
export const MAX_ASSERTIONS_PER_SECTION = 8;

export type QaCheckerDeps = {
  db: Db;
  router: Router;
  assemble: Assemble;
  rates?: ModelRates;
};

export function createQaSectionCheck(deps: QaCheckerDeps) {
  return async (
    requester: { organisationId: Id; participantId: Id },
    environment: { projectId: Id },
    input: QaSectionCheckInput,
  ): Promise<QaSectionCheckOutput> => {
    const draft = await readDraft(deps.db, input.sandboxDocumentId);
    if (draft === null) throw new UnknownDraftSection(input.section, 0);
    // section 0 is the whole draft read as one unit — the short shape
    const section =
      input.section === 0
        ? {
            index: 0,
            heading: null,
            start: 0,
            end: draft.content.length,
            text: draft.content,
          }
        : draft.sections[input.section - 1];
    if (section === undefined) throw new UnknownDraftSection(input.section, draft.sections.length);

    const wantsStyle = input.families.includes('style');
    const wantsCorpus = input.families.includes('corpus_accuracy');

    // T-428 — the accepted rules first, because they decide which style guides
    // are read as PROSE and which as rules. Four of the five kinds are settled
    // below in code and never reach a model at all.
    const rules = wantsStyle ? await readRulesForCheck(deps.db, environment.projectId) : [];
    const structured = [...new Set(rules.map((rule) => rule.styleGuideId))];
    const allClauses = wantsStyle
      ? await readStyleClauses(
          deps.db,
          environment.projectId,
          requester.organisationId,
          structured,
        )
      : [];
    const clauses = clauseSlice(allClauses, input.clausePass);

    let passages: CheckPassage[] = [];
    let assertionsSearched: number | null = null;
    if (wantsCorpus) {
      const searches =
        input.depth === 'quick'
          ? [section.text]
          : await checkableAssertions(deps, section);
      if (input.depth === 'full') assertionsSearched = searches.length;
      passages = await retrieveFor(deps, requester, environment, searches);
      // the narrowing is applied to what the gateway RETURNED, never passed
      // into it: `AssemblyRequest` has no field that widens or redirects
      // anything, which is the wall's signature guarantee (ADR-0053 §8). A
      // scope is a filter over what the requester could already reach.
      if (input.scopeVersionIds !== undefined && input.scopeVersionIds.length > 0) {
        const wanted = new Set<string>(input.scopeVersionIds);
        passages = passages.filter((passage) => wanted.has(passage.versionId));
      }
    }

    // 🔒 THE CODE PASS, BEFORE ANY MODEL CALL AND WHATEVER THE MODEL DOES NEXT.
    // Term and pattern rules are settled here — free, exact, and the same answer
    // every time — with the rule's scope and both halves of its exceptions
    // honoured. Only the pass over the FIRST clause slice runs it, so a style
    // guide split across two passes does not report every term finding twice.
    const deterministic =
      wantsStyle && (input.clausePass === undefined || input.clausePass.index === 0)
        ? applyRulesToSection(draft.content, section, rules)
        : [];

    const judgement = judgementRules(rules);
    const byId = new Map(rules.map((rule) => [rule.id, rule]));
    const material = {
      section,
      clauses,
      passages,
      excerpts: input.excerpts ?? [],
      families: input.families,
      // only the pass that carries the first clause slice asks the judgement
      // rules, for the reason above
      judgementRules:
        input.clausePass === undefined || input.clausePass.index === 0
          ? judgement.map((rule) => ({
              id: rule.id,
              statement: rule.statement,
              scope: rule.scope,
              ...(rule.payload.passExample !== undefined && {
                passExample: rule.payload.passExample,
              }),
              ...(rule.payload.failExample !== undefined && {
                failExample: rule.payload.failExample,
              }),
            }))
          : [],
      // 🔒 one function decides what a rule's finding rests on, and it reads the
      // rule's ORIGIN. A model never assembles evidence.
      judgementEvidence: (ruleId: string) => evidenceFor(byId.get(ruleId)!),
    };

    // Nothing to read against is not a clean section: with no clauses and no
    // passages the call would ask the model to judge on its own knowledge,
    // which is the third render ADR-0053 considered and did not take. The
    // coverage says so instead.
    if (
      clauses.length === 0 &&
      passages.length === 0 &&
      material.excerpts.length === 0 &&
      material.judgementRules.length === 0
    ) {
      return {
        section: input.section,
        // the code pass already ran and costs nothing — its findings are real
        // whether or not there was anything left to ask a model about
        findings: deterministic,
        summary: '',
        coverage: {
          clausesRead: 0,
          clausesTotal: allClauses.length,
          rulesApplied: appliedCount(rules),
          rulesTotal: rules.length,
          passagesRead: 0,
          excerptsRead: 0,
          assertionsSearched,
          discarded: { unanchored: 0, unknownRule: 0, unknownSource: 0 },
        },
      };
    }

    // `verify` is the ROUTING CLASS — claim verification, frontier tier — and
    // not the `verifier` worker, which stays beyond V1 (ADR-0053, and the
    // deterministic ground-check carries the guarantee). The task vocabulary is
    // the Wave 5 table and is not widened here for a new caller.
    const result = await deps.router.chat('verify', {
      system: composeSectionCheckPrompt(material),
      messages: [{ role: 'user', content: 'Check the section above.' }],
    });
    const admitted = admitSectionFindings(draft.content, material, result.text);

    return {
      section: input.section,
      findings: [...deterministic, ...admitted.findings],
      summary: admitted.summary,
      coverage: {
        clausesRead: admitted.coverage.clausesRead,
        clausesTotal: allClauses.length,
        // ADR-0053 §5, as ADR-0054 extends it: coverage states RULES, not only
        // clauses — a set where half the rules are `steers_only` covers less
        // than its size suggests, and silence about that is the claim §5 exists
        // to forbid.
        rulesApplied: appliedCount(rules),
        rulesTotal: rules.length,
        passagesRead: admitted.coverage.passagesRead,
        excerptsRead: admitted.coverage.excerptsRead,
        assertionsSearched,
        discarded: admitted.coverage.discarded,
      },
      audit: auditOf(deps.rates, result),
    };
  };
}

/**
 * `full` depth: the section's checkable assertions, one search each.
 *
 * This is the difference the depth buys. `quick` searches once on the section
 * as a whole, which finds the record's view of the section's **main topic**;
 * `full` pulls out the statements that could be wrong and searches for each, so
 * a buried figure in a paragraph about something else is actually looked up.
 * That is the case ADR-0053 §2 names, and it is why full is the default: a
 * too-cheap default fails invisibly.
 */
async function checkableAssertions(deps: QaCheckerDeps, section: DraftSection): Promise<string[]> {
  const result = await deps.router.chat('triage', {
    system: [
      'List the checkable factual assertions in the passage below — statements of fact, figures, dates, commitments and named standards that could be checked against a project record.',
      `One per line, at most ${MAX_ASSERTIONS_PER_SECTION}, each restated as a short searchable phrase.`,
      'No numbering, no commentary, nothing else.',
    ].join('\n'),
    messages: [{ role: 'user', content: section.text }],
  });
  const lines = result.text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, '').trim())
    .filter((line) => line !== '')
    .slice(0, MAX_ASSERTIONS_PER_SECTION);
  // an empty answer falls back to the section itself rather than to no search
  // at all: `full` must never cover LESS than `quick` would have
  return lines.length === 0 ? [section.text] : lines;
}

/** Every search, through the one gateway, de-duplicated by chunk. */
async function retrieveFor(
  deps: QaCheckerDeps,
  requester: { organisationId: Id; participantId: Id },
  environment: { projectId: Id },
  searches: readonly string[],
): Promise<CheckPassage[]> {
  const byKey = new Map<string, CheckPassage>();
  for (const text of searches) {
    const assembled = await deps.assemble({
      request: { text, mode: 'targeted' },
      environment: { kind: 'project', projectId: environment.projectId },
      requester,
    });
    for (const item of assembled.items) {
      // grounded only, and `source` present: a guiding item has no source at
      // all, and a finding about the record must never rest on one
      if (item.channel !== 'grounded' || item.source === undefined) continue;
      if (!('versionId' in item.source)) continue;
      const key = `${item.source.versionId}:${item.chunkId ?? ''}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        versionId: item.source.versionId as Id,
        chunkId: (item.chunkId ?? null) as Id | null,
        documentReference: item.descriptor?.documentReference ?? null,
        text: item.content,
        citationId: key as Id,
      });
    }
  }
  return [...byKey.values()];
}

export type QaContradictionCheckInput = {
  sandboxDocumentId: Id;
  summaries: readonly SectionSummary[];
  /**
   * ADR-0053 §4's very-long shape: the summaries themselves exceed one call, so
   * they are compared in **groups**. The plan says cross-section checking is
   * weaker when this is set — it degrades loudly or not at all.
   */
  group?: { index: number; of: number };
};

export type QaContradictionCheckOutput = {
  findings: DraftFinding[];
  coverage: { summariesCompared: number; discarded: number; groups: number };
  audit?: CheckAudit;
};

export function createQaContradictionCheck(deps: {
  db: Db;
  router: Router;
  rates?: ModelRates;
}) {
  return async (input: QaContradictionCheckInput): Promise<QaContradictionCheckOutput> => {
    const draft = await readDraft(deps.db, input.sandboxDocumentId);
    const all = input.summaries.filter((entry) => entry.summary.trim() !== '');
    const summaries = groupOf(all, input.group);
    // fewer than two summaries is not a weak comparison, it is no comparison —
    // and reporting "no contradictions" from one section would be the clean
    // result that means nothing was looked at
    if (draft === null || summaries.length < 2) {
      return {
        findings: [],
        coverage: {
          summariesCompared: summaries.length,
          discarded: 0,
          groups: input.group?.of ?? 1,
        },
      };
    }
    const result = await deps.router.chat('verify', {
      system: composeContradictionPrompt(summaries),
      messages: [{ role: 'user', content: 'Report the contradictions.' }],
    });
    const admitted = admitContradictionFindings(draft.content, draft.sections, result.text);
    return {
      findings: admitted.findings,
      coverage: {
        summariesCompared: summaries.length,
        discarded: admitted.discarded,
        groups: input.group?.of ?? 1,
      },
      audit: auditOf(deps.rates, result),
    };
  };
}

/**
 * One group's slice of the summaries, **contiguous and in plan order**.
 *
 * Contiguous rather than interleaved because neighbouring sections are the ones
 * most likely to contradict each other — a figure restated three paragraphs
 * later, not one restated forty. Splitting them apart would maximise exactly
 * the comparison the grouping already cannot make.
 */
function groupOf(
  summaries: readonly SectionSummary[],
  group?: { index: number; of: number },
): SectionSummary[] {
  if (group === undefined || group.of <= 1) return [...summaries];
  const size = Math.ceil(summaries.length / group.of);
  return summaries.slice(group.index * size, (group.index + 1) * size);
}

export type QaDocumentCheckInput = {
  sandboxDocumentId: Id;
  /**
   * Which of the two arithmetic families to run. **Every family is switchable
   * at launch** (ADR-0053 §2), and a capability that ran both regardless would
   * report findings from a check the user turned off — which is worse than
   * missing one, because nothing on the screen would explain where it came from.
   */
  families?: readonly CheckFamily[];
  /** absent runs the placeholder half of completeness only, and says so */
  templateId?: string;
  readabilityTarget?: number;
};

export type QaDocumentCheckOutput = {
  findings: DraftFinding[];
  coverage: {
    sections: number;
    readability: { target: number; scores: ReadabilityScore[] };
    completeness: CompletenessCoverage;
    /** T-428 — the accepted structure and measured rules this pass applied */
    structureRules: number;
    measuredRules: number;
  };
};

/**
 * 🔒 **CODE, AND NO ROUTER IN SIGHT.** `deps` carries no `Router` at all, which
 * is the declaration made structural: this capability could not make a model
 * call if somebody decided at runtime that it should (ADR-0027).
 */
export function createQaDocumentCheck(deps: { db: Db; templates?: TemplateRegistry }) {
  return async (input: QaDocumentCheckInput): Promise<QaDocumentCheckOutput> => {
    const draft = await readDraft(deps.db, input.sandboxDocumentId);
    if (draft === null) {
      return {
        findings: [],
        coverage: {
          sections: 0,
          readability: { target: input.readabilityTarget ?? DEFAULT_READABILITY_TARGET, scores: [] },
          completeness: { missingSections: null, placeholders: 0 },
          structureRules: 0,
          measuredRules: 0,
        },
      };
    }
    const families = input.families ?? (['readability', 'completeness'] as const);
    const target = input.readabilityTarget ?? DEFAULT_READABILITY_TARGET;
    // 🔒 T-428 — STRUCTURE routes into completeness and MEASURED into
    // readability (ADR-0054 decision 4). The check families do not change; the
    // kinds route into them, which is what keeps the launcher's own switches
    // describing what actually runs. Both passes are code, in a capability that
    // holds no `Router` at all.
    const rules = await readRulesForCheck(deps.db, draft.projectId as Id);
    const fromStructure = applyStructureRules(draft.content, draft.sections, rules);
    const fromMeasured = applyMeasuredRules(
      draft.content,
      draft.sections,
      rules,
      fleschKincaidGrade,
    );
    // the scores are computed either way, because the coverage statement has to
    // be able to say the family ran — it is the findings that are withheld
    const readability = readabilityCheck(draft.content, draft.sections, target);
    const template =
      input.templateId === undefined ? undefined : deps.templates?.get(input.templateId);
    const completeness = completenessCheck(draft.content, draft.sections, template);
    return {
      findings: [
        ...(families.includes('readability') ? [...readability.findings, ...fromMeasured] : []),
        ...(families.includes('completeness') ? [...completeness.findings, ...fromStructure] : []),
      ],
      coverage: {
        sections: draft.sections.length,
        readability: { target, scores: readability.scores },
        completeness: completeness.coverage,
        structureRules: structureRules(rules).length,
        measuredRules: measuredRules(rules).length,
      },
    };
  };
}

/**
 * What the call spent, so the executor can record it on the Step row it opened.
 * **Where the deployment declared no rate the cost is `null`, never 0** — an
 * unpriced call must not read as a free one (T-254).
 */
function auditOf(
  rates: ModelRates | undefined,
  result: { model: ModelIdentity; usage: { tokensPrompt: number; tokensCompletion: number } },
): CheckAudit {
  return {
    model: result.model,
    usage: {
      tokensPrompt: result.usage.tokensPrompt,
      tokensCompletion: result.usage.tokensCompletion,
      cost: costOf(rates, result.model, result.usage),
    },
  };
}

/**
 * How many accepted rules a run can actually apply.
 *
 * **`steers_only` rules are excluded and that is the honest number**: they
 * improve drafting and raise nothing, so counting them would inflate the
 * coverage sentence with rules that cannot produce a finding — which is exactly
 * the overstatement ADR-0053 §5 exists to prevent.
 */
function appliedCount(rules: readonly AcceptedRule[]): number {
  return rules.filter(raisesFindings).length;
}
