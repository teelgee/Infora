import type { BadgeTone } from '@infora/ui';

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
