// T-309 — THE DOCUMENT CREATOR'S PLAN: computed in code, priced before the
// click, and stating its coverage before the run and after it in the same
// shape (ADR-0053 §4 and §5).
//
// *In plain terms: before anything is generated, the system works out — in
// ordinary code, with no AI involved — exactly which steps will run, roughly
// what they will cost, and what the result will and will not cover. That is
// shown to the person first. After the run, the same coverage sentence is shown
// again with what actually happened in it, so "here is your document" is never
// an unqualified claim about material the run did not reach.*
//
// **The run semantics are NOT checker-specific**, which is the whole reason
// this file exists at T-309 rather than at T-336. ADR-0053 §4 rules the planner
// **code, not a model call**, and says so is load-bearing rather than an
// optimisation: if a model decided a run's shape, the same inputs would produce
// different plans on different days, and the workflow could not be **declared**
// at all — losing the one guarantee (same inputs, same steps, same order) a
// tool is sold on. That argument is about declared workflows, not about
// checking, so the document creator is held to it identically.
//
// 🔒 **AN UNPRICED STEP IS `null`, NEVER ZERO** (T-254, finding F7). A
// deployment that declared no rate for the model serving the draft call must
// read as *not priced*, because a plausible-looking zero is what a business
// case gets built on. `priced: false` is the plan saying so out loud.
import type { PlannedToolStep, ToolPlan, Workflow } from '@infora/contracts';
import { costOf } from '@infora/model';
import type { ModelRates } from '@infora/model';
import type { DocumentTemplate } from './workers/templates';

// `PlannedToolStep` and `ToolPlan` are declared in `contracts`, not here: the
// surface that renders a plan (T-335) sees `contracts` and `ui` alone, and a
// plan it cannot type is a plan it cannot render. The FUNCTION lives here
// because pricing needs the model rates, and `contracts` depends on nothing.

/**
 * What one section of a template is expected to cost the drafting call.
 *
 * Fixed numbers, deliberately: a plan whose estimate came from a model would be
 * a model call taken to avoid a model call, and would vary run to run for the
 * same document. They are an ESTIMATE and the plan says so; being repeatable
 * matters more than being exact, because the number's job is to let someone
 * decide whether to press the button.
 */
export const SECTION_COMPLETION_TOKENS = 350;
/** what a bound source contributes to the prompt, at the assembly's own grain */
export const SOURCE_PROMPT_TOKENS = 600;
/** the template's own headings and guidance, once */
export const TEMPLATE_PROMPT_TOKENS = 400;

export type DocumentCreationPlanInput = {
  workflow: Workflow;
  template: DocumentTemplate;
  /** how many library sources the author bound, chosen AHEAD of drafting (T-335) */
  sourceCount: number;
  /** the model that would serve the drafting call, for the rate lookup */
  draftModelId: string;
  rates?: ModelRates;
  /** the assembly budget one call is held to — the ceiling the estimate is capped at */
  tokenLimit: number;
};

export function planDocumentCreation(input: DocumentCreationPlanInput): ToolPlan {
  const sections = input.template.sections.length;
  // capped at the assembly budget: the gateway will not hand the builder more
  // than this, so an estimate above it would describe a call that cannot happen
  const promptTokens = Math.min(
    TEMPLATE_PROMPT_TOKENS + input.sourceCount * SOURCE_PROMPT_TOKENS,
    input.tokenLimit,
  );
  const completionTokens = sections * SECTION_COMPLETION_TOKENS;

  const steps: PlannedToolStep[] = input.workflow.steps.map((step) => {
    const drafting = step.worker === 'document_builder';
    const usage = drafting
      ? { tokensPrompt: promptTokens, tokensCompletion: completionTokens }
      : { tokensPrompt: 0, tokensCompletion: 0 };
    return {
      key: step.id,
      stage: step.stage,
      worker: step.worker ?? null,
      label: drafting
        ? `Draft ${sections} section${sections === 1 ? '' : 's'} into "${input.template.label}" from the ${input.sourceCount} bound source${input.sourceCount === 1 ? '' : 's'}`
        : `Run ${step.worker ?? step.stage}`,
      estimate: {
        calls: 1,
        ...usage,
        // an unpriced step is `null`, never 0 — a step with no model call is
        // priced at 0 because it genuinely spends nothing, and the two must
        // not be confused (T-254)
        cost: drafting
          ? costOf(input.rates, { id: input.draftModelId, version: input.draftModelId }, usage)
          : 0,
      },
    };
  });

  // A total is a number only when every step is priced. One unpriced step makes
  // the sum a partial figure wearing a total's name, which is the arithmetic
  // T-254 refuses.
  const priced = steps.every((step) => step.estimate.cost !== null);
  const total = priced ? steps.reduce((sum, step) => sum + (step.estimate.cost ?? 0), 0) : null;

  return {
    workflowId: input.workflow.id,
    workflowVersion: input.workflow.version,
    steps,
    coverage: coverageBefore(input.template, input.sourceCount),
    cost: { total, priced },
    refusal: refusalOf(input.sourceCount),
  };
}

/**
 * The pathological case, and the ONLY one (ADR-0053 §5).
 *
 * No bound sources means the builder has nothing to draft from and will produce
 * an empty document — a result indistinguishable, on screen, from one where the
 * record genuinely said nothing. Refusing before the click is the honest place
 * to say it; a caveat under an empty document is read after the disappointment.
 */
function refusalOf(sourceCount: number): string | null {
  return sourceCount > 0
    ? null
    : 'No sources are bound to this document, so nothing can be drafted from the record. Bind at least one library source and the plan will regenerate.';
}

/** Before the run — what it WILL cover. */
export function coverageBefore(template: DocumentTemplate, sourceCount: number): string {
  return [
    `${template.sections.length} section${template.sections.length === 1 ? '' : 's'}`,
    `${sourceCount} bound source${sourceCount === 1 ? '' : 's'}`,
    '1 drafting pass',
  ].join(' · ');
}

/**
 * After the run — what it DID cover, **in the same shape** (ADR-0053 §5).
 *
 * The same shape matters more than the same words: a reader comparing the two
 * sentences should be able to see the difference at a glance, which is what
 * makes *"4 bound sources"* becoming *"2 sources used"* a fact rather than
 * something they would have to go looking for. Unreachable sources, withheld
 * sentences and material written outside the outline are appended because all
 * three are absences the document itself cannot show.
 *
 * 🔒 **`sectionsWritten` counts SECTIONS OF THE OUTLINE, and nothing else**
 * (T-402). The run reported *"1 of 4 sections written"* into a document that
 * was empty: the drafting call wrote prose before any heading, that material
 * was filed under `unsectioned`, the assembly correctly wrote none of it, and
 * the tally counted the bucket as a section anyway. This is the one surface
 * whose whole job is the difference between a clean result and an unexamined
 * one, so the overstatement is the worst kind of defect it could carry. What
 * the run did produce and did not write is now **stated**, in the shape the
 * checker states its discards — appended, named, and never silently absorbed.
 */
export function coverageAfter(result: {
  /** sections OF THE OUTLINE written — never the `unsectioned` bucket (T-402) */
  sectionsWritten: number;
  sectionsPlanned: number;
  sourcesUsed: number;
  sourcesBound: number;
  unreachableSources: number;
  withheld: number;
  /** grounded sentences that matched no heading, so were not written (T-402) */
  outsideOutline: number;
}): string {
  const parts = [
    `${result.sectionsWritten} of ${result.sectionsPlanned} sections written`,
    `${result.sourcesUsed} of ${result.sourcesBound} bound sources used`,
    '1 drafting pass',
  ];
  if (result.unreachableSources > 0) {
    parts.push(
      `${result.unreachableSources} named source${result.unreachableSources === 1 ? '' : 's'} the library did not return`,
    );
  }
  if (result.withheld > 0) {
    parts.push(
      `${result.withheld} sentence${result.withheld === 1 ? '' : 's'} withheld for resting on no source`,
    );
  }
  if (result.outsideOutline > 0) {
    parts.push(
      `${result.outsideOutline} sentence${result.outsideOutline === 1 ? '' : 's'} written outside the outline and left out of the document`,
    );
  }
  return parts.join(' · ');
}
