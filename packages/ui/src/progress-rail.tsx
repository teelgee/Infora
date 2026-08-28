// T-293 — the progress rail: the plan's stages in the user's words, driven by
// the plan's own step states.
//
// **THE RAIL IS A TRUST SURFACE, NOT A SPINNER.** A rail driven by a
// client-side timer looks right most of the time, which is exactly what makes
// it a trust problem rather than a bug: it is a claim about what the system did
// that happens to be a good guess. So there is no timer in this file, no
// interval, no animation that advances on its own, and no state at all — every
// mark on the screen is read from a `PlanStep` the server wrote.
//
// The four rules from the Wave 8 design reference, and how each is kept:
//
//   1. **a stage that did not run is never shown as having run.** State comes
//      from `step.state` and nothing else; `pending` renders as not started.
//   2. **a conditional stage that was not needed is absent, or shown
//      explicitly as not run — never quietly completed.** The rail renders the
//      PLAN's steps, so a stage the plan never declared is simply not here; a
//      stage the plan declared and the walk skipped renders as skipped.
//   3. **failed and skipped stages show as failed and skipped**, in those
//      words. There is no state that renders as a tick without being complete.
//   4. **transitions come from the plan's step states.** The component takes
//      steps as a prop and derives nothing about time.
//
// The fifth rule is the one that made this component's signature: `steps` is
// nullable, and null is NOT an empty rail. A run in flight has no readable
// plan yet — the API returns on completion — so the honest rendering of "we
// are waiting" is a stated absence of record, never the first stage lit up.
import type { PlanStep, PlanStepState } from '@infora/contracts';

/**
 * The stage vocabulary in the user's words (the Wave 8 design reference).
 *
 * A `Record` over the closed union rather than a lookup with a fallback: a
 * stage added to `PLAN_STAGES` without a phrase here is a compile error, where
 * a fallback would put a raw enum value — or worse, a blank line — on the
 * screen of the surface whose whole job is saying what happened.
 */
const STAGE_WORDS: Record<PlanStep['stage'], string> = {
  understand: 'Understanding your question',
  load_context: 'Loading context',
  clarify: 'Scoping',
  search_corpus: 'Searching project documents',
  check_authority: 'Checking the consenting canon',
  research_web: 'Researching publicly available sources',
  plan: 'Planning the analysis',
  analyse: 'Running the analysis',
  verify: 'Verifying citations',
  present: 'Report',
};

/**
 * What each state says, in words rather than only in colour.
 *
 * `pending` is "not started" and not blank, because a blank row beside a
 * finished run reads as a stage that ran and had nothing to report — which is
 * rule 1 broken by omission.
 */
const STATE_WORDS: Record<PlanStepState, string> = {
  pending: 'not started',
  running: 'running',
  complete: 'done',
  failed: 'failed',
  skipped: 'skipped',
};

const STATE_MARK: Record<PlanStepState, string> = {
  pending: '○',
  running: '◐',
  complete: '●',
  failed: '✕',
  skipped: '–',
};

export function ProgressRail(props: {
  /**
   * The plan's steps in ordinal order, or **null when no plan has been read
   * yet** — a run in flight, or a reopened answer whose plan has not loaded.
   * Null and `[]` are deliberately different: an empty array is a plan with no
   * steps, which is a fact; null is the absence of a record, which is not.
   */
  steps: PlanStep[] | null;
  heading?: string;
}) {
  return (
    <div className="progress-rail">
      <div className="pr-head">{props.heading ?? 'What ran'}</div>
      {props.steps === null ? (
        // NOT a lit-up first stage. Nothing has been recorded, so nothing is
        // claimed — this line is the whole reason the prop is nullable.
        <div className="pr-empty">
          No plan has been recorded yet. This rail shows what actually ran, so it stays empty
          until the run reports.
        </div>
      ) : props.steps.length === 0 ? (
        <div className="pr-empty">This run&rsquo;s plan declared no steps.</div>
      ) : (
        <ol className="pr-steps">
          {[...props.steps]
            .sort((a, b) => a.ordinal - b.ordinal)
            .map((step) => (
              <li key={step.id} className={`pr-step is-${step.state}`}>
                <span className="pr-mark" aria-hidden="true">
                  {STATE_MARK[step.state]}
                </span>
                <span className="pr-stage">{STAGE_WORDS[step.stage]}</span>
                <span className="pr-state">{STATE_WORDS[step.state]}</span>
              </li>
            ))}
        </ol>
      )}
    </div>
  );
}
