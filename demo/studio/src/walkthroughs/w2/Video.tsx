/**
 * W2 Context layer (demo/plans/w2-context-layer/plan.md, revision 2).
 * Frames are video-local and follow the plan's shot table (§5); the native
 * points are the rendered controls' centres (measured from stills), the
 * frame numbers are the plan's.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { keyed } from '../../shared';
import { WT_ASK, WT_CREATOR_PAGE } from '../../data/wrenfield';
import {
  checkCaptions,
  Crossfade,
  CreatorScreen,
  EndGlimpse,
  key,
  navPoint,
  SelectMenu,
  Shell,
  SplitWindows,
  WalkthroughFrame,
  WIDE,
  work,
  detail,
  WtCursor,
  type CaptionCue,
  type WtCameraKey,
} from '../shared';
import { META } from './meta';
import { LibraryScene } from './Library';
import { CONFIRM_X, OntologyView } from './Ontology';
import { SandboxPage } from './Sandbox';
import { AskScreen, type FooterTimes, type RailTicks } from './Ask';

// ------------------------------------------------------------------ points (native; measured on renders)

/** Library scroll so all five reference rows show (review should-fix 2): 252–277 down, back up 596–618 for the switch. */
const LIB_SCROLL = 52;

const P = {
  start1: { x: 900, y: 560 },
  mstTitle: { x: 469, y: 452 - LIB_SCROLL },
  girOpen: { x: 1360, y: 829 - LIB_SCROLL },
  close: { x: 1299, y: 774 },
  howItConnects: { x: 1334, y: 116 },
  mstNode: { x: 790, y: 410 },
  confirm: [
    { x: CONFIRM_X, y: 540 },
    { x: CONFIRM_X, y: 570 },
    { x: CONFIRM_X, y: 600 },
  ],
  start3: { x: 1000, y: 400 },
  createWithAI: { x: 1079, y: 117 },
  wpSelect: { x: 747, y: 631 },
  wpLandQuality: { x: 420, y: 670 },
  tickGIR: { x: 373, y: 201 },
  tickBAS: { x: 373, y: 275 },
  railAsk: navPoint('Ask'),
  composer: { x: 900, y: 748 },
  pill: { x: 1164, y: 405 },
  // split (each window's own native space)
  splitStartL: { x: 420, y: 520 },
  composerL: { x: 360, y: 722 },
  splitStartR: { x: 600, y: 600 },
  sendR: { x: 700, y: 722 },
};

/** Creator scroll: two moves (W2 §5 shot 3.3), page px. */
const SCROLL_1 = 592;
const SCROLL_2 = 1184;
/** Wide transcript scroll when the footer lands (plan: 60; 52 keeps the ELEANOR label whole and the run line clear of the composer). */
const ASK_SCROLL = 52;
/** Narrow transcript scroll with the source panel open (claim 4 at y 330–420). */
const NARROW_SCROLL = 162;

// ------------------------------------------------------------------ timeline (W2 §5)

const RAIL_TICKS: RailTicks = {
  listAt: 1861,
  rows: [
    { runAt: 1863, doneAt: 1879 },
    { runAt: 1879, doneAt: 1895 },
    { runAt: 1895, doneAt: 1913 },
    { runAt: 1913, doneAt: 1931 },
    { runAt: 1931, doneAt: 2191 },
  ],
};
const FOOT1: FooterTimes = { openAt: 2191, footerAt: 2194, honestyAt: 2197, detailsAt: 2200, runAt: 2203 };
const FOOT3R: FooterTimes = { openAt: 3077, footerAt: 3080, honestyAt: 3083, detailsAt: 3086, runAt: 3089 };
const FOOT3E: FooterTimes = { openAt: 2996, footerAt: 2999, honestyAt: 3002, detailsAt: 3005, runAt: 3008 };

/** Seeds chosen so the shared `HumanTyped` cadence lands on the plan's end frames (Q1 → 1847, Q3 → 2846). */
const Q1_SEED = 3;
const Q3_SEED = 80;

const camera: WtCameraKey[] = [
  key(0, WIDE),
  key(391, work(870, 288, 1.5)),
  key(542, WIDE),
  key(812, work(1024, 494, 1.5)),
  key(1031, WIDE),
  key(1270, work(768, 380, 1.4)),
  key(1501, WIDE),
  key(1631, work(1006, 531, 1.45)),
  key(1859, WIDE),
  key(2360, work(1024, 400, 1.5)),
  key(2461, detail(1152, 400, 2.0), 15),
  key(2556, WIDE, 24),
];

// ------------------------------------------------------------------ captions (W2 §6)

const R = 'RACHEL' as const;
const E = 'ELEANOR' as const;
const captions: CaptionCue[] = [
  { from: 207, to: 290, chapter: 1, seat: R, line: 'The library holds accepted work and references' },
  { from: 293, to: 447, chapter: 1, seat: R, line: 'Accepted work joins the library automatically' },
  { from: 450, to: 624, chapter: 1, seat: R, line: 'Only the live revision is used for answers' },
  { from: 627, to: 699, chapter: 2, seat: R, line: 'Rachel opens how the library connects' },
  { from: 702, to: 904, chapter: 2, seat: R, line: 'Three links proposed - none live until confirmed' },
  { from: 907, to: 1074, chapter: 2, seat: R, line: 'Rachel confirms each link herself' },
  { from: 1077, to: 1263, chapter: 3, seat: E, line: 'Eleanor starts a new land quality document' },
  { from: 1266, to: 1401, chapter: 3, seat: E, line: 'Related documents come first, each with a reason' },
  { from: 1404, to: 1554, chapter: 3, seat: E, line: 'She ticks the sources herself' },
  { from: 1557, to: 1961, chapter: 4, seat: E, line: 'Eleanor asks the library a question' },
  { from: 1964, to: 2304, chapter: 4, seat: E, line: 'Every claim in the answer carries its source' },
  { from: 2307, to: 2449, chapter: 5, seat: E, line: 'She opens the source behind one claim' },
  { from: 2452, to: 2664, chapter: 5, seat: E, line: 'From the live v2 - never the superseded v1' },
  { from: 2667, to: 2956, chapter: 6, line: 'Rachel and Eleanor ask the same question' },
  { from: 2959, to: 3089, chapter: 6, line: "Rachel's answer draws on Redgate's appraisal" },
  { from: 3092, to: 3182, chapter: 6, line: "Eleanor's answer has no Redgate source, no hint" },
  { from: 3185, to: 3274, chapter: 6, line: 'Same question - each sees only their own' },
];

const problems = checkCaptions(captions);
if (problems.length) console.warn(`W${META.video} captions:\n` + problems.join('\n'));

// ------------------------------------------------------------------ the window content

const between = (f: number, a: number, b: number) => f >= a && f < b;

/** Chapter 4–5's Ask, single window (also the glimpse and the close). */
const AskSingle: React.FC = () => (
  <AskScreen
    seat="ELEANOR"
    question={WT_ASK.q1}
    focusAt={1627}
    typed={{ from: 1655, seed: Q1_SEED }}
    sendAt={1855}
    bubbleAt={1857}
    workingAt={1859}
    answerFrom={1937}
    claims={WT_ASK.answer1}
    footer={FOOT1}
    footerText={WT_ASK.footer1}
    runLine={WT_ASK.runLine}
    ticks={RAIL_TICKS}
    scroll={{ from: 2191, to: 2210, by: ASK_SCROLL }}
    panel={{ clickAt: 2345, at: 2347, hlAt: 2356, narrowScroll: NARROW_SCROLL, claim: 3, ref: 'WA-GEO-GIR-004' }}
  />
);

const Creator: React.FC = () => {
  const f = useCurrentFrame();
  const scrollY = keyed(f, [1210, 1235, 1240, 1265], [0, SCROLL_1, SCROLL_1, SCROLL_2]);
  const hoverRef = between(f, 1405, 1419) ? 'WA-GEO-GIR-004' : between(f, 1434, 1448) ? 'WA-ENV-BAS-003' : undefined;
  return (
    <Shell
      seat="ELEANOR"
      nav={f >= 1582 ? 'Ask' : null}
      hoverNav={between(f, 1574, 1582) ? 'Ask' : undefined}
      overlay={
        // The shared CreatorScreen drops its list on the pick frame; the plan fades it 1200–1203 (§2.7), so the
        // closing list is drawn here, over the same spot, for those 4 frames.
        between(f, 1200, 1204) ? (
          <SelectMenu x={358.4} y={652.4} width={778} at={1166} exitAt={1200} options={WT_CREATOR_PAGE.characteristics.workPackage.options} hover="Land quality" />
        ) : undefined
      }
    >
      <CreatorScreen
        scrollY={scrollY}
        workPackage={{ pick: 'Land quality', openAt: 1166, pickAt: 1200, hover: f >= 1190 ? 'Land quality' : undefined }}
        ticked={{ 'WA-GEO-GIR-004': 1415, 'WA-ENV-BAS-003': 1444 }}
        hoverRef={hoverRef}
      />
    </Shell>
  );
};

const Body: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 638) {
    return (
      <LibraryScene
        scrollY={keyed(f, [252, 277, 596, 618], [0, LIB_SCROLL, LIB_SCROLL, 0])}
        hoverRow={between(f, 302, 346) ? { table: 'live', row: 1 } : between(f, 373, 383) ? { table: 'ref', row: 3 } : undefined}
        switchHover={between(f, 628, 638)}
        modal={{ at: 383, exitAt: 591, closeHover: between(f, 581, 591), closePressAt: 589 }}
      />
    );
  }
  const ontology = (
    <OntologyView
      mstAt={668}
      edges={[
        { drawAt: 690, chipAt: 705, confirmAt: 918 },
        { drawAt: 700, chipAt: 715, confirmAt: 947 },
        { drawAt: 710, chipAt: 725, confirmAt: 976 },
      ]}
      selectedAt={806}
      detail={{ headerAt: 806, classAt: 809, relAt: 812 }}
      rows={[
        { type: 'Derived from', to: 'WA-GEO-GIR-004', hoverFrom: 908, pressAt: 916, confirmAt: 918 },
        { type: 'Derived from', to: 'WA-ENV-BAS-003', hoverFrom: 937, pressAt: 945, confirmAt: 947 },
        { type: 'References', to: 'WA-WAT-FRA-001', hoverFrom: 966, pressAt: 974, confirmAt: 976 },
      ]}
    />
  );
  const eleanor =
    f < 1126 ? (
      <Shell seat="ELEANOR" nav="Sandbox">
        <SandboxPage createHover={between(f, 1116, 1126)} createPressAt={1124} />
      </Shell>
    ) : f < 1584 ? (
      <Creator />
    ) : (
      <AskSingle />
    );
  return <Crossfade at={1077} a={ontology} b={eleanor} />;
};

// ------------------------------------------------------------------ cursors and the split (screen-space overlay)

const Overlay: React.FC = () => (
  <>
    {/* Rachel, chapters 1–2 */}
    <WtCursor
      showFrom={207}
      hideAfter={1071}
      idle={[
        [471, 566],
        [726, 771],
      ]}
      clicks={[381, 589, 636, 804, 916, 945, 974]}
      path={[
        { f: 207, at: P.start1, shape: 'arrow' },
        { f: 302, at: P.mstTitle, shape: 'hand' },
        { f: 373, at: P.girOpen, shape: 'hand' },
        { f: 556, at: P.girOpen, shape: 'hand' },
        { f: 581, at: P.close, shape: 'hand' },
        { f: 628, at: P.howItConnects, shape: 'hand' },
        { f: 771, at: P.howItConnects, shape: 'hand' },
        { f: 796, at: P.mstNode, shape: 'hand' },
        { f: 908, at: P.confirm[0], shape: 'hand' },
        { f: 937, at: P.confirm[1], shape: 'hand' },
        { f: 966, at: P.confirm[2], shape: 'hand' },
      ]}
    />
    {/* Eleanor, chapters 3–4 */}
    <WtCursor
      showFrom={1089}
      hideAfter={1715}
      clicks={[1124, 1164, 1198, 1413, 1442, 1582, 1625]}
      path={[
        { f: 1089, at: P.start3, shape: 'arrow' },
        { f: 1116, at: P.createWithAI, shape: 'hand' },
        { f: 1156, at: P.wpSelect, shape: 'hand' },
        { f: 1190, at: P.wpLandQuality, shape: 'hand' },
        { f: 1381, at: P.wpLandQuality, shape: 'arrow' },
        { f: 1405, at: P.tickGIR, shape: 'hand' },
        { f: 1434, at: P.tickBAS, shape: 'hand' },
        { f: 1557, at: P.tickBAS, shape: 'arrow' },
        { f: 1574, at: P.railAsk, shape: 'hand' },
        { f: 1590, at: P.railAsk, shape: 'hand' },
        { f: 1617, at: P.composer, shape: 'ibeam' },
      ]}
    />
    {/* Eleanor, chapter 5 */}
    <WtCursor
      showFrom={2307}
      hideAfter={2352}
      clicks={[2345]}
      path={[
        { f: 2307, at: P.composer, shape: 'arrow' },
        { f: 2337, at: P.pill, shape: 'hand' },
      ]}
    />
    {/* Chapter 6: the split */}
    <SplitWindows
      at={2667}
      exitAt={3277}
      left={{ seat: 'RACHEL', content: <SplitLeft /> }}
      right={{ seat: 'ELEANOR', content: <SplitRight /> }}
    />
    <WtCursor
      window="left"
      showFrom={2682}
      hideAfter={2745}
      clicks={[2715]}
      path={[
        { f: 2682, at: P.splitStartL, shape: 'arrow' },
        { f: 2707, at: P.composerL, shape: 'ibeam' },
      ]}
    />
    <WtCursor
      window="right"
      showFrom={2830}
      hideAfter={2893}
      clicks={[2863]}
      path={[
        { f: 2830, at: P.splitStartR, shape: 'arrow' },
        { f: 2855, at: P.sendR, shape: 'hand' },
      ]}
    />
  </>
);

const SplitLeft: React.FC = () => (
  <AskScreen
    seat="RACHEL"
    compact
    question={WT_ASK.q3}
    focusAt={2717}
    typed={{ from: 2721, seed: Q3_SEED }}
    sendAt={2854}
    bubbleAt={2856}
    workingAt={2858}
    answerFrom={2918}
    claims={WT_ASK.answer3R}
    footer={FOOT3R}
    footerText={WT_ASK.footer3R}
    runLine={WT_ASK.runLines.RACHEL_Q3}
  />
);

const SplitRight: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AskScreen
      seat="ELEANOR"
      compact
      question={WT_ASK.q3}
      prefilled
      focusAt={2667}
      sendAt={2863}
      sendHover={between(f, 2855, 2865)}
      bubbleAt={2865}
      workingAt={2867}
      answerFrom={2927}
      claims={WT_ASK.answer3E}
      footer={FOOT3E}
      footerText={WT_ASK.footer3E}
      runLine={WT_ASK.runLines.ELEANOR_Q3}
    />
  );
};

// ------------------------------------------------------------------ the video

export const Video: React.FC = () => (
  <WalkthroughFrame
    video={META.video}
    chapters={META.chapters}
    captions={captions}
    camera={camera}
    splits={[{ from: 2667, to: 3277 }]}
    glimpse={
      <EndGlimpse at={2666}>
        <Body />
      </EndGlimpse>
    }
    overlay={<Overlay />}
  >
    <Body />
  </WalkthroughFrame>
);
