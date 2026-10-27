/**
 * The chat-led app builder (master-plan §4.9, §5.4; video-04 "The builder
 * stage"): ChatComposer, ChatPanel + Turn, StepRail, BuilderHeader, ReadBack,
 * RowForm.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ArrowUp, Check, FileSpreadsheet } from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, TYPE } from '../theme';
import { agentChars, agentRevealFrames, appear, ui, type F } from '../motion';
import { GreekText, Highlight } from '../focus';
import { TypedText, typedCount } from '../cursor';
import { AgentGlyph, Badge, Button, Chip, MicroLabel, type BadgeProps } from './primitives';
import { Receipt } from './shell';

const LINE = TYPE.dense; // chat lines: 13 native → ≥ 31 px at 2.4

// ------------------------------------------------------------------ ChatComposer

export interface ChatComposerProps {
  placeholder: string;
  /** Static value, or typed with typeFrom/typeTo. */
  value?: string;
  typeFrom?: F;
  typeTo?: F;
  /** Keyboard send: the send button presses and the field clears 2 f later. */
  sendAt?: F;
  chips?: string[];
  activeChip?: string;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({ placeholder, value, typeFrom, typeTo, sendAt, chips, activeChip }) => {
  const f = useCurrentFrame();
  const sent = sendAt !== undefined && f >= sendAt + 2;
  const typed = value !== undefined && typeFrom !== undefined && typeTo !== undefined;
  const hasText = !sent && value !== undefined && (!typed || f >= typeFrom!);
  const pressed = sendAt !== undefined && f >= sendAt && f < sendAt + 3;
  return (
    <div style={{ fontFamily: FONT.sans }}>
      <div
        style={{
          background: C.sunken,
          borderRadius: RADIUS.lg,
          boxShadow: SHADOW.popout,
          padding: '10px 10px 10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <AgentGlyph size={12} />
        <div style={{ flex: 1, fontSize: LINE, lineHeight: 1.45, color: hasText ? C.text : C.muted, minHeight: LINE * 1.45 }}>
          {hasText ? typed ? <TypedText text={value!} from={typeFrom!} to={typeTo!} caretUntil={sendAt ?? typeTo! + 20} /> : value : placeholder}
        </div>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: RADIUS.control,
            background: hasText ? C.ink : C.faint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
            transform: pressed ? 'scale(0.94)' : undefined,
          }}
        >
          <ArrowUp size={15} color="#fff" strokeWidth={2.4} />
        </span>
      </div>
      {chips && chips.length ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {chips.map((c) => (
            <Chip key={c} label={c} active={c === activeChip} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ Turns

export type Turn =
  | { kind: 'user'; name?: string; text: string; at: F; greekFrom?: F; /** Echo of a tapped reply: a label, not a line. */ echo?: boolean }
  | { kind: 'agent'; text: string; at: F; greekFrom?: F }
  | { kind: 'receipt'; label: string; at: F }
  | { kind: 'question'; text: string; at: F; replies: string[]; chosen: number; chosenAt: F; greekFrom?: F; /** Draw the echo bubble at chosenAt + 8 (default true). */ echo?: boolean; name?: string }
  | { kind: 'file'; name: string; meta: string; button: string; pressAt?: F; at: F }
  | { kind: 'mapping'; label: string; at: F };

const isLine = (t: Turn) => t.kind === 'agent' || t.kind === 'question' || (t.kind === 'user' && !t.echo);

/** Expand question echoes into user turns so ordering is uniform. */
function expand(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    out.push(t);
    if (t.kind === 'question' && t.echo !== false) {
      out.push({ kind: 'user', name: t.name, text: t.replies[t.chosen], at: t.chosenAt + 8, echo: true });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const AgentLabel: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: TYPE.label, fontWeight: 600, color: C.muted, marginBottom: 4 }}>
    <AgentGlyph size={10} colour={C.muted} />
    Agent
  </div>
);

const AgentText: React.FC<{ text: string; at: F; greek: boolean }> = ({ text, at, greek }) => {
  const f = useCurrentFrame();
  const n = Math.min(text.length, agentChars(f, at));
  if (greek) return <GreekText text={text} greek />;
  return (
    <span>
      {text.slice(0, n)}
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </span>
  );
};

const TurnView: React.FC<{ t: Turn; greek: boolean; dim: boolean }> = ({ t, greek, dim }) => {
  const f = useCurrentFrame();
  const p = appear(f, t.at, 9);
  const base: React.CSSProperties = { opacity: p * (dim ? 0.6 : 1), transform: `translateY(${(1 - p) * 8}px)` };
  switch (t.kind) {
    case 'user':
      return (
        <div style={{ ...base, alignSelf: 'flex-end', maxWidth: '86%' }}>
          <div
            style={{
              background: C.pane,
              borderRadius: RADIUS.lg,
              boxShadow: SHADOW.popout,
              padding: '9px 13px',
              fontSize: LINE,
              lineHeight: 1.45,
              color: C.text,
            }}
          >
            <GreekText text={t.text} greek={greek} />
          </div>
        </div>
      );
    case 'agent':
      return (
        <div style={{ ...base, transform: undefined, opacity: dim && greek ? 0.6 : 1 }}>
          <AgentLabel />
          <div style={{ fontSize: LINE, lineHeight: 1.45, color: C.text }}>
            <AgentText text={t.text} at={t.at} greek={greek} />
          </div>
        </div>
      );
    case 'question': {
      const repliesAt = t.at + agentRevealFrames(t.text) + 2;
      const chosenP = ui(f, t.chosenAt);
      return (
        <div style={{ opacity: dim && greek ? 0.6 : 1 }}>
          <AgentLabel />
          <div style={{ fontSize: LINE, lineHeight: 1.45, color: C.text }}>
            <AgentText text={t.text} at={t.at} greek={greek} />
          </div>
          {f >= repliesAt ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', opacity: ui(f, repliesAt) }}>
              {t.replies.map((r, i) => (
                <Button
                  key={r}
                  variant="secondary"
                  size="sm"
                  label={r}
                  pressAt={i === t.chosen ? t.chosenAt : undefined}
                  latch
                  opacity={i === t.chosen ? 1 - 0.4 * appear(f, t.chosenAt + 8, 9) : 1 - 0.6 * chosenP}
                  anchor={`reply-${i}`}
                  style={{ fontSize: TYPE.ui, padding: '6px 12px' }}
                />
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    case 'receipt':
      return (
        <div style={base}>
          <Receipt label={t.label.replace(/^✓\s*/, '')} />
        </div>
      );
    case 'mapping':
      return (
        <div style={{ ...base, fontSize: TYPE.ui, color: C.text2, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: C.faint }} />
          {t.label}
        </div>
      );
    case 'file':
      return (
        <div
          style={{
            ...base,
            background: C.pane,
            borderRadius: RADIUS.card,
            boxShadow: SHADOW.soft,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ width: 30, height: 30, borderRadius: 6, background: C.sunken, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <FileSpreadsheet size={16} color={C.text2} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: TYPE.ui, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
            <div style={{ fontSize: TYPE.label, color: C.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <GreekText text={t.meta} greek />
            </div>
          </div>
          <Button variant="secondary" size="sm" label={t.button} pressAt={t.pressAt} anchor="file-button" />
        </div>
      );
  }
};

// ------------------------------------------------------------------ ChatPanel

export interface ChatPanelProps {
  title: string;
  /** 7-dot strip in the header. `done` is a count, or the frames each step finished. */
  progress?: { done: number | F[]; of: 7 };
  turns: Turn[];
  composer: ChatComposerProps;
  /** On-screen size; native = on-screen / scale. */
  width: number;
  height: number;
  scale: number;
  /** Entry (`panel`). */
  at?: F;
}

/**
 * The builder's agent: newest turn at the bottom, older lines Greek'd (§4.3),
 * older labels at 0.6. Agent text reveals at 3 chars/f; replies appear 2 f
 * after the question completes; the chosen one presses, the rest fade to 0.4,
 * and its echo bubble lands 8 f later. Position it with an absolute wrapper.
 */
export const ChatPanel: React.FC<ChatPanelProps> = ({ title, progress, turns, composer, width, height, scale, at }) => {
  const f = useCurrentFrame();
  const p = at === undefined ? 1 : appear(f, at, 9);
  const all = expand(turns);
  const visible = all.filter((t) => f >= t.at);
  const lines = all.filter(isLine);
  const done = progress ? (typeof progress.done === 'number' ? progress.done : progress.done.filter((d) => f >= d).length) : 0;
  return (
    <div style={{ width, height, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
      <div
        style={{
          width: width / scale,
          height: height / scale,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          background: C.pane,
          borderRadius: RADIUS.pane,
          boxShadow: SHADOW.pane,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT.sans,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <AgentGlyph size={11} />
          <span style={{ fontSize: TYPE.ui, fontWeight: 600 }}>{title}</span>
          {progress ? (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
              {Array.from({ length: progress.of }, (_, i) => (
                <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: i < done ? C.ink : C.borderStrong }} />
              ))}
              <span style={{ fontSize: TYPE.label, color: C.muted, marginLeft: 4, fontWeight: 500 }}>
                {done} of {progress.of}
              </span>
            </span>
          ) : null}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12, padding: '12px 14px', overflow: 'hidden' }}>
          {visible.map((t, i) => {
            const nextLine = lines.find((l) => l.at > t.at && l !== t);
            const autoGreek = isLine(t) && nextLine !== undefined && f >= nextLine.at;
            const g = 'greekFrom' in t && t.greekFrom !== undefined ? f >= t.greekFrom : autoGreek;
            const newer = visible.slice(i + 1).some((o) => o.at > t.at);
            return <TurnView key={`${t.kind}-${t.at}-${i}`} t={t} greek={g} dim={newer} />;
          })}
        </div>
        <div style={{ padding: '0 12px 12px' }}>
          <ChatComposer {...composer} />
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ StepRail

export interface StepSpec {
  n: number;
  title: string;
  /** Greek'd one-line summary shown under a done title. */
  summary?: string;
  asks?: boolean;
  activeAt?: F;
  waitingAt?: F;
  doneAt?: F;
  /** Shimmer the summary line from here until doneAt. */
  shimmerAt?: F;
}

export interface StepRailProps {
  steps: StepSpec[];
  compact?: boolean;
  /** On-screen size and scale (default 480 × 864 at 1.8). */
  width?: number;
  height?: number;
  scale?: number;
  at?: F;
  /** Fade out (opacity → 0) over 8 f from here. */
  exitAt?: F;
}

/** Slim step column: plain titles, 16 px native circles, line fills down; exposes `step-n` anchors. */
export const StepRail: React.FC<StepRailProps> = ({ steps, compact = false, width = 480, height = 864, scale = 1.8, at, exitAt }) => {
  const f = useCurrentFrame();
  const p = (at === undefined ? 1 : appear(f, at, 9)) * (exitAt === undefined ? 1 : 1 - appear(f, exitAt, 8));
  if (p <= 0) return null;
  const d = 16;
  return (
    <div style={{ width, height, opacity: p, transform: `translateY(${(1 - Math.min(1, p)) * 0}px)` }}>
      <div
        style={{
          width: width / scale,
          height: height / scale,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          background: C.pane,
          borderRadius: RADIUS.pane,
          boxShadow: SHADOW.pane,
          padding: '14px 14px',
          boxSizing: 'border-box',
          fontFamily: FONT.sans,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <MicroLabel style={{ marginBottom: 12 }}>Steps</MicroLabel>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: compact ? 'flex-start' : 'space-between' }}>
          {steps.map((s, i) => {
            const done = s.doneAt !== undefined && f >= s.doneAt;
            const waiting = !done && s.waitingAt !== undefined && f >= s.waitingAt;
            const active = !done && (waiting || (s.activeAt !== undefined && f >= s.activeAt));
            const last = i === steps.length - 1;
            const tickP = done ? ui(f, s.doneAt!) : 0;
            return (
              <div key={s.n} style={{ display: 'flex', gap: 10, flex: compact ? 'none' : 1, minHeight: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: d }}>
                  <span
                    style={{
                      width: d,
                      height: d,
                      borderRadius: 999,
                      flex: 'none',
                      boxSizing: 'border-box',
                      background: done ? C.ink : active ? C.pane : C.active,
                      border: active ? `1.5px solid ${C.ink}` : 'none',
                      color: done ? '#fff' : active ? C.text : C.muted,
                      fontSize: 9.5,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {done ? <Check size={10} strokeWidth={3.2} style={{ transform: `scale(${0.6 + 0.4 * tickP})` }} /> : s.n}
                  </span>
                  {!last ? (
                    <span style={{ width: 1.5, flex: 1, background: C.borderStrong, margin: '3px 0', position: 'relative', overflow: 'hidden' }}>
                      <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${tickP * 100}%`, background: C.ink }} />
                    </span>
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
                  <div
                    data-anchor={`step-${s.n}`}
                    style={{ fontSize: TYPE.ui, fontWeight: 600, lineHeight: `${d}px`, color: done || active ? C.text : C.text2, whiteSpace: 'nowrap', display: 'inline-block' }}
                  >
                    {s.title}
                  </div>
                  {waiting ? (
                    <div style={{ marginTop: 4 }}>
                      <Badge tone="warning" label="Waiting for you" pill at={s.waitingAt} size={10.5} />
                    </div>
                  ) : null}
                  {done && s.summary ? (
                    <div style={{ fontSize: TYPE.label, color: C.muted, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '88%', opacity: tickP }}>
                      <GreekText text={s.summary} greek />
                    </div>
                  ) : null}
                  {!done && s.asks && !waiting ? (
                    <div style={{ marginTop: 3 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 9,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          color: C.info.text,
                          background: C.info.tint,
                          borderRadius: 4,
                          padding: '1px 5px',
                        }}
                      >
                        <AgentGlyph size={7} colour={C.info.text} /> asks
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ BuilderHeader

export interface BuilderHeaderProps {
  /** Breadcrumb before the app name, e.g. ['Tools', 'App builder']. */
  crumb: string[];
  app: string;
  /** Publish-state badge (use flipTo for the publish). */
  badge: BadgeProps;
  /** Role badge (Owner / Member). */
  role?: BadgeProps;
  at?: F;
  /** On-screen width (default 1680). Inter 22 direct, no scale. */
  width?: number;
}

/** The builder's header strip, drawn at screen size (Inter 22). */
export const BuilderHeader: React.FC<BuilderHeaderProps> = ({ crumb, app, badge, role, at, width = 1680 }) => {
  const f = useCurrentFrame();
  const p = at === undefined ? 1 : appear(f, at, 9);
  return (
    <div style={{ width, height: 56, display: 'flex', alignItems: 'center', gap: 16, fontFamily: FONT.sans, fontSize: 22, opacity: p }}>
      <div style={{ color: C.muted, whiteSpace: 'nowrap' }}>
        {crumb.map((c) => (
          <span key={c}>
            {c} <span style={{ color: C.faint, margin: '0 6px' }}>/</span>
          </span>
        ))}
        <span style={{ color: C.text, fontWeight: 600 }}>{app}</span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
        <Badge pill size={20} {...badge} />
        {role ? <Badge pill size={20} {...role} /> : null}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ ReadBack

export interface ReadBackProps {
  lines: readonly string[];
  /** Index of the sharp (recap) line; the rest are Greek'd. */
  focalLine?: number;
  primary: string;
  pressAt?: F;
  width?: number;
}

/** "Check and open" (float it with Float for its entry): a short read-back, one sharp line, the primary open button. No playbook button. */
export const ReadBack: React.FC<ReadBackProps> = ({ lines, focalLine = 0, primary, pressAt, width = 360 }) => (
  <div style={{ width, background: C.pane, borderRadius: RADIUS.pane, padding: 18, boxSizing: 'border-box', fontFamily: FONT.sans }}>
    <div style={{ fontFamily: FONT.serif, fontSize: TYPE.heading, fontWeight: 500, color: C.text, marginBottom: 12 }}>Check and open</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {lines.map((l, i) => (
        <div key={l} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: LINE, lineHeight: 1.45, color: C.text }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: i === focalLine ? C.ink : C.faint, flex: 'none', transform: 'translateY(-2px)' }} />
          <GreekText text={l} greek={i !== focalLine} />
        </div>
      ))}
    </div>
    <Button variant="primary" label={primary} pressAt={pressAt} anchor="readback-primary" />
  </div>
);

// ------------------------------------------------------------------ RowForm

export interface RowField {
  label: string;
  value?: string;
  typeFrom?: F;
  typeTo?: F;
  kind?: 'text' | 'choice' | 'badge';
  /** For kind 'badge'. */
  badge?: { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string };
  greek?: boolean;
  /** Highlight wipe on the typed value. */
  highlightAt?: F;
}

export interface RowFormProps {
  title: string;
  /** Muted label under the title (e.g. "September 2026"). */
  sub?: string;
  fields: RowField[];
  submitLabel: string;
  pressAt?: F;
  /** "Saved" label appears here. */
  savedAt?: F;
  width?: number;
}

/** An app screen's entry form (e.g. "Write this month's commentary"). */
export const RowForm: React.FC<RowFormProps> = ({ title, sub, fields, submitLabel, pressAt, savedAt, width = 360 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ width, background: C.pane, borderRadius: RADIUS.pane, padding: 18, boxSizing: 'border-box', fontFamily: FONT.sans }}>
      <div style={{ fontSize: TYPE.heading - 3, fontWeight: 600, color: C.text }}>{title}</div>
      {sub ? <div style={{ fontSize: TYPE.label, color: C.muted, marginTop: 2 }}>{sub}</div> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {fields.map((fd) => {
          const typed = fd.typeFrom !== undefined && fd.typeTo !== undefined && fd.value !== undefined;
          const filled = typed ? typedCount(f, fd.value!, fd.typeFrom!, fd.typeTo!) > 0 : !!fd.value;
          let inner: React.ReactNode;
          if (fd.kind === 'badge' && fd.badge) inner = <Badge tone={fd.badge.tone} label={fd.badge.label} pill />;
          else if (typed) {
            const t = <TypedText text={fd.value!} from={fd.typeFrom!} to={fd.typeTo!} caretUntil={pressAt ?? fd.typeTo! + 20} />;
            inner = fd.highlightAt !== undefined && f >= fd.highlightAt ? <Highlight at={fd.highlightAt}>{fd.value}</Highlight> : t;
          } else inner = fd.value ? <GreekText text={fd.value} greek={!!fd.greek} /> : null;
          const focal = typed;
          return (
            <div key={fd.label}>
              <div style={{ fontSize: TYPE.label, fontWeight: 600, color: C.text2, marginBottom: 4 }}>{fd.label}</div>
              {fd.kind === 'badge' ? (
                inner
              ) : (
                <div
                  style={{
                    border: `1px solid ${focal && !(pressAt !== undefined && f >= pressAt) ? C.muted : C.border}`,
                    borderRadius: RADIUS.control,
                    padding: '7px 10px',
                    fontSize: focal ? LINE : TYPE.ui,
                    lineHeight: 1.45,
                    color: C.text,
                    minHeight: (focal ? LINE : TYPE.ui) * 1.45,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: focal && filled && !(pressAt !== undefined && f >= pressAt) ? '0 0 0 3px #cfcac0' : undefined,
                  }}
                >
                  <span style={{ flex: 1 }}>{inner}</span>
                  {fd.kind === 'choice' ? <span style={{ color: C.muted, fontSize: 10 }}>▾</span> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <Button variant="primary" label={submitLabel} pressAt={pressAt} anchor="rowform-submit" />
        {savedAt !== undefined && f >= savedAt ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: TYPE.ui, color: C.success.text, fontWeight: 600, opacity: ui(f, savedAt) }}>
            <Check size={13} strokeWidth={3} /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
};
