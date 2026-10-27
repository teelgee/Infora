/**
 * Clip 04: the supplier-KPI app. Durations in frames, from demo/archive/2026-10-sizzle/plan/master-plan.md §2
 * and demo/archive/2026-10-sizzle/plan/video-04-*.md. Do not change without changing the plan.
 */
import type { ClipMeta } from '../../shared';
import { CARDS } from '../../data/wrenfield';

export const META: ClipMeta = {
  id: 'V04-kpi-app',
  body: { standalone: 780, film: 900 },
  standalone: 900, // ClipOpen 30 + body 780 + EndCard 90
  filmStart: 1767,
  title: CARDS.v04.title,
  endCard: CARDS.v04.end,
};
