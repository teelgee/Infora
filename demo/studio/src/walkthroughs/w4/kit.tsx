/**
 * W4's local kit: absolute native placement, the built card looks, micro
 * labels, and a dev probe that logs the native rect of every `data-w4` anchor
 * (so cursor targets can be snapped to the rendered controls, plan §0).
 */
import React, { useLayoutEffect, useRef } from 'react';
import { continueRender, delayRender, useCurrentFrame } from 'remotion';
import { C, FONT, RADIUS, SHADOW, ease, fontsReady, keyed, type F } from '../../shared';

/** Turn on to log anchors (`PROBE f id x y w h`, native px) during a still render. */
export const PROBE_ON = false;

/** Pane-content origin in native px (rail 216, topbar bottom 68). */
export const ORIGIN = { x: 216, y: 68 } as const;
/** Same for the split windows (collapsed rail 64). */
export const SPLIT_ORIGIN = { x: 64, y: 68 } as const;

/** Absolutely place a child at NATIVE (x, y) inside a pane-content box whose origin is `o`. */
export const At: React.FC<{ x: number; y: number; w?: number; h?: number; o?: { x: number; y: number }; children?: React.ReactNode; style?: React.CSSProperties; a?: string }> = ({
  x,
  y,
  w,
  h,
  o = ORIGIN,
  children,
  style,
  a,
}) => (
  <div data-w4={a} style={{ position: 'absolute', left: x - o.x, top: y - o.y, width: w, height: h, boxSizing: 'border-box', ...style }}>
    {children}
  </div>
);

/** Micro uppercase label (10.5 / 700 / tracking .6). */
export const Micro: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontFamily: FONT.sans, fontSize: 10.5, lineHeight: '13px', letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.muted, ...style }}>{children}</div>
);

/** The built sunken card (`.card`): #efeeeb, radius 10, popout shadow. */
export const Sunken: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties; a?: string }> = ({ children, style, a }) => (
  <div data-w4={a} style={{ background: C.sunken, borderRadius: RADIUS.lg, boxShadow: SHADOW.popout, boxSizing: 'border-box', ...style }}>
    {children}
  </div>
);

/** A white card with the hairline border (tables, charts). */
export const White: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties; a?: string }> = ({ children, style, a }) => (
  <div data-w4={a} style={{ background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, boxSizing: 'border-box', ...style }}>
    {children}
  </div>
);

/** Page scroll from keys: [[from, to], value] pairs, eased inOut. */
export function scrollAt(f: number, start: number, moves: Array<[[F, F], number]>): number {
  let v = start;
  for (const [[a, b], to] of moves) {
    if (f < a) break;
    v = keyed(f, [a, b], [v, to], ease.inOut);
  }
  return v;
}

/** 0 → 1 between two frames (linear by default). */
export const prog = (f: number, a: F, b: F, e: (t: number) => number = ease.linear) => (f <= a ? 0 : f >= b ? 1 : e((f - a) / (b - a)));

/**
 * Dev probe: put it in a Shell's `overlay`. Logs every `[data-w4]` element's
 * rect in the Shell's native px. Two zero-size markers give the origin and
 * the scale, so it works through the camera and the split windows alike.
 */
export const Probe: React.FC<{ tag: string; texts?: string[] }> = ({ tag, texts = [] }) => {
  const f = useCurrentFrame();
  const o = useRef<HTMLDivElement>(null);
  const k = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!PROBE_ON || !o.current || !k.current) return;
    const handle = delayRender('w4 probe');
    fontsReady.then(() => requestAnimationFrame(() => { measure(); continueRender(handle); }));
    const measure = () => {
    if (!o.current || !k.current) return;
    const a = o.current.getBoundingClientRect();
    const b = k.current.getBoundingClientRect();
    const s = (b.left - a.left) / 1000;
    if (!(s > 0)) return;
    const doc = o.current.ownerDocument;
    const root = o.current.parentElement?.parentElement;
    const log = (name: string, el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const x = (r.left - a.left) / s;
      const y = (r.top - a.top) / s;
      // eslint-disable-next-line no-console
      console.log(`PROBE ${tag} f${f} ${name} x${x.toFixed(0)} y${y.toFixed(0)} w${(r.width / s).toFixed(0)} h${(r.height / s).toFixed(0)} cx${(x + r.width / s / 2).toFixed(0)} cy${(y + r.height / s / 2).toFixed(0)}`);
    };
    root?.querySelectorAll('[data-w4]').forEach((el) => log(el.getAttribute('data-w4') ?? '?', el));
    // Shared components carry no anchors: find their controls by exact text.
    for (const t of texts) {
      const all = Array.from(root?.querySelectorAll('span,div,b') ?? []).filter((el) => el.textContent?.trim() === t);
      const deepest = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
      deepest.forEach((el, i) => log(`"${t}"#${i}`, el));
    }
    void doc;
    };
  });
  return (
    <>
      <div ref={o} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }} />
      <div ref={k} style={{ position: 'absolute', left: 1000, top: 0, width: 0, height: 0 }} />
    </>
  );
};
