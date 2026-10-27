/**
 * Clip 02: the QA checker. Durations in frames, from demo/archive/2026-10-sizzle/plan/master-plan.md §2
 * and demo/archive/2026-10-sizzle/plan/video-02-*.md. Do not change without changing the plan.
 */
import type { ClipMeta } from '../../shared';
import { CARDS } from '../../data/wrenfield';

export const META: ClipMeta = {
  id: 'V02-qa-checker',
  body: { standalone: 503, film: 443 },
  standalone: 623, // ClipOpen 30 + body 503 + EndCard 90
  filmStart: 792,
  title: CARDS.v02.title,
  endCard: CARDS.v02.end,
};
