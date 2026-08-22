// T-347 — the cycle status bar (approved mockup:
// docs/design/mockups/deliverable-status-page.html). One component, two
// screens: the deliverable status page (T-348) and the cycle/review screen.
// Four states — Submitted → In review → Responding → Complete — driven
// entirely by stored state (the round's state and the cycle's terminal),
// never a client-side timer: the T-293 rule, applied verbatim. A
// non-accepting verdict loops to the next round, whose bar restarts at
// Submitted; prior rounds compress to one line beneath (optional — the cycle
// screen already collapses them to RoundSummary rows, so it hides them here).
// ADR-0014 honesty: no live comment count anywhere on the bar — the server
// already withholds open-round comments from the authoring side, and a count
// that renders 0 for one side and 3 for the other would dress the wall up as
// an absence.
import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import type { ReviewCycle, Round } from '@infora/contracts';
import { Badge, Button } from '@infora/ui';
import { formatDate } from './screens/shared';

type StepState = 'done' | 'active' | 'future';
const STEP_LABELS = ['Submitted', 'In review', 'Responding', 'Complete'] as const;

/** The four step states for the newest round, off stored state alone. */
function deriveSteps(cycle: ReviewCycle, round: Round): StepState[] {
  if (cycle.state === 'accepted') return ['done', 'done', 'done', 'done'];
  if (cycle.state === 'closed_rejected') {
    // frozen where it stopped — the terminal badge carries the story
    const reached = round.state === 'submitted' ? 1 : round.state === 'open' ? 2 : 3;
    return STEP_LABELS.map((_, i) => (i < reached ? 'done' : 'future'));
  }
  switch (round.state) {
    case 'submitted':
      return ['active', 'future', 'future', 'future'];
    case 'open':
      return ['done', 'active', 'future', 'future'];
    default: // issued | responded — the pen is with the authoring team
      return ['done', 'done', 'active', 'future'];
  }
}

function StepMarker(props: { state: StepState; number: number }) {
  const base: CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    flex: 'none',
    boxSizing: 'border-box',
  };
  if (props.state === 'done') {
    return (
      <span style={{ ...base, background: 'var(--action-primary-bg)', color: 'var(--action-primary-text)' }}>
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  if (props.state === 'active') {
    return (
      <span
        style={{
          ...base,
          background: 'var(--surface-pane)',
          color: 'var(--text-primary)',
          border: '2px solid var(--action-primary-bg)',
        }}
      >
        {props.number}
      </span>
    );
  }
  return (
    <span style={{ ...base, background: 'var(--surface-active)', color: 'var(--text-muted)' }}>
      {props.number}
    </span>
  );
}

export function CycleStatusBar(props: {
  cycle: ReviewCycle;
  /** Prior rounds compressed to one line each beneath the stepper. The cycle
   * screen passes false — its RoundSummary rows already carry them. */
  showPriorRounds?: boolean;
  /** Present only when the viewer may acknowledge (owner organisation,
   * ADR-0051 §3) — renders the act beside the bar while a round is submitted. */
  onAcknowledge?: () => void;
  /** T-372 — why the receipt cannot be given yet (ADR-0033/0051 addenda: it
   * waits on the lead reviewer's own acceptance). Disables the act rather than
   * removing it: the viewer holds it, it is simply not available, and hiding
   * the button would make an ordered gate look like a missing permission. */
  acknowledgeBlockedReason?: string;
}) {
  const { cycle } = props;
  const rounds = [...cycle.rounds].sort((a, b) => a.number - b.number);
  const current = rounds.at(-1);
  if (!current) return null;
  const steps = deriveSteps(cycle, current);
  const prior = rounds.slice(0, -1);

  const target = current.reviewPeriodTarget;
  // display marker only — the target guides, reminds and marks overdue, and
  // never gates or closes anything (ADR-0005). The countdown is display math
  // on a stored date, not a timer driving state.
  const targetLive =
    target !== null && (current.state === 'submitted' || current.state === 'open') && cycle.state === 'active';
  const daysLeft = target ? Math.ceil((new Date(target).getTime() - Date.now()) / 86_400_000) : 0;
  const overdue = targetLive && daysLeft < 0;

  const cycleBadge =
    cycle.state === 'accepted'
      ? { tone: 'success' as const, label: 'Accepted' }
      : cycle.state === 'closed_rejected'
        ? { tone: 'danger' as const, label: 'Closed as rejected' }
        : { tone: 'info' as const, label: 'Cycle active' };

  return (
    // the design system's nested-card treatment, exactly as the approved
    // mockup renders it (owner-ruled 2026-08-06 after trying pane elevation)
    <div className="card">
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--surface-active)',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 11.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              flex: 'none',
              marginTop: 1,
            }}
          >
            {current.versionReference} · Round {current.number}
          </span>
          <div style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'flex-start' }} role="list" aria-label={`Round ${current.number} progress`}>
            {STEP_LABELS.map((label, i) => (
              <div key={label} role="listitem" style={{ display: 'flex', flexDirection: 'column', flex: i < STEP_LABELS.length - 1 ? 1 : 'none', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <StepMarker state={steps[i]!} number={i + 1} />
                  {i < STEP_LABELS.length - 1 && (
                    <span
                      style={{
                        height: 2,
                        flex: 1,
                        margin: '0 6px',
                        // neutral-300/400, NOT border-default — the border
                        // tone vanishes against the sunken card fill
                        background: steps[i] === 'done' ? 'var(--text-faint)' : 'var(--primitive-neutral-300)',
                      }}
                    />
                  )}
                </div>
                <span
                  style={{
                    marginTop: 6,
                    fontSize: 12.5,
                    fontWeight: steps[i] === 'future' ? 500 : 600,
                    color: steps[i] === 'future' ? 'var(--text-muted)' : 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none', marginTop: 1 }}>
            {target && cycle.state === 'active' && (
              <span style={{ fontSize: 11.5, color: overdue ? 'var(--feedback-danger-text)' : 'var(--text-muted)' }}>
                {`Review period target ${formatDate(target)}`}
                {overdue
                  ? ' — overdue'
                  : targetLive && daysLeft >= 0
                    ? ` — ${daysLeft === 0 ? 'due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}`
                    : ''}
              </span>
            )}
            <Badge tone={cycleBadge.tone}>{cycleBadge.label}</Badge>
            {props.onAcknowledge && current.state === 'submitted' && cycle.state === 'active' && (
              <Button
                size="sm"
                variant="primary"
                disabled={props.acknowledgeBlockedReason !== undefined}
                title={props.acknowledgeBlockedReason}
                onClick={props.onAcknowledge}
              >
                Acknowledge submission
              </Button>
            )}
          </div>
        </div>
        {props.showPriorRounds !== false && prior.length > 0 && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 8,
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              fontSize: 11.5,
              color: 'var(--text-muted)',
            }}
          >
            {prior.map((r) => {
              const answered = r.comments.filter((c) => c.response !== null).length;
              return (
                <span key={r.id}>
                  <b>Round {r.number}</b> · {r.versionReference}
                  {r.deliverableCode ? ` — issued ${r.deliverableCode.code}` : ''}
                  {r.comments.length > 0 ? ` · ${answered} of ${r.comments.length} answered` : ''}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
