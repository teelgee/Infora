/**
 * Clip 04's step column: a local variant of the shared StepRail
 * (src/shared/ui/builder.tsx). Same look and the same `step-n` anchors, plus
 * one thing the shared rail lacks: the phrase a PhraseLift carried in stays
 * on its step as a small tinted tag (Rachel's own word, e.g. "Monthly" under
 * "When it runs") until the step ticks and the tag gives way to the step's
 * Greek'd summary. That makes "your words became the steps" legible.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check } from 'lucide-react';
import { Badge, C, FONT, GreekText, MicroLabel, RADIUS, SHADOW, TYPE, appear, ease, ui, type F } from '../../shared';

export interface RailStep {
  n: number;
  title: string;
  summary?: string;
  /** The lifted phrase lands here at `at`. */
  tag?: { text: string; at: F };
  waitingAt?: F;
  doneAt?: F;
}

export interface RailProps {
  steps: RailStep[];
  width: number;
  height: number;
  scale: number;
  at?: F;
  exitAt?: F;
}

export const Rail: React.FC<RailProps> = ({ steps, width, height, scale, at, exitAt }) => {
  const f = useCurrentFrame();
  const p = (at === undefined ? 1 : appear(f, at, 9)) * (exitAt === undefined ? 1 : 1 - appear(f, exitAt, 8, ease.linear));
  if (p <= 0) return null;
  const d = 16;
  const enter = at === undefined ? 1 : appear(f, at, 9);
  return (
    <div style={{ width, height, opacity: p, transform: `translateY(${(1 - enter) * 24}px)` }}>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {steps.map((s, i) => {
            const done = s.doneAt !== undefined && f >= s.doneAt;
            const waiting = !done && s.waitingAt !== undefined && f >= s.waitingAt;
            const tagged = s.tag !== undefined && f >= s.tag.at;
            const active = !done && (waiting || tagged);
            const last = i === steps.length - 1;
            const tickP = done ? ui(f, s.doneAt!) : 0;
            const tagP = s.tag ? appear(f, s.tag.at, 6, ease.linear) * (done ? 1 - tickP : 1) : 0;
            return (
              <div key={s.n} style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
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
                      color: done ? C.pane : active ? C.text : C.muted,
                      fontSize: 9.5,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: `scale(${done ? 0.85 + 0.15 * tickP : 1})`,
                    }}
                  >
                    {done ? <Check size={10} strokeWidth={3.2} /> : s.n}
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
                  <div style={{ position: 'relative', height: 18, marginTop: 1 }}>
                    {/* Rachel's phrase, then (on the tick) the Greek'd summary in its place. */}
                    {tagP > 0 || waiting ? (
                      <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                        {tagP > 0 ? (
                          <span
                            style={{
                              opacity: tagP,
                              fontSize: TYPE.label,
                              lineHeight: '17px',
                              fontWeight: 500,
                              color: C.text,
                              background: C.warning.tint,
                              borderRadius: 4,
                              padding: '0 4px',
                              marginLeft: -4, // text aligns with the title, where the flyer lands
                            }}
                          >
                            {s.tag!.text}
                          </span>
                        ) : null}
                        {waiting ? <Badge tone="warning" label="Waiting for you" pill at={s.waitingAt} size={10.5} /> : null}
                      </div>
                    ) : null}
                    {done && s.summary ? (
                      <div style={{ position: 'absolute', left: 0, top: 1, right: '6%', height: 17, fontSize: TYPE.label, lineHeight: '17px', color: C.muted, overflow: 'hidden', opacity: tickP }}>
                        <GreekText text={s.summary} greek />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
