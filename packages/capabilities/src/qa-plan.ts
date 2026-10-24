// T-336 — THE CHECKER'S PLANNER: computed in code, shown before the run, and
// shaped by parameters rather than edited (ADR-0053 §4 and §5).
//
// *In plain terms: before the QA checker spends anything, ordinary code works
// out how the run will be broken up — one pass over the whole draft, or a pass
// per section, or per section with the cross-section comparison done in groups
// — roughly what it will cost, and exactly what it will and will not cover.
// That is shown to the person first. If the writing rules are too long to fit
// alongside a section, the run is split into two passes over that section
// rather than quietly dropping half the rules.*
//
// 🔒 **THE PLANNER IS CODE, AND THAT IS LOAD-BEARING RATHER THAN AN
// OPTIMISATION.** If a model decided the run's shape, the same document would
// produce different plans on different days and the checker could not be a
// **declared** workflow at all — losing the one guarantee (same inputs, same
// steps, same order) a tool is sold on. ADR-0027's line is not merely respected
// here; the run depends on it. Nothing in this file consults a model, and
// nothing it reads was written by one: the section count comes from
// `splitIntoSections`, which is arithmetic over the draft's own text.
//
// 🔒 **SPLIT RATHER THAN DROP** (ADR-0053 §5). The built channel merge drops
// the lowest-priority channel first — correct for an Ask answer, where losing
// some steer degrades tone, and **wrong for a checker, whose silence is a
// claim**. A style guide that will not fit alongside a section is run over that
// section in TWO passes, half the clauses each: another call, and the whole
// manual covered. The context limit stops being a silent truncator and becomes
// something the plan routes around — and a firm's manual growing from 60
// clauses to 90 has **no day on which the checker silently weakens**, because
// the plan states the coverage and the pass count changes visibly.
import type {
  CheckFamily,
  CorpusDepth,
  PlannedToolStep,
  ReachCounts,
  RunReach,
  ToolPlan,
  Workflow,
} from '@infora/contracts';
import { nothingToReadRefusal, reachStatement } from '@infora/contracts';
import { costOf } from '@infora/model';
import type { ModelRates } from '@infora/model';
import type { DraftSection } from './workers/qa-sections';

/**
 * Fixed numbers, deliberately (T-309's rule, one tool along): an estimate that
 * came from a model would be a model call taken to avoid a model call, and
 * would vary run to run for the same document. Being **repeatable** matters
 * more than being exact, because the number's job is to let somebody decide
 * whether to press the button.
 */
export const CHARS_PER_TOKEN = 4;
/** what one retrieved passage contributes to a section's prompt */
export const PASSAGE_PROMPT_TOKENS = 250;
/** how many passages a section check is shown, by depth */
export const PASSAGES_QUICK = 6;
export const PASSAGES_FULL = 12;
/** the instructions and the output contract, once per call */
export const CHECK_OVERHEAD_TOKENS = 500;
/** what one section's findings and its summary cost to write */
export const CHECK_COMPLETION_TOKENS = 400;
/** one section's summary, in the comparison call */
export const SUMMARY_TOKENS = 80;

export const tokensIn = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

/** Which of the three shapes ADR-0053 §4 names this plan took. */
export type QaPlanShape = 'short' | 'ordinary' | 'very_long';

export type QaCheckPlanInput = {
  workflow: Workflow;
  /** from `splitIntoSections` — deterministic, and the planner's whole width */
  sections: readonly DraftSection[];
  families: readonly CheckFamily[];
  depth: CorpusDepth;
  /** the style clauses binding this run, project guide and firm rulebook together */
  styleClauses: { count: number; tokens: number };
  /**
   * T-428 (ADR-0054, extending ADR-0053 §5) — **the accepted RULES this run
   * will apply**, counted per register.
   *
   * Coverage now states rules and not only clauses, because a project that has
   * restructured its guide has no clauses left to count for it: reporting "0 of
   * 0 clauses" over a set of forty accepted rules would be the clean result
   * that means nothing was looked at, which is precisely what §5 exists to
   * prevent. `applied` excludes `steers_only` rules — they raise nothing, so
   * counting them would inflate the sentence with rules that cannot produce a
   * finding.
   */
  styleRules?: { applied: number; total: number; byRegister: Record<string, number> };
  /**
   * T-469 — what the corpus check can reach, in documents, under the
   * requester's own visibility, taken BEFORE the click. Replaces the count of
   * documents the run was narrowed to: the reach sentence is rendered from
   * these numbers, so the plan and the result describe the same library.
   */
  reach: ReachCounts;
  /** whether a scope was declared — the refusal's words differ, and only a scoped run refuses an empty reach */
  scoped: boolean;
  attachedDocuments: number;
  /**
   * T-399 — the NAMES of files uploaded straight into this run.
   *
   * Names rather than a count, and the asymmetry with `attachedDocuments` is
   * deliberate: a sandbox pin can be looked up later by its id, so a count plus
   * the record is enough to say what was read. An upload is stored nowhere, so
   * its name is the only handle the record will ever have for it — a coverage
   * sentence saying "1 attached document" would name a thing the reader cannot
   * then identify.
   */
  attachedUploads: readonly string[];
  /** the model the check calls would route to, for the estimate */
  checkModelId: string;
  rates?: ModelRates;
  /** the budget one call is held to — what the split routes around */
  tokenLimit: number;
};

/** The plan, plus the arithmetic the run itself has to execute. */
export type QaCheckPlan = {
  plan: ToolPlan;
  shape: QaPlanShape;
  /**
   * The fan-out list, as **pass keys** the run binds to the workflow's
   * `id_list` parameter. One entry is one execution of `qa_section_check`:
   * `s3p1of2` is *"section 3, the second of two style-clause passes"*.
   *
   * A compact string because a fan-out's width is the length of a bound
   * `id_list` and nothing else may set it (T-396's rule 6) — so everything one
   * expansion needs to know has to ride in its element.
   */
  passes: string[];
  /** the contradiction groups, `g0of3` — empty where the shape needs none */
  groups: string[];
  /**
   * The arithmetic step's fan-out, `['code']` or `[]`.
   *
   * A one-element list where a boolean would do, because **the plan and the run
   * must not have two ways of deciding what runs**: every step count in this
   * plan is the length of a bound `id_list`, so this one is too. A width of
   * zero is legal and silent about nothing (T-396) — it means no arithmetic
   * family was selected.
   */
  measures: string[];
};

export type PassKey = { section: number; index: number; of: number };

export const passKey = (pass: PassKey): string => `s${pass.section}p${pass.index}of${pass.of}`;

/** `s3p1of2` → `{ section: 3, index: 1, of: 2 }`, or null. */
export function parsePassKey(key: string): PassKey | null {
  const match = /^s(\d+)p(\d+)of(\d+)$/.exec(key.trim());
  if (match === null) return null;
  return {
    section: Number.parseInt(match[1]!, 10),
    index: Number.parseInt(match[2]!, 10),
    of: Number.parseInt(match[3]!, 10),
  };
}

export const groupKey = (index: number, of: number): string => `g${index}of${of}`;

/** `g1of3` → `{ index: 1, of: 3 }`, or null. */
export function parseGroupKey(key: string): { index: number; of: number } | null {
  const match = /^g(\d+)of(\d+)$/.exec(key.trim());
  return match === null
    ? null
    : { index: Number.parseInt(match[1]!, 10), of: Number.parseInt(match[2]!, 10) };
}

export function planQaCheck(input: QaCheckPlanInput): QaCheckPlan {
  const wantsStyle = input.families.includes('style');
  const wantsCorpus = input.families.includes('corpus_accuracy');
  const wantsContradiction = input.families.includes('self_contradiction');
  const wantsCode =
    input.families.includes('readability') ||
    input.families.includes('completeness') ||
    input.families.includes('stale_grounding');

  const clauseTokens = wantsStyle ? input.styleClauses.tokens : 0;
  const passageTokens = wantsCorpus
    ? (input.depth === 'full' ? PASSAGES_FULL : PASSAGES_QUICK) * PASSAGE_PROMPT_TOKENS
    : 0;
  const documentTokens = input.sections.reduce(
    (sum, section) => sum + tokensIn(section.text),
    0,
  );

  // ── the shape ───────────────────────────────────────────────────────────
  //
  // SHORT is not "few sections", it is "it all fits in one call" — and that is
  // why self-contradiction comes free in this shape: one reader genuinely sees
  // everything, so there is nothing to compare afterwards.
  const fitsWhole =
    documentTokens + clauseTokens + passageTokens + CHECK_OVERHEAD_TOKENS <= input.tokenLimit;
  const summaryTokens = input.sections.length * SUMMARY_TOKENS + CHECK_OVERHEAD_TOKENS;
  const groupCount = Math.max(1, Math.ceil(summaryTokens / input.tokenLimit));
  const shape: QaPlanShape =
    input.sections.length <= 1 || fitsWhole ? 'short' : groupCount > 1 ? 'very_long' : 'ordinary';

  // ── the units of work, and the split ────────────────────────────────────
  //
  // In the short shape the unit is the whole draft, which is section 0 by
  // convention — the run reads it as "every section at once" rather than as a
  // section that exists.
  const units =
    shape === 'short'
      ? [{ index: 0, tokens: documentTokens }]
      : input.sections.map((section) => ({ index: section.index, tokens: tokensIn(section.text) }));

  const passes: string[] = [];
  const refusals: string[] = [];
  // 🔒 T-469 — REFUSE BEFORE SPEND when a declared scope leaves nothing to read
  // against. Only where the corpus check was asked for and a scope was
  // declared: a whole-library run over an empty library keeps its old, honest
  // behaviour (the result says the library returned nothing), because that is
  // not a choice the person made.
  if (wantsCorpus && input.scoped && input.reach.inScope === 0) {
    refusals.push(nothingToReadRefusal(input.reach, true));
  }
  // 🔒 NO PER-SECTION FAMILY, NO PER-SECTION PASSES. `style` and
  // `corpus_accuracy` are the only families read at section grain, so a run of
  // readability alone must plan — and execute — zero section calls. The fan-out
  // width IS this list, so the plan and the run cannot disagree about it.
  for (const unit of wantsStyle || wantsCorpus ? units : []) {
    const room = input.tokenLimit - unit.tokens - passageTokens - CHECK_OVERHEAD_TOKENS;
    if (room <= 0) {
      // 🔒 THE PATHOLOGICAL CASE, and the ONLY one: material that cannot be
      // covered even by splitting. Said in the plan, before any spend, never as
      // a caveat under a clean result.
      refusals.push(
        unit.index === 0
          ? 'This draft has no section headings, so it is checked as one piece — and it is too long to read in one pass. Add headings, or check it a part at a time.'
          : `Section ${unit.index} is too long to check even on its own, before any writing rules are added. Split it, and the plan will regenerate.`,
      );
      continue;
    }
    const of = clauseTokens === 0 ? 1 : Math.max(1, Math.ceil(clauseTokens / room));
    for (let index = 0; index < of; index += 1) {
      passes.push(passKey({ section: unit.index, index, of }));
    }
  }

  // self-contradiction is FREE in the short shape (one reader saw everything),
  // and needs at least two sections to mean anything at all
  const groups =
    wantsContradiction && shape !== 'short' && input.sections.length >= 2
      ? Array.from({ length: groupCount }, (_, index) => groupKey(index, groupCount))
      : [];

  // ── the steps, priced ───────────────────────────────────────────────────
  const steps: PlannedToolStep[] = [];
  for (const key of passes) {
    const pass = parsePassKey(key)!;
    const unit = units.find((candidate) => candidate.index === pass.section)!;
    const usage = {
      tokensPrompt:
        unit.tokens +
        passageTokens +
        CHECK_OVERHEAD_TOKENS +
        (pass.of === 0 ? 0 : Math.ceil(clauseTokens / pass.of)),
      tokensCompletion: CHECK_COMPLETION_TOKENS,
    };
    steps.push({
      key: `check#${steps.length}`,
      stage: 'analyse',
      worker: 'qa_section_check',
      label:
        pass.section === 0
          ? `Read the whole draft against ${describeInputs(wantsStyle, wantsCorpus, input.styleClauses.count)}`
          : `Read section ${pass.section} against ${describeInputs(wantsStyle, wantsCorpus, input.styleClauses.count)}${pass.of > 1 ? ` (pass ${pass.index + 1} of ${pass.of})` : ''}`,
      estimate: {
        calls: input.depth === 'full' && wantsCorpus ? 2 : 1,
        ...usage,
        cost: costOf(input.rates, { id: input.checkModelId, version: input.checkModelId }, usage),
      },
    });
  }
  for (const [nth, key] of groups.entries()) {
    void key;
    const perGroup = Math.ceil(input.sections.length / groups.length);
    const usage = {
      tokensPrompt: perGroup * SUMMARY_TOKENS + CHECK_OVERHEAD_TOKENS,
      tokensCompletion: CHECK_COMPLETION_TOKENS,
    };
    steps.push({
      key: `compare#${nth}`,
      stage: 'analyse',
      worker: 'qa_contradiction_check',
      label:
        groups.length === 1
          ? 'Compare what every section asserts against every other'
          : `Compare what ${perGroup} sections assert against each other (group ${nth + 1} of ${groups.length})`,
      estimate: {
        calls: 1,
        ...usage,
        cost: costOf(input.rates, { id: input.checkModelId, version: input.checkModelId }, usage),
      },
    });
  }
  // ── the arithmetic step, and it ALWAYS runs ─────────────────────────────
  //
  // It carries the two CODE families where they were selected — and it runs
  // even where neither was, because **it is also where the run totals up what
  // it read**. The coverage statement is the checker's actual answer (ADR-0053
  // §5): it is the only thing distinguishing a clean result from an unexamined
  // one, so a run that produced findings and no statement of reach would be the
  // failure this design exists to prevent. That is why it is the `present`
  // step: the checker's answer is its coverage, not prose.
  //
  // 🔒 And the plan NAMES it either way, because the plan must describe the run
  // exactly — a step that ran without appearing in the plan is the preflight
  // lying, one field along from where T-373 caught it.
  const measures = ['code'];
  steps.push({
    key: 'measure',
    stage: 'present',
    worker: 'qa_document_check',
    label: wantsCode
      ? 'Score the draft for readability, check it for gaps and placeholders, and check its cited sources are still current'
      : 'Total up what was actually read, so the coverage statement is not a guess',
    // CODE, so the cost is a genuine ZERO rather than an unpriced null — there
    // is no model call to price, and the two must not be confused (T-254)
    estimate: { calls: 0, tokensPrompt: 0, tokensCompletion: 0, cost: 0 },
  });

  const priced = steps.every((step) => step.estimate.cost !== null);
  const total = priced ? steps.reduce((sum, step) => sum + (step.estimate.cost ?? 0), 0) : null;

  const caveats: string[] = [];
  if (groups.length > 1) {
    // 🔒 IT DEGRADES LOUDLY OR NOT AT ALL (ADR-0053 §4). The summaries no
    // longer fit one call, so a contradiction between two sections in different
    // groups is not looked for — and a run that did not say so would report a
    // clean cross-section result it had not earned.
    caveats.push(
      `This draft has ${input.sections.length} sections — too many to compare all at once — so they are compared in ${groups.length} groups. A contradiction between two sections in different groups will not be found.`,
    );
  }
  const attachedTotal = input.attachedDocuments + input.attachedUploads.length;
  if (attachedTotal > 0) {
    caveats.push(
      `${attachedTotal} attached ${attachedTotal === 1 ? 'document is' : 'documents are'} read but never cited — findings from ${attachedTotal === 1 ? 'it' : 'them'} quote an excerpt instead of resolving to a source (ADR-0022). Scope to a library document instead if you want citations.`,
    );
  }
  // T-399 — the upload's own consequence, said in the plan BEFORE any spend
  // like every other property of the run. It is the design and not a defect: the
  // file is parsed for this run and deliberately stored nowhere, so the record
  // keeps its fingerprint and not its text, and there is nothing to re-read.
  if (input.attachedUploads.length > 0) {
    caveats.push(
      `${input.attachedUploads.length === 1 ? 'The uploaded file is' : 'The uploaded files are'} read for this run and kept nowhere afterwards — the record keeps ${input.attachedUploads.length === 1 ? 'its name, size and content hash' : 'their names, sizes and content hashes'}, never ${input.attachedUploads.length === 1 ? 'its' : 'their'} text. Running this check again means attaching ${input.attachedUploads.length === 1 ? 'the file' : 'the files'} again.`,
    );
  }

  return {
    shape,
    passes,
    groups,
    measures,
    plan: {
      workflowId: input.workflow.id,
      workflowVersion: input.workflow.version,
      steps,
      // the coverage sentence is built from the passes the planner ACTUALLY
      // computed, never from a second copy of the same arithmetic — two
      // formulas is how a plan starts describing a run it is not
      coverage: coverageBefore(input, clausePassesOf(passes)),
      cost: { total, priced },
      refusal: refusals.length === 0 ? null : refusals.join(' '),
      shape: describeShape(shape, input.sections.length, groups.length),
      ...(caveats.length > 0 && { caveats }),
    },
  };
}

function describeInputs(style: boolean, corpus: boolean, clauses: number): string {
  const parts: string[] = [];
  if (style) parts.push(`${clauses} writing ${clauses === 1 ? 'rule' : 'rules'}`);
  if (corpus) parts.push('the project record');
  return parts.length === 0 ? 'nothing — no reading check was selected' : parts.join(' and ');
}

function describeShape(shape: QaPlanShape, sections: number, groups: number): string {
  if (shape === 'short') {
    return 'One pass over the whole draft — one reader sees everything, so the consistency check comes free.';
  }
  if (shape === 'ordinary') {
    return `A pass per section over ${sections} sections, then one comparison of what they each assert.`;
  }
  return `A pass per section over ${sections} sections, then their summaries compared in ${groups} groups.`;
}

/**
 * BEFORE THE RUN — what it **will** cover, in the shape the after-statement
 * repeats (ADR-0053 §5).
 *
 * The clause count is stated as *"80 of 80, in 2 passes"* and not as *"80"*,
 * because the number that matters is the ratio: a manual that outgrew the
 * budget would otherwise read exactly like one that fits, and the pass count is
 * what makes the split visible rather than silent.
 */
/** The widest split any unit needed — what the coverage sentence reports. */
export function clausePassesOf(passes: readonly string[]): number {
  let widest = 1;
  for (const key of passes) {
    const pass = parsePassKey(key);
    if (pass !== null && pass.of > widest) widest = pass.of;
  }
  return widest;
}

export function coverageBefore(input: QaCheckPlanInput, clausePasses = 1): string {
  const parts = [`${input.sections.length} section${input.sections.length === 1 ? '' : 's'}`];
  parts.push(`${input.families.length} check${input.families.length === 1 ? '' : 's'}`);
  if (input.families.includes('corpus_accuracy')) {
    parts.push(
      `the library searched ${input.depth === 'full' ? 'statement by statement' : 'once per section'}`,
    );
  }
  if (input.families.includes('style')) {
    parts.push(styleCoverage(input, clausePasses));
  }
  // T-474 — arithmetic, said in the plan like every other family
  if (input.families.includes('stale_grounding')) {
    parts.push('every cited source compared with the library as it stands now');
  }
  if (input.attachedDocuments > 0) {
    parts.push(
      `${input.attachedDocuments} attached document${input.attachedDocuments === 1 ? '' : 's'}, quoted and never cited`,
    );
  }
  // T-399 — named, for the reason on `attachedUploads`: nothing else in the
  // record will ever say which file this was.
  if (input.attachedUploads.length > 0) {
    parts.push(`attached: ${input.attachedUploads.join(', ')} — never grounds, never cited`);
  }
  // T-469 — what the library search can reach, in the one sentence every
  // surface renders; only said where the corpus check is among the checks
  return input.families.includes('corpus_accuracy')
    ? `${parts.join(' · ')}. ${reachStatement(input.reach)}`
    : parts.join(' · ');
}

function styleCoverage(input: QaCheckPlanInput, passes: number): string {
  const clauses = input.styleClauses.count;
  const rules = input.styleRules;
  const parts: string[] = [];
  if (rules !== undefined && rules.total > 0) {
    // T-428 — rules first, because on a project that has restructured its
    // standard they are the whole of what binds, and the per-register
    // breakdown is what ADR-0054 asks the sentence to carry
    const registers = Object.entries(rules.byRegister)
      .filter(([, count]) => count > 0)
      .map(([register, count]) => `${count} ${register}`)
      .join(', ');
    parts.push(
      `${rules.applied} of ${rules.total} accepted rule${rules.total === 1 ? '' : 's'} applied` +
        (registers === '' ? '' : ` (${registers})`) +
        (rules.total > rules.applied
          ? `, ${rules.total - rules.applied} steering drafting only and raising nothing`
          : ''),
    );
  }
  if (clauses > 0) {
    parts.push(
      `style guide ${clauses} of ${clauses} clauses${passes > 1 ? `, in ${passes} passes` : ''}`,
    );
  }
  // ⚠ "no writing rules are loaded" is STATED rather than omitted: a run with
  // no style guide and no rulebook produces no style findings, which reads
  // exactly like a draft that broke none of them.
  if (parts.length === 0) return 'no writing rules are loaded for this project or firm';
  return parts.join(' · ');
}

/**
 * AFTER THE RUN — what it **did** cover, **in the same shape** (ADR-0053 §5).
 *
 * 🔒 The same shape matters more than the same words: a reader comparing the
 * two sentences should see the difference at a glance, which is what makes
 * *"the whole library"* becoming *"the library returned nothing for 3 sections"*
 * a fact rather than something to go looking for. **This is the only thing
 * distinguishing a clean result from an unexamined one**, which is why it is an
 * output beside the findings rather than a footnote under them — "no findings"
 * must always read as "no findings in what was read".
 */
export function coverageAfterQaCheck(result: {
  sectionsRead: number;
  sectionsPlanned: number;
  checksRun: number;
  clausesRead: number;
  clausesTotal: number;
  clausePasses: number;
  /** T-428 — the same two numbers the plan promised, as they turned out */
  rulesApplied?: number;
  rulesTotal?: number;
  passagesRead: number;
  sectionsWithNoPassages: number;
  attachedRead: number;
  /** T-399 — the uploaded files this run was handed, by name */
  attachedUploads?: readonly string[];
  discarded: number;
  contradictionGroups: number;
  /** T-474 — cited claims the stale-grounding check examined; absent where the
   * family was not run, so the sentence stays silent about it */
  staleClaimsChecked?: number;
  /**
   * T-469 — the run's reach, as it turned out, rendered by the one function
   * every surface uses. Said only where the corpus check ran.
   */
  reach?: RunReach;
}): string {
  const parts = [
    `${result.sectionsRead} of ${result.sectionsPlanned} section${result.sectionsPlanned === 1 ? '' : 's'} read`,
    `${result.checksRun} check${result.checksRun === 1 ? '' : 's'}`,
  ];
  parts.push(
    result.passagesRead === 0
      ? 'the library returned nothing to check against'
      : `${result.passagesRead} passage${result.passagesRead === 1 ? '' : 's'} of the record read`,
  );
  // 🔒 THE SAME SHAPE AS THE PLAN'S SENTENCE (ADR-0053 §5), so the difference
  // between what was promised and what happened is visible at a glance.
  if ((result.rulesTotal ?? 0) > 0) {
    parts.push(
      `${result.rulesApplied ?? 0} of ${result.rulesTotal} accepted rule${result.rulesTotal === 1 ? '' : 's'} applied`,
    );
  }
  if (result.clausesTotal > 0) {
    parts.push(
      `style guide ${result.clausesRead} of ${result.clausesTotal} clauses${result.clausePasses > 1 ? `, in ${result.clausePasses} passes` : ''}`,
    );
  }
  if (result.attachedRead > 0) {
    parts.push(`${result.attachedRead} attached excerpt${result.attachedRead === 1 ? '' : 's'}, never cited`);
  }
  // T-399 — the SAME shape as the plan's sentence (ADR-0053 §5): if the plan
  // named the file, the result names it too, or the two stop being comparable.
  if (result.attachedUploads !== undefined && result.attachedUploads.length > 0) {
    parts.push(`attached: ${result.attachedUploads.join(', ')} — never grounds, never cited`);
  }
  if (result.staleClaimsChecked !== undefined) {
    parts.push(
      `${result.staleClaimsChecked} cited claim${result.staleClaimsChecked === 1 ? '' : 's'} checked for out-of-date sources`,
    );
  }
  if (result.contradictionGroups > 1) {
    parts.push(`sections compared in ${result.contradictionGroups} groups`);
  }
  // absences the findings list cannot show, appended rather than omitted
  if (result.sectionsWithNoPassages > 0) {
    parts.push(
      `${result.sectionsWithNoPassages} section${result.sectionsWithNoPassages === 1 ? '' : 's'} the library said nothing about`,
    );
  }
  if (result.discarded > 0) {
    parts.push(
      `${result.discarded} suggested finding${result.discarded === 1 ? '' : 's'} discarded for not pointing at real text or a real source`,
    );
  }
  return result.reach === undefined
    ? parts.join(' · ')
    : `${parts.join(' · ')}. ${reachStatement(result.reach)}`;
}
