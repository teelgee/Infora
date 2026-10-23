// T-455 — the lifecycle vocabulary is one table, and the badge composes the
// revision only where the position carries one.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LIFECYCLE_LABELS, LifecycleBadge, lifecycleBadge } from './lifecycle';
import type { LifecyclePosition } from './lifecycle';

describe('lifecycleBadge', () => {
  it('appends the revision where the position carries one, and only there', () => {
    expect(lifecycleBadge('working', 'v0.3').label).toBe('Working v0.3');
    expect(lifecycleBadge('frozen', 'v0.3').label).toBe('Frozen v0.3');
    expect(lifecycleBadge('in_review', 'P01').label).toBe('In review P01');
    expect(lifecycleBadge('accepted', 'C01').label).toBe('Accepted C01');
    // record states say nothing about the revision on the badge
    expect(lifecycleBadge('superseded', 'C01').label).toBe('Superseded');
    expect(lifecycleBadge('withdrawn', 'C01').label).toBe('Withdrawn');
    expect(lifecycleBadge('rejected', 'P02').label).toBe('Rejected');
    // and a missing revision never leaves a dangling space
    expect(lifecycleBadge('working', null).label).toBe('Working');
    expect(lifecycleBadge('planned').label).toBe('Planned');
  });

  it('keys every position to one of the two axes the glossary names', () => {
    for (const [position, entry] of Object.entries(LIFECYCLE_LABELS)) {
      expect(['CDE state', 'Record state']).toContain(entry.axis);
      expect(entry.word.length).toBeGreaterThan(0);
      expect(lifecycleBadge(position as LifecyclePosition).label).toBe(entry.word);
    }
  });

  it('never prints the retired word "suitability" and never prints a snake_case state', () => {
    for (const entry of Object.values(LIFECYCLE_LABELS)) {
      expect(entry.word.toLowerCase()).not.toContain('suitability');
      expect(entry.word).not.toMatch(/_/);
    }
  });

  it('renders as the status-dot badge the design rules style', () => {
    const html = renderToStaticMarkup(<LifecycleBadge position="in_review" revision="P01" />);
    expect(html).toContain('class="badge');
    expect(html).toContain('In review P01');
  });
});
