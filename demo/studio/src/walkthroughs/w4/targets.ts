/**
 * Cursor targets (native px), the plan's points snapped to the rendered
 * controls: measured with the dev probe (kit.tsx, PROBE_ON), then checked on
 * full-scale stills at every click frame. Inside a scrolled page the probe
 * reads 16 px low, so those points carry the still's correction. The plan's
 * own figure is noted where the render differs.
 */
export const PT = {
  toolQa: { x: 870, y: 238 }, // plan (870, 232)
  qaDraft: { x: 747, y: 248 }, // plan 233
  qaOpt1: { x: 600, y: 286 }, // plan 268
  qaSeePlan: { x: 399, y: 472 }, // plan 424 (the rebuilt checks card runs 64 px longer)
  qaRun: { x: 421, y: 746 }, // plan 706
  qaOpen: { x: 475, y: 770 }, // plan 730
  fxMech: { x: 1297, y: 329 },
  fxPill: { x: 1257, y: 509 }, // plan (1236, 426): the rebuilt panel runs ~100 px longer
  fxAccept: { x: 1233, y: 632 }, // plan (1232, 555)
  crFirm: { x: 883, y: 745 }, // plan 764; the shared page starts at scroll 100 (see crScrollA0)
  crSeePlan: { x: 397, y: 611 },
  crAccept: { x: 498, y: 612 }, // plan (486, 674)
  /** Creator scrolls: the opening frame (100, so the firm outline is clear of the pane foot), before the skip, and after it. */
  crScrollA0: 100,
  crScrollA: 700,
  crScrollB: 1750, // plan 1630: the shared CreatorScreen runs 120 px longer than the plan's page y
  appsCompose: { x: 520, y: 487 }, // plan (520, 470): the tool cards are 12 px taller (Inter wraps the built copy to 4 lines)
  bldCompose: { x: 500, y: 796 },
  bldEveryone: { x: 346, y: 718 }, // plan (348, 729): the reply row sits 12 above the thread's foot
  bldTrentmoor: { x: 519, y: 718 }, // plan (521, 729)
  bldOnly: { x: 314, y: 718 }, // plan (318, 729)
  bldOpen: { x: 335, y: 709 }, // plan (322, 712)
  samSubmit: { x: 313, y: 448 }, // plan (292, 454)
  dashRowAccept: { x: 1281, y: 380 }, // plan (1273, 382)
  dashStripAccept: { x: 1129, y: 579 }, // plan (1119, 575)
  dashRun: { x: 1157, y: 39 }, // plan (1151, 40)
  dashKeep: { x: 867, y: 629 }, // plan (864, 616)
} as const;
