/**
 * W3's timeline: every frame from the shot table (demo/plans/
 * w3-collaboration.md §4–§6), video-local. One source for both windows, so
 * each person's typing lands in the other's window on the same frames.
 */
import { WT_COLLAB } from '../../data/wrenfield';
import { typedEndsAt } from '../shared';

/**
 * §6 seed rule: if the listed seed's end is later than the nominal end, step
 * the seed upward until it is not (any slack becomes caret idle).
 */
export function fitSeed(text: string, from: number, seed: number, nominalEnd: number): number {
  for (let s = seed; s < seed + 400; s++) if (typedEndsAt(text, from, s) <= nominalEnd) return s;
  return seed;
}

const typing = (text: string, from: number, seed: number, nominalEnd: number) => {
  const s = fitSeed(text, from, seed, nominalEnd);
  return { text, from, seed: s, end: typedEndsAt(text, from, s) };
};

/** §6 typing schedule. */
export const TY = {
  sandboxName: typing(WT_COLLAB.sandboxName, 312, 31, 358),
  docTitle: typing(WT_COLLAB.docTitle, 1046, 32, 1114),
  nadia: typing(WT_COLLAB.nadiaText, 1339, 33, 1563),
  eleanor: typing(WT_COLLAB.eleanorHeading, 1403, 34, 1469),
  prompt: typing(WT_COLLAB.promptTyped, 1726, 35, 1850),
  promptAnd: typing(WT_COLLAB.promptAnd, 1916, 36, 1924),
  commentAt: typing(WT_COLLAB.comments.commentAt, 2807, 37, 2813),
  commentRest: typing(WT_COLLAB.comments.commentRest, 2853, 38, 2973),
  reply: typing(WT_COLLAB.comments.reply.body, 3048, 39, 3200),
} as const;

/** Key frames (UI responds at click + 2). */
export const T = {
  // furniture
  glimpseFreeze: 3300,
  // ch.1 Rachel
  rachelSandboxClick: 248,
  wizardIn: 250,
  accessOpen: 389,
  accessPick: 418,
  step2: 449,
  tickCalder: 489,
  tickRedgate: 518,
  step3: 559,
  whoOpen: 595,
  whoPick: 624,
  tickEleanor: 656,
  tickNadia: 685,
  createPress: 722,
  wizardOut: 724,
  owenIn: 807,
  owenHover: 851,
  // ch.2 Eleanor
  eleanorIn: 939,
  cardHover: 980,
  cardSelect: 990,
  newDocHover: 1011,
  newDocModal: 1021,
  createDocHover: 1135,
  createDocPress: 1143,
  newDocOut: 1145,
  dotsHover: 1177,
  menuOpen: 1187,
  openHover: 1206,
  editorCut: 1216,
  // ch.3 split
  split: 1262,
  presenceIn: 1285,
  nadiaCaret: 1333,
  eleanorCaret: 1399,
  // ch.4
  composerFocus: 1722,
  lib1Open: 1881,
  lib1Pick: 1910,
  lib2Open: 1955,
  lib2Pick: 1984,
  sendPress: 2011,
  sent: 2013,
  done: 2088,
  claimsFrom: 2094,
  actionsAt: 2232,
  // ch.5
  pillHover: 2381,
  hoverCardIn: 2387,
  hoverCardOut: 2537,
  acceptHover: 2551,
  acceptPress: 2559,
  accepted: 2561,
  scrollBackEnd: 2580,
  settle: 2675,
  // ch.6
  selPress: 2766,
  selRelease: 2770,
  bubbleIn: 2772,
  commentForm: 2801,
  mentionOpen: 2815,
  mentionHover: 2839,
  mentionPick: 2849,
  commentEnter: 2981,
  posted: 2983,
  leftComments: 3015,
  replyBox: 3044,
  replyEnter: 3208,
  replied: 3210,
  closeHover: 3231,
  closed: 3241,
  bothClick: 3268,
  bothResponds: 3270,
} as const;
