/**
 * The review-cycle page (`12`, `17`, `18`, `19`, `21`, `22`, `23`, `25`) and
 * the shared header / status card used by the status page (`15a`, `16`, `20`,
 * `27`). Native px; layouts follow the captures with x + 48.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, Download } from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, type F } from '../../shared';
import { WT_CODES } from '../../data/wrenfield';
import { Caret, caretOn, SelectMenu, StatusPill, type Tone } from '../shared';
import { Button, Fade, fade, Micro, SelectBox, TextArea } from './parts';

// ------------------------------------------------------------------ header

export interface HeaderAction {
  label: string;
  kind?: 'primary' | 'quiet' | 'danger' | 'disabled';
  hover?: boolean;
  pressAt?: F;
  /** Draw the hairline separator before this action. */
  sep?: boolean;
  /** Fade out from here (ui). */
  exitAt?: F;
}

export const PageTitleRow: React.FC<{
  title: string;
  serif?: boolean;
  /** The subtitle: inline nodes (text and pills) that wrap. */
  sub?: React.ReactNode;
  /** Second line under the subtitle (the amber `Not used for AI answers` badge). */
  under?: React.ReactNode;
  actions?: HeaderAction[];
}> = ({ title, serif, sub, under, actions = [] }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: serif ? FONT.serif : FONT.mono,
            fontSize: serif ? 29 : 28,
            fontWeight: serif ? 500 : 400,
            letterSpacing: serif ? 0.1 : -0.3,
            lineHeight: '32px',
            color: C.text,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        {sub ? <div style={{ fontSize: 13, lineHeight: '22px', color: C.text2 }}>{sub}</div> : null}
        {under ? <div style={{ marginTop: 1 }}>{under}</div> : null}
      </div>
      {actions.length ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none', paddingTop: 0 }}>
          {actions.map((a) => {
            const o = fade(f, undefined, a.exitAt);
            if (o <= 0) return null;
            return (
              <React.Fragment key={a.label}>
                {a.sep ? <span style={{ width: 1, height: 26, background: C.border, margin: '0 4px', opacity: o }} /> : null}
                <Button kind={a.kind ?? 'quiet'} label={a.label} hover={a.hover} pressAt={a.pressAt} pad={a.kind === 'danger' ? '3px 11px' : a.kind === 'primary' ? '4px 12px' : '4px 10px'} style={{ opacity: o, height: 27 }} />
              </React.Fragment>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

/** Inline subtitle pill (sits on the 22 px subtitle line). */
export const SubPill: React.FC<{ tone: Tone; label: React.ReactNode; flip?: { tone: Tone; label: React.ReactNode; at: F } }> = ({ tone, label, flip }) => (
  <StatusPill tone={tone} label={label} flipTo={flip} size={12.5} style={{ verticalAlign: '-4px' }} />
);

// ------------------------------------------------------------------ status card

export type StepState = 'done' | 'current' | 'todo';
const STEPS = ['Submitted', 'In review', 'Responding', 'Complete'] as const;

const StepDot: React.FC<{ n: number; s: StepState }> = ({ n, s }) =>
  s === 'done' ? (
    <span style={{ width: 22, height: 22, borderRadius: 999, background: C.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <Check size={13} strokeWidth={3} color="#fff" />
    </span>
  ) : s === 'current' ? (
    <span
      style={{
        width: 22,
        height: 22,
        boxSizing: 'border-box',
        borderRadius: 999,
        border: `1.6px solid ${C.ink}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11.5,
        fontWeight: 600,
        color: C.text,
        flex: 'none',
        background: '#f6f5f2',
      }}
    >
      {n}
    </span>
  ) : (
    <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 600, color: C.muted, flex: 'none' }}>{n}</span>
  );

export interface StatusCardProps {
  label: string;
  /** Steps over time: [frame, states] (first entry from -∞). */
  steps: Array<[F, StepState[]]>;
  target?: string;
  pill?: { tone: Tone; label: string; flip?: { tone: Tone; label: string; at: F } };
  /** Owner's `Acknowledge submission` (greyed → ink at `inkAt`, gone at `goneAt`). */
  ack?: { inkAt?: F; goneAt?: F; hover?: boolean; pressAt?: F };
  /** The accepted variant's second line. */
  line2?: React.ReactNode;
  /** Extra height above/below (card padding). */
  padY?: number;
}

export const StatusCard: React.FC<StatusCardProps> = ({ label, steps, target, pill, ack, line2, padY = 27 }) => {
  const f = useCurrentFrame();
  let cur = steps[0][1];
  for (const [at, s] of steps) if (f >= at) cur = s;
  const ackO = ack ? fade(f, undefined, ack.goneAt) : 0;
  const inked = ack?.inkAt !== undefined && f >= ack.inkAt;
  return (
    <div style={{ background: '#efeee9', borderRadius: RADIUS.pane, boxShadow: SHADOW.soft, padding: `${padY}px 34px ${padY - 2}px 32px` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <span style={{ flex: 'none', marginTop: 0, height: 22, display: 'inline-flex', alignItems: 'center', padding: '0 8px', marginRight: 14, borderRadius: 6, background: '#f6f5f2', fontSize: 12.5, fontWeight: 600, color: C.text }}>
          {label}
        </span>
        {/* Steps: circles joined by flexing lines; labels left-aligned under each circle. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', paddingRight: ack && ackO > 0 ? 36 : 44, position: 'relative' }}>
          {STEPS.map((name, i) => (
            <React.Fragment key={name}>
              <span style={{ position: 'relative', flex: 'none' }}>
                <StepDot n={i + 1} s={cur[i]} />
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 27,
                    fontSize: ack && ackO > 0 ? 12 : 12.5,
                    lineHeight: '18px',
                    letterSpacing: ack && ackO > 0 ? -0.2 : -0.1,
                    whiteSpace: 'nowrap',
                    fontWeight: cur[i] === 'todo' ? 450 : 600,
                    color: cur[i] === 'todo' ? C.muted : C.text,
                  }}
                >
                  {name}
                </span>
              </span>
              {i < 3 ? <span style={{ flex: 1, height: 1.5, margin: '0 6px', background: '#d6d3cb', minWidth: 30 }} /> : null}
            </React.Fragment>
          ))}
        </div>
        <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: ack && ackO > 0 ? 10 : 12, height: 22, marginLeft: 12 }}>
          {target ? <span style={{ fontSize: 12, color: C.text2, whiteSpace: 'nowrap' }}>{target}</span> : null}
          {pill ? <StatusPill tone={pill.tone} label={pill.label} flipTo={pill.flip} size={12.5} /> : null}
          {ack && ackO > 0 ? (
            <Button kind={inked ? 'primary' : 'disabled'} label="Acknowledge submission" size={12.5} hover={ack.hover} pressAt={ack.pressAt} pad="4px 12px" style={{ height: 28, opacity: ackO, marginLeft: -2 }} />
          ) : null}
        </span>
      </div>
      <div style={{ height: 23 }} />
      {line2 ? <div style={{ marginTop: 13, fontSize: 12, color: C.text2 }}>{line2}</div> : null}
    </div>
  );
};

// ------------------------------------------------------------------ round bar

export const RoundBar: React.FC<{ label: string; children: React.ReactNode; downloads?: boolean }> = ({ label, children, downloads = true }) => (
  <div>
    <Micro>{label}</Micro>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, height: 22, fontSize: 12.5, color: C.text2, whiteSpace: 'nowrap' }}>
      {children}
      {downloads ? (
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, color: C.text2 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Download size={13} strokeWidth={1.7} />
            native .docx
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Download size={13} strokeWidth={1.7} />
            PDF (review rendition)
          </span>
        </span>
      ) : null}
    </div>
  </div>
);

// ------------------------------------------------------------------ comment card

export interface ResponseBlock {
  text: string;
  /** `Change prepared for the next revision — “…”` */
  passage?: string;
  /** ` — no change: …` */
  noChange?: string;
}

export interface CommentCardProps {
  author: string;
  code: 'S0' | null;
  when: string;
  quote: string;
  body: React.ReactNode;
  /** `Edit as lead reviewer` (reviewer's own seat). */
  edit?: boolean;
  /** Quiet `Respond` (author seat, unanswered, form closed). */
  respond?: { hover?: boolean; pressAt?: F };
  response?: ResponseBlock;
  /** Response block appears (ui) from here. */
  responseAt?: F;
  /** The respond form (open). */
  form?: React.ReactNode;
  /** Hovered: sunken fill + ink left rule (`22`, `23`). */
  hovered?: boolean;
  compact?: boolean;
  /** Card appears (ui) from here. */
  at?: F;
}

export const ResponseBox: React.FC<{ r: ResponseBlock; compact?: boolean }> = ({ r, compact }) => (
  <div style={{ background: C.sunken, borderRadius: 6, padding: compact ? '6px 8px' : '7px 10px 8px', marginTop: compact ? 6 : 8, fontSize: compact ? 12 : 13, lineHeight: compact ? '16px' : '16px', color: C.text }}>
    <b style={{ fontWeight: 600 }}>Response</b> · {r.text}
    {r.noChange ? <span style={{ color: C.muted }}> — no change: {r.noChange}</span> : null}
    {r.passage ? (
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: '15px', color: C.muted }}>
        Change prepared for the next revision — <i>“{r.passage}”</i>
      </div>
    ) : null}
  </div>
);

export const CommentCard: React.FC<CommentCardProps> = ({ author, code, when, quote, body, edit, respond, response, responseAt, form, hovered, compact, at }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : fade(f, at);
  if (o <= 0) return null;
  const rO = response ? (responseAt === undefined ? 1 : fade(f, responseAt)) : 0;
  return (
    <div
      style={{
        opacity: o,
        borderLeft: hovered ? `3px solid ${C.ink}` : `2px solid #e6e4de`,
        background: hovered ? C.sunken : undefined,
        borderRadius: hovered ? '0 8px 8px 0' : undefined,
        padding: compact ? '0 0 0 9px' : hovered ? '2px 0 8px 9px' : '2px 0 0 10px',
        marginLeft: hovered ? 0 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: compact ? 18 : 20, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: compact ? 12.5 : 14, fontWeight: 600, color: C.text }}>{author}</span>
        {code ? <StatusPill tone="info" label={code} size={compact ? 11 : 12} /> : null}
        <span style={{ fontSize: compact ? 11.5 : 12.5, color: C.muted }}>{when}</span>
      </div>
      <div style={{ fontSize: compact ? 11.5 : 12.5, lineHeight: compact ? '17px' : '20px', fontStyle: 'italic', color: C.muted, marginTop: compact ? 1 : 2 }}>{quote}</div>
      <div style={{ fontSize: compact ? 12.5 : 14, lineHeight: compact ? '18px' : '16px', color: C.text, marginTop: compact ? 1 : 3, paddingRight: hovered ? 8 : 0 }}>{body}</div>
      {edit ? <Button label="Edit as lead reviewer" size={12.5} pad="4px 12px" style={{ marginTop: 4, height: 26 }} /> : null}
      {respond && !(response && rO >= 1) && !form ? <Button label="Respond" size={12.5} pad="4px 12px" hover={respond.hover} pressAt={respond.pressAt} style={{ marginTop: 4, height: 26 }} /> : null}
      {form}
      {response && rO > 0 ? (
        <div style={{ opacity: rO, paddingRight: hovered ? 8 : 0 }}>
          <ResponseBox r={response} compact={compact} />
        </div>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ the respond form (cycle.tsx 952–1010)

export const RespondForm: React.FC<{
  text: React.ReactNode;
  textFocus?: boolean;
  textScroll?: number;
  /** Lines of the textarea (16 px each, 3 → 48 px + padding). */
  textH?: number;
  noChangeAt?: F;
  checkHover?: boolean;
  passage: React.ReactNode;
  passageFocus?: boolean;
  passagePlaceholder: string;
  recordHover?: boolean;
  recordPressAt?: F;
}> = ({ text, textFocus, textScroll, textH = 50, noChangeAt, checkHover, passage, passageFocus, passagePlaceholder, recordHover, recordPressAt }) => {
  const f = useCurrentFrame();
  const ticked = noChangeAt !== undefined && f >= noChangeAt;
  return (
    <div style={{ marginTop: 8, paddingRight: 8 }}>
      <TextArea value={text} white focus={textFocus} height={textH} scrollY={textScroll} style={{ fontSize: 13 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 20, marginTop: 8, fontSize: 12.5, color: C.text2 }}>
        <span
          style={{
            width: 13,
            height: 13,
            boxSizing: 'border-box',
            borderRadius: 3,
            border: ticked ? 'none' : `1.3px solid ${checkHover ? C.text2 : '#8a887f'}`,
            background: ticked ? '#3b6ea8' : C.pane,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {ticked ? <Check size={10} strokeWidth={3.2} color="#fff" /> : null}
        </span>
        No change was made
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: 31,
            boxSizing: 'border-box',
            borderRadius: RADIUS.control,
            border: `1px solid ${passageFocus ? '#3b6ea8' : 'rgba(20,20,20,.14)'}`,
            boxShadow: passageFocus ? '0 0 0 1px #3b6ea8' : undefined,
            background: C.pane,
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            fontSize: 13,
            color: C.text,
          }}
        >
          <FieldRun value={passage} placeholder={passagePlaceholder} />
        </div>
        <Button kind="primary" label={<span style={{ textAlign: 'center', lineHeight: '15px' }}>Record the<br />response</span>} hover={recordHover} pressAt={recordPressAt} pad="5px 10px" style={{ width: 131, height: 41 }} />
      </div>
    </div>
  );
};

/**
 * One-line field content that keeps its END in view (an input scrolling as you
 * type): left-aligned while it fits, right-aligned once it overflows.
 */
export const FieldRun: React.FC<{ value: React.ReactNode; placeholder: string }> = ({ value, placeholder }) => (
  <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end', overflow: 'hidden', lineHeight: '20px' }}>
    {value === undefined || value === null ? (
      <span style={{ flex: 1, minWidth: 0, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{placeholder}</span>
    ) : (
      <span style={{ flex: 'none', minWidth: '100%', whiteSpace: 'nowrap' }}>{value}</span>
    )}
  </span>
);

// ------------------------------------------------------------------ composer and verdict (reviewer seat)

export const CODE_OPTS = WT_CODES.map((c) => `${c.code} — ${c.label}`);
export const VERDICT_OPTS = WT_CODES.map((c) => `${c.code} — ${c.label}${c.isAccepting ? ' (accepting)' : ''}`);

export const Composer: React.FC<{
  /** null: `No anchor — …`; else the anchored row. */
  anchored?: { quote: string; at?: F; exitAt?: F };
  text?: React.ReactNode;
  textFocus?: boolean;
  textScroll?: number;
  code?: string;
  codeFocus?: boolean;
  commentArmed?: boolean;
  commentHover?: boolean;
  commentPressAt?: F;
  /** Leading empty-state line (`No comments yet — …`). */
  empty?: boolean;
  verdict?: string;
  verdictFocus?: boolean;
  closeArmed?: boolean;
  closeHover?: boolean;
  closePressAt?: F;
}> = ({ anchored, text, textFocus, textScroll, code, codeFocus, commentArmed, commentHover, commentPressAt, empty, verdict, verdictFocus, closeArmed, closeHover, closePressAt }) => {
  const f = useCurrentFrame();
  const aO = anchored ? fade(f, anchored.at, anchored.exitAt) : 0;
  return (
    <div>
      {empty ? (
        <div style={{ fontSize: 13, lineHeight: '16px', color: C.muted, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${C.border}`, paddingTop: 1 }}>
          No comments yet — the round is open to the review group.
        </div>
      ) : null}
      {/* `No anchor — …` (2 lines, 30) or the anchored row (40): the textarea moves down 12 when anchoring, as captured in 17 vs 18. */}
      <div style={{ position: 'relative', height: 30 + 10 * aO }}>
        <div style={{ position: 'absolute', inset: 0, fontSize: 12.5, lineHeight: '15px', color: C.muted, opacity: 1 - aO }}>No anchor — the comment will attach to the round, not a passage.</div>
        {aO > 0 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 10, opacity: aO }}>
            <StatusPill tone="warning" label="anchored" size={12.5} />
            <span style={{ flex: 1, fontSize: 12.5, lineHeight: '15px', fontStyle: 'italic', color: C.muted }}>{anchored!.quote}</span>
            <span style={{ width: 66, textAlign: 'center', fontSize: 12.5, lineHeight: '15px', color: C.text2 }}>Clear anchor</span>
          </div>
        ) : null}
      </div>
      <TextArea value={text} placeholder="Add a review comment…" focus={textFocus} white={!!text && !textFocus} height={53} scrollY={textScroll} style={{ marginTop: 8 + 2 * aO }} />
      <div style={{ display: 'flex', gap: 9, marginTop: 9.5, alignItems: 'center' }}>
        <SelectBox value={code ?? 'no code'} focus={codeFocus} style={{ flex: 1 }} />
        <Button kind={commentArmed ? 'primary' : 'disabled'} label="Comment" hover={commentHover} pressAt={commentPressAt} pad="4px 14px" style={{ height: 28, width: 82 }} />
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 7.5 }}>
        <div style={{ fontSize: 13, lineHeight: '17px', color: C.text2 }}>Deliverable verdict</div>
        <SelectBox value={verdict ?? 'choose a code…'} focus={verdictFocus} style={{ marginTop: 8.5, height: 33 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button kind={closeArmed ? 'primary' : 'disabled'} label="Close & issue the round" hover={closeHover} pressAt={closePressAt} pad="4px 12px" style={{ height: 27, width: 166 }} />
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: '17px', color: C.muted }}>
          A verdict is required to close the round. An accepting code (e.g. A1) publishes the deliverable to the project library — the review is complete; any other code returns it to the authors for revision.
        </div>
      </div>
    </div>
  );
};

/** The open select list (native `<select>` drawn as the shared SelectMenu). */
export const OpenSelect: React.FC<{ x: number; y: number; at: F; exitAt?: F; options: readonly string[]; placeholder: string; hover?: string; direction?: 'up' | 'down' }> = ({
  x,
  y,
  at,
  exitAt,
  options,
  placeholder,
  hover,
  direction,
}) => <SelectMenu x={x} y={y} at={at} exitAt={exitAt} options={[placeholder, ...options]} hover={hover} direction={direction} />;

/** A typed value with the caret (frames from HumanTyped's schedule). */
export const CaretAfter: React.FC<{ on: boolean; since: F }> = ({ on, since }) => {
  const f = useCurrentFrame();
  return on ? <Caret visible={caretOn(f, since)} /> : null;
};

export { Fade };
