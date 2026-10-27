/**
 * Clip 05 body: the progress-pack app (demo/archive/2026-10-sizzle/plan/video-05-deck-app.md).
 * Frames are body-local (frame 0 = the title card).
 *
 * Standalone 779 f; film 663 f. The film drops shots 6–7 (358–473) and, in
 * their place, finishes the build in a quick sweep (film 344–387): step 2
 * ticks, R2 lands, steps 4–6 tick, and a short gate (Greek'd read-back,
 * "Open to Calder & Hale" pressed at 374) flips the badge and ticks step 7.
 * The 30 f this costs is paid for in shot 10: the film overlaps the deck-grid
 * landing with the push (the grid is unreadable at 0.25 anyway), so every
 * film beat from the push on runs 30 f earlier (LATE_TRIM).
 * Everything from the mid-card on is written in standalone frames; the film
 * plays it from film frame 388 (= standalone 474) through a nested Sequence.
 */
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import {
  BuilderHeader,
  Camera,
  ChatPanel,
  Cursor,
  FadeOutToField,
  Field,
  Float,
  PhraseLift,
  PromptHero,
  ReadBack,
  SavedStrip,
  SeatLabel,
  Shimmer,
  StepRail,
  TitleCard,
  between,
  contextStyle,
  ease,
  type BodyProps,
  type Cut,
  type StepSpec,
  type Turn,
} from '../../shared';
import { BUILDER, CARDS, COMMENTARY, DECK_APP, PEOPLE, PROGRAMME, STEPS } from '../../data/wrenfield';
import { META } from './meta';
import { DeckGrid } from './deck';
import { CommentaryForm, HomeCard } from './screens';

/** Film frame = standalone − FILM_SHIFT for every frame ≥ LATE_START. */
const LATE_START = 474;
/** Film: the builder runs to 387, so the late shots start at film 388. */
const FILM_LATE_FROM = 388;
/** Film: shot-10 beats after the Generate click run this much earlier. */
const LATE_TRIM = 30;
/** Film-only gate (the build finishes): read-back in, press, badge flip / step 7, gate out. */
const FG = { in: 366, press: 374, done: 376, out: 378 };

// ------------------------------------------------------------------ builder stage (shots 2–7)

const HERO = { x: 960, y: 460 };
/** Where the shrunk prompt lands: the first user bubble (screen px), and its scale (44 → 31.2 px text). */
const BUBBLE = { x: 753, y: 745, scale: 0.68 };
/** PromptHero's composer width (native px), and the chat pane's right edge (screen px). */
const HERO_W = 1360;
const CHAT = { left: 120, right: 1240 };

const Builder: React.FC<{ cut: Cut }> = ({ cut }) => {
  const f = useCurrentFrame();
  const film = cut === 'film';

  // Shot 3: the prompt shrinks into the first user bubble (156–170), then crossfades to it.
  const m = between(f, [156, 170], [0, 1], ease.inOut);
  const heroOpacity = 1 - between(f, [166, 172], [0, 1], ease.linear);
  // Scale settles faster than position (ease.out), so the card is pane-sized by the time the pane is in.
  const heroScale = 1 + (BUBBLE.scale - 1) * between(f, [156, 170], [0, 1], ease.out);

  const steps: StepSpec[] = STEPS.map((title, i) => ({ n: i + 1, title, summary: DECK_APP.summaries[i] }));
  steps[0].doneAt = 204;
  // No "asks" chips (review: internal jargon); the "Waiting for you" badge carries the meaning.
  steps[1] = { ...steps[1], waitingAt: 280, doneAt: 348 };
  steps[2] = { ...steps[2], activeAt: 223, doneAt: 262 };
  steps[3].doneAt = film ? 354 : 352;
  steps[4].doneAt = film ? 358 : 354;
  steps[5] = film ? { ...steps[5], doneAt: 362 } : { ...steps[5], waitingAt: 360, doneAt: 433 };
  steps[6] = film ? { ...steps[6], activeAt: FG.in, doneAt: FG.done } : { ...steps[6], doneAt: 470 };

  const turns: Turn[] = [
    { kind: 'user', name: PEOPLE.ELEANOR.name, text: DECK_APP.prompt, at: 165, greekFrom: 165 },
    { kind: 'agent', text: DECK_APP.c1, at: 204 },
    { kind: 'file', name: DECK_APP.file.name, meta: DECK_APP.file.meta, button: DECK_APP.file.button, at: 223, pressAt: 256 },
    { kind: 'receipt', label: DECK_APP.rm, at: 262 },
    { kind: 'question', text: DECK_APP.q1.text, replies: [...DECK_APP.q1.replies], chosen: DECK_APP.q1.chosen, at: 280, chosenAt: 336 },
    { kind: 'receipt', label: DECK_APP.r2, at: 350 },
  ];
  if (!film) {
    turns.push(
      { kind: 'question', text: DECK_APP.q3.text, replies: [...DECK_APP.q3.replies], chosen: DECK_APP.q3.chosen, at: 360, chosenAt: 424 },
      { kind: 'receipt', label: DECK_APP.r3, at: 433 },
    );
  }

  // Shot 7 (standalone): everything but the header blurs behind the read-back.
  // Film: the same gate, briefly, lifted again once it is pressed so step 7's tick shows.
  const gate = film ? contextStyle(f, FG.in, FG.out, 0.6) : contextStyle(f, 434);
  // Step 3's summary shimmers while the sheet is read (256–262); StepRail has no shimmer of its own.
  // As the chat pane fades in, the shrinking prompt is held 12 px inside it (no overhang into the
  // gap or the step rail); where it is still wider than the pane, it is centred on the pane.
  const paneP = between(f, [156, 159], [0, 1], ease.linear);
  const half = (HERO_W / 2) * heroScale;
  const cx = HERO.x + (BUBBLE.x - HERO.x) * m;
  const lo = CHAT.left + 12 + half;
  const hi = CHAT.right - 12 - half;
  const held = lo > hi ? (CHAT.left + CHAT.right) / 2 : Math.min(hi, Math.max(lo, cx));
  const heroNudge = paneP * (cx - held);
  const shimmerO = between(f, [256, 258], [0, 1], ease.linear) * (1 - between(f, [261, 264], [0, 1], ease.linear));

  return (
    <AbsoluteFill>
      <AbsoluteFill style={gate}>
        <div style={{ position: 'absolute', left: 120, top: 136 }}>
          <ChatPanel title={BUILDER.panelTitle} turns={turns} composer={{ placeholder: BUILDER.composer }} width={1120} height={864} scale={2.4} at={158} />
        </div>
        <div style={{ position: 'absolute', left: 1320, top: 136 }}>
          <StepRail steps={steps} at={162} />
        </div>
        {shimmerO > 0 ? (
          <div style={{ position: 'absolute', left: 1392, top: 472, opacity: shimmerO }}>
            <Shimmer w={300} h={13} radius={6} />
          </div>
        ) : null}
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 120, top: 48 }}>
        <BuilderHeader
          crumb={['Tools', 'App builder']}
          app={DECK_APP.name}
          badge={{ tone: 'neutral', label: BUILDER.draftBadge, flipTo: { tone: 'success', label: DECK_APP.publish, at: film ? FG.done : 470 } }}
          role={{ tone: 'success', label: 'Member' }}
          at={162}
        />
      </div>

      {/* Shots 2–3: the prompt, then its shrink into the bubble. */}
      {heroOpacity > 0 ? (
        <AbsoluteFill
          style={{
            opacity: heroOpacity,
            transformOrigin: `${HERO.x}px ${HERO.y}px`,
            transform: `translate(${(BUBBLE.x - HERO.x) * m - heroNudge}px, ${(BUBBLE.y - HERO.y) * m}px) scale(${heroScale})`,
          }}
        >
          <PromptHero
            placeholder={BUILDER.placeholder}
            text={DECK_APP.prompt}
            typeFrom={64}
            typeTo={96}
            sendAt={108}
            at={60}
            x={HERO.x}
            y={HERO.y}
            author={{ name: PEOPLE.ELEANOR.name, org: PEOPLE.ELEANOR.org }}
            highlights={DECK_APP.phrases.map((p, i) => ({ phrase: p.phrase, at: 144 + i * 3, id: `v05-${p.id}` }))}
          />
        </AbsoluteFill>
      ) : null}

      {/* Shot 7 (standalone): the human gate. */}
      {!film ? (
        <Float x={960} y={560} scale={2.4} at={434} shadow="overlay">
          <ReadBack lines={DECK_APP.readBack} primary={DECK_APP.publish} pressAt={464} />
        </Float>
      ) : (
        /* Film: the gate the viewer just read in clip 4, so every line stays Greek'd; only the button reads. */
        <Float x={960} y={560} scale={2.4} at={FG.in} exitAt={FG.out} shadow="overlay">
          <ReadBack lines={DECK_APP.readBack} focalLine={-1} primary={DECK_APP.publish} pressAt={FG.press} />
        </Float>
      )}
    </AbsoluteFill>
  );
};

/** Hidden prompt copy kept mounted after the crossfade, so PhraseLift can still measure the highlights. */
const LiftSources: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 168 || f > 201) return null;
  const m = 1;
  return (
    <AbsoluteFill
      style={{
        opacity: 0,
        transformOrigin: `${HERO.x}px ${HERO.y}px`,
        transform: `translate(${(BUBBLE.x - HERO.x) * m}px, ${(BUBBLE.y - HERO.y) * m}px) scale(${BUBBLE.scale})`,
      }}
    >
      <PromptHero
        text={DECK_APP.prompt}
        typeFrom={-2}
        typeTo={-1}
        caret={false}
        x={HERO.x}
        y={HERO.y}
        author={{ name: PEOPLE.ELEANOR.name, org: PEOPLE.ELEANOR.org }}
        highlights={DECK_APP.phrases.map((p) => ({ phrase: p.phrase, at: 0, id: `v05-src-${p.id}` }))}
      />
    </AbsoluteFill>
  );
};

const BuilderOverlays: React.FC<{ cut: Cut }> = ({ cut }) => {
  const film = cut === 'film';
  return (
    <>
      <LiftSources />
      {DECK_APP.phrases.map((p, i) => (
        <PhraseLift key={p.id} id={`v05-src-${p.id}`} target={`step-${p.step}`} from={168 + i * 3} dur={20} />
      ))}
      {/* Shot 4: Connect the spreadsheet. */}
      <Cursor path={[{ f: 240, x: 900, y: 1010 }, { f: 254, x: CONNECT.x, y: CONNECT.y }]} clicks={[256]} showFrom={240} hideAfter={264} />
      {/* Shot 5: the payments question, reply 2. */}
      <Cursor path={[{ f: 318, x: 900, y: 1010 }, { f: 334, x: REPLY_NO.x, y: REPLY_NO.y }]} clicks={[336]} showFrom={318} hideAfter={344} />
      {!film ? (
        <>
          {/* Shot 6: run as Eleanor, reply 1. */}
          <Cursor path={[{ f: 406, x: 900, y: 1010 }, { f: 422, x: REPLY_YES.x, y: REPLY_YES.y }]} clicks={[424]} showFrom={406} hideAfter={432} />
          {/* Shot 7: open it. */}
          <Cursor path={[{ f: 448, x: 1300, y: 960 }, { f: 462, x: OPEN.x, y: OPEN.y }]} clicks={[464]} showFrom={448} hideAfter={467} />
        </>
      ) : (
        /* Film: open it. */
        <Cursor path={[{ f: FG.in, x: 1180, y: 900 }, { f: FG.press - 2, x: OPEN.x, y: OPEN.y }]} clicks={[FG.press]} showFrom={FG.in} hideAfter={FG.out} />
      )}
    </>
  );
};

/** Cursor targets (screen px), render-checked at the click frames. */
const CONNECT = { x: 1092, y: 766 };
const REPLY_NO = { x: 500, y: 788 };
const REPLY_YES = { x: 312, y: 788 };
const OPEN = { x: 780, y: 708 };

// ------------------------------------------------------------------ late shots (8–10), standalone frames

const DECK_CENTRE = { x: 960, y: 540 };
const GRID = { w: 1248, h: 474 };
/** Slide 4 (row 2, col 1) centre in stage px. */
const SLIDE4 = { x: DECK_CENTRE.x - GRID.w / 2 + 200, y: DECK_CENTRE.y - GRID.h / 2 + 225 + 24 + 112.5 };
const GENERATE = { x: 960, y: 700 };

const Late: React.FC<{ cut: Cut }> = ({ cut }) => {
  const f = useCurrentFrame();
  const film = cut === 'film';
  /** Film: beats after the push starts run LATE_TRIM earlier; the grid lands during the push. */
  const t = film ? LATE_TRIM : 0;
  const deckAt = film ? 612 : 618;
  /** Film: the home card fades from the click (612–618), then one 15 f push straight to slide 4. */
  const cardFade = film ? 612 : 614;
  const pushFrom = film ? 618 : 640;
  const brook = PROGRAMME.rows.find((r) => r.status === 'Behind')!;
  const c = COMMENTARY[brook.pkg];
  return (
    <AbsoluteFill>
      {/* Shot 8: mid-card. */}
      {f >= 474 && f <= 518 ? <TitleCard text={CARDS.v05.mid} from={474} /> : null}

      {/* Shot 9: a package lead writes in the app. */}
      {f >= 519 && f <= 594 ? (
        <>
          <Float x={960} y={580} scale={2.4} at={519} shadow="pane">
            <CommentaryForm pkg={brook.pkg} progress={c.progress} risk={c.risk} decision={c.decision} typeFrom={525} typeTo={549} highlightAt={552} pressAt={580} savedAt={584} />
          </Float>
          <SeatLabel seat="consultant" text={`Calder & Hale · ${PEOPLE.OWEN.name}, package lead`} at={521} x={960} y={90} />
        </>
      ) : null}

      {/* Shot 10: the deck. */}
      {f >= 595 ? (
        <>
          <Camera
            keys={[
              { f: pushFrom, x: DECK_CENTRE.x, y: DECK_CENTRE.y, scale: 1 },
              { f: 663 - t, x: SLIDE4.x, y: SLIDE4.y, scale: 3.8, ease: 'out' },
            ]}
          >
            <div style={{ position: 'absolute', left: DECK_CENTRE.x - GRID.w / 2, top: DECK_CENTRE.y - GRID.h / 2 }}>
              <DeckGrid at={deckAt} stagger={film ? 2 : 4} beats={{ quoteHighlightAt: 664 - t, forecastHighlightAt: 736 - t, contextFrom: 645 - t }} />
            </div>
          </Camera>
          <Float x={960} y={540} scale={2.4} at={595} opacity={1 - between(f, [cardFade, cardFade + 6], [0, 1], ease.linear)}>
            <HomeCard title={DECK_APP.homeTitle} label={DECK_APP.homeLabel} packages={PROGRAMME.rows.map((r) => r.short)} primary={DECK_APP.generate} pressAt={612} />
          </Float>
          <Cursor path={[{ f: 596, x: 1300, y: 900 }, { f: 610, x: GENERATE.x, y: GENERATE.y }]} clicks={[612]} showFrom={596} hideAfter={film ? 614 : 620} />
          <SavedStrip at={744 - t} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ Body

export const Body: React.FC<BodyProps> = ({ cut }) => {
  const len = META.body[cut];
  const lateFrom = cut === 'film' ? FILM_LATE_FROM : LATE_START;
  return (
    <Field>
      <Sequence durationInFrames={60}>
        <TitleCard text={CARDS.v05.title} />
      </Sequence>
      <Sequence from={60} durationInFrames={lateFrom - 60}>
        {/* Inner frames stay body-local. */}
        <Sequence from={-60}>
          <Builder cut={cut} />
          <BuilderOverlays cut={cut} />
        </Sequence>
      </Sequence>
      <Sequence from={lateFrom}>
        <Sequence from={-LATE_START}>
          <Late cut={cut} />
        </Sequence>
      </Sequence>
      <FadeOutToField from={len - 12} />
    </Field>
  );
};
