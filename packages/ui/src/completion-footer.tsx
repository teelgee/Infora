// T-294 — the completion footer: what an answer is, stated under it.
//
// **THE MODE IS THE HARD REQUIREMENT AND IT IS ALWAYS VISIBLE.** A user must
// never be unable to tell which kind of answer they are holding: a declared
// workflow promises the same steps in the same order for the same inputs, and a
// model-chosen run promises nothing of the sort while producing something that
// reads identically. So the mode is stated in words at the top of the footer,
// never behind the Details affordance, and it is read from `plan.mode` — the
// stored column — never derived from whether a `workflowId` happens to be set.
// T-267's edited plans are exactly why that distinction earns a comment: an
// edited plan is `model_chosen` even though it began declared, and anything
// deriving the label from the workflow would put the old promise on a plan
// that no longer makes it.
//
// The footer takes the plan as `Plan | null` for the same reason the rail takes
// nullable steps (T-293): a plan that could not be read is a stated absence,
// never a guess. Nothing here computes a fact the record does not hold.
import { useState } from 'react';
import { reachStatement } from '@infora/contracts';
import type { Citation, Plan, Run, Step } from '@infora/contracts';
import { WorkingSetLine } from './working-set-line';

const MODE_WORDS = {
  declared: 'Ran a declared workflow',
  model_chosen: 'Composed for this question',
} as const;

/** claims cited / withheld / labelled open-world, off the rail outcomes only. */
function outcomeCounts(steps: Step[]) {
  const outcomes = steps.filter((step) => step.type === 'ground_check').flatMap((s) => s.railOutcomes);
  return {
    // the deterministic check ran at all — zero outcomes is "no check recorded",
    // which is not the same as "nothing was withheld" (T-256's own distinction)
    recorded: outcomes.length > 0,
    passed: outcomes.filter((o) => o.outcome === 'passed').length,
    withheld: outcomes.filter((o) => o.outcome === 'withheld').length,
    openWorld: outcomes.filter((o) => o.outcome === 'open_world').length,
  };
}

/**
 * T-254's rule on the one surface that reports the number: **null is "nobody
 * priced it" and 0 is a price.** Rendering null as `$0.0000` would put finding
 * F7 back — the arithmetic succeeds, the figure is plausible, and nobody
 * notices until a provider changes a model id. Exported so the rule is pinned
 * directly rather than through a Details section static markup never renders.
 */
export function formatStepCost(cost: number | null | undefined): string {
  if (cost === undefined || cost === null) return 'unpriced';
  return `$${cost.toFixed(4)}`;
}

export function CompletionFooter(props: {
  run: Run;
  /** null = the plan could not be read; the footer says so rather than guessing */
  plan: Plan | null;
  /** the Lens label for `plan.lensId`, when the deployment still carries it */
  lensLabel?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { run, plan } = props;
  const counts = outcomeCounts(run.steps);
  const stepById = new Map(run.steps.map((step) => [step.id, step]));

  return (
    <div className="completion-footer">
      <div className="cf-line">
        {/* what was produced, in one line */}
        <span className="cf-produced">
          {run.response === null
            ? 'No answer was produced — nothing survived the ground check.'
            : `${counts.passed} cited claim${counts.passed === 1 ? '' : 's'}`}
        </span>
        <span className="cf-sep">·</span>
        {/* the orchestration mode, in words. Always visible, never derived. */}
        <span className="cf-mode">
          {plan === null
            ? 'Orchestration mode not recorded for this answer'
            : plan.mode === 'declared' && plan.workflowId !== null
              ? `${MODE_WORDS.declared}: ${plan.workflowId} (v${plan.workflowVersion ?? '?'})`
              : MODE_WORDS[plan.mode]}
        </span>
        {plan !== null && plan.lensId !== null && (
          <>
            <span className="cf-sep">·</span>
            <span>
              {props.lensLabel ?? plan.lensId} Lens{plan.lensVersion !== null && ` v${plan.lensVersion}`}
            </span>
          </>
        )}
        {/* T-471 — a run handed a working set says so beside its answer, and
            never cites it. The list is on hover; a reader outside those
            drafts' working area is told only how many. */}
        {run.workingSet !== undefined && run.workingSet.length > 0 && (
          <>
            <span className="cf-sep">·</span>
            <WorkingSetLine entries={run.workingSet} />
          </>
        )}
        {counts.withheld > 0 && (
          <>
            <span className="cf-sep">·</span>
            <span className="cf-withheld">{counts.withheld} withheld</span>
          </>
        )}
        {counts.openWorld > 0 && (
          <>
            <span className="cf-sep">·</span>
            <span className="cf-open-world">{counts.openWorld} labelled model knowledge</span>
          </>
        )}
      </div>

      {/* T-470 — what the run read and what it could not, in the one sentence
          `reachStatement` renders everywhere. An answer from before the counts
          existed has none, and says nothing rather than guessing. */}
      {run.reach !== undefined && run.reach !== null && (
        <div className="cf-reach">{reachStatement(run.reach)}</div>
      )}

      {/* Where verification could not be taken independently, SAY SO. The
          deterministic ground-check always runs and is code, not a model; the
          independent-family verifier is T-275/T-286 and is beyond V1, so no
          answer in this build carries one. Saying nothing would let a reader
          assume the stronger check happened. */}
      <div className="cf-verification">
        {counts.recorded
          ? 'Every claim was checked against the sources this run actually admitted. That check is deterministic code, not a second model — no independent model verification was taken.'
          : 'No ground-check outcomes were recorded for this answer.'}
      </div>

      <button type="button" className="cf-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Hide details' : 'Details'}
      </button>

      {open && (
        <div className="cf-details">
          <section>
            <h4>The plan</h4>
            {plan === null ? (
              <p className="cf-absent">No plan could be read for this answer.</p>
            ) : (
              <ol className="cf-steps">
                {[...plan.steps]
                  .sort((a, b) => a.ordinal - b.ordinal)
                  .map((step) => {
                    const row = step.stepRowId === null ? undefined : stepById.get(step.stepRowId);
                    return (
                      <li key={step.id}>
                        <span className="cf-stage">{step.stage}</span>
                        <span className={`cf-state cf-state--${step.state}`}>{step.state}</span>
                        {/* the workers invoked — a step naming none ran the
                            coded chain's own leaf, which is a fact rather than
                            a gap, so it is stated instead of left blank */}
                        <span className="cf-worker">{step.worker ?? 'coded leaf'}</span>
                        {/* per-step model and cost. There is no "pinned" marker
                            because nothing can pin: a per-conversation model pin
                            is the Model chip, which is Q-021 and unbuilt, so
                            every model here was chosen by the router. A column
                            that could never be true would be a claim the code
                            cannot make (T-269's rule, one surface up). */}
                        <span className="cf-model">
                          {row?.model === undefined ? 'no model call' : `${row.model.id} · router-chosen`}
                        </span>
                        <span className="cf-cost">{row?.usage === undefined ? '—' : formatStepCost(row.usage.cost)}</span>
                      </li>
                    );
                  })}
              </ol>
            )}
          </section>

          <section>
            <h4>Citation manifest</h4>
            <CitationManifest citations={run.citations} />
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Every source behind the answer, with its register.
 *
 * ⚠ **Version and locator are not here, and their absence is the record's, not
 * this component's.** `Citation.source` carries a version id and a document
 * reference for a library source, and an authority ref for the other register;
 * the version *reference* and the locator live on the assembled item and reach
 * no persisted row. Rendering a plausible stand-in would be worse than the gap,
 * so the manifest names what the record holds and says what it does not.
 */
function CitationManifest(props: { citations: Citation[] }) {
  if (props.citations.length === 0) {
    return <p className="cf-absent">This answer cites no sources.</p>;
  }
  return (
    <>
      <ul className="cf-manifest">
        {props.citations.map((citation) => (
          <li key={citation.id}>
            {'versionId' in citation.source ? (
              <>
                <span className="cf-register">Record</span>
                <span className="mono">{citation.source.documentReference}</span>
              </>
            ) : (
              <>
                <span className="cf-register">Authority</span>
                <span className="mono">{citation.source.authorityRef}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="cf-absent">
        The version reference and the locator are not recorded on a citation — open a source to read
        the passage it was drawn from.
      </p>
    </>
  );
}
