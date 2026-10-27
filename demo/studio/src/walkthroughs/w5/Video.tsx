/**
 * W5 · Ethical walls (demo/plans/w5-ethical-walls/plan.md).
 *
 * Rachel (the owner) shares Calder & Hale's accepted method statement with
 * Redgate; the split then shows each seat's library and sandboxes, each one
 * lacking (never hinting at) what it may not see; chapter 5 replays W3's split
 * editor, time-shifted, as the one place the two firms meet.
 *
 * Frames are video-local and match the plan's shot table (§4). Chapter 5 uses
 * <TimeShift> (a Sequence offset) on purpose: it re-times W3's own timeline.
 */
import React, { useEffect, useState } from 'react';
import { continueRender, delayRender, Freeze, Sequence, useCurrentFrame } from 'remotion';
import { fontsReady } from '../../shared';
import { checkCaptions, Crossfade, key, Show, SplitWindows, WalkthroughFrame, WIDE, work, WtCursor, type CaptionCue } from '../shared';
import { SplitSeat } from '../w3/editor';
import { useCursors } from '../w3/Video';
import { META } from './meta';
import { LibrarySplit, OwnerLibrary, OwnerStatus, P1, P2, SandboxSplit, SB_CARDS, T1 } from './screens';

// ------------------------------------------------------------------ captions (§6)

const cue = (from: number, to: number, chapter: number, line: string, seat?: CaptionCue['seat']): CaptionCue => ({ from, to, chapter, line, seat });
const captions: CaptionCue[] = [
  cue(207, 306, 1, "Rachel's library holds everything on the project", 'RACHEL'),
  cue(309, 548, 1, 'She shares the method statement with Redgate', 'RACHEL'),
  cue(551, 804, 1, 'The record lists who it went to', 'RACHEL'),
  cue(807, 998, 2, 'Same library - each sees only their own'),
  cue(1001, 1254, 2, 'Calder & Hale sees no trace of it'),
  cue(1257, 1389, 3, "Redgate sees its own work and what's shared"),
  cue(1392, 1518, 3, 'Nadia acknowledges receipt for Redgate'),
  cue(1521, 1704, 3, "Now it's open to everyone at Redgate"),
  cue(1707, 1837, 4, 'Each firm has its own private areas'),
  cue(1840, 1915, 4, 'Nothing private shows across the wall'),
  cue(1918, 2274, 4, 'The shared space is the one overlap'),
  cue(2277, 2385, 5, 'Two firms in one document at once'),
  cue(2388, 2793, 5, 'Eleanor asks the agent in the shared chat'),
  cue(2796, 2943, 5, 'Both see the suggestion arrive, with sources'),
  cue(2946, 3148, 5, 'Nadia accepts - it lands for both'),
];
const problems = checkCaptions(captions);
if (problems.length) console.warn(`W5 captions:\n` + problems.join('\n'));

// ------------------------------------------------------------------ timing

const S = {
  split: 807,
  nadiaIn: 1257,
  ackClick: 1403,
  sandbox: 1707,
  eleanorSelect: 1935,
  nadiaSelect: 2085,
  segA: 2277,
  segB: 2397,
  segC: 2955,
  close: META.closeFrom, // 3149
  glimpseFreeze: 1700,
};
/** W5 frame − W3 frame, per replayed segment (§3.4). */
const SHIFT = { A: 938, B: 717, C: 419 };

const camera = [key(0, WIDE), key(297, work(768, 380, 1.3)), key(521, WIDE), key(613, work(860, 490, 1.5)), key(783, WIDE)];

// ------------------------------------------------------------------ helpers

/** Re-time children: they see (frame − by). */
const TimeShift: React.FC<{ by: number; children: React.ReactNode }> = ({ by, children }) => (
  <Sequence from={by} layout="none">
    {children}
  </Sequence>
);

// ------------------------------------------------------------------ single window (ch.1)

const Single: React.FC = () => {
  const f = useCurrentFrame();
  return f < T1.statusCut ? <OwnerLibrary /> : <OwnerStatus />;
};

// ------------------------------------------------------------------ split seats

const W3Seat: React.FC<{ seat: 'ELEANOR' | 'NADIA' }> = ({ seat }) => {
  const f = useCurrentFrame();
  if (f >= S.close) {
    return (
      <Freeze frame={2729}>
        <SplitSeat seat={seat} />
      </Freeze>
    );
  }
  const seg = (by: number) => (
    <TimeShift by={by}>
      <SplitSeat seat={seat} />
    </TimeShift>
  );
  return <Crossfade at={S.segB} a={seg(SHIFT.A)} b={<Crossfade at={S.segC} a={seg(SHIFT.B)} b={seg(SHIFT.C)} />} />;
};

const LeftSeat: React.FC = () => (
  <Crossfade
    at={S.sandbox}
    a={<LibrarySplit variant="calder" hoverLive={{ row: 0, from: 854, to: 905 }} />}
    b={<Crossfade at={S.segA} a={<SandboxSplit seat="ELEANOR" selectAt={S.eleanorSelect + 2} hoverCard={[{ card: 'working', from: 1751, to: 1865 }, { card: 'shared', from: 1923, to: S.eleanorSelect + 2 }]} />} b={<W3Seat seat="ELEANOR" />} />}
  />
);

const RightRachel: React.FC = () => <LibrarySplit variant="owner" hoverLive={{ row: 0, from: 1029, to: 1205 }} />;

const RightNadia: React.FC = () => (
  <Crossfade
    at={S.sandbox}
    a={<LibrarySplit variant="redgate" ackHover={[1389, 1410]} ackAt={S.ackClick} />}
    b={
      <Crossfade
        at={S.segA}
        a={<SandboxSplit seat="NADIA" selectAt={S.nadiaSelect + 2} hoverCard={[{ card: 'shared', from: 2073, to: S.nadiaSelect + 2 }]} />}
        b={<W3Seat seat="NADIA" />}
      />
    }
  />
);

// ------------------------------------------------------------------ cursors

const steps = (list: Array<{ f: number; at: { x: number; y: number }; shape?: 'arrow' | 'hand' | 'ibeam'; click?: boolean }>) => {
  const path: Array<{ f: number; at: { x: number; y: number }; shape?: 'arrow' | 'hand' | 'ibeam' }> = [];
  const clicks: number[] = [];
  for (const s of list) {
    path.push({ f: s.f, at: s.at, shape: s.shape });
    if (s.click) {
      clicks.push(s.f + 8);
      path.push({ f: s.f + 14, at: s.at });
    }
  }
  return { path, clicks };
};

const RACHEL1 = steps([
  { f: 210, at: P1.start },
  { f: 240, at: P1.peaTitle, shape: 'hand' },
  { f: 345, at: P1.transmit, shape: 'hand', click: true },
  { f: 388, at: P1.combo, shape: 'ibeam', click: true },
  { f: 429, at: P1.option, shape: 'hand', click: true },
  { f: 458, at: P1.transmitBtn, shape: 'hand', click: true },
  { f: 557, at: P1.open, shape: 'hand', click: true },
  { f: 656, at: P1.recipient, shape: 'arrow' },
]);
const ELEANOR2 = steps([
  { f: 826, at: P2.start },
  { f: 858, at: P2.firstLiveTitle, shape: 'hand' },
]);
const RACHEL2 = steps([
  { f: 1001, at: P2.start },
  { f: 1033, at: P2.firstLiveTitle, shape: 'hand' },
]);
const NADIA3 = steps([
  { f: 1300, at: P2.start },
  { f: 1370, at: P2.start },
  { f: 1395, at: P2.ackBtn, shape: 'hand', click: true },
]);
const ELEANOR4 = steps([
  { f: 1722, at: P2.start },
  { f: 1755, at: SB_CARDS.working, shape: 'hand' },
  { f: 1904, at: SB_CARDS.working, shape: 'hand' },
  { f: 1927, at: SB_CARDS.shared, shape: 'hand', click: true },
]);
const NADIA4 = steps([
  { f: 2051, at: P2.start },
  { f: 2077, at: SB_CARDS.shared, shape: 'hand', click: true },
]);

const W3Cursors: React.FC = () => {
  const c = useCursors();
  return (
    <>
      <Show from={S.segA + 6} to={S.segB + 6}>
        <TimeShift by={SHIFT.A}>
          <WtCursor window="right" path={c.nadia3.path} clicks={c.nadia3.clicks} showFrom={1290} hideAfter={1654} />
          <WtCursor window="left" path={c.eleanor3.path} clicks={c.eleanor3.clicks} showFrom={1363} hideAfter={1560} />
        </TimeShift>
      </Show>
      <Show from={S.segB + 6} to={S.segC + 6}>
        <TimeShift by={SHIFT.B}>
          <WtCursor window="left" path={c.eleanor4.path} clicks={c.eleanor4.clicks} showFrom={1683} hideAfter={2102} />
        </TimeShift>
      </Show>
      <Show from={S.segC + 6} to={S.close + 12}>
        <TimeShift by={SHIFT.C}>
          <WtCursor window="right" path={c.nadia5.path} clicks={c.nadia5.clicks} showFrom={2356} hideAfter={2650} />
        </TimeShift>
      </Show>
    </>
  );
};

const Overlay: React.FC = () => (
  <>
    {/* the glimpse: ch.3's end state, frozen */}
    <SplitWindows
      at={-200}
      exitAt={195}
      left={{
        seat: 'ELEANOR',
        content: (
          <Freeze frame={S.glimpseFreeze}>
            <LibrarySplit variant="calder" />
          </Freeze>
        ),
      }}
      right={{
        seat: 'NADIA',
        content: (
          <Freeze frame={S.glimpseFreeze}>
            <LibrarySplit variant="redgate" ackAt={S.ackClick} />
          </Freeze>
        ),
      }}
    />
    {/* ch.3 on: Eleanor | Nadia, under the ch.2 pair, which fades away at 1257 */}
    <SplitWindows at={S.nadiaIn - 15} left={{ seat: 'ELEANOR', content: <LeftSeat /> }} right={{ seat: 'NADIA', content: <RightNadia /> }} />
    <SplitWindows at={S.split} exitAt={S.nadiaIn} left={{ seat: 'ELEANOR', content: <LeftSeat /> }} right={{ seat: 'RACHEL', content: <RightRachel /> }} />

    <WtCursor path={RACHEL1.path} clicks={RACHEL1.clicks} showFrom={210} hideAfter={760} />
    <WtCursor window="left" path={ELEANOR2.path} clicks={ELEANOR2.clicks} showFrom={826} hideAfter={900} />
    <WtCursor window="right" path={RACHEL2.path} clicks={RACHEL2.clicks} showFrom={1001} hideAfter={1200} />
    <WtCursor window="right" path={NADIA3.path} clicks={NADIA3.clicks} showFrom={1300} hideAfter={1460} />
    <WtCursor window="left" path={ELEANOR4.path} clicks={ELEANOR4.clicks} showFrom={1722} hideAfter={2000} />
    <WtCursor window="right" path={NADIA4.path} clicks={NADIA4.clicks} showFrom={2051} hideAfter={2200} />
    <W3Cursors />
  </>
);

const Body: React.FC = () => (
  <WalkthroughFrame
    video={META.video}
    chapters={META.chapters}
    captions={captions}
    camera={camera}
    splits={[
      { from: -200, to: 195 },
      { from: S.split, to: 100000 },
    ]}
    overlay={<Overlay />}
  >
    <Single />
  </WalkthroughFrame>
);

/** The replayed W3 editor measures its text: hold the frame until the faces are loaded. */
export const Video: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('W5: fonts for measured layout'));
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
