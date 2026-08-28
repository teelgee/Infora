import type { BadgeTone } from '@infora/ui';
import type { ContextState } from '@infora/contracts';

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

// One date format across the app (T-233): "25 Jul 2026"; the datetime variant
// adds the time for timestamps (comment/run activity).
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * T-388 — the context-state badge, and it NAMES ITS REASON.
 *
 * "Not used for AI answers" on its own is the unhelpful version: a user who
 * reads it cannot tell whether the deliverable was ended, replaced, or accepted
 * under a code their own project decided not to rely on — three situations with
 * three different responses. So the label always carries the why, and the why
 * comes from the server's derivation rather than being re-inferred here, because
 * a surface that worked it out for itself would be the second state machine the
 * ADR refuses (ADR-0013 §6).
 *
 * Null when the deliverable grounds: silence is right there. A green "used for
 * AI answers" chip on every row would make the ordinary case shout and the
 * exceptional case blend in.
 */
export function contextStateBadge(state: ContextState): { tone: BadgeTone; label: string } | null {
  if (state.grounds) return null;
  return { tone: 'warning', label: `Not used for AI answers — ${state.reason}` };
}

/** A stored status/state → badge tone + humanised label. */
export function statusBadge(status: string): { tone: BadgeTone; label: string } {
  const label = status.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
  // explicit tones for the known statuses; the keyword fallback keeps novel
  // states from rendering tone-less
  const TONES: Record<string, BadgeTone> = {
    planned: 'neutral',
    in_production: 'success',
    in_review: 'info',
    // a round awaiting the owner's acknowledgement (ADR-0051)
    submitted: 'warning',
    responding: 'warning',
    accepted: 'success',
    rejected: 'danger',
    withdrawn: 'neutral',
    // run/agent states (Ask, History)
    running: 'neutral',
    succeeded: 'success',
    completed: 'success',
    failed: 'danger',
  };
  const tone: BadgeTone =
    TONES[status] ??
    (status.includes('review')
      ? 'info'
      : status.includes('respond')
        ? 'warning'
        : status.includes('fail') || status.includes('reject')
          ? 'danger'
          : 'neutral');
  return { tone, label };
}
