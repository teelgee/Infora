/**
 * W4 frames (video-local), straight from plan/w4-tools.md §4. One place, so the
 * screens, cursors and captions agree. Names follow the shot ids.
 */

/** Ch 1 · QA check (207–611). */
export const QA = {
  toolsClick: 243,
  cut: 245,
  selectClick: 280,
  menuOpen: 282,
  optClick: 309,
  valueSet: 311,
  scroll1: [314, 339] as [number, number], // 0 → 600
  scroll2: [350, 375] as [number, number], // 600 → 1200
  seePlanClick: 400,
  planIn: 402,
  runClick: 480,
  running: 482,
  step1Done: 507,
  done: 531,
  resultIn: 532,
  scroll3: [537, 556] as [number, number], // 1200 → 1320
  openClick: 610,
} as const;

/** Ch 2 · Findings (612–981). */
export const FX = {
  cut: 612,
  mechClick: 647,
  tracked1: 649,
  settle1: 679,
  cardFade: 687,
  closeUp: [693, 704] as [number, number],
  panelScroll: [726, 749] as [number, number],
  hoverIn: 772,
  hoverOut: 871,
  accClick: 894,
  tracked2: 896,
  settle2: 926,
  resolve2: 934,
} as const;

/** Ch 3 · Workflow (982–1362). */
export const CR = {
  xfade: 982,
  firmClick: 1029,
  sectionsAt: 1031,
  scroll1: [1039, 1064] as [number, number], // 0 → 600
  xfade2: 1083, // → scroll 1630, brief and ticks done
  seePlanClick: 1180,
  planIn: 1182,
  scroll2: [1187, 1210] as [number, number], // 1630 → 2130
  scroll3: [1217, 1236] as [number, number], // 2130 → 2500
  acceptClick: 1260,
  working: 1262,
  resultIn: 1307,
} as const;

/** Ch 4 · Build (1363–2845). */
export const B = {
  xfade: 1363,
  composeClick: 1403,
  promptFrom: 1409,
  promptSeed: 366, // plan 404 ends at 1606 with the shared cadence; 366 ends on budget, 1591
  promptEnter: 1599,
  cut: 1601,
  workingTo: 1645,
  a1: 1646,
  r1: 1694,
  q1: 1698,
  q1Replies: 1785,
  composeClick2: 1816,
  u1From: 1822,
  u1Seed: 403, // ends 1941 (plan seed 405 ends 1956)
  u1Enter: 1949,
  u1: 1951,
  a2: 1955,
  r2: 1993,
  a3: 1997,
  r3: 2044,
  previewFill: 2048,
  q2a: 2159,
  q2aReplies: 2233,
  everyoneClick: 2269,
  u2a: 2271,
  q2b: 2275,
  q2bReplies: 2288,
  trentmoorClick: 2324,
  u2b: 2326,
  a4: 2330,
  r4: 2366,
  composeClick3: 2393,
  u3From: 2399,
  u3Seed: 429, // ends 2465 (plan seed 406 ends 2471)
  u3Enter: 2473,
  u3: 2475,
  a5: 2479,
  flag: 2489,
  a6: 2600,
  r5: 2639,
  promptValue: 2643,
  q3: 2659,
  q3Replies: 2707,
  onlyClick: 2743,
  u4: 2745,
  r6: 2749,
  a7: 2753,
  readBack: 2761,
  openClick: 2824,
  opened: 2826,
} as const;

/** Ch 5 · Two seats (2846–3277). */
export const TS = {
  split: 2846,
  submitClick: 2926,
  submitted: 2928,
  rachelSees: 2946,
  splitOut: 3011,
  rowAcceptClick: 3063,
  stripIn: 3065,
  stripAcceptClick: 3153,
  accepted: 3155,
  countFrom: 3167,
} as const;

/** Ch 6 · Insight (3278–3650). */
export const IN = {
  runClick: 3315,
  working: 3317,
  metaIn: 3367,
  stream: 3372,
  scrollDown: [3507, 3532] as [number, number], // 0 → 560
  keepClick: 3567,
  notice: 3569,
  scrollUp: [3619, 3644] as [number, number], // 560 → 0
} as const;

export const CLOSE = 3651;
