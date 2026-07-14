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

/** Work-item status → mockup badge tone; label humanised from the stored key. */
export function statusBadge(status: string): { tone: BadgeTone; label: string } {
  const label = status.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
  const tone: BadgeTone = status.includes('review')
    ? 'slate'
    : status.includes('respond')
      ? 'amber'
      : status === 'in_production'
        ? 'green'
        : 'grey';
  return { tone, label };
}
