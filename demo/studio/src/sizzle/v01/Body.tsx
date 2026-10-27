/**
 * Clip 01 body: cited drafting (demo/archive/2026-10-sizzle/plan/video-01-cited-drafting.md).
 * Frames are body-local (frame 0 = the title card). The film cut is the
 * standalone body unchanged (723 f in both).
 *
 *  1   0–59   title card
 *  2  60–95   the Editor, push to the composer
 *  3  96–191  the prompt
 *  4 192–251  the run trace
 *  5 252–296  mid card
 *  6 297–392  the suggestion, the withheld notice
 *  7 393–476  segment 3, click its pill, the page opens
 *  8 477–548  the cited span
 *  9 549–620  the superseded line
 * 10 621–710  accept; the draft lands in the canvas
 * 11 711–722  fade to field
 */
import React from "react";
import { Sequence, useCurrentFrame } from "remotion";
import {
  between,
  C,
  Camera,
  cameraAt,
  contextStyle,
  Cursor,
  ease,
  FadeOutToField,
  Field,
  Float,
  FONT,
  GreekText,
  PromptHero,
  RADIUS,
  RunTrace,
  SourcePanel,
  SuggestionCard,
  TitleCard,
  appear,
  type BodyProps,
  type CameraKey,
} from "../../shared";
import {
  CARDS,
  DRAFT_PROMPT,
  DRAFT_SEGMENTS,
  DRAFT_TRACE,
  GIR_LOCATOR,
  GIR_PASSAGE,
  GIR_SUPERSEDED_LINE,
  LIB,
  PEOPLE,
  SUGGESTION_TITLE,
  WITHHELD_LINE,
} from "../../data/wrenfield";
import { EditorShell } from "./EditorShell";
import { META } from "./meta";
import { GEO } from "./geometry";

// ------------------------------------------------------------------ shot 2–3: the shell, then the prompt

const ShellIntro: React.FC = () => {
  const f = useCurrentFrame();
  if (f >= 110) return null;
  const blur = contextStyle(f, 96);
  const gone = 1 - between(f, [102, 110], [0, 1], ease.linear);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        ...blur,
        opacity: ((blur.opacity as number | undefined) ?? 1) * gone,
      }}
    >
      <Camera
        keys={[
          { f: 68, x: 960, y: 540, scale: 1 },
          {
            f: 95,
            x: GEO.composer.x,
            y: GEO.composer.y,
            scale: 1.7,
            ease: "out",
          },
        ]}
      >
        <Float x={960} y={540} scale={1.2} at={60} shadow="pane" radius={10}>
          <EditorShell shotTwoLabels />
        </Float>
      </Camera>
    </div>
  );
};

const Prompt: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 96 || f > 191) return null;
  return (
    <PromptHero
      at={96}
      x={960}
      y={500}
      placeholder="Ask for a draft into this document"
      text={DRAFT_PROMPT}
      typeFrom={102}
      typeTo={140}
      sendAt={160}
      author={{ name: PEOPLE.ELEANOR.name, org: PEOPLE.ELEANOR.org }}
      highlights={[{ phrase: "accepted", at: 144, id: "v01-accepted" }]}
      chips={["From the library"]}
      activeChip="From the library"
    />
  );
};

// ------------------------------------------------------------------ shot 4: the run trace

const Trace: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 192 || f > 251) return null;
  return (
    <>
      <Float
        x={GEO.bubble.x}
        y={GEO.bubble.y}
        scale={2.4}
        at={192}
        shadow="popout"
        radius={RADIUS.lg}
        background={C.pane}
      >
        <div
          style={{
            width: 330,
            padding: "9px 13px",
            boxSizing: "border-box",
            fontFamily: FONT.sans,
            fontSize: 13,
            lineHeight: 1.45,
            color: C.text,
          }}
        >
          <GreekText text={DRAFT_PROMPT} greek />
        </div>
      </Float>
      <Float x={960} y={GEO.traceY} scale={2.4} at={192}>
        <RunTrace
          title="Agent · Working"
          doneTitle={{ text: "Agent · Done", at: 236 }}
          steps={DRAFT_TRACE.map((s, i) => ({
            ...s,
            doneAt: [204, 218, 232][i],
          }))}
          startAt={192}
          width={360}
        />
      </Float>
    </>
  );
};

// ------------------------------------------------------------------ shots 6–10: the suggestion card

const CARD_SEGMENTS = DRAFT_SEGMENTS.map((s, i) =>
  i === 2
    ? {
        ...s,
        greek: true,
        focalFrom: 393,
        highlightAt: 393,
        greekFrom: 474,
        pillActiveAt: 462,
      }
    : { ...s, greek: true },
);

/** Height-locked so the title stays put while the card fills downwards (final native height 279). */
const Card: React.FC = () => (
  <div style={{ width: 640, height: 280 }}>
    <SuggestionCard
      title={SUGGESTION_TITLE}
      segments={CARD_SEGMENTS}
      revealFrom={303}
      stagger={6}
      withheld={{ text: WITHHELD_LINE, at: 333, greekFrom: 389 }}
      actionsAt={340}
      acceptAt={644}
      greekAllFrom={621}
      width={640}
    />
  </div>
);

/** Screen-space slide of the card: left to x 560 (466–476), back to 960 (621–629). */
const cardSlide = (f: number) =>
  f < 621
    ? between(f, [466, 476], [0, GEO.cardLeftX - 960], ease.inOut)
    : between(f, [621, 629], [GEO.cardLeftX - 960, 0], ease.inOut);

/** Shots 6–9: the card on its own camera (slow push 330–392; eased back while it slides away). */
const CardStage: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 297 || f >= 621) return null;
  return (
    <div style={{ position: "absolute", inset: 0, ...contextStyle(f, 466) }}>
      <Camera
        keys={[
          { f: 330, x: 960, y: 540, scale: 1 },
          { f: 392, x: 960, y: 540, scale: 1.05, ease: "inOut" },
          { f: 466, x: 960, y: 540, scale: 1.05 },
          { f: 476, x: 960, y: 540, scale: 1, ease: "inOut" },
        ]}
      >
        <Float
          x={960}
          y={540}
          scale={2.4}
          at={297}
          dx={cardSlide(f)}
          shadow="none"
        >
          <Card />
        </Float>
      </Camera>
    </div>
  );
};

// ------------------------------------------------------------------ shots 7–9: the source panel

const PANEL_SCALE = GEO.panel.scale;
/**
 * The two hl spans, one readable line at a time: the depth (480), then the
 * migration pathway (516), so both halves of segment 3's claim are seen in
 * the source. Each repeats the claim just read, so each is a recap line
 * (§4.3: ≥ words × 4 f; 9 words → 36 f, 6 words → 24 f before the rise).
 */
const HL_TIMES = [
  { at: 480, greekFrom: 516 },
  { at: 516, greekFrom: undefined },
];
/** The superseded line rises here (8 words × 8 = 64 f, done by 616). */
const RISE_AT = 552;
/** The seed passage with each hl span kept on one line (non-breaking spaces). */
const PASSAGE = (() => {
  let n = 0;
  return GIR_PASSAGE.map((p) =>
    p.hl
      ? { ...p, text: p.text.replace(/ /g, "\u00a0"), ...HL_TIMES[n++] }
      : p,
  );
})();

const Panel: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 468 || f > 632) return null;
  const exit = between(f, [621, 629], [0, 1], ease.in);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - exit }}>
      <Camera
        keys={[
          { f: 480, x: 960, y: 540, scale: 1 },
          // Slow push about the span: keep the span's screen point fixed.
          {
            f: 548,
            x: GEO.span.x - (GEO.span.x - 960) / 1.06,
            y: GEO.span.y - (GEO.span.y - 540) / 1.06,
            scale: 1.06,
            ease: "inOut",
          },
        ]}
      >
        <Float
          x={GEO.panel.x}
          y={GEO.panel.y}
          scale={PANEL_SCALE}
          at={468}
          dx={exit * 520}
          shadow="overlay"
        >
          <SourcePanel
            docRef={LIB.GIR.ref}
            title={LIB.GIR.title}
            badges={[
              { tone: "success", label: "v2 · Current" },
              { tone: "neutral", label: "Used for AI answers" },
            ]}
            page={GIR_LOCATOR}
            passage={PASSAGE}
            keepBadges={["v2 · Current"]}
            width={GEO.panel.width}
            footer={{
              // Workaround: SourcePanel types the footer as a string and draws it
              // legibly before it rises; Greek it until the rise so the hl span
              // is the only line (readability rule).
              text: (
                <GreekText text={GIR_SUPERSEDED_LINE} sharpFrom={RISE_AT} />
              ) as unknown as string,
              riseAt: RISE_AT,
            }}
          />
        </Float>
      </Camera>
    </div>
  );
};

// ------------------------------------------------------------------ shot 10: accept, the pull-back into the canvas

/** Shell camera: held on section 2 at ×(2.4 / 1.7) until 648, then the pull-back reveal to ×1 (32 f, ease.out). */
const SHELL_CAM: CameraKey[] = [
  {
    f: 648,
    x: GEO.section2.x,
    y: GEO.section2.y,
    scale: 2.4 / GEO.shell.scale,
  },
  { f: 680, x: 960, y: 540, scale: 1, ease: "out" },
];

const AcceptStage: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 621) return null;
  const k = cameraAt(f, SHELL_CAM).scale;
  const shellO = appear(f, 646, 8);
  const cardO = 1 - between(f, [647, 658], [0, 1], ease.linear);
  return (
    <Camera keys={SHELL_CAM}>
      {shellO > 0 ? (
        <Float
          x={GEO.shell.x}
          y={GEO.shell.y}
          scale={GEO.shell.scale}
          opacity={shellO}
          shadow="pane"
          radius={10}
        >
          <EditorShell
            landAt={657}
            flashAt={662}
            receipt={{ at: 654, focalAt: 654, size: GEO.receiptSize }}
          />
        </Float>
      ) : null}
      {cardO > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            ...contextStyle(f, 466, 621),
          }}
        >
          <Float
            x={GEO.section2.x}
            y={GEO.section2.y}
            scale={GEO.shell.scale}
            dx={cardSlide(f) / k}
            dy={between(f, [648, 680], [0, GEO.cardDy], ease.out)}
            opacity={cardO}
            shadow="none"
          >
            <Card />
          </Float>
        </div>
      ) : null}
    </Camera>
  );
};

// ------------------------------------------------------------------ the body

export const Body: React.FC<BodyProps> = ({ cut }) => {
  const len = META.body[cut];
  return (
    <Field>
      <Sequence durationInFrames={60}>
        <TitleCard text={CARDS.v01.title} />
      </Sequence>
      <ShellIntro />
      <Prompt />
      <Trace />
      <Sequence from={252} durationInFrames={45}>
        <TitleCard text={CARDS.v01.mid} />
      </Sequence>
      <CardStage />
      <Panel />
      <AcceptStage />
      {/* Cursors: screen space, never blurred. */}
      <Cursor
        path={[
          { f: 444, x: 1300, y: 860 },
          { f: 460, x: GEO.pill3.x, y: GEO.pill3.y },
        ]}
        clicks={[462]}
        showFrom={444}
        hideAfter={470}
      />
      <Cursor
        path={[
          { f: 626, x: 1300, y: 900 },
          { f: 642, x: GEO.accept.x, y: GEO.accept.y },
        ]}
        clicks={[644]}
        showFrom={626}
        hideAfter={652}
      />
      <FadeOutToField from={len - 12} />
    </Field>
  );
};
