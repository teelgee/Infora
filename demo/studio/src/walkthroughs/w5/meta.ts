/**
 * W5 timing: demo/plans/w5-ethical-walls/plan.md §1, via WT_TITLES[5].chapters (frames). The
 * lead changes WT_TITLES; this file only lays the chapters out.
 * Frames are video-local; chapter `to` is exclusive.
 */
import { WT_TITLES } from '../../data/wrenfield';
import { layChapters, totalFrames } from '../shared';

const chapters = layChapters(WT_TITLES[5].chapters);
const closeFrom = chapters[chapters.length - 1].to;

export const META = {
  id: 'W5-ethical-walls',
  video: 5 as const,
  title: WT_TITLES[5],
  chapters,
  /** Close starts here (150 f), then the logo (90 f). */
  closeFrom,
  logoFrom: closeFrom + 150,
  total: totalFrames(closeFrom),
};
