/**
 * Ask (BUILT-NP ask.tsx, in the cleaned layout of flows D-14), W2 §4.7–4.9:
 *   - single window: the "What ran" rail (VISION live ticks over the BUILT
 *     stage words), the transcript, the composer;
 *   - `narrow`: the same with the source panel open (BUILT-NP source-panel.tsx,
 *     VISION locator + highlight);
 *   - `compact`: the 752 × 832 split shell, no "What ran" column.
 * Native px, plate coordinates (PlateLayer).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { X } from 'lucide-react';
import { AgentGlyph, C, ease, FONT, keyed, pressScale, RADIUS, SHADOW, ui, type F } from '../../shared';
import { WT_ASK, WT_GIR_HL, WT_LOCATOR, WT_PEOPLE, type WtClaim } from '../../data/wrenfield';
import { Caret, caretOn, CitedClaims, ComposerChip, HumanTyped, Shell, StatusPill } from '../shared';
import { Abs, lin, Micro, PlateLayer } from './common';

// ------------------------------------------------------------------ geometry

interface AskGeom {
  railW: number;
  W: number;
  H: number;
  headTop: number;
  headBottom: number;
  headX: number;
  pillRight: number;
  /** Transcript clip (x) and its measure. */
  tx0: number;
  tx1: number;
  mx0: number;
  mx1: number;
  clipBottom: number;
  dest: number;
  empty: number;
  userLabel: number;
  bubble: number;
  agentLabel: number;
  claims: number;
  comp: { x0: number; x1: number; y0: number; y1: number };
  chipsY: number;
  rail: boolean;
}

const SINGLE: AskGeom = {
  railW: 216,
  W: 1536,
  H: 864,
  headTop: 68,
  headBottom: 108,
  headX: 244,
  pillRight: 1500,
  tx0: 520,
  tx1: 1480,
  mx0: 560,
  mx1: 1440,
  clipBottom: 712,
  dest: 124,
  empty: 176,
  userLabel: 168,
  bubble: 180,
  agentLabel: 256,
  claims: 272,
  comp: { x0: 560, x1: 1440, y0: 716, y1: 780 },
  chipsY: 792,
  rail: true,
};
const NARROW: AskGeom = { ...SINGLE, tx1: 1108, mx0: 540, mx1: 1088, comp: { x0: 540, x1: 1088, y0: 716, y1: 780 } };
const COMPACT: AskGeom = {
  railW: 64,
  W: 752,
  H: 832,
  headTop: 68,
  headBottom: 104,
  headX: 84,
  pillRight: 720,
  tx0: 64,
  tx1: 740,
  mx0: 84,
  mx1: 720,
  clipBottom: 678,
  dest: 116,
  empty: 170,
  userLabel: 155,
  bubble: 164,
  agentLabel: 222,
  claims: 238,
  comp: { x0: 84, x1: 724, y0: 690, y1: 754 },
  chipsY: 764,
  rail: false,
};

// ------------------------------------------------------------------ what ran (VISION live ticks; BUILT words)

export type StageState = 'pending' | 'running' | 'complete';
/** Rail timeline: `listAt` = rows appear (all `not started`); per row, the frames it starts running and completes. */
export interface RailTicks {
  listAt: F;
  rows: Array<{ runAt: F; doneAt: F }>;
}

const STATE_WORD: Record<StageState, string> = { pending: 'not started', running: 'running', complete: 'done' };

const Mark: React.FC<{ s: StageState }> = ({ s }) => (
  <svg width={11} height={11} viewBox="0 0 12 12" style={{ display: 'block' }}>
    {s === 'pending' ? <circle cx={6} cy={6} r={4.6} fill="none" stroke={C.muted} strokeWidth={1.3} /> : null}
    {s === 'running' ? (
      <>
        <circle cx={6} cy={6} r={4.6} fill="none" stroke={C.text} strokeWidth={1.3} />
        <path d="M6 1.4 A4.6 4.6 0 0 1 6 10.6 Z" fill={C.text} />
      </>
    ) : null}
    {s === 'complete' ? <circle cx={6} cy={6} r={5.2} fill={C.text} /> : null}
  </svg>
);

export const WhatRan: React.FC<{ ticks?: RailTicks }> = ({ ticks }) => {
  const f = useCurrentFrame();
  const listed = ticks && f >= ticks.listAt;
  return (
    <Abs x={232} y={120} w={240} h={720} style={{ background: C.sunken, borderRadius: RADIUS.control, fontFamily: FONT.sans }}>
      <div style={{ position: 'absolute', left: 18, top: 14 }}>
        <Micro>{WT_ASK.railHead}</Micro>
      </div>
      {!listed ? (
        <div style={{ position: 'absolute', left: 18, right: 18, top: 36, fontSize: 12, lineHeight: 1.6, color: C.muted }}>
          No plan has been recorded yet. This rail shows what actually ran, so it stays empty until the run reports.
        </div>
      ) : (
        <div style={{ position: 'absolute', left: 14, right: 14, top: 34, opacity: ui(f, ticks!.listAt) }}>
          {WT_ASK.railStages.map((stage, i) => {
            const r = ticks!.rows[i];
            const s: StageState = f >= r.doneAt ? 'complete' : f >= r.runAt ? 'running' : 'pending';
            return (
              <div key={stage} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 4px', fontSize: 12.5, lineHeight: '17px', color: s === 'pending' ? C.muted : s === 'complete' ? C.text : C.text2 }}>
                <span style={{ width: 12, flex: 'none', alignSelf: 'flex-start', paddingTop: 3, display: 'flex', justifyContent: 'center' }}>
                  <Mark s={s} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>{stage}</span>
                <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{STATE_WORD[s]}</span>
              </div>
            );
          })}
        </div>
      )}
    </Abs>
  );
};

// ------------------------------------------------------------------ working shimmer

/** The built `Working…` with a slow light sweep (never a spinner). */
export const Working: React.FC = () => {
  const f = useCurrentFrame();
  const pos = 120 - (((f % 42) + 42) % 42) / 42 * 140;
  return (
    <span
      style={{
        fontSize: 15,
        lineHeight: '23px',
        backgroundImage: `linear-gradient(90deg, ${C.muted} 0%, ${C.muted} 40%, ${C.faint} 50%, ${C.muted} 60%, ${C.muted} 100%)`,
        backgroundSize: '300% 100%',
        backgroundPosition: `${pos}% 0`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {WT_ASK.working}
    </span>
  );
};

// ------------------------------------------------------------------ answer footer (BUILT-NP completion-footer.tsx, ask.tsx 365–440)

export interface FooterTimes {
  openAt: F;
  footerAt: F;
  honestyAt: F;
  detailsAt: F;
  runAt: F;
}

export const AnswerFooter: React.FC<{ t: FooterTimes; footer: string; runLine: string }> = ({ t, footer, runLine }) => {
  const f = useCurrentFrame();
  const o = (at: F) => ui(f, at);
  if (f < t.openAt) return null;
  return (
    <div style={{ fontFamily: FONT.sans }}>
      <div style={{ margin: '4px 0 2px', opacity: o(t.openAt) }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            border: '1px solid rgba(20,20,20,.09)',
            background: C.neutral50,
            borderRadius: 999,
            padding: '2px 10px',
            fontSize: 12.5,
            lineHeight: '19px',
            color: C.text2,
          }}
        >
          {WT_ASK.openInEditor}
        </span>
      </div>
      <div style={{ marginTop: 12, paddingTop: 9, borderTop: `1px solid ${C.border}`, fontSize: 12.5, lineHeight: '18px', color: C.muted, opacity: o(t.footerAt) }}>{footer}</div>
      <div style={{ marginTop: 5, fontSize: 12, lineHeight: '17px', color: C.muted, opacity: o(t.honestyAt) }}>{WT_ASK.honesty}</div>
      <div style={{ marginTop: 5, fontSize: 12, lineHeight: '17px', color: C.text2, textDecoration: 'underline', textUnderlineOffset: 3, opacity: o(t.detailsAt) }}>{WT_ASK.details}</div>
      <div style={{ marginTop: 5, fontSize: 12, lineHeight: '17px', color: C.muted, opacity: o(t.runAt), display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 8 }}>▶</span>
        {runLine}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ source panel (BUILT-NP source-panel.tsx)

/** W2 §4.8: a right column inside the pane, x 1120–1524, y 108–852, hairline at its left. */
export const SourcePanel: React.FC<{ at: F; hlAt: F }> = ({ at, hlAt }) => {
  const f = useCurrentFrame();
  const o = ui(f, at);
  if (o <= 0) return null;
  const hl = lin(f, hlAt, 8);
  return (
    <Abs x={1120} y={108} w={404} h={744} style={{ borderLeft: `1px solid ${C.border}`, background: C.pane, opacity: o, fontFamily: FONT.sans, boxSizing: 'border-box' }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 0 20px', borderBottom: `1px solid ${C.border}`, boxSizing: 'border-box' }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.text }}>WA-GEO-GIR-004 · v2</span>
        <StatusPill tone="success" label="Live" />
        <span style={{ marginLeft: 'auto', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={14} strokeWidth={1.8} color={C.muted} />
        </span>
      </div>
      <div style={{ position: 'absolute', left: 20, top: 164 - 108 - 8, fontSize: 12, lineHeight: '16px', color: C.muted }}>{WT_LOCATOR}</div>
      <div style={{ position: 'absolute', left: 20, top: 186 - 108, width: 352, fontSize: 14.5, lineHeight: '24px', color: C.text2 }}>
        {WT_GIR_HL.map((s, i) =>
          s.hl ? (
            <span key={i} style={{ background: `rgba(248,239,221,${hl})`, borderRadius: 2, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', boxShadow: hl > 0 ? `0 0 0 2px rgba(248,239,221,${hl})` : undefined, color: C.text }}>
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
    </Abs>
  );
};

// ------------------------------------------------------------------ the screen

export interface AskScreenProps {
  seat: 'RACHEL' | 'ELEANOR';
  compact?: boolean;
  /** The question, as it ends up in the bubble. */
  question: string;
  /** Composer focused (ring + caret) from here. */
  focusAt?: F;
  /** Typed into the composer. */
  typed?: { from: F; seed: number };
  /** The composer already holds the question (time compression), caret blinking. */
  prefilled?: boolean;
  /** Send: the button presses (Enter or click). */
  sendAt?: F;
  /** User bubble fades in; the composer clears. */
  bubbleAt?: F;
  /** `INFORA AGENT` + `Working…`. */
  workingAt?: F;
  /** Claims stream from here (4 c/f). */
  answerFrom?: F;
  claims: WtClaim[];
  footer?: FooterTimes;
  footerText?: string;
  runLine?: string;
  ticks?: RailTicks;
  /** Transcript scroll (wide), e.g. 60 px over 2191–2210. */
  scroll?: { from: F; to: F; by: number };
  /** The source panel: opens at `at` (one 5 f crossfade with the reflow); narrow transcript scroll; highlight. */
  panel?: { clickAt: F; at: F; hlAt: F; narrowScroll: number; claim: number; ref: string };
  /** Send button hover (cursor over it). */
  sendHover?: boolean;
}

const Transcript: React.FC<AskScreenProps & { g: AskGeom; scrollY: number; active?: { claim: number; ref: string; at: F } }> = (p) => {
  const f = useCurrentFrame();
  const { g } = p;
  const sent = p.bubbleAt !== undefined && f >= p.bubbleAt;
  const working = p.workingAt !== undefined && f >= p.workingAt && (p.answerFrom === undefined || f < p.answerFrom);
  const answering = p.answerFrom !== undefined && f >= p.answerFrom;
  const who = WT_PEOPLE[p.seat].first.toUpperCase();
  const mw = g.mx1 - g.mx0;
  return (
    <Abs x={g.tx0} y={g.headBottom + 1} w={g.tx1 - g.tx0} h={g.clipBottom - g.headBottom - 1} style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: -(g.headBottom + 1) - p.scrollY, width: g.tx1 - g.tx0, height: 2000 }}>
        {/* destination row (T-295) */}
        <Abs x={g.mx0 - g.tx0} y={g.dest} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.muted, height: 24, whiteSpace: 'nowrap' }}>
          Write answers to
          <ComposerChip label="▤ Choose a destination" />
        </Abs>
        {!sent ? (
          <Abs x={g.mx0 - g.tx0} y={g.empty} w={Math.min(mw, 760)} style={{ fontSize: 13, lineHeight: 1.55, color: C.muted }}>
            Ask about the project — answers are grounded on its library, with the sources inline. To draft into a document, open it in the Editor and use its chat.
          </Abs>
        ) : (
          <>
            <Abs x={g.mx0 - g.tx0} y={g.userLabel - 7} w={mw} style={{ textAlign: 'right', opacity: ui(f, p.bubbleAt!) }}>
              <Micro>{who}</Micro>
            </Abs>
            <Abs x={g.mx0 - g.tx0} y={g.bubble} w={mw} style={{ display: 'flex', justifyContent: 'flex-end', opacity: ui(f, p.bubbleAt!) }}>
              <div style={{ maxWidth: '78%', background: C.sunken, boxShadow: SHADOW.popout, borderRadius: RADIUS.control, padding: '10px 15px', fontSize: 14, lineHeight: '21px', color: C.text, boxSizing: 'border-box' }}>
                {p.question}
              </div>
            </Abs>
          </>
        )}
        {working || answering ? (
          <>
            <Abs x={g.mx0 - g.tx0} y={g.agentLabel - 7} style={{ opacity: ui(f, p.workingAt ?? p.answerFrom!) }}>
              <Micro>{WT_ASK.agentLabel}</Micro>
            </Abs>
            <Abs x={g.mx0 - g.tx0} y={g.claims} w={mw} style={{ fontFamily: FONT.sans }}>
              {working ? (
                <Working />
              ) : (
                <>
                  <CitedClaims claims={p.claims} from={p.answerFrom!} pillStagger={3} activeRef={p.active} pillSize={11.5} style={{ fontSize: 15, lineHeight: '23px', color: C.text2 }} />
                  {p.footer ? <AnswerFooter t={p.footer} footer={p.footerText ?? ''} runLine={p.runLine ?? ''} /> : null}
                </>
              )}
            </Abs>
          </>
        ) : null}
      </div>
    </Abs>
  );
};

const Composer: React.FC<AskScreenProps & { g: AskGeom }> = (p) => {
  const f = useCurrentFrame();
  const { g } = p;
  const sent = p.bubbleAt !== undefined && f >= p.bubbleAt;
  const focused = p.focusAt !== undefined && f >= p.focusAt && !sent;
  const hasText = !sent && (p.prefilled || (p.typed !== undefined && f >= p.typed.from));
  const chipSources = WT_ASK.sourcesChip[p.seat];
  let value: React.ReactNode;
  if (sent) value = <span style={{ color: C.muted }}>{WT_ASK.placeholder}</span>;
  else if (p.prefilled)
    value = (
      <>
        {p.question}
        <Caret visible={caretOn(f, p.focusAt ?? 0)} />
      </>
    );
  else if (p.typed && f >= p.typed.from) value = <HumanTyped text={p.question} from={p.typed.from} seed={p.typed.seed} caretUntil={p.sendAt ?? Infinity} />;
  else
    value = (
      <>
        {focused ? <Caret visible={caretOn(f, p.focusAt!)} /> : null}
        <span style={{ color: C.muted }}>{WT_ASK.placeholder}</span>
      </>
    );
  const w = g.comp.x1 - g.comp.x0;
  return (
    <>
      <Abs
        x={g.comp.x0}
        y={g.comp.y0}
        w={w}
        style={{
          minHeight: g.comp.y1 - g.comp.y0,
          boxSizing: 'border-box',
          background: C.sunken,
          borderRadius: 12,
          boxShadow: focused ? `${SHADOW.popout}, 0 0 0 1px rgba(20,20,20,.14)` : SHADOW.popout,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 10px 0 18px',
          fontFamily: FONT.sans,
        }}
      >
        <AgentGlyph size={13} colour={C.text2} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '21px', color: C.text, padding: '8px 0' }}>{value}</span>
        <span
          style={{
            width: 32,
            height: 32,
            flex: 'none',
            borderRadius: 999,
            background: hasText ? (p.sendHover ? '#000' : C.ink) : C.faint,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${pressScale(f, p.sendAt)})`,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 14 14">
            <path d="M7 11.5 V2.8 M3 6.5 L7 2.5 L11 6.5" stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </Abs>
      <Abs x={g.comp.x0} y={g.chipsY} style={{ display: 'flex', gap: 8 }}>
        <ComposerChip label={`◑ ${WT_ASK.lens}`} />
        <ComposerChip label={chipSources} />
        <ComposerChip label="▤ From the library" />
      </Abs>
    </>
  );
};

export const AskScreen: React.FC<AskScreenProps> = (p) => {
  const f = useCurrentFrame();
  const base = p.compact ? COMPACT : SINGLE;
  const wideScroll = p.scroll ? keyed(f, [p.scroll.from, p.scroll.to], [0, p.scroll.by], ease.inOut) : 0;
  const panelP = p.panel ? ui(f, p.panel.at) : 0;
  const active = p.panel ? { claim: p.panel.claim, ref: p.panel.ref, at: p.panel.at } : undefined;
  return (
    <Shell seat={p.seat} nav="Ask" width={base.W} height={base.H}>
      <PlateLayer railW={base.railW} width={base.W} height={base.H}>
        {/* header line under the topbar */}
        <Abs x={base.railW} y={base.headTop} w={base.W - base.railW - 12} h={base.headBottom - base.headTop} style={{ borderBottom: `1px solid ${C.border}`, boxSizing: 'border-box' }} />
        <Abs x={base.headX} y={base.headTop} h={base.headBottom - base.headTop} style={{ display: 'flex', alignItems: 'center', fontFamily: FONT.sans, fontSize: 13, whiteSpace: 'nowrap' }}>
          <b style={{ fontSize: 14, color: C.text }}>Ask</b>
          <span style={{ color: C.muted }}>&nbsp;· {WT_ASK.header}</span>
        </Abs>
        <div style={{ position: 'absolute', right: base.W - base.pillRight, top: (base.headTop + base.headBottom) / 2 - 9.5 }}>
          <StatusPill tone="success" label={WT_ASK.groundedPill} />
        </div>
        {base.rail ? <WhatRan ticks={p.ticks} /> : null}
        {panelP < 1 ? (
          <div style={{ opacity: 1 - panelP }}>
            <Transcript {...p} g={base} scrollY={wideScroll} active={active} />
            <Composer {...p} g={base} />
          </div>
        ) : null}
        {panelP > 0 ? (
          <div style={{ opacity: panelP }}>
            <Transcript {...p} g={NARROW} scrollY={p.panel!.narrowScroll} active={active} />
            <Composer {...p} g={NARROW} />
          </div>
        ) : null}
        {p.panel ? <SourcePanel at={p.panel.at} hlAt={p.panel.hlAt} /> : null}
      </PlateLayer>
    </Shell>
  );
};
