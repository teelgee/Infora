/**
 * Clip 04's builder chat: a local variant of the shared ChatPanel
 * (src/shared/ui/builder.tsx) with what this clip needs and the shared one
 * lacks:
 *   - the prompt bubble carries the five highlighted phrases as `data-anchor`
 *     sources for PhraseLift, each tint fading as its copy flies;
 *   - turns grow in (height animates), so the conversation scrolls smoothly
 *     instead of jumping a whole turn in one frame;
 *   - the thread is top-anchored until it fills, then scrolls with the newest
 *     turn at the bottom;
 *   - every line takes an explicit `greekFrom`, so the readability rule is
 *     set frame by frame (a typed composer line counts as the focal line);
 *   - reply buttons carry unique anchors (`<id>-r<n>`) for the cursor;
 *   - the header's 7-dot strip fades in when the step column leaves.
 * Styles match the shared ChatPanel exactly (same tokens, sizes, radii).
 */
import React, { useLayoutEffect, useRef } from 'react';
import { useCurrentFrame } from 'remotion';
import { ArrowUp } from 'lucide-react';
import {
  AgentGlyph,
  Button,
  C,
  FONT,
  GreekText,
  RADIUS,
  Receipt,
  SHADOW,
  TYPE,
  agentChars,
  agentRevealFrames,
  appear,
  ease,
  ui,
  TypedText,
  type ChatComposerProps,
  type F,
} from '../../shared';

const LINE = TYPE.dense; // 13 native → 31.2 px at 2.4
/** Balanced wrapping: no one-word widows when the panel narrows. */
const BALANCE = { textWrap: 'balance' } as React.CSSProperties;

export type ChatTurn =
  | {
      kind: 'prompt';
      text: string;
      at: F;
      /** The bubble fades in from here (the hero morphs onto it). */
      showFrom: F;
      greekFrom: F;
      phrases: Array<{ phrase: string; id: string; liftAt: F }>;
    }
  | { kind: 'question'; id: string; text: string; at: F; replies: readonly string[]; chosen: number; chosenAt: F; greekFrom: F }
  | { kind: 'user'; text: string; at: F; greekFrom?: F }
  | { kind: 'agent'; text: string; at: F; greekFrom: F }
  | { kind: 'receipt'; label: string; at: F };

export interface KpiChatProps {
  title: string;
  turns: ChatTurn[];
  composer: ChatComposerProps;
  /** On-screen size; native = on-screen / scale. */
  width: number;
  height: number;
  scale: number;
  at?: F;
  progress?: { done: F[]; from: F };
}

const AgentLabel: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: TYPE.label, fontWeight: 600, color: C.muted, marginBottom: 4 }}>
    <AgentGlyph size={10} colour={C.muted} />
    Agent
  </div>
);

/** Agent text at 3 chars/f; the unrevealed tail keeps its layout (no reflow). */
const AgentText: React.FC<{ text: string; at: F; greekFrom: F }> = ({ text, at, greekFrom }) => {
  const f = useCurrentFrame();
  if (f >= greekFrom) return <GreekText text={text} greekFrom={greekFrom} />;
  const n = Math.min(text.length, agentChars(f, at));
  return (
    <span>
      {text.slice(0, n)}
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </span>
  );
};

const Bubble: React.FC<{ children: React.ReactNode; anchor?: string; opacity?: number }> = ({ children, anchor, opacity = 1 }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
    <div
      data-anchor={anchor}
      style={{
        maxWidth: '86%',
        background: C.pane,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.popout,
        padding: '9px 13px',
        fontSize: LINE,
        lineHeight: 1.45,
        color: C.text,
        opacity,
        ...BALANCE,
      }}
    >
      {children}
    </div>
  </div>
);

function segments(text: string, phrases: Array<{ phrase: string; id: string; liftAt: F }>) {
  const marks = phrases.map((p) => ({ ...p, idx: text.indexOf(p.phrase) })).sort((a, b) => a.idx - b.idx);
  const out: Array<{ text: string; mark?: { id: string; liftAt: F } }> = [];
  let cur = 0;
  for (const m of marks) {
    if (m.idx < cur) continue;
    if (m.idx > cur) out.push({ text: text.slice(cur, m.idx) });
    out.push({ text: m.phrase, mark: { id: m.id, liftAt: m.liftAt } });
    cur = m.idx + m.phrase.length;
  }
  if (cur < text.length) out.push({ text: text.slice(cur) });
  return out;
}

/**
 * Non-phrase prompt text. Punctuation glued to a phrase (", " after "KPI
 * returns", the final ".") would Greek into a lone sliver bar, so it fades
 * out instead while the words turn to bars.
 */
const Plain: React.FC<{ text: string; greekFrom: F }> = ({ text, greekFrom }) => {
  const f = useCurrentFrame();
  const m = /^([,.;:]*)([\s\S]*?)([,.;:]*)$/.exec(text)!;
  const fade = 1 - appear(f, greekFrom, 6, ease.linear);
  return (
    <>
      {m[1] ? <span style={{ opacity: fade }}>{m[1]}</span> : null}
      {m[2] ? <GreekText text={m[2]} greekFrom={greekFrom} /> : null}
      {m[3] ? <span style={{ opacity: fade }}>{m[3]}</span> : null}
    </>
  );
};

const TurnBody: React.FC<{ t: ChatTurn; dim: number }> = ({ t, dim }) => {
  const f = useCurrentFrame();
  switch (t.kind) {
    case 'prompt': {
      const segs = segments(t.text, t.phrases);
      return (
        <Bubble anchor="prompt-bubble" opacity={appear(f, t.showFrom, 5, ease.linear) * (1 - 0.4 * dim)}>
          {segs.map((s, i) =>
            s.mark ? (
              <span
                key={i}
                data-anchor={s.mark.id}
                style={{
                  background: tint(C.warning.tint, 1 - appear(f, s.mark.liftAt + 4, 10, ease.linear)), // fades as the copy flies
                  borderRadius: 4,
                  padding: '0 2px',
                  margin: '0 -2px',
                }}
              >
                <GreekText text={s.text} greekFrom={t.greekFrom} />
              </span>
            ) : (
              <Plain key={i} text={s.text} greekFrom={t.greekFrom} />
            ),
          )}
        </Bubble>
      );
    }
    case 'user':
      return (
        <Bubble opacity={1 - 0.4 * dim}>
          {t.greekFrom !== undefined ? <GreekText text={t.text} greekFrom={t.greekFrom} /> : t.text}
        </Bubble>
      );
    case 'agent':
      return (
        <div style={{ opacity: f >= t.greekFrom ? 0.6 : 1 }}>
          <AgentLabel />
          <div style={{ fontSize: LINE, lineHeight: 1.45, color: C.text, ...BALANCE }}>
            <AgentText text={t.text} at={t.at} greekFrom={t.greekFrom} />
          </div>
        </div>
      );
    case 'question': {
      const rAt = t.at + agentRevealFrames(t.text) + 2;
      const chosenP = ui(f, t.chosenAt);
      return (
        <div style={{ opacity: f >= t.greekFrom ? 0.6 : 1 }}>
          <AgentLabel />
          <div style={{ fontSize: LINE, lineHeight: 1.45, color: C.text, ...BALANCE }}>
            <AgentText text={t.text} at={t.at} greekFrom={t.greekFrom} />
          </div>
          {/* The replies' row is reserved from the start so nothing reflows when they land. */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', opacity: f >= rAt ? ui(f, rAt) : 0 }}>
            {t.replies.map((r, i) => (
              <Button
                key={r}
                variant="secondary"
                size="sm"
                label={r}
                pressAt={i === t.chosen ? t.chosenAt : undefined}
                latch
                opacity={i === t.chosen ? 1 - 0.4 * appear(f, t.chosenAt + 8, 9) : 1 - 0.6 * chosenP}
                anchor={`${t.id}-r${i}`}
                style={{ fontSize: TYPE.ui, padding: '6px 12px' }}
              />
            ))}
          </div>
        </div>
      );
    }
    case 'receipt':
      return (
        <div style={{ opacity: 1 - 0.4 * dim }}>
          <Receipt label={<span style={BALANCE}>{t.label.replace(/^✓\s*/, '')}</span>} />
        </div>
      );
  }
};

/** One turn: its height grows 0 → full over 9 f (ease.out), content fades and rises 8 px. */
const TurnSlot: React.FC<{ t: ChatTurn; dim: number; first: boolean }> = ({ t, dim, first }) => {
  const f = useCurrentFrame();
  const g = appear(f, t.at, 9);
  if (g <= 0) return null;
  const fade = t.kind === 'prompt' ? 1 : g;
  return (
    <div style={{ display: 'grid', gridTemplateRows: `${g}fr` }}>
      <div style={{ overflow: g < 1 ? 'hidden' : 'visible', minHeight: 0 }}>
        <div style={{ paddingTop: first ? 0 : 12, paddingBottom: 6, opacity: fade, transform: `translateY(${(1 - g) * 8}px)` }}>
          <TurnBody t={t} dim={dim} />
        </div>
      </div>
    </div>
  );
};

export const KpiChat: React.FC<KpiChatProps> = ({ title, turns, composer, width, height, scale, at, progress }) => {
  const f = useCurrentFrame();
  const p = at === undefined ? 1 : appear(f, at, 9);
  const area = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const sorted = [...turns].sort((a, b) => a.at - b.at);
  const visible = sorted.filter((t) => f >= t.at);

  // Top-anchored until the thread fills; then the newest turn sits at the bottom.
  useLayoutEffect(() => {
    if (!area.current || !thread.current) return;
    const over = thread.current.offsetHeight - area.current.clientHeight;
    thread.current.style.transform = `translateY(${-Math.max(0, over)}px)`;
  });

  const done = progress ? progress.done.filter((d) => f >= d).length : 0;
  const dotsP = progress ? appear(f, progress.from, 9) : 0;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, flex: 'none' }}>
          <AgentGlyph size={11} />
          <span style={{ fontSize: TYPE.ui, fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
          {progress && dotsP > 0 ? (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, opacity: dotsP }}>
              {Array.from({ length: 7 }, (_, i) => {
                const d = progress.done[i];
                const on = i < done ? ui(f, d) : 0;
                return (
                  <span
                    key={i}
                    style={{ width: 6, height: 6, borderRadius: 999, background: on > 0 ? `color-mix(in srgb, ${C.ink} ${on * 100}%, ${C.borderStrong})` : C.borderStrong }}
                  />
                );
              })}
              <span style={{ fontSize: TYPE.label, color: C.muted, marginLeft: 4, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {done} of 7
              </span>
            </span>
          ) : null}
        </div>
        <div ref={area} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <div ref={thread} style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '14px 14px 6px', display: 'flex', flexDirection: 'column' }}>
            {visible.map((t, i) => {
              const next = visible[i + 1];
              const dim = next ? ui(f, next.at) : 0;
              return <TurnSlot key={`${t.kind}-${t.at}`} t={t} dim={dim} first={i === 0} />;
            })}
          </div>
        </div>
        <div style={{ padding: '0 12px 12px', flex: 'none' }}>
          <Composer {...composer} />
        </div>
      </div>
    </div>
  );
};

/**
 * The composer: the shared ChatComposer's look, except the placeholder stays
 * on one line (ellipsis) when the panel narrows to 300 native, instead of
 * wrapping to two and squeezing the thread. Typed text still wraps.
 */
const Composer: React.FC<ChatComposerProps> = ({ placeholder, value, typeFrom, typeTo, sendAt }) => {
  const f = useCurrentFrame();
  const sent = sendAt !== undefined && f >= sendAt + 2;
  const typed = value !== undefined && typeFrom !== undefined && typeTo !== undefined;
  const hasText = !sent && value !== undefined && (!typed || f >= typeFrom!);
  const pressed = sendAt !== undefined && f >= sendAt && f < sendAt + 3;
  return (
    <div
      style={{
        background: C.sunken,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.popout,
        padding: '10px 10px 10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: FONT.sans,
      }}
    >
      <AgentGlyph size={12} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: LINE,
          lineHeight: 1.45,
          color: hasText ? C.text : C.muted,
          minHeight: LINE * 1.45,
          ...(hasText ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
        }}
      >
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
        <ArrowUp size={15} color={C.pane} strokeWidth={2.4} />
      </span>
    </div>
  );
};

/** A token colour at partial strength (keeps hex values in theme.ts). */
function tint(colour: string, strength: number): string {
  return `color-mix(in srgb, ${colour} ${Math.max(0, Math.min(1, strength)) * 100}%, transparent)`;
}
