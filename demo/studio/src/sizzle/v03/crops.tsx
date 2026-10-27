/**
 * The two cropped review screens of clip 03, at native size (358 wide).
 * Rachel's crop (Trentmoor, reviewing) and Eleanor's crop (Calder & Hale,
 * behind the wall). Both read the body-local frame directly; every beat
 * frame is in `T` below, straight from demo/archive/2026-10-sizzle/plan/video-03-review-wall.md.
 *
 * A local, compact comment card is used instead of the shared CommentCard:
 * the shared card's padding and two-line greek bodies make three comments,
 * a composer, the verdict and the release button overflow the crop (see the
 * report). Its styling matches the shared card.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Badge,
  Button,
  C,
  FONT,
  GreekText,
  ProgressBar4,
  RADIUS,
  SHADOW,
  TYPE,
  TypedText,
  WithheldNotice,
  appear,
  ease,
  ui,
  type F,
} from '../../shared';
import { COMMENTS, DOC_REF, DOC_TITLE, RESPONSE_LINE, REVIEW_STEPS, WALL_NOTICE } from '../../data/wrenfield';
import { COPY, GEO } from './copy';

/** Every beat, body-local frames (standalone; film = same up to 362). */
export const T = {
  leftIn: 60,
  rightIn: 66,
  seatL: 62,
  seatR: 68,
  typeFrom: 64,
  typeTo: 94,
  commentPress: 104,
  bCard: 110,
  rightFocal: 130,
  pushFrom: 150,
  shot2End: 227,
  shot4: 273,
  cursorShow: 276,
  cursorArrive: 292,
  click: 294,
  advance: 300,
  cursorHide: 302,
  cardsIn: [308, 314, 320] as const,
  dimLeft: 310,
  shot5: 363,
  leftExitEnd: 372,
  moveEnd: 381,
  camEnd: 387,
  respFocal: 369,
  respFrom: 371,
  respTo: 403,
  chip: 410,
  respond: 418,
  answered: 424,
  shot5End: 482,
} as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Native height the response adds under comment B (standalone shot 5). */
export const RESPONSE_H = 88;
/** 0 → 1 as the response opens (standalone only); the crop grows by RESPONSE_H × this. */
export const responseGrow = (f: number, cut: 'standalone' | 'film') => (cut === 'standalone' ? appear(f, T.shot5, 12, ease.out) : 0);
/** The response, broken by hand so the second line never strands one word. */
const RESPONSE_TYPED = RESPONSE_LINE.replace(' the depth', '\nthe depth');

// ------------------------------------------------------------------ shared pieces

/** Greek'd reference, title label, compact progress bar. */
const CropTop: React.FC<{ labelOpacity: number }> = ({ labelOpacity }) => (
  <div style={{ padding: '10px 12px 9px', opacity: labelOpacity }}>
    <div style={{ fontFamily: FONT.mono, fontSize: 12, lineHeight: '14px', height: 14, color: C.text }}>
      <GreekText text={DOC_REF} greek barColour={C.faint} />
    </div>
    <div style={{ fontSize: TYPE.ui, fontWeight: 600, color: C.text, marginTop: 4, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{DOC_TITLE}</div>
    <div style={{ marginTop: 9, marginLeft: -3 }}>
      <ProgressBar4 labels={REVIEW_STEPS} current={2} advanceAt={T.advance} compact />
    </div>
  </div>
);

const CropFrame: React.FC<{ children: React.ReactNode; labelOpacity: number; extraH?: number }> = ({ children, labelOpacity, extraH = 0 }) => (
  <div
    style={{
      width: GEO.w,
      height: GEO.h + extraH,
      background: C.pane,
      borderRadius: RADIUS.pane,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: FONT.sans,
      fontSize: TYPE.ui,
      color: C.text,
    }}
  >
    <CropTop labelOpacity={labelOpacity} />
    <div
      style={{
        flex: 1,
        background: C.sunken,
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  </div>
);

/** "Open · 3 comments": first word bold, the rest muted; `swap` crossfades the tail. */
const Counter: React.FC<{ head: string; tail: string; swap?: { tail: string; at: F }; opacity?: number }> = ({ head, tail, swap, opacity = 1 }) => {
  const f = useCurrentFrame();
  const p = swap ? ui(f, swap.at) : 0;
  return (
    <div style={{ height: 18, display: 'flex', alignItems: 'center', gap: 5, fontSize: TYPE.label, color: C.text2, whiteSpace: 'nowrap', opacity }}>
      <span style={{ fontWeight: 700, color: C.text }}>{head}</span>
      <span>·</span>
      <span style={{ display: 'inline-grid' }}>
        <span style={{ gridArea: '1/1', opacity: 1 - p }}>{tail}</span>
        {swap ? <span style={{ gridArea: '1/1', opacity: p }}>{swap.tail}</span> : null}
      </span>
    </div>
  );
};

/** The code badge: always Greek'd (§4.10). */
const CodePill: React.FC = () => (
  <span style={{ background: C.info.tint, borderRadius: 999, padding: '1px 8px', fontSize: TYPE.label, lineHeight: 1.3 }}>
    <GreekText text="S0" greek barColour={C.faint} />
  </span>
);

const AuthorRow: React.FC<{ author: string; when: string }> = ({ author, when }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 16, whiteSpace: 'nowrap' }}>
    <span style={{ fontWeight: 700, color: C.text, fontSize: TYPE.ui }}>{author}</span>
    <CodePill />
    <span style={{ color: C.muted, fontSize: TYPE.label }}>{when}</span>
  </div>
);

const QuoteRow: React.FC<{ quote: string; right?: React.ReactNode }> = ({ quote, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', height: 16, gap: 8 }}>
    <span style={{ fontStyle: 'italic', color: C.text2, fontSize: TYPE.ui, whiteSpace: 'nowrap' }}>{quote}</span>
    {right ? <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>{right}</span> : null}
  </div>
);

/** Whole words of `text` up to `max` characters (so a Greek'd line never ends in a clipped bar). */
const fitWords = (text: string, max: number) => {
  let out = '';
  for (const w of text.split(' ')) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  return out;
};

/** One body line, Greek'd or sharp, kept to one line. */
const BodyLine: React.FC<{ text: string; greek?: boolean; greekFrom?: F }> = ({ text, greek, greekFrom }) => (
  <div style={{ height: 19, lineHeight: '19px', fontSize: TYPE.dense, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden' }}>
    <GreekText text={greek ? fitWords(text, 46) : text} greek={greek} greekFrom={greekFrom} />
  </div>
);

/** The `panel` slide-in (opacity + translateY 12 → 0) used for arriving cards. */
const slideIn = (f: number, at: F | undefined): React.CSSProperties => {
  if (at === undefined) return {};
  const p = appear(f, at, 9);
  return { opacity: p, transform: `translateY(${(1 - p) * 12}px)` };
};

const cardStyle: React.CSSProperties = {
  background: C.pane,
  borderRadius: RADIUS.card,
  boxShadow: SHADOW.soft,
  padding: '9px 11px',
  boxSizing: 'border-box',
  flex: 'none',
};

/** Compact comment card: author row, quote row (+ badge), one body line, optional extra. */
const Comment: React.FC<{
  c: { author: string; when: string; quote: string; body: string };
  at?: F;
  badge?: React.ReactNode;
  labelOpacity?: number;
  greekFrom?: F;
  children?: React.ReactNode;
}> = ({ c, at, badge, labelOpacity = 1, greekFrom, children }) => {
  const f = useCurrentFrame();
  const s = slideIn(f, at);
  if (s.opacity === 0) return <div style={{ ...cardStyle, height: 74, opacity: 0 }} />;
  return (
    <div style={{ ...cardStyle, ...s }}>
      <div style={{ opacity: labelOpacity }}>
        <AuthorRow author={c.author} when={c.when} />
        <div style={{ marginTop: 2 }}>
          <QuoteRow quote={c.quote} right={badge} />
        </div>
        <div style={{ marginTop: 3 }}>
          <BodyLine text={c.body} greek={greekFrom === undefined} greekFrom={greekFrom} />
        </div>
      </div>
      {children}
    </div>
  );
};

/** The "Answered" success pill; Greek'd for A and C (only B's is ever read). */
const Answered: React.FC<{ at: F; greek?: boolean }> = ({ at, greek }) => (
  <Badge tone="success" pill at={at} label={greek ? <span style={{ opacity: 0.35 }}><GreekText text={COPY.answered} greek barColour={C.success.dot} /></span> : COPY.answered} />
);

// ------------------------------------------------------------------ Rachel's crop

/**
 * Comment B in Rachel's crop: a composer that types, then becomes a card at
 * `T.bCard`. The rows slide down as the author row fades in, so the typed line
 * never jumps.
 */
const ComposerToCard: React.FC<{ focalUntil: F }> = ({ focalUntil }) => {
  const f = useCurrentFrame();
  const a = appear(f, T.bCard, 9);
  const c = COMMENTS.B;
  const H = 82;
  return (
    <div style={{ position: 'relative', height: H, flex: 'none' }}>
      {/* composer face */}
      <div style={{ position: 'absolute', inset: 0, background: C.pane, borderRadius: RADIUS.card, border: `1px solid ${C.borderStrong}`, opacity: 1 - a, boxSizing: 'border-box' }} />
      {/* card face */}
      <div style={{ position: 'absolute', inset: 0, background: C.pane, borderRadius: RADIUS.card, boxShadow: SHADOW.soft, opacity: a }} />
      <div style={{ position: 'absolute', left: 11, right: 11, top: 11, opacity: a }}>
        <AuthorRow author={c.author} when={c.when} />
      </div>
      <div style={{ position: 'absolute', left: 11, right: 11, top: lerp(9, 31, a) }}>
        <QuoteRow quote={c.quote} />
      </div>
      <div style={{ position: 'absolute', left: 11, right: 11, top: lerp(28, 50, a), height: 19, lineHeight: '19px', fontSize: TYPE.dense, whiteSpace: 'nowrap' }}>
        {f < T.typeFrom ? (
          <span style={{ color: C.faint }}>{COPY.composerPlaceholder}</span>
        ) : f < T.bCard ? (
          <TypedText text={c.body} from={T.typeFrom} to={T.typeTo} caretUntil={T.commentPress} style={{ color: C.text }} />
        ) : (
          <GreekText text={c.body} greekFrom={focalUntil} colour={C.text} />
        )}
      </div>
      {/* composer controls: gone over the 5 f before the post (after the press), so the posted line never crosses the button */}
      <div style={{ position: 'absolute', left: 11, right: 9, top: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 1 - appear(f, T.bCard - 5, 5, ease.linear) }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${C.borderStrong}`, borderRadius: RADIUS.control, padding: '3px 7px', fontSize: TYPE.label, color: C.text2 }}>
          <GreekText text="no code" greek barColour={C.borderStrong} />
          <ChevronDown size={11} color={C.muted} strokeWidth={2} />
        </span>
        <Button variant="primary" size="sm" label={COPY.commentButton} pressAt={T.commentPress} />
      </div>
    </div>
  );
};

/**
 * Rachel's crop. `focusLabels` dims the non-focal labels to 0.6 while comment
 * B is the focal line (§4.3 rule 4).
 */
export const RachelCrop: React.FC<{ labelOpacity: number }> = ({ labelOpacity }) => {
  const f = useCurrentFrame();
  return (
    <CropFrame labelOpacity={labelOpacity}>
      <Counter head="Open" tail="2 comments" swap={{ tail: '3 comments', at: T.bCard }} />
      <Comment c={COMMENTS.A} labelOpacity={labelOpacity} />
      <ComposerToCard focalUntil={T.rightFocal} />
      {/* Comment C, collapsed and Greek'd */}
      <div style={{ ...cardStyle, padding: '0 11px', opacity: labelOpacity, display: 'flex', alignItems: 'center', gap: 7, height: 26, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <ChevronRight size={14} color={C.text2} strokeWidth={2} style={{ flex: 'none' }} />
        <span style={{ fontWeight: 700, fontSize: TYPE.ui }}>
          <GreekText text={COMMENTS.C.author} greek />
        </span>
        <CodePill />
        <span style={{ fontStyle: 'italic', fontSize: TYPE.ui }}>
          <GreekText text={COMMENTS.C.quote} greek />
        </span>
      </div>
      {/* Verdict (Greek'd and blurred: the step exists, its value is unreadable) + release */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, flex: 'none' }}>
        <span
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 5,
            background: C.pane,
            border: `1px solid ${C.borderStrong}`,
            borderRadius: RADIUS.control,
            padding: '5px 7px',
            fontSize: TYPE.label,
            lineHeight: 1.3,
            opacity: labelOpacity,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            filter: 'blur(1.2px)',
          }}
        >
          <GreekText text={COPY.verdictValue} greek />
          <ChevronDown size={11} color={C.muted} strokeWidth={2} />
        </span>
        <span style={{ opacity: f < T.shot4 ? labelOpacity : 1, display: 'inline-flex' }}>
          <Button variant="primary" size="sm" label={COPY.releaseButton} pressAt={T.click} anchor="release" />
        </span>
      </div>
    </CropFrame>
  );
};

// ------------------------------------------------------------------ Eleanor's crop

/** The response under comment B (standalone shot 5). */
const Response: React.FC = () => {
  const f = useCurrentFrame();
  const ex = responseGrow(f, 'standalone');
  if (ex <= 0) return null;
  return (
    <div style={{ height: RESPONSE_H * ex, overflow: 'hidden' }}>
      <div style={{ paddingTop: 8 }}>
        <div
          style={{
            background: C.sunken,
            borderRadius: RADIUS.control,
            padding: '6px 9px',
            fontSize: TYPE.ui,
            lineHeight: 1.45,
            color: C.text,
            minHeight: 48,
            boxSizing: 'border-box',
            whiteSpace: 'pre-line',
          }}
        >
          <TypedText text={RESPONSE_TYPED} from={T.respFrom} to={T.respTo} caretUntil={T.respond} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 7, height: 25 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: `1px solid ${C.borderStrong}`,
              borderRadius: 999,
              padding: '3px 9px',
              fontSize: TYPE.label,
              fontWeight: 500,
              color: C.text2,
              whiteSpace: 'nowrap',
              ...slideIn(f, T.chip),
            }}
          >
            {COPY.responseChip}
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>
            <Button variant="primary" size="sm" label={COPY.respondButton} pressAt={T.respond} fadeAt={T.answered + 2} />
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * Eleanor's crop. Before release: the amber notice only (sharp in shot 2,
 * Greek'd in shot 4). After release: the counter and three cards, bodies
 * Greek'd. Standalone shot 5 adds the response under comment B.
 */
export const EleanorCrop: React.FC<{ labelOpacity: number; cut: 'standalone' | 'film' }> = ({ labelOpacity, cut }) => {
  const f = useCurrentFrame();
  const noticeO = 1 - appear(f, T.advance, 8, ease.linear);
  const released = f >= T.cardsIn[0];
  const responding = cut === 'standalone' && f >= T.shot5;
  return (
    <CropFrame labelOpacity={labelOpacity} extraH={RESPONSE_H * responseGrow(f, cut)}>
      {!released ? (
        <div style={{ opacity: noticeO }}>
          <WithheldNotice
            text={f < T.shot4 ? WALL_NOTICE : <span style={{ opacity: 0.32 }}><GreekText text={WALL_NOTICE} greek barColour={C.warning.dot} /></span>}
            style={{ padding: '9px 11px' }}
          />
        </div>
      ) : (
        <>
          <div style={{ ...slideIn(f, T.cardsIn[0]) }}>
            {responding ? (
              <Counter head="Responding" tail="2 of 3 comments answered" swap={{ tail: '3 of 3 comments answered', at: T.answered }} opacity={labelOpacity} />
            ) : (
              <Counter head="Responding" tail="3 comments to answer" />
            )}
          </div>
          <Comment c={COMMENTS.A} at={T.cardsIn[0]} labelOpacity={labelOpacity} badge={responding ? <Answered at={T.shot5} greek /> : undefined} />
          <Comment c={COMMENTS.B} at={T.cardsIn[1]} badge={responding ? <Answered at={T.answered} /> : undefined} labelOpacity={responding ? 1 : labelOpacity}>
            {responding ? <Response /> : null}
          </Comment>
          <Comment c={COMMENTS.C} at={T.cardsIn[2]} labelOpacity={labelOpacity} badge={responding ? <Answered at={T.shot5} greek /> : undefined} />
        </>
      )}
    </CropFrame>
  );
};
