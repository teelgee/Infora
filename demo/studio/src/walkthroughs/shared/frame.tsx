/**
 * The walkthrough frame (master-plan §2.1, §2.2, §2.5, §2.8, §2.9): field,
 * opening title, the app window with its camera, the split pair, captions,
 * the chapter bar, the close and the logo.
 *
 * Every frame number is VIDEO-LOCAL (frame 0 = the first frame of the title).
 * Nothing here resets time: use <Show> / <Crossfade>, not <Sequence>.
 */
import React from 'react';
import { AbsoluteFill, Freeze, useCurrentFrame } from 'remotion';
import { appear, C, ease, Field, FONT, Wordmark, type F } from '../../shared';
import { WT_TITLES, type WtPersonKey } from '../../data/wrenfield';
import { Caption, ChapterBar, SeatTag, type CaptionCue } from './captions';
import { CameraProvider } from './context';
import {
  cameraAt,
  K,
  plateTransform,
  SKELETON,
  SPLIT,
  WIDE,
  WINDOW,
  WINDOW_SHADOW,
  type Chapter,
  type WtCameraKey,
} from './geometry';

// ------------------------------------------------------------------ time helpers

/** Render children only for from ≤ f < to (no time shift). */
export const Show: React.FC<{ from?: F; to?: F; children: React.ReactNode }> = ({ from = -Infinity, to = Infinity, children }) => {
  const f = useCurrentFrame();
  return f >= from && f < to ? <>{children}</> : null;
};

/**
 * Crossfade window content from `a` to `b` over `dur` frames from `at`
 * (12 f for a seat change or time jump, §2.7). Use a plain cut (<Show>) for
 * the same person moving around the app.
 */
export const Crossfade: React.FC<{ at: F; dur?: number; a: React.ReactNode; b: React.ReactNode }> = ({ at, dur = 12, a, b }) => {
  const f = useCurrentFrame();
  if (f < at) return <>{a}</>;
  if (f >= at + dur) return <>{b}</>;
  const p = (f - at) / dur;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - p }}>{a}</div>
      <div style={{ position: 'absolute', inset: 0, opacity: p }}>{b}</div>
    </div>
  );
};

/**
 * The end-state glimpse: render the body frozen at `at` (usually a frame in
 * the close), so the glimpse is exactly the end state with no motion.
 */
export const EndGlimpse: React.FC<{ at: F; children: React.ReactNode }> = ({ at, children }) => <Freeze frame={at}>{children}</Freeze>;

// ------------------------------------------------------------------ windows

/** The window chrome: the frame fill, radius 12, soft shadow, clip. */
export const WindowFrame: React.FC<{ x?: number; y?: number; w?: number; h?: number; opacity?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  x = WINDOW.x,
  y = WINDOW.y,
  w = WINDOW.w,
  h = WINDOW.h,
  opacity = 1,
  children,
  style,
}) =>
  opacity <= 0 ? null : (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: WINDOW.r,
        background: C.frame,
        boxShadow: WINDOW_SHADOW,
        overflow: 'hidden',
        opacity,
        ...style,
      }}
    >
      {children}
    </div>
  );

/** The native plate inside the main window, magnified by the camera. */
export const Plate: React.FC<{ camera?: WtCameraKey[]; opacity?: number; children: React.ReactNode }> = ({ camera, opacity = 1, children }) => {
  const f = useCurrentFrame();
  if (opacity <= 0) return null;
  const cam = cameraAt(f, camera);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: plateTransform(cam), opacity }}>
      {children}
    </div>
  );
};

/** The single app window (§2.2): content is the Shell at native 1536 × 864. */
export const AppWindow: React.FC<{ camera?: WtCameraKey[]; opacity?: number; children: React.ReactNode }> = ({ camera, opacity = 1, children }) => (
  <WindowFrame opacity={opacity}>
    <Plate camera={camera}>{children}</Plate>
  </WindowFrame>
);

export interface SplitSide {
  seat: WtPersonKey;
  /** A Shell at native 752 × 832 (collapsed rail). */
  content: React.ReactNode;
}

/**
 * Two seats at once (§2.2): 822 × 910 windows at (120, 60) and (978, 60), seat
 * tags above at y 24–52. Crossfades in over 15 f from `at`, out from `exitAt`.
 * No camera in split. Pass the same interval to WalkthroughFrame's `splits`.
 */
export const SplitWindows: React.FC<{ at: F; exitAt?: F; left: SplitSide; right: SplitSide }> = ({ at, exitAt, left, right }) => {
  const f = useCurrentFrame();
  const o = appear(f, at, 15, ease.linear) * (exitAt === undefined ? 1 : 1 - appear(f, exitAt, 15, ease.linear));
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      {(['left', 'right'] as const).map((side) => {
        const g = SPLIT[side];
        const s = side === 'left' ? left : right;
        return (
          <React.Fragment key={side}>
            <div style={{ position: 'absolute', left: g.x + 2, top: SPLIT.tagY, height: 28, display: 'flex', alignItems: 'center' }}>
              <SeatTag seat={s.seat} size={17} />
            </div>
            <WindowFrame x={g.x} y={g.y} w={g.w} h={g.h}>
              <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `scale(${K})` }}>{s.content}</div>
            </WindowFrame>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ title and logo

/** The opening title (frames 0–89, §2.5). The third row is the video's scenario line (producer ruling), not the deck tagline. */
export const OpeningTitle: React.FC<{ kicker: string; name: string; line: string }> = ({ kicker, name, line }) => {
  const f = useCurrentFrame();
  if (f >= 90) return null;
  const out = 1 - appear(f, 80, 10, ease.out);
  const row = (i: number): React.CSSProperties => {
    const p = appear(f, 4 + i * 4, 12, ease.out);
    return { opacity: p * out, transform: `translateY(${(1 - p) * 8}px)` };
  };
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 520, left: 0, right: 0, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ ...row(0), fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: C.muted, lineHeight: '18px' }}>
          {kicker}
        </div>
        <div style={{ ...row(1), marginTop: 18, fontFamily: FONT.serif, fontSize: 76, fontWeight: 500, letterSpacing: -0.5, color: C.ink, lineHeight: '86px' }}>
          {name}
        </div>
        <div
          style={{
            ...row(2),
            marginTop: 22,
            maxWidth: 1200,
            textAlign: 'center',
            fontFamily: FONT.sans,
            fontSize: 28,
            fontWeight: 400,
            color: C.text2,
            lineHeight: '38px',
          }}
        >
          {line}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The logo (90 f from `from`, §2.9): the 72 px wordmark fades in over f 6–20, centred. */
export const ClosingLogo: React.FC<{ from: F }> = ({ from }) => {
  const f = useCurrentFrame();
  const o = appear(f, from + 6, 14, ease.out);
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Wordmark size={72} tone="onField" opacity={o} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ the frame

export interface WalkthroughFrameProps {
  video: 1 | 2 | 3 | 4 | 5;
  chapters: Chapter[];
  /** Chapter captions only. The glimpse and close captions are added from WT_TITLES. */
  captions: CaptionCue[];
  /** Main-window camera (native centre + m). Starts Wide; the close returns to Wide over 24 f automatically. */
  camera?: WtCameraKey[];
  /** The end state for frames 90–206, window content at Wide (use <EndGlimpse at={…}>). */
  glimpse?: React.ReactNode;
  /** Window content from frame 195 on (chapters + close), native px. */
  children: React.ReactNode;
  /** Screen-space layer above the windows: cursors, SplitWindows. */
  overlay?: React.ReactNode;
  /** Intervals the main window is hidden for a split (15 f crossfades at both ends). */
  splits?: Array<{ from: F; to: F }>;
  /** Override the close caption's line (default WT_TITLES[video].closeLine). */
  closeLine?: string;
  glimpseLine?: string;
}

/**
 * The skeleton (§2.1): title 0–89 · glimpse 90–194 · crossfade 195–206 ·
 * chapters from 207 · close (150 f) · logo (90 f). Total = last chapter's end
 * + 240.
 */
export const WalkthroughFrame: React.FC<WalkthroughFrameProps> = ({ video, chapters, captions, camera, glimpse, children, overlay, splits = [], closeLine, glimpseLine }) => {
  const f = useCurrentFrame();
  const t = WT_TITLES[video];
  const closeFrom = chapters[chapters.length - 1].to;
  const logoFrom = closeFrom + SKELETON.close;

  // Close: back to Wide over 24 f if needed.
  const keys = React.useMemo(() => {
    const k = [...(camera ?? [{ f: 0, ...WIDE }])];
    const end = cameraAt(closeFrom, k);
    if (Math.abs(end.m - 1) > 1e-3) k.push({ f: closeFrom, ...WIDE, dur: 24 });
    return k;
  }, [camera, closeFrom]);

  const cues: CaptionCue[] = [
    { from: 96, to: 186, chapter: 0, line: glimpseLine ?? t.glimpseLine },
    ...captions,
    { from: closeFrom, to: logoFrom + 12, chapter: chapters.length, line: closeLine ?? t.closeLine },
  ];

  // Stage: the window fades in 84–101 (scale .985 → 1) and everything fades out over the logo's first 12 f.
  const intro = appear(f, 84, 17, ease.out);
  const outro = 1 - appear(f, logoFrom, 12, ease.out);
  const stage = intro * outro;
  let mainVis = 1;
  for (const s of splits) {
    if (f >= s.from && f < s.to + 15) mainVis = Math.min(mainVis, 1 - appear(f, s.from, 15, ease.linear) + appear(f, s.to, 15, ease.linear));
  }
  const glimpseO = f < SKELETON.glimpseOutFrom ? 1 : 1 - Math.min(1, (f - SKELETON.glimpseOutFrom) / 12);
  const bodyO = f < SKELETON.glimpseOutFrom ? 0 : Math.min(1, (f - SKELETON.glimpseOutFrom) / 12);

  return (
    <CameraProvider keys={keys}>
      <Field>
        <OpeningTitle kicker={t.kicker} name={t.name} line={t.scenarioLine} />
        {stage > 0 ? (
          <AbsoluteFill style={{ opacity: stage, transform: `scale(${0.985 + 0.015 * intro})`, transformOrigin: '960px 496px' }}>
            <WindowFrame opacity={mainVis}>
              {glimpse && glimpseO > 0 ? (
                <Plate camera={[{ f: 0, ...WIDE }]} opacity={glimpseO}>
                  {glimpse}
                </Plate>
              ) : null}
              {bodyO > 0 ? (
                <Plate camera={keys} opacity={bodyO}>
                  {children}
                </Plate>
              ) : null}
            </WindowFrame>
            {overlay}
          </AbsoluteFill>
        ) : null}
        {outro > 0 ? (
          <AbsoluteFill style={{ opacity: outro }}>
            <Caption cues={cues} chapters={chapters} />
            {f < logoFrom + 12 ? <ChapterBar chapters={chapters} /> : null}
          </AbsoluteFill>
        ) : null}
        <ClosingLogo from={logoFrom} />
      </Field>
    </CameraProvider>
  );
};
