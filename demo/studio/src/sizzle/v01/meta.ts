/**
 * Clip 01: cited drafting. Durations in frames, from demo/archive/2026-10-sizzle/plan/master-plan.md §2
 * and demo/archive/2026-10-sizzle/plan/video-01-*.md. Do not change without changing the plan.
 */
import type { ClipMeta } from '../../shared';
import { CARDS } from '../../data/wrenfield';

export const META: ClipMeta = {
  id: 'V01-cited-drafting',
  body: { standalone: 723, film: 723 },
  standalone: 843, // ClipOpen 30 + body 723 + EndCard 90
  filmStart: 69,
  title: CARDS.v01.title,
  endCard: CARDS.v01.end,
};
