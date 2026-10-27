/**
 * W4 timing: the final per-video plan (demo/plans/w4-…/plan.md §2), via WT_TITLES[4].chapters (frames). The
 * lead changes WT_TITLES; this file only lays the chapters out.
 * Frames are video-local; chapter `to` is exclusive.
 */
import { WT_TITLES } from '../../data/wrenfield';
import { layChapters, totalFrames } from '../shared';

const chapters = layChapters(WT_TITLES[4].chapters);
const closeFrom = chapters[chapters.length - 1].to;

export const META = {
  id: 'W4-tools',
  video: 4 as const,
  title: WT_TITLES[4],
  chapters,
  /** Close starts here (150 f), then the logo (90 f). */
  closeFrom,
  logoFrom: closeFrom + 150,
  total: totalFrames(closeFrom),
};
