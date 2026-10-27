/**
 * W4 · Tools (demo/plans/w4-tools/plan.md). A QA check, a saved
 * workflow, and the chat-led build of the supplier KPI app, then the app in
 * use across two firms. Frames are video-local; see ./timing.ts.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { checkCaptions, Crossfade, EndGlimpse, key, Show, SplitWindows, WalkthroughFrame, WIDE, work, WtCursor, type CaptionCue } from '../shared';
import { META } from './meta';
import { B, CR, FX, IN, QA, TS } from './timing';
import { PT } from './targets';
import { ToolsScreen } from './ToolsScreen';
import { QaChecker } from './QaChecker';
import { FindingsEditor } from './FindingsEditor';
import { Creator } from './Creator';
import { Builder } from './Builder';
import { RachelDashboard, SamReturns } from './AppSeats';
import type { KpiDashboardProps } from './KpiDashboard';
import { scrollAt } from './kit';

// ------------------------------------------------------------------ captions (plan §5)

const E = 'ELEANOR' as const;
const R = 'RACHEL' as const;
const captions: CaptionCue[] = [
  { from: 234, to: 388, chapter: 1, seat: E, line: 'Eleanor opens the QA checker on her draft' },
  { from: 391, to: 517, chapter: 1, seat: E, line: 'She sees the plan before anything runs' },
  { from: 520, to: 609, chapter: 1, seat: E, line: 'Five findings land as marks in the draft' },
  { from: 612, to: 744, chapter: 2, seat: E, line: 'One decision fixes the house-style wording' },
  { from: 747, to: 979, chapter: 2, seat: E, line: 'The accuracy finding cites the ground investigation' },
  { from: 982, to: 1071, chapter: 3, seat: E, line: "Eleanor starts from her firm's saved outline" },
  { from: 1074, to: 1277, chapter: 3, seat: E, line: 'Brief written, two sources chosen - then the plan' },
  { from: 1280, to: 1360, chapter: 3, seat: E, line: 'Four sections written, from two bound sources' },
  { from: 1363, to: 1634, chapter: 4, seat: R, line: 'In June, Rachel describes the app she needs' },
  { from: 1637, to: 1810, chapter: 4, seat: R, line: 'The agent fills each step as it goes' },
  { from: 1813, to: 2036, chapter: 4, seat: R, line: 'Rachel says the returns are contractual' },
  { from: 2039, to: 2147, chapter: 4, seat: R, line: 'The screens appear in a live preview' },
  { from: 2150, to: 2387, chapter: 4, seat: R, line: 'Rachel decides who opens each screen' },
  { from: 2390, to: 2647, chapter: 4, seat: R, line: 'She asks for a flag in plain words' },
  { from: 2650, to: 2749, chapter: 4, seat: R, line: 'She confirms what the monthly run may touch' },
  { from: 2752, to: 2843, chapter: 4, seat: R, line: 'Rachel checks it and opens it' },
  { from: 2846, to: 2934, chapter: 5, line: 'October - Netherfold submits its September return' },
  { from: 2937, to: 3024, chapter: 5, line: 'Same app - each firm sees its own' },
  { from: 3027, to: 3141, chapter: 5, seat: R, line: "Rachel accepts Netherfold's return" },
  { from: 3144, to: 3303, chapter: 5, seat: R, line: 'Totals count accepted returns only' },
  { from: 3306, to: 3555, chapter: 6, seat: R, line: "Rachel runs the month's analysis" },
  { from: 3558, to: 3648, chapter: 6, seat: R, line: 'Kept as a playbook for the next project' },
];

const problems = checkCaptions(captions);
if (problems.length) console.warn(`W${META.video} captions:\n` + problems.join('\n'));

// ------------------------------------------------------------------ camera (plan §4, §6)

const camera = [
  key(0, WIDE),
  key(402, work(870, 531, 1.3)),
  key(566, WIDE),
  key(705, work(987, 480, 1.4)),
  key(951, WIDE),
  key(1095, work(870, 531, 1.3)),
  key(1342, WIDE),
  key(2048, work(1056, 470, 1.6)),
  key(2138, WIDE),
  key(2489, work(1056, 470, 1.6)),
  key(2579, WIDE),
  key(3082, work(870, 420, 1.3)),
  key(3242, WIDE),
  key(3322, work(870, 576, 1.5)),
  key(3486, WIDE),
];

// ------------------------------------------------------------------ the dashboard's frames (ch 5–6 and the end state)

const dash: KpiDashboardProps = {
  layout: 'full',
  submittedAt: TS.rachelSees,
  acceptedAt: TS.accepted,
  countFrom: TS.countFrom,
  rowHoverFrom: TS.rowAcceptClick - 8,
  rowAcceptPressAt: TS.rowAcceptClick,
  stripOpenAt: TS.stripIn,
  stripAcceptHoverFrom: TS.stripAcceptClick - 8,
  stripAcceptPressAt: TS.stripAcceptClick,
  run: { workingAt: IN.working, metaAt: IN.metaIn, streamAt: IN.stream },
  keep: { hoverFrom: IN.keepClick - 8, pressAt: IN.keepClick, noticeAt: IN.notice },
};

const Dashboard: React.FC = () => {
  const f = useCurrentFrame();
  const scrollY = scrollAt(f, 0, [
    [IN.scrollDown, 560],
    [IN.scrollUp, 0],
  ]);
  return <RachelDashboard {...dash} scrollY={scrollY} runHoverFrom={IN.runClick - 8} runPressAt={IN.runClick} />;
};

// ------------------------------------------------------------------ chapter screens

const QaScreen: React.FC = () => {
  const f = useCurrentFrame();
  const scrollY = scrollAt(f, 0, [
    [QA.scroll1, 600],
    [QA.scroll2, 1200],
    [QA.scroll3, 1320],
  ]);
  return (
    <QaChecker
      scrollY={scrollY}
      selectHoverFrom={QA.selectClick - 8}
      menuAt={QA.menuOpen}
      optHoverFrom={QA.optClick - 8}
      valueAt={QA.valueSet}
      seePlanHoverFrom={QA.seePlanClick - 8}
      seePlanPressAt={QA.seePlanClick}
      planAt={QA.planIn}
      runHoverFrom={QA.runClick - 8}
      runPressAt={QA.runClick}
      runningAt={QA.running}
      step1DoneAt={QA.step1Done}
      doneAt={QA.done}
      resultAt={QA.resultIn}
      openHoverFrom={QA.openClick - 8}
      openPressAt={QA.openClick}
    />
  );
};

const Findings: React.FC = () => (
  <FindingsEditor
    t={{
      mechHoverFrom: FX.mechClick - 8,
      mechClick: FX.mechClick,
      tracked1: FX.tracked1,
      settle1: FX.settle1,
      cardFade: FX.cardFade,
      closeUp: FX.closeUp,
      panelScroll: FX.panelScroll,
      pillHoverFrom: 771,
      hoverIn: FX.hoverIn,
      hoverOut: FX.hoverOut,
      accHoverFrom: FX.accClick - 8,
      accClick: FX.accClick,
      tracked2: FX.tracked2,
      settle2: FX.settle2,
      resolve2: FX.resolve2,
    }}
  />
);

const CreatorShot: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Creator
      t={{
        firmHoverFrom: CR.firmClick - 8,
        firmPressAt: CR.firmClick,
        sectionsAt: CR.sectionsAt,
        scrollA: scrollAt(f, PT.crScrollA0, [[CR.scroll1, PT.crScrollA]]),
        skipAt: CR.xfade2,
        scrollB: scrollAt(f, PT.crScrollB, [
          [CR.scroll2, PT.crScrollB + 500],
          [CR.scroll3, PT.crScrollB + 870],
        ]),
        seePlanHoverFrom: CR.seePlanClick - 8,
        seePlanPressAt: CR.seePlanClick,
        planAt: CR.planIn,
        acceptHoverFrom: CR.acceptClick - 8,
        acceptPressAt: CR.acceptClick,
        workingAt: CR.working,
        resultAt: CR.resultIn,
      }}
    />
  );
};

const EleanorTools = <ToolsScreen seat="ELEANOR" qaHoverFrom={QA.toolsClick - 8} qaPressAt={QA.toolsClick} />;
const RachelTools = <ToolsScreen seat="RACHEL" composer={{ focusAt: B.composeClick, typeFrom: B.promptFrom, seed: B.promptSeed, enterAt: B.promptEnter }} />;

/** The window content, chapter by chapter (cuts on click + 2, crossfades on seat changes and time skips). */
const Body: React.FC = () => (
  <>
    <Show to={QA.cut}>{EleanorTools}</Show>
    <Show from={QA.cut} to={FX.cut}>
      <QaScreen />
    </Show>
    <Show from={FX.cut} to={CR.xfade + 12}>
      <Crossfade at={CR.xfade} a={<Findings />} b={<CreatorShot />} />
    </Show>
    <Show from={CR.xfade + 12} to={B.xfade}>
      <CreatorShot />
    </Show>
    <Show from={B.xfade} to={B.cut}>
      <Crossfade at={B.xfade} a={<CreatorShot />} b={RachelTools} />
    </Show>
    <Show from={B.cut} to={TS.split + 15}>
      <Builder />
    </Show>
    <Show from={TS.split + 15}>
      <Dashboard />
    </Show>
  </>
);

// ------------------------------------------------------------------ cursors (plan §4; points snapped to the rendered controls, ./targets.ts)

const Cursors: React.FC = () => (
  <>
    {/* Eleanor, ch 1–2 */}
    <WtCursor
      showFrom={207}
      hideAfter={976}
      path={[
        { f: 207, at: { x: 980, y: 560 } },
        { f: 235, at: PT.toolQa, shape: 'hand' },
        { f: 256, at: PT.toolQa },
        { f: 272, at: PT.qaDraft },
        { f: 301, at: PT.qaOpt1 },
        { f: 392, at: PT.qaSeePlan },
        { f: 472, at: PT.qaRun },
        { f: 602, at: PT.qaOpen },
        { f: 639, at: PT.fxMech },
        { f: 771, at: PT.fxPill },
        { f: 886, at: PT.fxAccept },
      ]}
      clicks={[QA.toolsClick, QA.selectClick, QA.optClick, QA.seePlanClick, QA.runClick, QA.openClick, FX.mechClick, FX.accClick]}
    />
    {/* Eleanor, ch 3 */}
    <WtCursor
      showFrom={994}
      hideAfter={1356}
      path={[
        { f: 994, at: { x: 1000, y: 520 } },
        { f: 1021, at: PT.crFirm, shape: 'hand' },
        { f: 1172, at: PT.crSeePlan },
        { f: 1252, at: PT.crAccept },
      ]}
      clicks={[CR.firmClick, CR.seePlanClick, CR.acceptClick]}
    />
    {/* Rachel, ch 4 */}
    <WtCursor showFrom={1365} hideAfter={1499} path={[{ f: 1365, at: { x: 900, y: 640 } }, { f: 1395, at: PT.appsCompose, shape: 'ibeam' }]} clicks={[B.composeClick]} />
    <WtCursor showFrom={1780} hideAfter={1912} path={[{ f: 1780, at: { x: 520, y: 470 } }, { f: 1808, at: PT.bldCompose, shape: 'ibeam' }]} clicks={[B.composeClick2]} />
    <WtCursor
      showFrom={2236}
      hideAfter={2489}
      path={[
        { f: 2236, at: { x: 560, y: 640 } },
        { f: 2261, at: PT.bldEveryone, shape: 'hand' },
        { f: 2316, at: PT.bldTrentmoor, shape: 'hand' },
        { f: 2385, at: PT.bldCompose, shape: 'ibeam' },
      ]}
      clicks={[B.everyoneClick, B.trentmoorClick, B.composeClick3]}
    />
    <WtCursor
      showFrom={2710}
      hideAfter={2840}
      path={[
        { f: 2710, at: { x: 560, y: 640 } },
        { f: 2735, at: PT.bldOnly, shape: 'hand' },
        { f: 2816, at: PT.bldOpen, shape: 'hand' },
      ]}
      clicks={[B.onlyClick, B.openClick]}
    />
    {/* Sam, split left */}
    <WtCursor window="left" showFrom={2891} hideAfter={3005} path={[{ f: 2891, at: { x: 500, y: 640 } }, { f: 2918, at: PT.samSubmit, shape: 'hand' }]} clicks={[TS.submitClick]} />
    {/* Rachel, ch 5–6 */}
    <WtCursor
      showFrom={3026}
      hideAfter={3249}
      path={[
        { f: 3026, at: { x: 1000, y: 640 } },
        { f: 3055, at: PT.dashRowAccept, shape: 'hand' },
        { f: 3145, at: PT.dashStripAccept, shape: 'hand' },
      ]}
      clicks={[TS.rowAcceptClick, TS.stripAcceptClick]}
    />
    <WtCursor showFrom={3274} hideAfter={IN.runClick + 6} path={[{ f: 3274, at: PT.dashStripAccept }, { f: 3307, at: PT.dashRun, shape: 'hand' }]} clicks={[IN.runClick]} />
    <WtCursor showFrom={3523} hideAfter={3651} path={[{ f: 3523, at: PT.dashRun }, { f: 3559, at: PT.dashKeep, shape: 'hand' }]} clicks={[IN.keepClick]} />
  </>
);

export const Video: React.FC = () => (
  <WalkthroughFrame
    video={META.video}
    chapters={META.chapters}
    captions={captions}
    camera={camera}
    splits={[{ from: TS.split, to: TS.splitOut }]}
    glimpse={
      <EndGlimpse at={META.closeFrom + 60}>
        <Dashboard />
      </EndGlimpse>
    }
    overlay={
      <>
        <SplitWindows
          at={TS.split}
          exitAt={TS.splitOut}
          left={{ seat: 'SAM', content: <SamReturns submitHoverFrom={TS.submitClick - 8} submitPressAt={TS.submitClick} submittedAt={TS.submitted} /> }}
          right={{ seat: 'RACHEL', content: <RachelDashboard layout="narrow" submittedAt={TS.rachelSees} /> }}
        />
        <Cursors />
      </>
    }
  >
    <Body />
  </WalkthroughFrame>
);
