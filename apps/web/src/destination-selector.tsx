// T-295 — the output destination selector, at the top of a new conversation.
//
// 🔒 **THIS CARRIES PERMISSION CONSEQUENCES AND IS NOT A PREFERENCE.** Where an
// answer is written decides who can read it, so the two rules below are the
// component, and everything else is chrome:
//
//   1. **A destination broader than the source material is BLOCKED by
//      default**, and the refusal **names both labels** — "refused" alone tells
//      a user nothing they can act on and invites them to conclude the system
//      is broken rather than careful. Writing anyway takes an explicit
//      override with a typed reason, recorded on the run and in the audit
//      trail (T-249's `label_overrides`, append-only).
//   2. **Narrower is allowed, with no warning at all.** Writing restricted
//      material somewhere more restricted is the safe direction, and a warning
//      there would train people to click through the one that matters.
//
// ⚠ **This surface makes no judgement of its own.** Both labels and the verdict
// come from `GET /runs/:runId/destination-check`, which runs the *same*
// `checkPropagation` over the *same* freshly-computed audiences that the write
// itself runs — T-373's rule from the promotion window: a preflight computed
// separately from the act it previews is a preflight that will eventually lie.
// The selector surfaces what the backend already refuses; it cannot allow
// something the backend would block, because it is not the thing deciding.
//
// The destinations offered are the sandboxes the user can reach at their real
// scope — `GET /projects/:id/sandboxes` is grant-based and resolves server-side,
// so this list has no scope parameter and cannot be widened from here.
import { useEffect, useState } from 'react';
import type { DestinationCheckResponse, Sandbox } from '@infora/contracts';
import { Button, Chip, DropdownMenu, DropdownMenuItem, TextInput } from '@infora/ui';
import { api } from './api';

export type Destination = { id: string; name: string } | null;

const LABEL_WORDS: Record<DestinationCheckResponse['sourceLabel'], string> = {
  participant_narrowed: 'restricted to named people',
  single_organisation: 'held by one organisation',
  multi_organisation: 'shared across organisations',
  project_wide: 'open to the whole project',
};

/** the destinations the requester can actually reach; resolved server-side */
export function useDestinations(projectId: string): Sandbox[] {
  const [items, setItems] = useState<Sandbox[]>([]);
  useEffect(() => {
    void api
      .sandboxes(projectId)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [projectId]);
  return items;
}

export function DestinationSelector(props: {
  destinations: Sandbox[];
  value: Destination;
  onChange: (destination: Destination) => void;
}) {
  if (props.destinations.length === 0) return null;
  return (
    <div className="destination-selector">
      <span className="ds-label">Write answers to</span>
      <DropdownMenu
        trigger={(toggle) => (
          <Chip
            onClick={toggle}
            title="Where an answer goes when you carry it into the editor. This decides who can read it — a destination broader than the answer's sources is refused."
          >
            ▤ {props.value?.name ?? 'Choose a destination'}
          </Chip>
        )}
      >
        {props.destinations.map((sandbox) => (
          <DropdownMenuItem
            key={sandbox.id}
            onClick={() => props.onChange({ id: sandbox.id, name: sandbox.name })}
          >
            {sandbox.name}
          </DropdownMenuItem>
        ))}
        {props.value !== null && (
          <DropdownMenuItem onClick={() => props.onChange(null)}>
            Use my default working area
          </DropdownMenuItem>
        )}
      </DropdownMenu>
    </div>
  );
}

/**
 * The warning, and the block.
 *
 * Rendered per answer, because the verdict is per answer: the source label is
 * computed from *that run's* source set, so the same destination can be legal
 * for one answer in a conversation and refused for the next. Nothing is cached
 * across runs for that reason.
 */
export function DestinationWarning(props: {
  runId: string;
  destination: Destination;
  onOverride: (reason: string) => void;
}) {
  const [verdict, setVerdict] = useState<DestinationCheckResponse | null>(null);
  const destinationId = props.destination?.id ?? null;

  useEffect(() => {
    setVerdict(null);
    if (destinationId === null) return;
    void api
      .destinationCheck(props.runId, destinationId)
      // a check that could not be taken is NOT an allowance: rendering nothing
      // leaves the write to refuse, which it still will
      .catch(() => null)
      .then((res) => setVerdict(res ?? null));
  }, [props.runId, destinationId]);

  // narrower or equal is allowed and says nothing — a warning on the safe
  // direction is how people learn to click through the one that matters
  if (verdict === null || verdict.allowed) return null;

  return (
    <DestinationBlock
      verdict={verdict}
      destinationName={props.destination?.name ?? ''}
      onOverride={props.onOverride}
    />
  );
}

/**
 * The block itself, separated from the fetch by T-395.
 *
 * It is split for one reason: **the two sentences below are the component**,
 * and until `apps/web` had a test runner they shipped unpinned. A block whose
 * copy lives behind an effect and a network call cannot be asserted at render,
 * so the effect stays in `DestinationWarning` and the words live here, where a
 * test can hold them. Nothing about the behaviour moved.
 */
export function DestinationBlock(props: {
  verdict: DestinationCheckResponse;
  destinationName: string;
  onOverride: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="banner banner--warning" style={{ marginTop: 6 }}>
      <div>
        {/* both labels, named — the whole point of the refusal */}
        This answer draws on material {LABEL_WORDS[props.verdict.sourceLabel]}. The selected
        destination “{props.destinationName}” is {LABEL_WORDS[props.verdict.destinationLabel]}.
        Writing it there would widen who can read it, so it is blocked.
        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{props.verdict.reason}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <TextInput
          value={reason}
          onChange={setReason}
          placeholder="Why this should be written there anyway…"
        />
        {/* the override is explicit, and its reason is mandatory — an override
            with no reason is a record that answers "somebody did it" and not
            "somebody did it because" */}
        <Button
          size="sm"
          variant="quiet"
          disabled={reason.trim() === ''}
          onClick={() => props.onOverride(reason.trim())}
        >
          Write it there anyway
        </Button>
      </div>
    </div>
  );
}
