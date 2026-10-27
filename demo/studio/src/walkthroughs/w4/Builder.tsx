/**
 * S6 · the chat-led app builder (VISION layout, flows B.6.2, over the BUILT
 * step titles, sub-lines, questions, answer labels and read-back; RULED Q3).
 * Three zones in the main pane: the agent's conversation (hero), the seven
 * steps it fills, and a live preview of the dashboard it is writing.
 *
 * The agent drives: every answer lands as a receipt in the thread AND as a
 * recorded line in its step; every question that decides who sees what holds
 * an amber `Waiting for you` until Rachel answers it.
 */
import React, { useLayoutEffect, useRef } from 'react';
import { continueRender, delayRender, useCurrentFrame } from 'remotion';
import { ArrowUp, Check } from 'lucide-react';
import { AgentGlyph, C, FONT, RADIUS, SHADOW, Shimmer, appear, ease, fontsReady, pressScale, ui, type F } from '../../shared';
import { WT_TOOLS } from '../../data/wrenfield';
import { Btn, HumanTyped, Segmented, Shell, StatusPill } from '../shared';
import { KpiBody, NARROW } from './KpiDashboard';
import { At, Micro, prog, Probe } from './kit';
import { B } from './timing';

const BD = WT_TOOLS.builder;
const turn = (id: string) => BD.turns.find((t) => t.id === id)!.text;

// ------------------------------------------------------------------ the conversation

type Reply = { labels: readonly string[]; at: F; chosen?: number; chosenAt?: F; fadeAt?: F; anchors?: string[] };
type Turn =
  | { kind: 'user'; at: F; text: string; instant?: boolean }
  | { kind: 'agent'; at: F; text: string; streamAt: F; workingFrom?: F; replies?: Reply }
  | { kind: 'receipt'; at: F; step: number; text: string }
  | { kind: 'card'; at: F };

const TURNS: Turn[] = [
  { kind: 'user', at: B.cut, text: BD.prompt, instant: true },
  { kind: 'agent', at: B.cut, workingFrom: B.cut, streamAt: B.a1, text: turn('A1') },
  { kind: 'receipt', at: B.r1, step: 1, text: turn('R1') },
  { kind: 'agent', at: B.q1, streamAt: B.q1, text: turn('Q1'), replies: { labels: BD.q1Replies, at: B.q1Replies, fadeAt: B.u1 } },
  { kind: 'user', at: B.u1, text: turn('U1') },
  { kind: 'agent', at: B.a2, streamAt: B.a2, text: turn('A2') },
  { kind: 'receipt', at: B.r2, step: 2, text: turn('R2') },
  { kind: 'agent', at: B.a3, streamAt: B.a3, text: turn('A3') },
  { kind: 'receipt', at: B.r3, step: 3, text: turn('R3') },
  {
    kind: 'agent',
    at: B.q2a,
    streamAt: B.q2a,
    text: turn('Q2a'),
    replies: { labels: BD.openReplies, at: B.q2aReplies, chosen: 0, chosenAt: B.everyoneClick, anchors: ['bld-r-everyone'] },
  },
  { kind: 'user', at: B.u2a, text: turn('U2a') },
  {
    kind: 'agent',
    at: B.q2b,
    streamAt: B.q2b,
    text: turn('Q2b'),
    replies: { labels: BD.openReplies, at: B.q2bReplies, chosen: 1, chosenAt: B.trentmoorClick, anchors: ['', 'bld-r-trentmoor'] },
  },
  { kind: 'user', at: B.u2b, text: turn('U2b') },
  { kind: 'agent', at: B.a4, streamAt: B.a4, text: turn('A4') },
  { kind: 'receipt', at: B.r4, step: 4, text: turn('R4') },
  { kind: 'user', at: B.u3, text: turn('U3') },
  { kind: 'agent', at: B.a5, streamAt: B.a5, text: turn('A5') },
  { kind: 'agent', at: B.a6, streamAt: B.a6, text: turn('A6') },
  { kind: 'receipt', at: B.r5, step: 5, text: turn('R5') },
  { kind: 'agent', at: B.q3, streamAt: B.q3, text: turn('Q3'), replies: { labels: BD.q3Replies, at: B.q3Replies, chosen: 0, chosenAt: B.onlyClick, anchors: ['bld-r-only'] } },
  { kind: 'user', at: B.u4, text: turn('U4') },
  { kind: 'receipt', at: B.r6, step: 6, text: turn('R6') },
  { kind: 'agent', at: B.a7, streamAt: B.a7, text: turn('A7') },
  { kind: 'card', at: B.readBack },
];

const Label: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <Micro style={{ textAlign: right ? 'right' : 'left', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5, justifyContent: right ? 'flex-end' : 'flex-start' }}>{children}</Micro>
);

/** Agent text at 3 c/f; the unrevealed tail keeps its layout so nothing reflows. */
const AgentText: React.FC<{ text: string; at: F }> = ({ text, at }) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.min(text.length, Math.floor((f - at + 1) * 3)));
  return (
    <span>
      {text.slice(0, n)}
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </span>
  );
};

const ReplyChips: React.FC<{ r: Reply }> = ({ r }) => {
  const f = useCurrentFrame();
  const o = ui(f, r.at) * (r.fadeAt === undefined ? 1 : 1 - ui(f, r.fadeAt));
  const chose = r.chosenAt !== undefined && f >= r.chosenAt;
  // Unused chips fold away with the fade, so the thread closes up.
  const fold = r.fadeAt === undefined ? 1 : 1 - prog(f, r.fadeAt, r.fadeAt + 9, ease.inOut);
  if (fold <= 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateRows: `${fold}fr` }}>
    <div style={{ overflow: 'hidden', minHeight: 0 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 12, opacity: o }}>
      {r.labels.map((l, i) => {
        const me = r.chosen === i;
        const hover = me && r.chosenAt !== undefined && f >= r.chosenAt - 8 && f < r.chosenAt;
        const pressed = me && chose;
        const dim = chose && !me ? 1 - 0.55 * ui(f, r.chosenAt!) : 1;
        return (
          <span
            key={l}
            data-w4={r.anchors?.[i] || undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 28,
              boxSizing: 'border-box',
              padding: '0 10px',
              borderRadius: 999,
              border: `1px solid ${pressed ? C.ink : C.borderStrong}`,
              background: pressed ? C.active : hover ? C.sunken : C.pane,
              fontSize: 13,
              fontWeight: 500,
              color: C.text,
              whiteSpace: 'nowrap',
              opacity: dim,
              transform: me ? `scale(${pressScale(f, r.chosenAt)})` : undefined,
            }}
          >
            {l}
          </span>
        );
      })}
    </div>
    </div>
    </div>
  );
};

const Bubble: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
    <Label right>Rachel Bowen</Label>
    <div style={{ maxWidth: 443, background: C.sunken, borderRadius: 12, boxShadow: SHADOW.popout, padding: '12px 15px', fontSize: 14.5, lineHeight: '21px', color: C.text }}>{text}</div>
  </div>
);

const ReceiptRow: React.FC<{ step: number; text: string }> = ({ step, text }) => {
  const [head, ...rest] = text.split(' — ');
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 13.5, lineHeight: '19px', color: C.muted }}>
      <span style={{ color: C.success.dot, fontWeight: 700, flex: 'none' }}>✓</span>
      <span>
        <b style={{ color: C.text2, fontWeight: 700 }}>Step {step}</b> · {head}
        {rest.length ? ` — ${rest.join(' — ')}` : ''}
      </span>
    </div>
  );
};

const ReadBackCard: React.FC = () => {
  const f = useCurrentFrame();
  const opened = f >= B.opened;
  const lines = BD.readBack;
  const [nameHead, nameTail] = lines[0].split(' — ');
  const kv = (s: string) => {
    const i = s.indexOf(': ');
    return (
      <>
        <span style={{ color: C.muted }}>{s.slice(0, i + 1)}</span> {s.slice(i + 2)}
      </>
    );
  };
  return (
    <div style={{ background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, padding: '14px 16px 16px', boxShadow: '0 1px 2px rgba(20,20,20,.04)' }}>
      <Micro>{BD.readBackLabel}</Micro>
      <div style={{ fontSize: 13.5, lineHeight: '19px', color: C.text, marginTop: 8 }}>
        <b>{nameHead}</b> <span style={{ color: C.text2 }}>— {nameTail}</span>
      </div>
      <div style={{ display: 'grid', gap: 3, marginTop: 8, fontSize: 13, lineHeight: '18px', color: C.text }}>
        {lines.slice(1).map((l) => (
          <div key={l}>{kv(l)}</div>
        ))}
      </div>
      <div style={{ fontSize: 12, lineHeight: '16px', color: C.muted, marginTop: 10, maxWidth: 520 }}>{BD.readBackNote}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <span data-w4="bld-open" style={{ display: 'inline-flex' }}>
          <Btn
            variant="primary"
            label={opened ? BD.openLatest : BD.checkAndOpen}
            pressAt={B.openClick}
            hover={f >= B.openClick - 8 && f < B.openClick + 6}
            style={{ padding: '6px 16px' }}
          />
        </span>
        <Btn variant="quiet" label={BD.openApp} />
      </div>
    </div>
  );
};

const TurnBody: React.FC<{ t: Turn }> = ({ t }) => {
  const f = useCurrentFrame();
  switch (t.kind) {
    case 'user':
      return <Bubble text={t.text} />;
    case 'agent': {
      const working = t.workingFrom !== undefined && f < t.streamAt;
      return (
        <div>
          <Label>
            <AgentGlyph size={9} colour={C.muted} />
            Agent
          </Label>
          <div style={{ fontSize: 15, lineHeight: '23px', color: C.text }}>
            {working ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: C.text2, fontSize: 14 }}>Working…</span>
                <Shimmer w={180} h={9} />
              </div>
            ) : (
              <AgentText text={t.text} at={t.streamAt} />
            )}
          </div>
          {t.replies ? <ReplyChips r={t.replies} /> : null}
        </div>
      );
    }
    case 'receipt':
      return <ReceiptRow step={t.step} text={t.text} />;
    case 'card':
      return <ReadBackCard />;
  }
};

const GAP: Record<Turn['kind'], number> = { user: 16, agent: 12, receipt: 16, card: 0 };

/** One turn: its height grows 0 → full over 9 f (ease.out) and the content rises 6 px (v04 chat mechanics). */
const TurnSlot: React.FC<{ t: Turn }> = ({ t }) => {
  const f = useCurrentFrame();
  const instant = t.kind === 'user' && t.instant;
  const dur = t.kind === 'card' ? 12 : 9;
  const g = instant ? 1 : appear(f, t.at, dur);
  if (g <= 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateRows: `${g}fr` }}>
      <div style={{ overflow: g < 1 ? 'hidden' : 'visible', minHeight: 0 }}>
        <div style={{ paddingBottom: GAP[t.kind], opacity: instant ? 1 : g, transform: `translateY(${(1 - g) * 6}px)` }}>
          <TurnBody t={t} />
        </div>
      </div>
    </div>
  );
};

/** Top-anchored until the thread fills, then the newest content sits on the bottom edge (y 744). */
const Thread: React.FC = () => {
  const f = useCurrentFrame();
  const area = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const apply = () => {
      if (!area.current || !inner.current) return;
      const over = inner.current.offsetHeight - area.current.clientHeight;
      inner.current.style.transform = `translateY(${-Math.max(0, over)}px)`;
      // Fade the top edge only once older turns are scrolling out of view.
      const mask = over > 0 ? 'linear-gradient(to bottom, transparent 0, #000 28px)' : 'none';
      area.current.style.maskImage = mask;
      area.current.style.webkitMaskImage = mask;
    };
    apply();
    // Measure again once the web fonts are in: the first pass can run on fallback metrics.
    const h = delayRender('w4 thread anchor');
    fontsReady.then(() => {
      apply();
      continueRender(h);
    });
  });
  const visible = TURNS.filter((t) => f >= t.at);
  return (
    <div
      ref={area}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      <div ref={inner} style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
        {visible.map((t, i) => (
          <TurnSlot key={i} t={t} />
        ))}
      </div>
    </div>
  );
};

/** The builder's composer: sunken, ✦, the placeholder; Rachel types into it twice. */
const Composer: React.FC = () => {
  const f = useCurrentFrame();
  const typing: Array<{ focus: F; from: F; seed: number; enter: F; text: string }> = [
    { focus: B.composeClick2, from: B.u1From, seed: B.u1Seed, enter: B.u1Enter, text: turn('U1') },
    { focus: B.composeClick3, from: B.u3From, seed: B.u3Seed, enter: B.u3Enter, text: turn('U3') },
  ];
  const cur = typing.find((x) => f >= x.focus && f < x.enter + 2);
  const armed = cur && f >= cur.from;
  const lastEnter = typing.filter((x) => f >= x.enter && f < x.enter + 4).map((x) => x.enter)[0];
  return (
    <div
      data-w4="bld-compose"
      style={{
        position: 'absolute',
        inset: 0,
        background: C.sunken,
        borderRadius: 12,
        boxShadow: cur ? `${SHADOW.popout}, 0 0 0 1px rgba(20,20,20,.12)` : SHADOW.popout,
      }}
    >
      <AgentGlyph size={13} colour={C.text2} style={{ position: 'absolute', left: 18, top: 16 }} />
      <div style={{ position: 'absolute', left: 42, top: 11, right: 56, fontSize: 14.5, lineHeight: '21px', color: C.text }}>
        {cur ? (
          f >= cur.from ? (
            <HumanTyped text={cur.text} from={cur.from} seed={cur.seed} caretFrom={cur.focus} caretUntil={cur.enter + 2} />
          ) : (
            <HumanTyped text="" from={cur.focus} caretFrom={cur.focus} caretUntil={cur.from} placeholder={BD.composer} />
          )
        ) : (
          <span style={{ color: C.muted }}>{BD.composer}</span>
        )}
      </div>
      <span
        style={{
          position: 'absolute',
          right: 14,
          top: 25,
          width: 30,
          height: 30,
          borderRadius: 999,
          background: armed || lastEnter ? C.ink : C.faint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${pressScale(f, lastEnter)})`,
        }}
      >
        <ArrowUp size={15} color="#fff" strokeWidth={2.4} />
      </span>
    </div>
  );
};

// ------------------------------------------------------------------ the steps

const CURRENT_AT = [B.a1, B.r1, B.r2, B.r3, B.r4, B.r5, B.r6];
const DONE_AT = [B.r1, B.r2, B.r3, B.r4, B.r5, B.r6, B.opened];
const RECORDED: Array<Array<{ text: string; at: F }>> = BD.steps.map((s, i) => {
  const at: F[][] = [[B.r1], [B.r2, B.r6], [B.r3], [B.r4, B.flag], [B.r5], [B.r6], [B.opened]];
  return s.recorded.map((text, j) => ({ text, at: at[i][j] }));
});
const WAITING: Array<[F, F] | null> = [null, [B.q1, B.u1], null, [B.q2a, B.u2b], null, [B.q3, B.u4], null];

/** Open (grid 0fr → 1fr over 12 f) from `open`, closed again from `close`. */
const Detail: React.FC<{ open: F; close?: F; children: React.ReactNode }> = ({ open, close, children }) => {
  const f = useCurrentFrame();
  const g = prog(f, open, open + 12, ease.out) * (close === undefined ? 1 : 1 - prog(f, close, close + 12, ease.inOut));
  if (g <= 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateRows: `${g}fr` }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <div style={{ opacity: g, paddingTop: 10 }}>{children}</div>
      </div>
    </div>
  );
};

const Step2Detail: React.FC = () => {
  const f = useCurrentFrame();
  const d = BD.step2Detail;
  return (
    <div style={{ background: C.pane, borderRadius: 8, border: `1px solid ${C.border}`, padding: '8px 10px' }}>
      <Micro style={{ fontSize: 9.5, marginBottom: 4 }}>{d.head}</Micro>
      {d.rows.map(([col, type], i) => (
        <div key={col} style={{ display: 'flex', height: 18, alignItems: 'center', fontSize: 11.5, color: C.text, opacity: ui(f, B.q1 + 4 * i) }}>
          <span>{col}</span>
          <span style={{ marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 11, color: C.muted }}>{type}</span>
        </div>
      ))}
      {f >= B.a2 ? (
        <div style={{ marginTop: 5, paddingTop: 6, borderTop: `1px solid ${C.border}`, fontSize: 12, lineHeight: '16px', color: C.success.text, opacity: ui(f, B.a2) }}>{d.acceptance}</div>
      ) : null}
    </div>
  );
};

const Step4Detail: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ background: C.pane, borderRadius: 8, border: `1px solid ${C.border}`, padding: '8px 10px', display: 'grid', gap: 6 }}>
      {BD.step4Detail.map((l, i) => {
        const at = [B.u2a, B.u2b][i];
        const [screen, who] = l.split(' — ');
        return (
          <div key={l} style={{ fontSize: 12, lineHeight: '16px', color: C.text, opacity: f >= at ? ui(f, at) : 0 }}>
            {screen}
            <div style={{ color: C.muted }}>{who}</div>
          </div>
        );
      })}
    </div>
  );
};

const Step6Detail: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ background: C.pane, borderRadius: 8, border: `1px solid ${C.border}`, padding: '8px 10px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text2 }}>{BD.step6Detail.label}</div>
      <div style={{ fontSize: 12, lineHeight: '16px', color: C.text, marginTop: 4, opacity: f >= B.promptValue ? ui(f, B.promptValue) : 0 }}>{BD.analysisPrompt}</div>
    </div>
  );
};

const StepRow: React.FC<{ i: number }> = ({ i }) => {
  const f = useCurrentFrame();
  const s = BD.steps[i];
  const done = f >= DONE_AT[i];
  const current = !done && f >= CURRENT_AT[i];
  const doneP = done ? ui(f, DONE_AT[i]) : 0;
  const curP = current ? ui(f, CURRENT_AT[i]) : done ? 1 - doneP : 0;
  const rec = RECORDED[i].filter((r) => f >= r.at);
  const w = WAITING[i];
  const waiting = w && f >= w[0] && f < w[1] + 5;
  const waitO = w ? ui(f, w[0]) * (1 - ui(f, w[1])) : 0;
  const detail = i === 1 ? <Detail open={B.r1} close={B.r2}><Step2Detail /></Detail> : i === 3 ? <Detail open={B.u2a} close={B.r4}><Step4Detail /></Detail> : i === 5 ? <Detail open={B.r5} close={B.r6}><Step6Detail /></Detail> : null;
  return (
    <div
      style={{
        position: 'relative',
        padding: '8px 10px 9px 46px',
        borderRadius: 8,
        background: `rgba(255,255,255,${curP})`,
        boxShadow: curP > 0 ? `0 1px 3px rgba(20,20,20,${0.06 * curP})` : undefined,
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 14,
          top: 8,
          width: 22,
          height: 22,
          borderRadius: 999,
          boxSizing: 'border-box',
          border: `1.5px solid ${done || current ? C.ink : C.faint}`,
          background: done || current ? C.ink : 'transparent',
          color: done || current ? '#fff' : C.muted,
          fontSize: 11.5,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done ? <Check size={12} strokeWidth={3} /> : i + 1}
      </span>
      <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: '20px', color: done || current ? C.text : C.text2 }}>{BD.steps[i].title}</div>
      <div style={{ display: 'grid', marginTop: 1 }}>
        <div style={{ gridArea: '1/1', fontSize: 11.5, lineHeight: '15px', color: C.muted, opacity: rec.length ? 1 - ui(f, rec[0].at) : 1 }}>{s.sub}</div>
        {rec.map((r, j) => (
          <div key={j} style={{ gridArea: '1/1', fontSize: 11.5, lineHeight: '15px', color: C.text2, fontWeight: 500, opacity: ui(f, r.at) * (rec[j + 1] ? 1 - ui(f, rec[j + 1].at) : 1) }}>
            {r.text}
          </div>
        ))}
      </div>
      {s.asks || waiting ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 5 }}>
          {s.asks ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, lineHeight: '12px', fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: C.info.text, whiteSpace: 'nowrap' }}>
              <AgentGlyph size={8} colour={C.info.text} />
              {BD.asksTag}
            </span>
          ) : null}
          {waiting ? (
            <span style={{ opacity: waitO, display: 'inline-flex' }}>
              <StatusPill tone="warning" label={BD.waiting} size={11} />
            </span>
          ) : null}
        </div>
      ) : null}
      {detail}
    </div>
  );
};

const StepColumn: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: C.sunken, borderRadius: RADIUS.lg, padding: '14px 8px 8px', boxSizing: 'border-box', overflow: 'hidden' }}>
    <Micro style={{ marginLeft: 8, marginBottom: 8 }}>{BD.stepsLabel}</Micro>
    <div style={{ display: 'grid', gap: 2 }}>
      {BD.steps.map((_, i) => (
        <StepRow key={i} i={i} />
      ))}
    </div>
  </div>
);

// ------------------------------------------------------------------ the preview

const PREVIEW_SCALE = 330 / NARROW.w; // 0.525

const Preview: React.FC = () => {
  const f = useCurrentFrame();
  const filled = f >= B.previewFill;
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, boxShadow: SHADOW.popout, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 16, top: 14 }}>
        <Micro>{BD.previewLabel}</Micro>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{BD.previewAs}</div>
      </div>
      <div style={{ position: 'absolute', left: 14, top: 54, opacity: filled ? ui(f, B.previewFill) : 0 }}>
        <Segmented options={BD.previewTabs} active={BD.previewTabs[0]} size={11} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 96, bottom: 0, borderTop: `1px solid ${C.border}` }}>
        {filled ? (
          <div style={{ position: 'absolute', left: 17, top: 26, width: NARROW.w, transform: `scale(${PREVIEW_SCALE})`, transformOrigin: '0 0' }}>
            <div style={{ position: 'absolute', left: -NARROW.x0, top: -NARROW.h1 }}>
              <KpiBody layout="narrow" empty fillAt={B.previewFill} flagAt={B.flag} />
            </div>
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 150 }}>
            <div style={{ display: 'grid', gap: 10, opacity: 0.4 }}>
              <Shimmer w={250} h={34} radius={6} />
              <Shimmer w={250} h={70} radius={6} offset={10} />
              <Shimmer w={250} h={70} radius={6} offset={20} />
            </div>
            <div style={{ marginTop: 18, width: 230, textAlign: 'center', fontSize: 12.5, lineHeight: '18px', color: C.muted }}>{BD.previewEmpty}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ the screen

export const Builder: React.FC = () => {
  const f = useCurrentFrame();
  const stepNow = CURRENT_AT.filter((a) => f >= a).length || 1;
  const opened = f >= B.opened;
  return (
    <Shell
      seat="RACHEL"
      nav="Tools"
      topbar={{ crumb: BD.crumb as unknown as string[] }}
      topbarRight={<StatusPill tone="neutral" label={BD.draftBadge} flipTo={{ tone: 'success', label: BD.openBadge, at: B.opened }} />}
      overlay={<Probe tag="bld" />}
    >
      <div style={{ position: 'relative', flex: 1, fontFamily: FONT.sans, color: C.text }}>
        {/* conversation header */}
        <At x={248} y={84} w={568} h={32}>
          <div style={{ display: 'flex', alignItems: 'center', height: 32 }}>
            <AgentGlyph size={12} colour={C.ink} style={{ marginRight: 8 }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{BD.agentPane}</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: opened ? C.success.dot : C.faint }} />
              {BD.stepCounter(stepNow)}
            </span>
          </div>
        </At>
        <At x={232} y={120} w={600} h={1} style={{ background: C.border }} />
        <At x={248} y={132} w={568} h={612}>
          <Thread />
        </At>
        <At x={248} y={756} w={568} h={80}>
          <Composer />
        </At>
        {/* the steps */}
        <At x={848} y={80} w={280} h={760}>
          <StepColumn />
        </At>
        {/* the live preview */}
        <At x={1144} y={80} w={364} h={760}>
          <Preview />
        </At>
      </div>
    </Shell>
  );
};
