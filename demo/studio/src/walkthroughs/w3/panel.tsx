/**
 * W3's side panel at split width (local): tabs (with the wrapping
 * `1 pending in the document`), the shared chat thread with its composer
 * (BUILT-NP `chat-composer.tsx`, `composer-sources.tsx`), and the comments tab
 * (BUILT-NP `comments-panel.tsx`): the new-comment form, the thread, the reply
 * box, Close, and `▸/▾ Resolved (1)`. One component for both seats; the seat
 * decides only what is local (Eleanor's composer, Nadia's comment box).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, MessageSquare, Paperclip, Reply, RotateCcw } from 'lucide-react';
import { AgentGlyph, C, FONT, pressScale, RADIUS, SHADOW, ui } from '../../shared';
import { WT_COLLAB } from '../../data/wrenfield';
import { Btn, Caret, caretOn, Streamed, typedCountAt } from '../shared';
import {
  BUBBLE,
  CHIP_H,
  CHIP_ROW,
  chipBoxes,
  CMT,
  COMPOSER,
  composerH,
  composerLines,
  composerText,
  contentTop,
  nadiaCommentText,
  PANEL,
  SANS,
  SPLIT_O,
  tabLabel,
  tabRowBottom,
} from './layout';
import { tw } from './measure';
import { T, TY } from './timeline';
import type { Seat } from './editor';

const ED = WT_COLLAB.editor;
const TH = WT_COLLAB.thread;
const CM = WT_COLLAB.comments;

// ------------------------------------------------------------------ small parts

const Micro: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 10.5, lineHeight: '14px', height: 14, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.muted, whiteSpace: 'nowrap' }}>{children}</div>
);

const Chip: React.FC<{ label: React.ReactNode; disabled?: boolean; hover?: boolean; style?: React.CSSProperties }> = ({ label, disabled, hover, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      height: CHIP_H,
      boxSizing: 'border-box',
      border: '1px solid rgba(20,20,20,.09)',
      background: hover ? C.sunken : 'transparent',
      borderRadius: 999,
      padding: '0 10px',
      fontSize: 11.5,
      fontWeight: 500,
      color: C.text2,
      opacity: disabled ? 0.45 : 1,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {label}
  </span>
);

const Chips: React.FC<{ hoverLib?: boolean }> = ({ hoverLib }) => (
  <div style={{ position: 'relative', height: 2 * CHIP_ROW + CHIP_H }}>
    {chipBoxes().map((c, i) => (
      <Chip key={c.label} label={c.label} disabled={i > 0} hover={i === 0 && hoverLib} style={{ position: 'absolute', left: c.x0, top: c.row * CHIP_ROW, width: c.w }} />
    ))}
  </div>
);

const Composer: React.FC<{ text: string; focused?: boolean; caret?: boolean; stop?: boolean; sendPressAt?: number; caretSince?: number }> = ({
  text,
  focused,
  caret,
  stop,
  sendPressAt,
  caretSince = 0,
}) => {
  const f = useCurrentFrame();
  const lines = composerLines(text);
  const solid = f - caretSince < 8;
  return (
    <div
      style={{
        position: 'relative',
        height: composerH(lines),
        boxSizing: 'border-box',
        background: C.sunken,
        borderRadius: RADIUS.lg,
        boxShadow: focused ? `${SHADOW.popout}, 0 0 0 1px rgba(20,20,20,.16), 0 0 0 4px rgba(28,27,24,.06)` : SHADOW.popout,
      }}
    >
      <AgentGlyph size={12} colour={C.text2} style={{ position: 'absolute', left: 14, top: 20 }} />
      <div
        style={{
          position: 'absolute',
          left: 36,
          top: COMPOSER.padY + (lines === 1 ? 4.5 : 0),
          width: COMPOSER.textW,
          fontSize: 12.5,
          lineHeight: `${COMPOSER.lh}px`,
          color: text ? C.text : C.muted,
          whiteSpace: 'pre-wrap',
        }}
      >
        {text ? (
          <>
            {text}
            {caret ? <Caret visible={solid || caretOn(f, caretSince)} /> : null}
          </>
        ) : (
          <>
            {caret ? <Caret visible={solid || caretOn(f, caretSince)} /> : null}
            {ED.composerPlaceholder}
          </>
        )}
      </div>
      <span
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          width: 30,
          height: 30,
          borderRadius: RADIUS.control,
          background: stop || text ? C.ink : C.faint,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          transform: `scale(${pressScale(f, sendPressAt)})`,
        }}
      >
        {stop ? <span style={{ width: 9, height: 9, borderRadius: 2, background: '#fff' }} /> : '↵'}
      </span>
    </div>
  );
};

/** `Working…` with the built shimmer (never a spinner). */
const Working: React.FC = () => {
  const f = useCurrentFrame();
  const x = ((f % 45) / 45) * 200 - 50;
  return (
    <span
      style={{
        fontSize: 12.5,
        lineHeight: '18.75px',
        backgroundImage: `linear-gradient(90deg, ${C.muted} 0%, ${C.muted} ${x - 18}%, ${C.ink} ${x}%, ${C.muted} ${x + 18}%, ${C.muted} 100%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {TH.working}
    </span>
  );
};

// ------------------------------------------------------------------ tabs

const Tabs: React.FC<{ active: 'Chat' | 'Comments'; comments: number; pending: boolean; pendingAt: number }> = ({ active, comments, pending, pendingAt }) => {
  const f = useCurrentFrame();
  let x = 0;
  const gap = pending ? 16 : 20;
  const h = tabRowBottom(pending) - PANEL.tabsY;
  return (
    <div style={{ position: 'absolute', left: PANEL.cx0 - PANEL.x0, top: PANEL.tabsY - PANEL.y0, width: PANEL.cw, height: h, borderBottom: `1px solid ${C.border}` }}>
      {(['Chat', 'Comments', 'Checks'] as const).map((t) => {
        const label = tabLabel(t, comments);
        const w = tw(label, SANS(13, 600));
        const left = x;
        x += w + gap;
        return (
          <span key={t} style={{ position: 'absolute', left, top: 0, height: h, width: w }}>
            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: '23px', color: t === active ? C.text : C.text2, whiteSpace: 'nowrap' }}>{label}</span>
            {t === active ? <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: C.ink }} /> : null}
          </span>
        );
      })}
      {pending ? (
        <span style={{ position: 'absolute', right: 0, top: 3, width: 70, textAlign: 'right', fontSize: 11.5, lineHeight: '15px', color: C.muted, fontWeight: 500, opacity: ui(f, pendingAt) }}>
          {ED.pending}
        </span>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ chat

const PromptBody: React.FC = () => <>{WT_COLLAB.promptFinal}</>;

const ChatLog: React.FC<{ seat: Seat }> = ({ seat }) => {
  const f = useCurrentFrame();
  const done = f >= T.done;
  return (
    <>
      <Micro>{seat === 'ELEANOR' ? TH.you : TH.other}</Micro>
      <div
        style={{
          marginTop: 6,
          background: C.sunken,
          borderRadius: RADIUS.control,
          boxShadow: SHADOW.popout,
          padding: `${BUBBLE.padY}px ${BUBBLE.padX}px`,
          fontSize: 12.5,
          lineHeight: `${BUBBLE.lh}px`,
          color: C.text,
        }}
      >
        <PromptBody />
      </div>
      <div style={{ marginTop: 14 }}>
        <Micro>{TH.agent}</Micro>
      </div>
      <div style={{ marginTop: 6, height: 18.75, fontSize: 12.5, lineHeight: '18.75px', color: C.text2, whiteSpace: 'nowrap' }}>
        {done ? <Streamed text={TH.done} from={T.done} rate={3} /> : <Working />}
      </div>
      <div style={{ marginTop: 16 }}>
        <Chip
          label={
            <>
              <Paperclip size={12} strokeWidth={1.9} />
              {ED.attachSource}
            </>
          }
        />
      </div>
    </>
  );
};

const ChatTab: React.FC<{ seat: Seat; pending: boolean }> = ({ seat, pending }) => {
  const f = useCurrentFrame();
  const top = contentTop(pending);
  const sent = f >= T.sent;
  const eleanor = seat === 'ELEANOR';
  const text = eleanor ? composerText(f) : '';
  const focused = eleanor && f >= T.composerFocus && f < T.sent;
  // last keystroke frame for a steady caret while typing
  let since: number = T.composerFocus;
  if (eleanor && f >= TY.prompt.from) {
    const n = typedCountAt(f, TY.prompt.text, TY.prompt.from, TY.prompt.seed);
    since = n > 0 ? f - 1 : since;
    if (n >= TY.prompt.text.length) since = TY.prompt.end;
    if (f >= T.lib1Pick) since = T.lib1Pick;
    if (f >= TY.promptAnd.from) since = Math.max(T.lib1Pick, Math.min(f - 1, TY.promptAnd.end));
    if (f >= T.lib2Pick) since = T.lib2Pick;
  }
  const libHover = eleanor && ((f >= 1867 && f < 1885) || (f >= 1941 && f < 1959));
  return (
    <div style={{ position: 'absolute', left: PANEL.cx0 - PANEL.x0, top: top - PANEL.y0, width: PANEL.cw }}>
      {sent ? (
        <div style={{ marginBottom: 10 }}>
          <ChatLog seat={seat} />
        </div>
      ) : null}
      <Composer
        text={text}
        focused={focused}
        caret={focused}
        caretSince={since}
        stop={eleanor && sent && f < T.done}
        sendPressAt={eleanor ? T.sendPress : undefined}
      />
      <div style={{ marginTop: 12 }}>
        <Chips hoverLib={libHover} />
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ comments

const MentionBody: React.FC<{ text: string }> = ({ text }) => {
  const m = CM.mentionPick;
  if (!text.startsWith(m)) return <>{text}</>;
  return (
    <>
      <span style={{ color: C.info.text, fontWeight: 600 }}>{m}</span>
      {text.slice(m.length)}
    </>
  );
};

const CommentBlock: React.FC<{ who: string; when: string; body: string; reply?: boolean; closed?: boolean }> = ({ who, when, body, reply, closed }) => (
  <div style={{ marginBottom: 8, ...(reply ? { marginLeft: 14, paddingLeft: 10, borderLeft: `2px solid ${C.borderStrong}` } : {}) }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, lineHeight: `${CMT.headH}px`, color: C.text, whiteSpace: 'nowrap' }}>
      <b style={{ fontWeight: 700 }}>{who}</b>
      <span style={{ fontSize: 11, color: C.muted }}>{when}</span>
    </div>
    <div style={{ marginTop: 2, fontSize: 12.5, lineHeight: `${CMT.lh}px`, color: closed ? C.text2 : C.text, whiteSpace: 'pre-wrap' }}>
      <MentionBody text={body} />
    </div>
  </div>
);

const QuietSm: React.FC<{ Icon: typeof Reply; label: string; hover?: boolean; pressAt?: number }> = ({ Icon, label, hover, pressAt }) => (
  <Btn
    variant="quiet"
    size="sm"
    hover={hover}
    pressAt={pressAt}
    label={
      <>
        <Icon size={13} strokeWidth={2} style={{ marginRight: -3 }} />
        {label}
      </>
    }
  />
);

const Anchor: React.FC = () => (
  <div style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, color: C.text2, background: C.sunken, borderRadius: 6, padding: '4px 9px', marginBottom: 9 }}>❝ {CM.anchor}</div>
);

const CommentBox: React.FC<{ text: string; placeholder: string; caretSince: number; focused: boolean }> = ({ text, placeholder, caretSince, focused }) => {
  const f = useCurrentFrame();
  const solid = f - caretSince < 8;
  return (
    <div
      style={{
        minHeight: 56,
        boxSizing: 'border-box',
        padding: '8px 10px',
        border: `1px solid ${focused ? C.ink : C.border}`,
        boxShadow: focused ? '0 0 0 3px rgba(28,27,24,.08)' : undefined,
        borderRadius: 6,
        fontSize: 12.5,
        lineHeight: `${CMT.lh}px`,
        color: text ? C.text : C.muted,
        whiteSpace: 'pre-wrap',
        background: C.pane,
      }}
    >
      {text ? (
        <>
          {text}
          {focused ? <Caret visible={solid || caretOn(f, caretSince)} /> : null}
        </>
      ) : (
        <>
          {focused ? <Caret visible={solid || caretOn(f, caretSince)} /> : null}
          {placeholder}
        </>
      )}
    </div>
  );
};

const Card: React.FC<{ closed?: boolean; children: React.ReactNode }> = ({ closed, children }) => (
  <div style={{ background: closed ? C.sunken : C.pane, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>{children}</div>
);

const NewCommentBtn: React.FC = () => (
  <div style={{ marginBottom: 10, height: 27 }}>
    <Btn
      variant="secondary"
      size="sm"
      label={
        <>
          <MessageSquare size={13} strokeWidth={2} style={{ marginRight: -3 }} />
          {CM.newComment}
        </>
      }
    />
  </div>
);

/** Nadia's new-comment form (2801–2983). */
const NewCommentForm: React.FC = () => {
  const f = useCurrentFrame();
  const text = nadiaCommentText(f);
  let since: number = T.commentForm;
  if (f >= TY.commentAt.from) since = Math.min(f - 1, TY.commentAt.end);
  if (f >= T.mentionPick) since = T.mentionPick;
  if (f >= TY.commentRest.from) since = Math.min(f - 1, TY.commentRest.end);
  return (
    <Card>
      <Anchor />
      <CommentBox text={text} placeholder={CM.placeholderSel} caretSince={since} focused />
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <Btn variant={text ? 'primary' : 'disabled'} size="sm" label={CM.buttons.comment} pressAt={T.commentEnter} />
        <Btn variant="quiet" size="sm" label={CM.buttons.cancel} />
      </div>
    </Card>
  );
};

const Thread: React.FC<{ seat: Seat; closed?: boolean }> = ({ seat, closed }) => {
  const f = useCurrentFrame();
  const eleanor = seat === 'ELEANOR';
  const replied = f >= T.replied;
  const replyBox = eleanor && f >= T.replyBox && f < T.replied && !closed;
  const n = typedCountAt(f, TY.reply.text, TY.reply.from, TY.reply.seed);
  const since = f < TY.reply.from ? T.replyBox : Math.min(f - 1, TY.reply.end);
  const hoverReply = eleanor && f >= 3030 && f < 3044;
  const hoverClose = eleanor && f >= T.closeHover - 4 && f < T.closed;
  return (
    <Card closed={closed}>
      <Anchor />
      <CommentBlock who={CM.comment.who} when={CM.comment.when} body={CM.comment.body} closed={closed} />
      {replied ? <CommentBlock who={CM.reply.who} when={CM.reply.when} body={CM.reply.body} reply closed={closed} /> : null}
      {closed ? <div style={{ fontSize: 11.5, color: C.muted, fontStyle: 'italic', margin: '6px 0 2px' }}>{CM.resolved}</div> : null}
      {replyBox ? (
        <div style={{ marginTop: 8 }}>
          <CommentBox text={TY.reply.text.slice(0, n)} placeholder={CM.placeholderReply} caretSince={since} focused />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Btn variant="primary" size="sm" label={CM.buttons.reply} pressAt={T.replyEnter} />
            <Btn variant="quiet" size="sm" label={CM.buttons.cancel} />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {closed ? (
            <QuietSm Icon={RotateCcw} label={CM.buttons.reopen} />
          ) : (
            <>
              <QuietSm Icon={Reply} label={CM.buttons.reply} hover={hoverReply} />
              <QuietSm Icon={Check} label={CM.buttons.close} hover={hoverClose} />
            </>
          )}
        </div>
      )}
    </Card>
  );
};

const CommentsTab: React.FC<{ seat: Seat }> = ({ seat }) => {
  const f = useCurrentFrame();
  const top = contentTop(false);
  const eleanor = seat === 'ELEANOR';
  let body: React.ReactNode;
  if (!eleanor && f < T.posted) body = <NewCommentForm />;
  else if (f < T.closed)
    body = (
      <>
        <NewCommentBtn />
        <Thread seat={seat} />
      </>
    );
  else {
    const open = eleanor && f >= T.bothResponds;
    body = (
      <>
        <NewCommentBtn />
        <div style={{ fontSize: 12.5, lineHeight: '18.75px', color: C.muted }}>{CM.emptyOpen}</div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, lineHeight: '15px', padding: '4px 0', fontWeight: 600, color: eleanor && f >= 3256 && f < T.bothResponds ? C.text : C.muted, whiteSpace: 'nowrap' }}>
            {CM.resolvedToggle(1, open)}
          </div>
          {open ? (
            <div style={{ marginTop: 6, opacity: ui(f, T.bothResponds) }}>
              <Thread seat={seat} closed />
            </div>
          ) : null}
        </div>
      </>
    );
  }
  return <div style={{ position: 'absolute', left: PANEL.cx0 - PANEL.x0, top: top - PANEL.y0, width: PANEL.cw }}>{body}</div>;
};

// ------------------------------------------------------------------ the panel

export const SplitPanel: React.FC<{ seat: Seat }> = ({ seat }) => {
  const f = useCurrentFrame();
  const pending = f >= T.done && f < T.accepted;
  const comments = f >= T.posted && f < T.closed ? 1 : 0;
  const active: 'Chat' | 'Comments' =
    seat === 'ELEANOR' ? (f >= T.leftComments ? 'Comments' : 'Chat') : f >= T.commentForm && f < T.bothResponds ? 'Comments' : 'Chat';
  return (
    <div
      style={{
        position: 'absolute',
        left: PANEL.x0 - SPLIT_O.x,
        top: PANEL.y0 - SPLIT_O.y,
        width: PANEL.x1 - PANEL.x0,
        height: PANEL.y1 - PANEL.y0,
        background: C.pane,
        borderRadius: RADIUS.pane,
        boxShadow: SHADOW.soft,
        overflow: 'hidden',
        fontFamily: FONT.sans,
        color: C.text,
      }}
    >
      <Tabs active={active} comments={comments} pending={pending} pendingAt={T.done} />
      {active === 'Chat' ? <ChatTab seat={seat} pending={pending} /> : <CommentsTab seat={seat} />}
    </div>
  );
};

