/**
 * Clip 05: the progress-pack app. Durations in frames, from demo/archive/2026-10-sizzle/plan/master-plan.md §2
 * and demo/archive/2026-10-sizzle/plan/video-05-*.md. Do not change without changing the plan.
 */
import type { ClipMeta } from '../../shared';
import { CARDS } from '../../data/wrenfield';

export const META: ClipMeta = {
  id: 'V05-deck-app',
  body: { standalone: 779, film: 663 },
  standalone: 899, // ClipOpen 30 + body 779 + EndCard 90
  filmStart: 2667,
  title: CARDS.v05.title,
  endCard: CARDS.v05.end,
};
