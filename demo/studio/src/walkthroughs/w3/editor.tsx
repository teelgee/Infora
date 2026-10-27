/**
 * W3's split editor (local): one seat's window, rendered from the ONE
 * timeline both seats share (plan §3.6, §3.7). The same canvas text, the same
 * callout and the same scroll in both windows; only the carets differ — each
 * window shows its own person's caret plain and the other person's flagged.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Bold, Check, Heading2, Heading3, Italic, List, ListOrdered, MessageSquare, Quote } from 'lucide-react';
import { appear, C, ease, FONT, RADIUS, SHADOW, ui } from '../../shared';
import { WT_COLLAB, WT_PEOPLE } from '../../data/wrenfield';
import { Caret, caretOn, EditorBar, PresenceFlag, PresenceStack, Shell, SuggestionCallout, typingSchedule } from '../shared';
import { flow, tw } from './measure';
import { acceptedText, CALLOUT, CANVAS, calloutGeom, canvasScroll, docGeom, LH, SERIF, SPLIT_O } from './layout';
import { T, TY } from './timeline';
import { SplitPanel } from './panel';
import { PillHoverCard, SelectionBubble, LibraryList, MentionList } from './overlays';

export type Seat = 'ELEANOR' | 'NADIA';
const ED = WT_COLLAB.editor;
const SG = WT_COLLAB.suggestion;
const NADIA = WT_PEOPLE.NADIA;
const ELEANOR = WT_PEOPLE.ELEANOR;

const rel = (x: number, y: number): React.CSSProperties => ({ position: 'absolute', left: x - SPLIT_O.x, top: y - SPLIT_O.y });

// ------------------------------------------------------------------ format bar (split DEV: icon-only)

const FormatBarIcons: React.FC = () => {
  const ic = { size: 14, strokeWidth: 1.9 } as const;
  const sep = <span style={{ width: 1, height: 14, background: C.border, flex: 'none' }} />;
  return (
    <div
      style={{
        position: 'absolute',
        left: CANVAS.colX - CANVAS.x0,
        top: CANVAS.barY - CANVAS.y0,
        width: CANVAS.colW,
        height: 32,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        paddingBottom: 6,
        borderBottom: `1px solid ${C.border}`,
        color: C.text2,
      }}
    >
      <Bold {...ic} />
      <Italic {...ic} />
      {sep}
      <Heading2 {...ic} />
      <Heading3 {...ic} />
      {sep}
      <List {...ic} />
      <ListOrdered {...ic} />
      <Quote {...ic} />
      {sep}
      <MessageSquare {...ic} />
      <Check {...ic} />
    </div>
  );
};

// ------------------------------------------------------------------ co-typing (local RemoteTyped)

/**
 * A person's typing as both windows see it (VISION, flows B.2): the text
 * arrives on that person's own seeded timeline; their own window shows a plain
 * caret, the other window a flagged caret that rides the end of the text and
 * collapses to initials 60 f after the last keystroke. Local variant of the
 * shared RemoteTyped: the flag flips to sit left of the caret near the pane's
 * right edge (the shared one would be clipped there at split width).
 */
const typedAt = (text: string, from: number, seed: number, f: number) => {
  const sched = typingSchedule(text, from, seed);
  let n = 0;
  while (n < sched.length && sched[n] <= f) n++;
  return { n, last: n > 0 ? sched[n - 1] : from, total: sched.length };
};

const Flag: React.FC<{ label: string; flip: boolean; o: number }> = ({ label, flip, o }) => (
  <span style={{ position: 'relative', display: 'inline-block', width: 0, height: '1.15em', verticalAlign: '-0.2em', opacity: o }}>
    <span style={{ position: 'absolute', left: -1, top: 0, width: 2, height: '100%', background: C.ink }} />
    <span
      style={{
        position: 'absolute',
        ...(flip ? { right: -1 } : { left: -1 }),
        bottom: '100%',
        background: C.ink,
        color: '#fff',
        fontFamily: FONT.sans,
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: '15px',
        padding: '1px 6px',
        borderRadius: flip ? '4px 4px 0 4px' : '4px 4px 4px 0',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  </span>
);

const CoTyped: React.FC<{
  text: string;
  from: number;
  seed: number;
  name: string;
  initials: string;
  local: boolean;
  showFrom: number;
  hideAt: number;
  /** Text before this person's (its caret sits after both). */
  prefix: string;
}> = ({ text, from, seed, name, initials, local, showFrom, hideAt, prefix }) => {
  const f = useCurrentFrame();
  const { n, last, total } = typedAt(text, from, seed, f);
  const typed = text.slice(0, n);
  const shown = f >= showFrom;
  let caret: React.ReactNode = null;
  if (shown && local && f < hideAt) caret = <Caret visible={(n > 0 && n < total) || n === 0 || f - last < 8 || caretOn(f, last)} />;
  if (shown && !local) {
    const o = ui(f, showFrom) * (1 - ui(f, hideAt));
    if (o > 0) {
      const label = f >= last + 60 && n > 0 ? initials : name;
      const caretX = flow([{ text: prefix + typed, st: SERIF }], CANVAS.colW).lastX;
      const w = tw(label, { size: 10.5, weight: 600 }) + 12;
      caret = <Flag label={label} flip={caretX + w > CANVAS.colW + 22} o={o} />;
    }
  }
  return (
    <span>
      {typed}
      {caret}
    </span>
  );
};

// ------------------------------------------------------------------ the accepted paragraph (§7.3)

const SEL_TINT = 'rgba(110,160,230,.32)';

/**
 * Appended under `2. Dewatering and the brook` as plain prose (no pills),
 * shown as a green tracked insert that settles to ink (VISION, flows §E 14).
 * "dewatering" carries the selection / remote selection / comment anchor.
 */
const Accepted: React.FC<{ seat: Seat }> = ({ seat }) => {
  const f = useCurrentFrame();
  const settle = appear(f, T.settle, 14, ease.linear);
  const o = ui(f, T.accepted);
  const i = acceptedText.indexOf('dewatering.');
  const before = acceptedText.slice(0, i);
  const after = acceptedText.slice(i + 'dewatering'.length);
  const word = 'dewatering';
  const drag = Math.min(1, Math.max(0, (f - T.selPress) / (T.selRelease - T.selPress)));
  const k = f >= T.selPress ? Math.round(drag * word.length) : 0;
  const anchored = f >= T.posted && f < T.closed;
  let wordEl: React.ReactNode;
  if (anchored) {
    wordEl = <mark style={{ color: 'inherit', background: C.warning.tint, borderBottom: `2px solid ${C.warning.text}`, borderRadius: 4 }}>{word}</mark>;
  } else if (seat === 'NADIA' && k > 0 && f < T.posted) {
    // Nadia's own selection; it stays (inactive) while she writes the comment
    const tint = f < T.commentForm ? SEL_TINT : 'rgba(120,118,111,.18)';
    wordEl = (
      <>
        <span style={{ background: tint }}>{word.slice(0, k)}</span>
        {word.slice(k)}
      </>
    );
  } else if (seat === 'ELEANOR' && k > 0 && f < T.commentForm + 5) {
    // Nadia's selection, seen live in Eleanor's window (VISION RemoteSelection + flag)
    const fade = 1 - ui(f, T.commentForm);
    wordEl = (
      <>
        <span style={{ background: `rgba(239,238,235,${fade})`, borderBottom: `1px dotted rgba(120,118,111,${fade})` }}>{word.slice(0, k)}</span>
        <PresenceFlag name={NADIA.name} initials={NADIA.initials} at={T.selPress} hideAt={T.commentForm} />
        {word.slice(k)}
      </>
    );
  } else wordEl = word;
  return (
    <span
      style={{
        opacity: o,
        background: `rgba(232,245,234,${1 - settle})`,
        textDecoration: settle < 1 ? 'underline' : 'none',
        textDecorationColor: `rgba(47,158,82,${1 - settle})`,
        textUnderlineOffset: 3,
        borderRadius: 2,
      }}
    >
      {before}
      {wordEl}
      {after}
    </span>
  );
};

// ------------------------------------------------------------------ the canvas

const SplitCanvas: React.FC<{ seat: Seat }> = ({ seat }) => {
  const f = useCurrentFrame();
  const scroll = canvasScroll(f);
  const showCallout = f >= T.done && f < T.accepted + 5;
  const calloutO = f < T.accepted ? 1 : 1 - ui(f, T.accepted);
  const nadiaSeat = seat === 'NADIA';
  return (
    <div
      style={{
        position: 'absolute',
        left: CANVAS.x0 - SPLIT_O.x,
        top: CANVAS.y0 - SPLIT_O.y,
        width: CANVAS.x1 - CANVAS.x0,
        height: CANVAS.y1 - CANVAS.y0,
        background: C.pane,
        borderRadius: RADIUS.pane,
        boxShadow: SHADOW.soft,
        overflow: 'hidden',
      }}
    >
      <FormatBarIcons />
      <div style={{ position: 'absolute', left: 0, top: CANVAS.viewTop - CANVAS.y0, width: CANVAS.x1 - CANVAS.x0, height: CANVAS.viewBottom - CANVAS.viewTop, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', transform: `translateY(${-scroll}px)` }}>
          <div
            style={{
              position: 'absolute',
              left: CANVAS.colX - CANVAS.x0,
              top: CANVAS.textTop - CANVAS.viewTop,
              width: CANVAS.colW,
              fontFamily: FONT.serif,
              fontSize: 15.5,
              lineHeight: `${LH}px`,
              color: C.text,
              whiteSpace: 'pre-wrap',
            }}
          >
            <CoTyped
              text={TY.nadia.text}
              from={TY.nadia.from}
              seed={TY.nadia.seed}
              name={NADIA.name}
              initials={NADIA.initials}
              local={nadiaSeat}
              showFrom={T.nadiaCaret}
              hideAt={T.accepted}
              prefix=""
            />
            <CoTyped
              text={TY.eleanor.text}
              from={TY.eleanor.from}
              seed={TY.eleanor.seed}
              name={ELEANOR.name}
              initials={ELEANOR.initials}
              local={!nadiaSeat}
              showFrom={T.eleanorCaret}
              hideAt={T.composerFocus}
              prefix={TY.nadia.text.slice(0, typedAt(TY.nadia.text, TY.nadia.from, TY.nadia.seed, f).n)}
            />
            {f < TY.nadia.from ? <span style={{ color: C.muted }}>{ED.canvasPlaceholder}</span> : null}
            {f >= T.accepted ? (
              <>
                {'\n\n'}
                <Accepted seat={seat} />
              </>
            ) : null}
          </div>
          {showCallout ? (
            <div
              style={{
                position: 'absolute',
                left: CANVAS.colX - CANVAS.x0,
                top: CALLOUT.top - CANVAS.viewTop - 14,
                width: CANVAS.colW,
                fontFamily: FONT.serif,
                fontSize: 15.5,
                lineHeight: 1.72,
                color: C.text,
                opacity: ui(f, T.done) * calloutO,
              }}
            >
              <SuggestionCallout
                claims={SG.claims}
                from={T.claimsFrom}
                actionsAt={T.actionsAt}
                hover={nadiaSeat && f >= T.acceptHover - 4 ? 'accept' : undefined}
                acceptPressAt={nadiaSeat ? T.acceptPress : undefined}
                activeRef={nadiaSeat ? { claim: 2, ref: 'WA-ENV-BAS-003', at: T.pillHover } : undefined}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ one seat's window

export const SplitSeat: React.FC<{ seat: Seat }> = ({ seat }) => {
  const other = seat === 'ELEANOR' ? NADIA : ELEANOR;
  const doc = docGeom();
  const cg = calloutGeom();
  return (
    <Shell
      seat={seat}
      nav={null}
      width={752}
      height={832}
      contentTone="sunken"
      unread={seat === 'ELEANOR' ? 1 : 0}
      unreadAt={seat === 'ELEANOR' ? T.posted : undefined}
      secondBar={
        <EditorBar
          location={ED.location}
          title={WT_COLLAB.docTitle}
          titleMax={190}
          presence={
            <PresenceStack
              people={[{ initials: other.initials, name: other.name, org: other.org, at: T.presenceIn, editingAt: seat === 'ELEANOR' ? T.nadiaCaret : T.eleanorCaret }]}
            />
          }
        />
      }
      overlay={
        seat === 'ELEANOR' ? (
          <LibraryList />
        ) : (
          <>
            <PillHoverCard pill={{ x: cg.pill3.x, top: cg.pill3.top - cg.settled }} />
            <SelectionBubble left={doc.dew.x1 - 8} top={doc.dew.lineTop - 34} />
            <MentionList />
          </>
        )
      }
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <SplitCanvas seat={seat} />
        <SplitPanel seat={seat} />
      </div>
    </Shell>
  );
};

export { rel };
