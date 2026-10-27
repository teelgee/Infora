/**
 * W1 timing: the final per-video plan (demo/plans/w1-…/plan.md §2), via WT_TITLES[1].chapters (frames). The
 * lead changes WT_TITLES; this file only lays the chapters out.
 * Frames are video-local; chapter `to` is exclusive.
 */
import { WT_TITLES } from '../../data/wrenfield';
import { layChapters, totalFrames } from '../shared';

const chapters = layChapters(WT_TITLES[1].chapters);
const closeFrom = chapters[chapters.length - 1].to;

export const META = {
  id: 'W1-document-management',
  video: 1 as const,
  title: WT_TITLES[1],
  chapters,
  /** Close starts here (150 f), then the logo (90 f). */
  closeFrom,
  logoFrom: closeFrom + 150,
  total: totalFrames(closeFrom),
};
