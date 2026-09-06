// T-049 — the run trace: the coded chain rendered as a progressive checklist
// (Ask mockup), typed against the contracts Step so T-052 hands it a Run's
// steps unchanged. Delegate steps render as the indented sub-agent line; the
// withheld count reads from rail_outcomes.detail entries (ruled 2026-07-06).
import type { Step } from '@infora/contracts';

// The coded chain's five, plus T-263's seven worker types — a worker
// invocation is a Step in the same append-only tree (ADR-0028 §3), so the
// trace has to be able to name one. Found unlabelled 2026-08-28 while
// building T-331: `STEP_TYPES` widened with migration 0055 and this map did
// not, which typechecks only while a stale turbo cache hides it.
//
// The three whose workers are beyond V1 (`authority_lookup`, `web_research`,
// `verifier`) are labelled anyway, for the same reason the vocabulary declares
// them: this is a Record over a closed union, so an unlabelled member is a
// compile error rather than a blank line on a screen.
const LABEL: Record<Step['type'], string> = {
  retrieve: 'Assembled context',
  delegate: 'Sub-agent',
  draft: 'Drafted',
  ground_check: 'Ground-check',
  cite: 'Cited',
  corpus_retrieval: 'Searched the library',
  authority_lookup: 'Looked up an authority',
  web_research: 'Researched the web',
  extractor: 'Extracted',
  workflow_runner: 'Ran a workflow',
  document_builder: 'Built a document',
  verifier: 'Verified',
  // T-310 — the checker's three. Found unlabelled the same way T-331 found the
  // last set: `STEP_TYPES` widened and this map did not, and it typechecks
  // until the turbo cache is cold. The words are what a person watching a run
  // would say happened, not the capability's name.
  qa_section_check: 'Checked a section',
  qa_contradiction_check: 'Compared the sections',
  qa_document_check: 'Scored and checked the draft',
  // T-439 — drawer 9's one drawn widening. The Record over a closed union is
  // what made this a compile error rather than a blank line on a screen, which
  // is the third time it has caught exactly that.
  app_step: 'Ran an app',
};

const tick = (status: Step['status']) =>
  status === 'completed' ? '✓' : status === 'failed' ? '✕' : '…';

function duration(step: Step): string | null {
  if (step.endedAt === null) return null;
  const ms = new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

function detail(step: Step): string {
  switch (step.type) {
    case 'retrieve':
      return `${LABEL.retrieve} — ${step.sourceSet.length} access-resolved source${step.sourceSet.length === 1 ? '' : 's'}`;
    case 'draft':
      return step.model === undefined ? LABEL.draft : `${LABEL.draft} — ${step.model.id}`;
    case 'ground_check': {
      const withheld = step.railOutcomes.filter((r) => r.outcome === 'withheld').length;
      return withheld === 0
        ? `${LABEL.ground_check} — every claim resolved to a source`
        : `${LABEL.ground_check} — ${withheld} claim${withheld === 1 ? '' : 's'} withheld`;
    }
    default:
      return LABEL[step.type];
  }
}

export function RunTrace(props: { steps: Step[]; heading?: string }) {
  return (
    <div className="trace">
      <div className="t-head">
        {props.heading ?? 'Working on task · retrieve → draft → ground-check → cite'}
      </div>
      {props.steps.map((step) =>
        step.type === 'delegate' ? (
          <div key={step.id}>
            <div className="t-row">
              <span className="tick">{tick(step.status)}</span> 1 sub-agent
            </div>
            <div className="subagent">
              Targeted retrieval · {tick(step.status)} {step.status}
              {step.childRunId !== undefined && (
                <>
                  {' '}
                  <span className="mono">run {step.childRunId.slice(0, 8)}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div key={step.id} className="t-row">
            <span className="tick">{tick(step.status)}</span> {detail(step)}
            {duration(step) !== null && <span className="t-dur">{duration(step)}</span>}
          </div>
        ),
      )}
    </div>
  );
}
