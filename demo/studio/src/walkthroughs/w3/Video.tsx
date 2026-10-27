/**
 * W3 · Collaboration (demo/plans/w3-collaboration/plan.md).
 *
 * Rachel opens a shared sandbox for exactly two people from two other firms;
 * Owen, on the same project, sees nothing; Eleanor starts a document there;
 * then the screen splits, one window per person, and Eleanor and Nadia work in
 * the same document in the same seconds. Both windows render from ONE
 * timeline (timeline.ts), so each person's typing, the agent's draft, the
 * accept and the thread land in both windows on the same frames.
 *
 * Frames are video-local and match the plan's shot table (§4).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { continueRender, delayRender, Freeze, useCurrentFrame } from 'remotion';
import { fontsReady } from '../../shared';
import { WT_COLLAB } from '../../data/wrenfield';
import {
  checkCaptions,
  Crossfade,
  EditorBar,
  EditorBody,
  key,
  PanelComposer,
  Prose,
  Shell,
  SplitWindows,
  WalkthroughFrame,
  WIDE,
  work,
  WtCursor,
  type CaptionCue,
  type CursorKey,
  type CursorShape,
  type NativePt,
} from '../shared';
import { META } from './meta';
import { T } from './timeline';
import { cardCentre, DOTS, headerButtons, menuItem, NewDocModal, newDocGeom, NewSandboxWizard, SandboxPage, wizardGeom } from './sandbox';
import { SplitSeat } from './editor';
import {
  calloutGeom,
  commentsGeom,
  composerLines,
  composerText,
  contentTop,
  docGeom,
  libChipPoint,
  libRowPoint,
  mentionRowPoint,
  sendPoint,
  tabX,
} from './layout';
import { bubbleWidth } from './overlays';

const CB = WT_COLLAB.cards;

// ------------------------------------------------------------------ captions (§5)

const captions: CaptionCue[] = [
  { from: 208, to: 581, chapter: 1, seat: 'RACHEL', line: 'Rachel opens a shared space for two firms' },
  { from: 584, to: 795, chapter: 1, seat: 'RACHEL', line: 'Rachel lets in only Eleanor and Nadia' },
  { from: 798, to: 939, chapter: 1, seat: 'OWEN', line: 'Everyone else on the project sees nothing' },
  { from: 942, to: 1273, chapter: 2, seat: 'ELEANOR', line: 'Eleanor creates a document in the shared space' },
  { from: 1276, to: 1357, chapter: 3, line: 'Nadia from Redgate opens the same document' },
  { from: 1360, to: 1681, chapter: 3, line: 'Both write in the same document at once' },
  { from: 1684, to: 2076, chapter: 4, line: 'Eleanor asks the agent, naming two library sources' },
  { from: 2079, to: 2237, chapter: 4, line: 'One cited draft appears for both of them' },
  { from: 2240, to: 2354, chapter: 4, line: "Nadia sees Eleanor's request in the shared thread" },
  { from: 2357, to: 2547, chapter: 5, line: 'Nadia checks the ecology source, then accepts' },
  { from: 2550, to: 2731, chapter: 5, line: 'Accepted once, it lands for both' },
  { from: 2734, to: 2973, chapter: 6, line: 'Nadia raises the trout with Eleanor' },
  { from: 2976, to: 3207, chapter: 6, line: 'Eleanor sees the mention and replies' },
  { from: 3210, to: 3285, chapter: 6, line: 'Eleanor closes the thread once answered' },
];

const problems = checkCaptions(captions);
if (problems.length) console.warn(`W${META.video} captions:\n` + problems.join('\n'));

// ------------------------------------------------------------------ camera (§3.1, §8): two moves

const camera = [key(0, WIDE), key(286, work(768, 288, 1.5)), key(724, WIDE)];

// ------------------------------------------------------------------ cursor paths

interface Step {
  /** Arrival frame. */
  f: number;
  at: NativePt;
  shape?: CursorShape;
  /** Click 8 f after arrival, then 6 f dwell. */
  click?: boolean;
}

/** Keys + clicks from arrival steps (§2.10: dwell 8 f, click, dwell 6 f). */
function steps(list: Step[]): { path: CursorKey[]; clicks: number[] } {
  const path: CursorKey[] = [];
  const clicks: number[] = [];
  for (const s of list) {
    path.push({ f: s.f, at: s.at, shape: s.shape });
    if (s.click) {
      clicks.push(s.f + 8);
      path.push({ f: s.f + 14, at: s.at });
    }
  }
  return { path, clicks };
}

/** Exported for W5, which replays W3 ch.3–5 time-shifted. */
export function useCursors() {
  return useMemo(() => {
    const wz = wizardGeom();
    const nd = newDocGeom();
    const sbBtn = headerButtons(false, true).find((b) => b.k === 'sandbox')!;
    const newDocSel = headerButtons(true, true).find((b) => b.k === 'newDoc')!;
    const cg = calloutGeom();
    const dg = docGeom();
    const cm = commentsGeom();
    const S = cg.settled;
    const chip1 = libChipPoint(composerLines(composerText(1879)));
    const chip2 = libChipPoint(composerLines(composerText(1953)));
    const send = sendPoint(composerLines(composerText(2011)));
    const dewY = dg.dew.y;
    const bubble = { x: dg.dew.x1 - 8 + bubbleWidth / 2, y: dg.dew.lineTop - 34 + 12 };

    const rachel = steps([
      { f: 207, at: { x: 1060, y: 560 } },
      { f: 240, at: { x: sbBtn.cx, y: sbBtn.cy }, shape: 'hand', click: true },
      { f: 279, at: wz.name, shape: 'ibeam' },
      { f: 379, at: wz.access, shape: 'hand', click: true },
      { f: 408, at: wz.accessOpt2, shape: 'hand', click: true },
      { f: 439, at: wz.next1, shape: 'hand', click: true },
      { f: 479, at: wz.calder, shape: 'hand', click: true },
      { f: 508, at: wz.redgate, shape: 'hand', click: true },
      { f: 549, at: wz.next2, shape: 'hand', click: true },
      { f: 585, at: wz.who, shape: 'hand', click: true },
      { f: 614, at: wz.whoOpt2, shape: 'hand', click: true },
      { f: 646, at: wz.eleanor, shape: 'hand', click: true },
      { f: 675, at: wz.nadia, shape: 'hand', click: true },
      { f: 714, at: wz.create, shape: 'hand', click: true },
    ]);
    const owen = steps([
      { f: 822, at: { x: 900, y: 600 } },
      { f: 851, at: cardCentre(1), shape: 'arrow' },
    ]);
    const eleanor1 = steps([
      { f: 951, at: { x: 1000, y: 560 } },
      { f: 980, at: cardCentre(1), shape: 'hand', click: true },
      { f: 1011, at: { x: newDocSel.cx, y: newDocSel.cy }, shape: 'hand', click: true },
      { f: 1040, at: nd.title, shape: 'ibeam' },
      { f: 1135, at: nd.create, shape: 'hand', click: true },
      { f: 1177, at: DOTS, shape: 'hand', click: true },
      { f: 1206, at: menuItem(0), shape: 'hand', click: true },
    ]);
    // split: Nadia (right) and Eleanor (left), shell-native px of one seat
    const nadia3 = steps([
      { f: 1290, at: { x: 560, y: 600 } },
      { f: 1323, at: { x: 180, y: 230 }, shape: 'ibeam', click: true },
    ]);
    const eleanor3 = steps([
      { f: 1363, at: { x: 300, y: 650 } },
      { f: 1389, at: { x: 250, y: 420 }, shape: 'ibeam', click: true },
    ]);
    const eleanor4 = steps([
      { f: 1683, at: { x: 250, y: 420 } },
      { f: 1712, at: { x: 560, y: contentTop(false) + 26 }, shape: 'ibeam', click: true },
      { f: 1871, at: { x: chip1.x, y: chip1.y }, shape: 'hand', click: true },
      { f: 1900, at: libRowPoint(chip1.top, 4), shape: 'hand', click: true },
      { f: 1945, at: { x: chip2.x, y: chip2.y }, shape: 'hand', click: true },
      { f: 1974, at: libRowPoint(chip2.top, 3), shape: 'hand', click: true },
      { f: 2003, at: send, shape: 'hand', click: true },
    ]);
    const nadia5 = steps([
      { f: 2356, at: { x: 300, y: 700 } },
      { f: 2381, at: { x: cg.pill3.x, y: cg.pill3.y - S }, shape: 'hand' },
      { f: 2551, at: { x: cg.accept.x, y: cg.accept.y - S }, shape: 'hand', click: true },
    ]);
    // ch.6 Nadia: to "dewatering", press, drag 20 px/f, release, the bubble, the mention
    const nadia6: { path: CursorKey[]; clicks: number[] } = {
      path: [
        { f: 2733, at: { x: cg.accept.x, y: cg.accept.y - S }, shape: 'hand' },
        { f: 2758, at: { x: dg.dew.x0, y: dewY }, shape: 'ibeam' },
        { f: 2766, at: { x: dg.dew.x0, y: dewY } },
        { f: 2770, at: { x: dg.dew.x1, y: dewY }, linear: true },
        { f: 2791, at: bubble, shape: 'hand' },
        { f: 2805, at: bubble },
        { f: 2839, at: mentionRowPoint(), shape: 'hand' },
        { f: 2853, at: mentionRowPoint() },
      ],
      clicks: [2799, 2847],
    };
    const eleanor6 = steps([
      { f: 2975, at: { x: 300, y: 500 } },
      { f: 3005, at: { x: tabX('Comments', 1), y: 166 }, shape: 'hand', click: true },
      { f: 3034, at: cm.beforeReply.reply, shape: 'hand', click: true },
      { f: 3231, at: cm.afterReply.close, shape: 'hand', click: true },
      { f: 3260, at: { x: cm.toggle.x, y: cm.toggle.y }, shape: 'hand', click: true },
    ]);
    const nadiaEnd = steps([
      { f: 3235, at: { x: 498, y: 319 } },
      { f: 3260, at: { x: tabX('Chat', 0), y: 166 }, shape: 'hand', click: true },
    ]);
    return { rachel, owen, eleanor1, nadia3, eleanor3, eleanor4, nadia5, nadia6, eleanor6, nadiaEnd };
  }, []);
}

// ------------------------------------------------------------------ single-window seats (ch.1–2)

const within = (f: number, a: number, b: number) => f >= a && f < b;

const RachelSeat: React.FC = () => {
  const f = useCurrentFrame();
  const created = f >= T.wizardOut;
  return (
    <Shell
      seat="RACHEL"
      nav="Sandbox"
      overlay={
        f < T.wizardOut + 6 ? (
          <NewSandboxWizard
            hoverNext1={within(f, 435, T.step2)}
            hoverNext2={within(f, 545, T.step3)}
            hoverCreate={within(f, 710, T.wizardOut)}
            hoverRow={within(f, 475, 493) ? 'Calder & Hale' : within(f, 504, 522) ? 'Redgate Ecology' : within(f, 642, 660) ? 'Eleanor Price' : within(f, 671, 689) ? 'Nadia Okonjo' : undefined}
          />
        ) : null
      }
    >
      <SandboxPage
        org="Trentmoor Energy"
        isSuper
        cards={created ? [CB.rachel[0], CB.shared, CB.rachel[1]] : [...CB.rachel]}
        selected={created ? 1 : null}
        cardAt={{ i: 1, at: T.wizardOut }}
        hoverBtn={within(f, 236, T.wizardIn) ? 'sandbox' : undefined}
        flat="empty"
        toolbar="owner"
      />
    </Shell>
  );
};

const OwenSeat: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Shell seat="OWEN" nav="Sandbox">
      <SandboxPage org="Calder & Hale" isSuper={false} cards={[...CB.calderHale]} selected={null} hoverCard={f >= T.owenHover ? 1 : undefined} flat="calderHale" />
    </Shell>
  );
};

const EleanorSandbox: React.FC = () => {
  const f = useCurrentFrame();
  const sel = f >= T.cardSelect;
  return (
    <Shell
      seat="ELEANOR"
      nav="Sandbox"
      overlay={f >= T.newDocModal && f < T.newDocOut + 6 ? <NewDocModal hoverCreate={within(f, T.createDocHover - 4, T.newDocOut)} /> : null}
    >
      <SandboxPage
        org="Calder & Hale"
        isSuper
        cards={[CB.calderHale[0], CB.shared, CB.calderHale[1]]}
        selected={sel ? 1 : null}
        hoverCard={within(f, T.cardHover, T.cardSelect) ? 1 : undefined}
        hoverBtn={within(f, T.newDocHover - 4, T.newDocModal) ? 'newDoc' : undefined}
        flat="calderHale"
        toolbar="member"
        docRowAt={T.newDocOut}
        dotsHover={within(f, T.dotsHover - 4, T.menuOpen + 30)}
        menu={f >= T.menuOpen ? { at: T.menuOpen, hover: 0 } : undefined}
      />
    </Shell>
  );
};

const EleanorEditorSingle: React.FC = () => (
  <Shell
    seat="ELEANOR"
    nav={null}
    contentTone="sunken"
    secondBar={<EditorBar location={WT_COLLAB.editor.location} title={WT_COLLAB.docTitle} />}
  >
    <EditorBody
      canvas={
        <Prose>
          <span style={{ color: '#78766f' }}>{WT_COLLAB.editor.canvasPlaceholder}</span>
        </Prose>
      }
      panel={<PanelComposer />}
    />
  </Shell>
);

const EleanorSeat: React.FC = () => {
  const f = useCurrentFrame();
  return f < T.editorCut ? <EleanorSandbox /> : <EleanorEditorSingle />;
};

// ------------------------------------------------------------------ the video

const SINGLE_BODY = <Crossfade at={T.owenIn} a={<RachelSeat />} b={<Crossfade at={T.eleanorIn} a={<OwenSeat />} b={<EleanorSeat />} />} />;

const Body: React.FC = () => {
  const c = useCursors();
  return (
    <WalkthroughFrame
      video={META.video}
      chapters={META.chapters}
      captions={captions}
      camera={camera}
      splits={[
        { from: -200, to: 195 },
        { from: T.split, to: 100000 },
      ]}
      overlay={
        <>
          {/* the glimpse: the end state, frozen, as the split pair (90–194) */}
          <SplitWindows
            at={-200}
            exitAt={195}
            left={{
              seat: 'ELEANOR',
              content: (
                <Freeze frame={T.glimpseFreeze}>
                  <SplitSeat seat="ELEANOR" />
                </Freeze>
              ),
            }}
            right={{
              seat: 'NADIA',
              content: (
                <Freeze frame={T.glimpseFreeze}>
                  <SplitSeat seat="NADIA" />
                </Freeze>
              ),
            }}
          />
          <SplitWindows at={T.split} left={{ seat: 'ELEANOR', content: <SplitSeat seat="ELEANOR" /> }} right={{ seat: 'NADIA', content: <SplitSeat seat="NADIA" /> }} />

          {/* single window */}
          <WtCursor path={c.rachel.path} clicks={c.rachel.clicks} showFrom={207} hideAfter={801} />
          <WtCursor path={c.owen.path} clicks={c.owen.clicks} showFrom={822} hideAfter={T.eleanorIn} />
          <WtCursor path={c.eleanor1.path} clicks={c.eleanor1.clicks} showFrom={951} hideAfter={T.split} />
          {/* split: ch.3 */}
          <WtCursor window="right" path={c.nadia3.path} clicks={c.nadia3.clicks} showFrom={1290} hideAfter={1654} />
          <WtCursor window="left" path={c.eleanor3.path} clicks={c.eleanor3.clicks} showFrom={1363} hideAfter={1560} />
          {/* ch.4 */}
          <WtCursor window="left" path={c.eleanor4.path} clicks={c.eleanor4.clicks} showFrom={1683} hideAfter={2102} />
          {/* ch.5 */}
          <WtCursor window="right" path={c.nadia5.path} clicks={c.nadia5.clicks} showFrom={2356} hideAfter={2650} />
          {/* ch.6 */}
          <WtCursor window="right" path={c.nadia6.path} clicks={c.nadia6.clicks} drags={[{ from: T.selPress, to: T.selRelease }]} showFrom={2733} hideAfter={3074} />
          <WtCursor window="left" path={c.eleanor6.path} clicks={c.eleanor6.clicks} showFrom={2975} hideAfter={META.closeFrom} />
          <WtCursor window="right" path={c.nadiaEnd.path} clicks={c.nadiaEnd.clicks} showFrom={3235} hideAfter={META.closeFrom} />
        </>
      }
    >
      {SINGLE_BODY}
    </WalkthroughFrame>
  );
};

/**
 * Measured layout (wrapping, pill and word positions) needs the faces loaded:
 * hold the frame until they are, then render with real metrics.
 */
export const Video: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('W3: fonts for measured layout'));
  useEffect(() => {
    let live = true;
    fontsReady.then(
      () => {
        if (live) setReady(true);
        continueRender(handle);
      },
      () => continueRender(handle),
    );
    return () => {
      live = false;
    };
  }, [handle]);
  return ready ? <Body /> : null;
};
