/**
 * Clip 03 body: review across the ethical wall (demo/archive/2026-10-sizzle/plan/video-03-review-wall.md).
 * Frames are body-local (frame 0 = the title card).
 *
 *   #  standalone  film     what
 *   1  0–59        0–59     title card
 *   2  60–227      60–227   split: Rachel comments (left focal), then the wall notice (right focal)
 *   3  228–272     228–272  mid-card 1
 *   4  273–362     273–362  split: release click; comments arrive on Eleanor's side
 *   5  363–482     —        Eleanor alone: the response to comment B (standalone only)
 *   6  483–527     363–407  mid-card 2
 *   7  528–639     408–519  payoff card: Accepted, in the library, citable
 *   8  640–651     520–531  fade to field
 *
 * Deviation (stated): the crops are 358 × 376 native, not 358 × 330, and sit
 * at y 590 with the seat labels at y 94. At 330 the shared type sizes cannot
 * hold the top labels, three comments, the verdict select and the release
 * button without cramping; 376 keeps every row at its token size.
 */
import React from 'react';
import { Sequence, useCurrentFrame } from 'remotion';
import {
  Camera,
  Cursor,
  FadeOutToField,
  Field,
  Float,
  SeatLabel,
  TitleCard,
  appear,
  between,
  contextStyle,
  ease,
  type BodyProps,
  type CameraKey,
} from '../../shared';
import { CARDS } from '../../data/wrenfield';
import { META } from './meta';
import { GEO, SEATS } from './copy';
import { EleanorCrop, RESPONSE_H, RachelCrop, T, responseGrow } from './crops';
import { Payoff } from './payoff';

/** Zoom about a fixed screen point P (so P stays put while the camera pushes). */
const fixedPoint = (px: number, py: number, s: number) => ({ x: px - (px - 960) / s, y: py - (py - 540) / s, scale: s });

/** Wall notice centre on screen (right crop), for the shot-2 slow push. */
const NOTICE = { x: GEO.rightX, y: 486 };
/**
 * Shot-5 push target (stage px) once Eleanor's crop sits at x 960. y is chosen
 * so the seat label (screen y 72–116) falls in the gap between the progress
 * labels and the counter, with comment B and its response filling the frame.
 */
const COMMENT_B = { x: 960, y: 743 };
/** Release button centre on screen (left crop). */
export const RELEASE = { x: 640, y: 978 };

const Split: React.FC<{ cut: BodyProps['cut'] }> = ({ cut }) => {
  const f = useCurrentFrame();
  const shot2 = f < T.shot4;
  const shot5 = cut === 'standalone' && f >= T.shot5;

  // Focus (§4.3, §4.7): shot 2 is left-focal to 129, right-focal from 130.
  const leftCtx = shot2 ? contextStyle(f, T.rightFocal) : {};
  const rightCtx = shot2 ? contextStyle(f, T.leftIn - 9, T.rightFocal) : {};
  // Non-focal labels at 0.6 beside a focal line.
  const leftLabels = shot2 ? 0.6 : 1;
  const rightLabels = shot2 ? 0.6 : shot5 ? 1 - 0.4 * appear(f, T.respFocal, 9) : 1;

  // Shot 4: Rachel's side dims once the comments have left it.
  const leftDim = shot2 ? 1 : 1 - 0.4 * appear(f, T.dimLeft, 9);
  // Shot 5: Rachel exits left; Eleanor's crop moves to centre.
  const exit = shot5 ? between(f, [T.shot5, T.leftExitEnd], [0, 1], ease.inOut) : 0;
  const move = shot5 ? between(f, [T.shot5, T.moveEnd], [0, 1], ease.inOut) : 0;
  const rightX = GEO.rightX + (960 - GEO.rightX) * move;

  const keys: CameraKey[] = shot2
    ? [
        { f: T.pushFrom, x: 960, y: 540, scale: 1 },
        { f: T.shot2End, ...fixedPoint(NOTICE.x, NOTICE.y, 1.05), ease: 'inOut' },
      ]
    : shot5
      ? [
          { f: T.shot5, x: 960, y: 540, scale: 1 },
          { f: T.camEnd, x: COMMENT_B.x, y: COMMENT_B.y, scale: 1.25, ease: 'out' },
        ]
      : [];

  const seatAt = (at: number) => (shot2 ? at : T.shot4 - 9);
  // Standalone shot 5: the push slides the stepper labels under both seat
  // pills, so the pills leave in the push's first 4 f.
  const pillO = shot5 ? 1 - appear(f, T.shot5, 4, ease.linear) : 1;

  return (
    <>
      <Camera keys={keys}>
        {exit < 1 ? (
          <Float
            x={GEO.leftX}
            y={GEO.y}
            scale={GEO.scale}
            at={shot2 ? T.leftIn : undefined}
            dx={-120 * exit}
            opacity={leftDim * (1 - exit) * ((leftCtx.opacity as number | undefined) ?? 1)}
            filter={leftCtx.filter}
          >
            <RachelCrop labelOpacity={leftLabels} />
          </Float>
        ) : null}
        <Float
          x={rightX}
          y={GEO.y}
          scale={GEO.scale}
          at={shot2 ? T.rightIn : undefined}
          dy={(RESPONSE_H * responseGrow(f, cut) * GEO.scale) / 2}
          opacity={(rightCtx.opacity as number | undefined) ?? 1}
          filter={rightCtx.filter}
        >
          <EleanorCrop labelOpacity={rightLabels} cut={cut} />
        </Float>
      </Camera>

      {exit < 1 ? (
        <SeatLabel seat="client" text={SEATS.left} at={seatAt(T.seatL)} x={GEO.leftX - 120 * exit} y={GEO.seatY} opacity={pillO} />
      ) : null}
      <SeatLabel seat="consultant" text={SEATS.right} at={seatAt(T.seatR)} x={rightX} y={GEO.seatY} opacity={pillO} />

      {!shot2 && f < T.shot5 ? (
        <Cursor
          path={[
            { f: T.cursorShow, x: 760, y: 1040 },
            { f: T.cursorArrive, x: RELEASE.x, y: RELEASE.y },
          ]}
          clicks={[T.click]}
          showFrom={T.cursorShow}
          hideAfter={T.cursorHide}
        />
      ) : null}
    </>
  );
};

export const Body: React.FC<BodyProps> = ({ cut }) => {
  const f = useCurrentFrame();
  const len = META.body[cut];
  const film = cut === 'film';
  const splitEnd = film ? 362 : T.shot5End; // last frame of shot 4 (film) or shot 5 (standalone)
  const mid2 = film ? 363 : 483;
  const payoff = film ? 408 : 528;
  const showSplit = (f >= T.leftIn && f < 228) || (f >= T.shot4 && f <= splitEnd);
  return (
    <Field>
      <Sequence durationInFrames={60} name="1 · title">
        <TitleCard text={CARDS.v03.title} />
      </Sequence>
      {showSplit ? <Split cut={cut} /> : null}
      <Sequence from={228} durationInFrames={45} name="3 · mid-card 1">
        <TitleCard text={CARDS.v03.mid1} />
      </Sequence>
      <Sequence from={mid2} durationInFrames={45} name="6 · mid-card 2">
        <TitleCard text={CARDS.v03.mid2} />
      </Sequence>
      {/* Runs through the fade so the payoff fades out under the field. */}
      <Sequence from={payoff} durationInFrames={len - payoff} name="7 · payoff">
        <Payoff />
      </Sequence>
      <FadeOutToField from={len - 12} />
    </Field>
  );
};
