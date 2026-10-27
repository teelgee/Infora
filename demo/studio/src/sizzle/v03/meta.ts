/**
 * Clip 03: review across the ethical wall. Durations in frames, from demo/archive/2026-10-sizzle/plan/master-plan.md §2
 * and demo/archive/2026-10-sizzle/plan/video-03-*.md. Do not change without changing the plan.
 */
import type { ClipMeta } from '../../shared';
import { CARDS } from '../../data/wrenfield';

export const META: ClipMeta = {
  id: 'V03-review-wall',
  body: { standalone: 652, film: 532 },
  standalone: 772, // ClipOpen 30 + body 652 + EndCard 90
  filmStart: 1235,
  title: CARDS.v03.title,
  endCard: CARDS.v03.end,
};
