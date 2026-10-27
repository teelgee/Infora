/**
 * Review UI at native size (master-plan §5.4): ProgressBar4, CommentCard,
 * from 18-round-open.png.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check } from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, TYPE } from '../theme';
import { appear, ui, type F } from '../motion';
import { GreekText } from '../focus';
import { Badge } from './primitives';

// ------------------------------------------------------------------ ProgressBar4

export interface ProgressBar4Props {
  labels: readonly string[];
  /** 1-based index of the current step (steps before it are done). */
  current: number;
  /** Advance current → current + 1 at this frame (`ui`). */
  advanceAt?: F;
  /** 340 native wide, labels only; no meta, no round label. */
  compact?: boolean;
  /** Meta line on the right (full mode only). */
  meta?: React.ReactNode;
  roundLabel?: React.ReactNode;
}

/** Four numbered circles joined by a line; done = black check circle. */
export const ProgressBar4: React.FC<ProgressBar4Props> = ({ labels, current, advanceAt, compact = false, meta, roundLabel }) => {
  const f = useCurrentFrame();
  const adv = advanceAt !== undefined ? ui(f, advanceAt) : 0;
  const cur = advanceAt !== undefined && f >= advanceAt ? current + 1 : current;
  const d = compact ? 20 : 24;
  return (
    <div
      style={{
        width: compact ? 340 : undefined,
        background: compact ? 'transparent' : C.sunken,
        borderRadius: RADIUS.card,
        boxShadow: compact ? undefined : SHADOW.soft,
        padding: compact ? 0 : '18px 28px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        fontFamily: FONT.sans,
        boxSizing: 'border-box',
      }}
    >
      {roundLabel ? <div style={{ fontWeight: 600, fontSize: TYPE.ui, paddingTop: 4 }}>{roundLabel}</div> : null}
      <div style={{ display: 'flex', flex: compact ? 1 : undefined, alignItems: 'flex-start' }}>
        {labels.map((label, i) => {
          const n = i + 1;
          const done = n < cur;
          const isCur = n === cur;
          // Transition emphasis for the step that just flipped.
          const flipping = advanceAt !== undefined && (n === current || n === current + 1) ? adv : 1;
          return (
            <React.Fragment key={label}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: compact ? 70 : 110, flex: 'none' }}>
                <div
                  style={{
                    width: d,
                    height: d,
                    borderRadius: 999,
                    background: done ? C.ink : 'transparent',
                    border: isCur ? `1.5px solid ${C.ink}` : done ? `1.5px solid ${C.ink}` : '1.5px solid transparent',
                    color: done ? '#fff' : isCur ? C.text : C.muted,
                    fontSize: compact ? TYPE.label : TYPE.ui,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    opacity: 0.4 + 0.6 * flipping,
                  }}
                >
                  {done ? <Check size={d * 0.6} strokeWidth={3} /> : n}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: compact ? TYPE.label : TYPE.dense,
                    fontWeight: done || isCur ? 600 : 500,
                    color: done || isCur ? C.text : C.muted,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </div>
              </div>
              {i < labels.length - 1 ? (
                <div style={{ flex: compact ? 1 : 'none', width: compact ? undefined : 90, height: 1.5, background: n < cur ? C.ink : C.borderStrong, marginTop: d / 2, marginLeft: compact ? -24 : -30, marginRight: compact ? -24 : -30 }} />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
      {meta ? <div style={{ marginLeft: 'auto', color: C.text2, fontSize: TYPE.ui, paddingTop: 4 }}>{meta}</div> : null}
    </div>
  );
};

// ------------------------------------------------------------------ CommentCard

export interface CommentCardProps {
  author: string;
  when: string;
  /** e.g. “Conceptual site model” — p.1 */
  quote: string;
  body: string;
  /** Slides in (opacity + translateY 12 → 0) at this frame. */
  at?: F;
  greekBody?: boolean;
  bodySharpFrom?: F;
  bodyGreekFrom?: F;
  /** A code badge exists in the data but is always Greek'd. */
  code?: string;
  answeredAt?: F;
  width?: number;
  /** Render as a flat entry (inside a list) rather than a card. */
  flat?: boolean;
}

/** A review comment: author, code badge (Greek'd), time, quote, body. */
export const CommentCard: React.FC<CommentCardProps> = ({
  author,
  when,
  quote,
  body,
  at,
  greekBody = false,
  bodySharpFrom,
  bodyGreekFrom,
  code = 'S0',
  answeredAt,
  width = 330,
  flat = false,
}) => {
  const f = useCurrentFrame();
  const p = at === undefined ? 1 : appear(f, at, 9);
  if (p <= 0) return null;
  return (
    <div
      style={{
        width,
        background: flat ? 'transparent' : C.pane,
        borderRadius: RADIUS.card,
        boxShadow: flat ? undefined : SHADOW.soft,
        padding: flat ? '4px 0' : 12,
        boxSizing: 'border-box',
        fontFamily: FONT.sans,
        fontSize: TYPE.ui,
        opacity: p,
        transform: `translateY(${(1 - p) * 12}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
        <span style={{ fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{author}</span>
        <span style={{ background: C.info.tint, borderRadius: 999, padding: '1px 8px', fontSize: TYPE.label }}>
          <GreekText text={code} greek />
        </span>
        <span style={{ color: C.muted, fontSize: TYPE.label, whiteSpace: 'nowrap' }}>{when}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
        <span style={{ fontStyle: 'italic', color: C.text2, fontSize: TYPE.ui, whiteSpace: 'nowrap' }}>{quote}</span>
        {answeredAt !== undefined ? (
          <span style={{ marginLeft: 'auto' }}>
            <Badge tone="success" label="Answered" pill at={answeredAt} />
          </span>
        ) : null}
      </div>
      <div style={{ color: C.text, marginTop: 5, lineHeight: 1.45, fontSize: TYPE.dense }}>
        <GreekText text={body} greek={greekBody && bodySharpFrom === undefined} sharpFrom={greekBody ? bodySharpFrom : undefined} greekFrom={bodyGreekFrom} />
      </div>
    </div>
  );
};
