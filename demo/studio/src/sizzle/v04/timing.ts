/**
 * Clip 04 frame plan (demo/archive/2026-10-sizzle/plan/video-04-kpi-app.md). Every constant is a
 * STANDALONE body-local frame. The film cut plays the same builder frames,
 * shifted: +45 for 372–678 (mid-card A is inserted), +120 for ≥ 679 (the
 * insight beat is inserted). Film-only beats carry film frames (FILM_*).
 */
import { agentRevealFrames } from '../../shared';
import { KPI_APP } from '../../data/wrenfield';

export const T = {
  // 2 · the prompt
  heroAt: 60,
  typeFrom: 64,
  typeTo: 96,
  sendAt: 108,
  // 3 · words to workflow
  hl: [144, 147, 150, 153, 156],
  morphFrom: 156,
  morphTo: 170,
  bubbleFadeFrom: 166, // hero crossfades into the bubble 166–170, once it has all but landed
  chatAt: 158,
  railAt: 162,
  headerAt: 162,
  promptGreek: 172,
  lifts: [168, 171, 174, 177, 180], // p1..p5, 20 f each
  liftDur: 20,
  // 4 · Q1
  step1Done: 206,
  q1: 208,
  step2Waiting: 208,
  q1Cursor: { show: 246, arrive: 262, click: 264, hide: 272, from: { x: 900, y: 1010 } },
  step2Done: 276,
  r1: 278,
  step3Done: 284,
  // 5 · Q2
  q2: 292,
  step4Waiting: 292,
  q2Cursor: { show: 330, arrive: 346, click: 348, hide: 356, from: { x: 900, y: 1010 } },
  step4Done: 360,
  r2: 362,
  step5Done: 368,
  // 6 · preview, then Rachel's own words
  narrowFrom: 372,
  narrowTo: 386,
  railExit: 372,
  previewAt: 378,
  dashAt: 384, // blocks 384, 388, 392, 396, 400, 404
  u3TypeFrom: 400,
  u3TypeTo: 418,
  u3Send: 430,
  a3: 456,
  flagRule: 462,
  // 7 · Q3
  q3: 498,
  q3Cursor: { show: 552, arrive: 566, click: 568, hide: 576, from: { x: 900, y: 1010 } },
  r3: 578,
  step6Done: 578,
  // 8 · the human gate
  gate: 580,
  readBackAt: 582,
  rbCursor: { show: 604, arrive: 618, click: 620, hide: 628, from: { x: 1300, y: 960 } },
  publish: 626,
  // 9 · mid-card B
  cardB: 634,
  // 10 · two seats
  leftAt: 679,
  rightAt: 685,
  count: 692,
  flag: 712,
  noteAt: 706,
  noteHl: 712,
  leftDim: 716,
  fade: 768,
} as const;

/** Builder stage runs 60–633 (standalone frames). */
export const BUILDER_START = 60;
export const BUILDER_END = 634;
export const PAYOFF_START = 679;

/** Film-only beats, film body frames. */
export const FILM = {
  cardA: 372,
  shiftBuilder: 45, // standalone 372–678 → film 417–723
  shiftPayoff: 120, // standalone ≥ 679 → film ≥ 799
  insight: 724,
  insightCount: 728,
  pushFrom: 730,
  pushTo: 750,
  insightFocal: 734,
  insightEnd: 799,
} as const;

/** Replies appear 2 f after the question finishes typing (3 chars/f). */
export const repliesAt = (at: number, text: string) => at + agentRevealFrames(text) + 2;

export const Q1_REPLIES = repliesAt(T.q1, KPI_APP.q1.text);
export const Q2_REPLIES = repliesAt(T.q2, KPI_APP.q2.text);
export const Q3_REPLIES = repliesAt(T.q3, KPI_APP.q3.text);

/** The frames each of the seven steps finished (for the dot strip). */
export const STEP_DONE = [T.step1Done, T.step2Done, T.step3Done, T.step4Done, T.step5Done, T.step6Done, T.publish];
