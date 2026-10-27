/**
 * Clip 04 body: the supplier-KPI app, built by asking
 * (demo/archive/2026-10-sizzle/plan/video-04-kpi-app.md). Frames are body-local (frame 0 = the
 * title card). Constants live in ./timing.ts as STANDALONE frames; the film
 * cut replays the same builder and payoff frames, shifted (see `Shifted`).
 *
 *  #   standalone  film      what
 *  1     0–59      0–59      title card
 *  2    60–143     60–143    the prompt
 *  3   144–203    144–203    words to workflow (hero → bubble, phrases → steps)
 *  4   204–287    204–287    Q1: will payments depend on these numbers?
 *  5   288–371    288–371    Q2: who should see the dashboard?
 *  A      —       372–416    mid-card A (film only)
 *  6   372–495    417–540    preview (empty), then Rachel's own words
 *  7   496–579    541–624    Q3: run as you, Rachel, on these two tables only?
 *  8   580–633    625–678    the human gate (read back, open)
 *  9   634–678    679–723    mid-card B
 *  I      —       724–798    insight beat (film only)
 * 10   679–767    799–887    two seats, same dashboard
 * 11   768–779    888–899    fade to field
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  Badge,
  BuilderHeader,
  C,
  Camera,
  Cursor,
  Dashboard,
  FadeOutToField,
  Field,
  Float,
  FONT,
  Highlight,
  PhraseLift,
  PromptHero,
  RADIUS,
  ReadBack,
  SeatLabel,
  SHADOW,
  STAGE,
  TitleCard,
  appear,
  between,
  contextStyle,
  ease,
  type BodyProps,
} from '../../shared';
import { BUILDER, CARDS, KPI_APP, PEOPLE, STEPS } from '../../data/wrenfield';
import { META } from './meta';
import { DASH } from './data';
import { KpiChat, type ChatTurn } from './chat';
import { Rail, type RailStep } from './steps';
import { MeasureRoot, useAnchorRects, type Rect } from './measure';
import { BUILDER_END, BUILDER_START, FILM, PAYOFF_START, STEP_DONE, T } from './timing';

// ------------------------------------------------------------------ helpers

/** Show `children` for body frames [from, from + dur); children see (body frame − shift). */
const Shifted: React.FC<{ from: number; dur: number; shift: number; children: React.ReactNode }> = ({ from, dur, shift, children }) => (
  <Sequence from={from} durationInFrames={dur} name={`v04 +${shift}`}>
    <Sequence from={-(from - shift)}>{children}</Sequence>
  </Sequence>
);

const centre = (r: Rect | undefined, fallback: { x: number; y: number }) => (r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : fallback);

type CursorPlan = { show: number; arrive: number; click: number; hide: number; from: { x: number; y: number } };

/** A cursor that travels to a measured control and clicks it (§4.8). */
const ClickTo: React.FC<{ plan: CursorPlan; target: Rect | undefined }> = ({ plan, target }) => {
  const to = centre(target, plan.from);
  return (
    <Cursor
      path={[
        { f: plan.show, ...plan.from },
        { f: plan.arrive, ...to },
      ]}
      clicks={[plan.click]}
      showFrom={plan.show}
      hideAfter={plan.hide}
    />
  );
};

const RACHEL = PEOPLE.RACHEL;
const SAM = PEOPLE.SAM;

// ------------------------------------------------------------------ shot 2–3: the hero, morphing into the chat's first bubble

/**
 * The PromptHero, which from 156 to 170 shrinks and travels so that its first
 * phrase lands exactly on the same phrase in the chat's first bubble
 * (measured live), crossfading into the bubble over 164–170.
 */
/** The hero's rest centre and width (PromptHero default 1360), and the chat pane's body (left 120, 1120 wide; header rule at y 222). */
const HERO_X = 960;
const HERO_W = 1360;
const CHAT_PANE = { right: 120 + 1120, top: 222 } as const;

const HeroMorph: React.FC = () => {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const root = useRef<HTMLDivElement>(null);
  const [xf, setXf] = useState({ s: 1, tx: 0, ty: 0 });
  const active = f >= T.morphFrom && f <= T.morphTo;
  const applied = active ? xf : { s: 1, tx: 0, ty: 0 };

  useLayoutEffect(() => {
    if (!active || !root.current) return;
    const r = root.current.getBoundingClientRect();
    const k = r.width / width;
    if (!(k > 0)) return;
    const doc = root.current.ownerDocument;
    const heroEl = doc.querySelector('[data-anchor="h-p1"]');
    const bubbleEl = doc.querySelector('[data-anchor="p1"]');
    if (!heroEl || !bubbleEl) return;
    const hb = heroEl.getBoundingClientRect();
    const bb = bubbleEl.getBoundingClientRect();
    // Hero anchor at rest: undo the transform applied in this render.
    const px = ((hb.left - r.left) / k - applied.tx) / applied.s;
    const py = ((hb.top - r.top) / k - applied.ty) / applied.s;
    const ph = hb.height / k / applied.s;
    const qx = (bb.left - r.left) / k;
    const qy = (bb.top - r.top) / k;
    const qh = bb.height / k;
    const m = ease.inOut((f - T.morphFrom) / (T.morphTo - T.morphFrom));
    const s1 = qh / ph;
    const next = { s: 1 + (s1 - 1) * m, tx: m * (qx - s1 * px), ty: m * (qy - s1 * py) };
    if (Math.abs(next.s - xf.s) > 1e-4 || Math.abs(next.tx - xf.tx) > 0.05 || Math.abs(next.ty - xf.ty) > 0.05) setXf(next);
  });

  const o = 1 - appear(f, T.bubbleFadeFrom, 4, ease.linear);
  // Keep the shrinking card inside the chat pane: once its send button has crossed the pane's
  // right edge, crop at that edge (never through the button), and never draw above the header rule.
  const cardRight = applied.tx + applied.s * (HERO_X + HERO_W / 2);
  const clipRight = Math.max(CHAT_PANE.right, cardRight - 40 * applied.s + 6);
  const clipTop = f >= T.chatAt ? CHAT_PANE.top : 0;
  const clip = active ? `inset(${clipTop}px ${Math.max(0, width - clipRight)}px 0 0)` : undefined;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <MeasureRoot ref={root} />
      {o > 0 ? (
        <AbsoluteFill style={{ clipPath: clip }}>
          <AbsoluteFill style={{ transformOrigin: '0 0', transform: `translate(${applied.tx}px, ${applied.ty}px) scale(${applied.s})`, opacity: o }}>
            <PromptHero
              at={T.heroAt}
              x={HERO_X}
              y={460}
              placeholder={BUILDER.placeholder}
              text={KPI_APP.prompt}
              typeFrom={T.typeFrom}
              typeTo={T.typeTo}
              sendAt={T.sendAt}
              author={{ name: RACHEL.name, org: RACHEL.org }}
              highlights={KPI_APP.phrases.map((p, i) => ({ phrase: p.phrase, at: T.hl[i], id: `h-${p.id}` }))}
            />
          </AbsoluteFill>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ shots 2–8: the builder stage

const TAG_LAND = 14; // a lifted phrase's tag fades in as its flyer resolves (last 6 of 20 f)

function railSteps(): RailStep[] {
  const tagOf = (n: number) => {
    const i = KPI_APP.phrases.findIndex((p) => p.step === n);
    return i < 0 ? undefined : { text: KPI_APP.phrases[i].phrase, at: T.lifts[i] + TAG_LAND };
  };
  const waiting: Record<number, number> = { 2: T.step2Waiting, 4: T.step4Waiting };
  return STEPS.map((title, i) => ({
    n: i + 1,
    title,
    summary: KPI_APP.summaries[i],
    tag: tagOf(i + 1),
    waitingAt: waiting[i + 1],
    doneAt: STEP_DONE[i],
  }));
}

function chatTurns(): ChatTurn[] {
  const { q1, q2, q3 } = KPI_APP;
  return [
    {
      kind: 'prompt',
      text: KPI_APP.prompt,
      at: T.morphFrom - 6,
      showFrom: T.bubbleFadeFrom,
      greekFrom: T.promptGreek,
      phrases: KPI_APP.phrases.map((p, i) => ({ phrase: p.phrase, id: p.id, liftAt: T.lifts[i] })),
    },
    { kind: 'question', id: 'q1', text: q1.text, at: T.q1, replies: q1.replies, chosen: q1.chosen, chosenAt: T.q1Cursor.click, greekFrom: T.q2 },
    { kind: 'user', text: q1.replies[q1.chosen], at: T.q1Cursor.click + 8 },
    { kind: 'receipt', label: KPI_APP.r1, at: T.r1 },
    { kind: 'question', id: 'q2', text: q2.text, at: T.q2, replies: q2.replies, chosen: q2.chosen, chosenAt: T.q2Cursor.click, greekFrom: T.u3TypeFrom },
    { kind: 'user', text: q2.replies[q2.chosen], at: T.q2Cursor.click + 8 },
    { kind: 'receipt', label: KPI_APP.r2, at: T.r2 },
    { kind: 'user', text: KPI_APP.u3, at: T.u3Send, greekFrom: T.a3 },
    { kind: 'agent', text: KPI_APP.a3, at: T.a3, greekFrom: T.q3 },
    { kind: 'question', id: 'q3', text: q3.text, at: T.q3, replies: q3.replies, chosen: q3.chosen, chosenAt: T.q3Cursor.click, greekFrom: T.readBackAt },
    { kind: 'user', text: q3.replies[q3.chosen], at: T.q3Cursor.click + 8 },
    { kind: 'receipt', label: KPI_APP.r3, at: T.r3 },
  ];
}

/** The preview pane (880, 160, 920 × 762): the empty dashboard at 1.19. */
const PREVIEW = { x: 880, y: 160, w: 920, h: 762, scale: 1.19 } as const;
/** The bar chart's native rect inside the 774 × 640 dashboard (video-04 grid). */
const BAR_NATIVE = { x: 12, y: 24 + 40 + 12 + 72 + 12, w: 250, h: 190 } as const;

const Preview: React.FC = () => {
  const f = useCurrentFrame();
  const enter = appear(f, T.previewAt, 9);
  if (enter <= 0) return null;
  const ring = appear(f, T.flagRule, 6, ease.linear) * (1 - appear(f, T.q3 + 20, 12, ease.linear));
  const s = PREVIEW.scale;
  const rx = PREVIEW.x + (PREVIEW.w - 774 * s) / 2 + BAR_NATIVE.x * s - 6;
  const ry = PREVIEW.y + BAR_NATIVE.y * s - 6;
  const rw = BAR_NATIVE.w * s + 12;
  const rh = BAR_NATIVE.h * s + 12;
  return (
    // Slides in from the right, behind the narrowing chat, so the two never collide.
    <AbsoluteFill style={{ opacity: enter, transform: `translateX(${(1 - enter) * 48}px)` }}>
      <Float x={PREVIEW.x + PREVIEW.w / 2} y={PREVIEW.y + PREVIEW.h / 2} scale={s}>
        {/* No header flag badge here: the callout under the ring carries the rule, once. */}
        <Dashboard seat="client" data={DASH.client} empty at={T.dashAt} />
      </Float>
      {/* The preview's label, at screen size, in the dashboard header's empty right side. */}
      <div style={{ position: 'absolute', right: STAGE.w - (PREVIEW.x + PREVIEW.w) + 22, top: PREVIEW.y + 26 }}>
        <Badge tone="neutral" pill size={19} label="Preview · no returns yet" />
      </div>
      {/* Where Rachel's change landed: an amber ring round the bar chart, tagged with the rule at a readable size. */}
      {ring > 0 ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: rx,
              top: ry,
              width: rw,
              height: rh,
              boxSizing: 'border-box',
              borderRadius: RADIUS.card * s + 6,
              border: `2.5px solid ${C.warning.dot}`,
              boxShadow: `0 0 0 6px ${C.warning.tint}`,
              opacity: ring,
            }}
          />
          <div style={{ position: 'absolute', left: rx + rw / 2, top: ry + rh, transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * ring})`, opacity: ring }}>
            <Badge tone="warning" pill size={17} label="Flags under 90% on time" style={{ boxShadow: SHADOW.popout, borderRadius: 999 }} />
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};

const CURSOR_ANCHORS = ['q1-r0', 'q2-r1', 'q3-r0', 'readback-primary'];

const Builder: React.FC = () => {
  const f = useCurrentFrame();
  const { rects, root } = useAnchorRects(CURSOR_ANCHORS, true);
  const chatW = between(f, [T.narrowFrom, T.narrowTo], [1120, 720], ease.inOut);
  const ctx = contextStyle(f, T.gate);
  return (
    <AbsoluteFill>
      <MeasureRoot ref={root} />

      <AbsoluteFill style={ctx}>
        <Preview />
        <div style={{ position: 'absolute', left: 120, top: 136 }}>
          <KpiChat
            title={BUILDER.panelTitle}
            turns={chatTurns()}
            composer={{ placeholder: BUILDER.composer, value: KPI_APP.u3, typeFrom: T.u3TypeFrom, typeTo: T.u3TypeTo, sendAt: T.u3Send }}
            width={chatW}
            height={864}
            scale={2.4}
            at={T.chatAt}
            progress={{ done: STEP_DONE, from: T.narrowFrom }}
          />
        </div>
        <div style={{ position: 'absolute', left: 1320, top: 136 }}>
          <Rail steps={railSteps()} width={480} height={864} scale={1.8} at={T.railAt} exitAt={T.railExit} />
        </div>
      </AbsoluteFill>

      {/* The header stays sharp through the gate (shot 8). */}
      <div style={{ position: 'absolute', left: 120, top: 48 }}>
        <BuilderHeader
          crumb={['Tools', 'App builder']}
          app={KPI_APP.name}
          at={T.headerAt}
          badge={{ tone: 'neutral', label: BUILDER.draftBadge, flipTo: { tone: 'success', label: KPI_APP.publish, at: T.publish } }}
          role={{ tone: 'info', label: RACHEL.seat }}
        />
      </div>

      {f <= T.morphTo ? <HeroMorph /> : null}

      {KPI_APP.phrases.map((p, i) => (
        <PhraseLift key={p.id} id={p.id} from={T.lifts[i]} dur={T.liftDur} target={`step-${p.step}`} />
      ))}

      {/* 8 · Check and open */}
      <Float x={960} y={560} scale={2.4} at={T.readBackAt} shadow="overlay">
        <ReadBack lines={KPI_APP.readBack} focalLine={0} primary={KPI_APP.publish} pressAt={T.rbCursor.click} />
      </Float>

      <ClickTo plan={T.q1Cursor} target={rects['q1-r0']} />
      <ClickTo plan={T.q2Cursor} target={rects['q2-r1']} />
      <ClickTo plan={T.q3Cursor} target={rects['q3-r0']} />
      <ClickTo plan={T.rbCursor} target={rects['readback-primary']} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ insight beat (film only, film frames)

/** The InsightCard's native rect inside the 774 × 640 dashboard. */
const INSIGHT_NATIVE = { top: 24 + 40 + 12 + 72 + 12 + 190 + 12, h: 96 } as const;

const InsightBeat: React.FC = () => {
  const f = useCurrentFrame();
  const s = 1.19;
  // 50 px lower than centre so the seat pill (y 60) sits clear of the dashboard header.
  const fy = 610;
  const insightY = fy + (INSIGHT_NATIVE.top + INSIGHT_NATIVE.h / 2 - 320) * s;
  // Blur from the push, so nothing sharp passes under the seat pill as the camera moves.
  const blur = contextStyle(f, FILM.pushFrom - 2);
  const bottom = 640 - INSIGHT_NATIVE.top - INSIGHT_NATIVE.h;
  // Lands already counted (final figures, Rachel's flag applied): no mid-count values on the beat's first frames.
  const dash = <Dashboard seat="client" data={DASH.client} flagRuleAt={FILM.insight} flagAt={FILM.insight} insightFocalFrom={FILM.insightFocal} />;
  return (
    <AbsoluteFill>
      <Camera
        keys={[
          { f: FILM.pushFrom, x: 960, y: 540, scale: 1 },
          { f: FILM.pushTo, x: 960, y: insightY, scale: 2.05, ease: 'out' },
        ]}
      >
        <Float x={960} y={fy} scale={s} at={FILM.insight} filter={blur.filter as string | undefined} opacity={(blur.opacity as number | undefined) ?? 1}>
          {dash}
        </Float>
        {f >= FILM.insightFocal + 2 ? (
          <Float x={960} y={fy} scale={s} shadow="none" style={{ clipPath: `inset(${INSIGHT_NATIVE.top}px 12px ${bottom}px 12px round 8px)` }}>
            {dash}
          </Float>
        ) : null}
      </Camera>
      <SeatLabel seat="client" text={`${RACHEL.org} · ${RACHEL.name}`} at={FILM.insight} x={960} y={60} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ shot 10: two seats, same dashboard

/** The payoff crop (620 × 468 native) at 1.4 = 868 × 655 on screen; key labels ≥ 21 px, values ≥ 50 px. */
const PAYOFF_SCALE = 1.4;
const PAY = { lx: 502, rx: 1418, y: 510, pillY: 140, noteY: 904 } as const;

const Payoff: React.FC = () => {
  const f = useCurrentFrame();
  const dim = 1 - 0.4 * appear(f, T.leftDim, 9);
  return (
    <AbsoluteFill>
      <Float x={PAY.lx} y={PAY.y} scale={PAYOFF_SCALE} at={T.leftAt} opacity={dim}>
        <Dashboard seat="client" data={DASH.client} crop="payoff" countFrom={T.count} flagRuleAt={T.leftAt} flagAt={T.flag} />
      </Float>
      <Float x={PAY.rx} y={PAY.y} scale={PAYOFF_SCALE} at={T.rightAt}>
        <Dashboard seat="supplier" data={DASH.supplier} crop="payoff" countFrom={T.count} flagRuleAt={T.rightAt} />
      </Float>
      <SeatLabel seat="client" text={`${RACHEL.org} · ${RACHEL.name}`} at={T.leftAt} x={PAY.lx} y={PAY.pillY} opacity={dim} />
      <SeatLabel seat="supplier" text={`${SAM.org} · ${SAM.name}`} at={T.rightAt} x={PAY.rx} y={PAY.pillY} />
      <Float x={PAY.rx} y={PAY.noteY} scale={2.4} at={T.noteAt} shadow="none" radius={RADIUS.card} background={C.info.tint}>
        <div style={{ width: 340, boxSizing: 'border-box', padding: '10px 14px', fontFamily: FONT.sans, fontSize: 13, lineHeight: 1.45, fontWeight: 500, color: C.info.text, textAlign: 'center' }}>
          <Highlight at={T.noteHl}>{KPI_APP.netherfoldNote}</Highlight>
        </div>
      </Float>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ the body

export const Body: React.FC<BodyProps> = ({ cut }) => {
  const len = META.body[cut];
  const film = cut === 'film';
  const midB = film ? FILM.cardA + 45 + (T.cardB - FILM.cardA) : T.cardB;
  return (
    <Field>
      <Sequence durationInFrames={60} name="1 · title">
        <TitleCard text={CARDS.v04.title} />
      </Sequence>
      {film ? (
        <>
          <Shifted from={BUILDER_START} dur={FILM.cardA - BUILDER_START} shift={0}>
            <Builder />
          </Shifted>
          <Sequence from={FILM.cardA} durationInFrames={45} name="A · mid-card">
            <TitleCard text={CARDS.v04.midA} />
          </Sequence>
          <Shifted from={FILM.cardA + FILM.shiftBuilder} dur={BUILDER_END - FILM.cardA} shift={FILM.shiftBuilder}>
            <Builder />
          </Shifted>
        </>
      ) : (
        <Shifted from={BUILDER_START} dur={BUILDER_END - BUILDER_START} shift={0}>
          <Builder />
        </Shifted>
      )}
      <Sequence from={midB} durationInFrames={45} name="9 · mid-card B">
        <TitleCard text={CARDS.v04.midB} />
      </Sequence>
      {film ? (
        <Shifted from={FILM.insight} dur={FILM.insightEnd - FILM.insight} shift={0}>
          <InsightBeat />
        </Shifted>
      ) : null}
      <Shifted from={film ? PAYOFF_START + FILM.shiftPayoff : PAYOFF_START} dur={len - (film ? PAYOFF_START + FILM.shiftPayoff : PAYOFF_START)} shift={film ? FILM.shiftPayoff : 0}>
        <Payoff />
      </Shifted>
      <FadeOutToField from={len - 12} />
    </Field>
  );
};
