/**
 * The method statement's PDF rendition as captured in `12`, `17`, `18`, `19`,
 * `22`, `23`, `25`: a white page, Helvetica/Arial 11 px on 13.7 px lines, text
 * column 480 px from x + 57, first line 61 px from the page top.
 *
 * Local variant of the shared PdfPage (whose column is 546 px in Inter, so its
 * line breaks don't match the captures). Anchor looks follow the captures:
 * pending = green tint dashed (`17`), saved = amber tint dashed (`18`),
 * active = slate (`22`, `23`).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, type F } from '../../shared';
import { WT_MST_TEXT } from '../../data/wrenfield';

export type AnchorState = 'pending' | 'saved' | 'active';
export interface Anchor {
  span: string;
  /** Timeline of states (ascending); before the first entry the span is plain. */
  states: Array<[F, AnchorState | null]>;
}

const LOOK: Record<AnchorState, React.CSSProperties> = {
  pending: { background: '#d5ecd9', boxShadow: `inset 0 0 0 1px ${C.success.dot}`, outline: 'none' },
  saved: { background: '#f6e4bf', boxShadow: 'inset 0 0 0 1px #d9b46a' },
  active: { background: '#b9c9d9', boxShadow: `inset 0 0 0 1px ${C.info.text}` },
};
const SELECT_TINT = '#d5ecd9';

const at = (f: number, s: Anchor['states']) => {
  let cur: AnchorState | null = null;
  for (const [fr, st] of s) if (f >= fr) cur = st;
  return cur;
};

function marked(text: string, f: number, anchors: Anchor[], select?: { span: string; from: F; to: F }): React.ReactNode {
  type M = { s: number; e: number; style: React.CSSProperties };
  const ms: M[] = [];
  for (const a of anchors) {
    const i = text.indexOf(a.span);
    const st = at(f, a.states);
    if (i < 0 || !st) continue;
    ms.push({ s: i, e: i + a.span.length, style: LOOK[st] });
  }
  if (select && f >= select.from) {
    const i = text.indexOf(select.span);
    const already = ms.some((m) => m.s === i);
    if (i >= 0 && !already) {
      const p = Math.min(1, (f - select.from) / Math.max(1, select.to - select.from));
      const n = Math.round(select.span.length * p);
      if (n > 0) ms.push({ s: i, e: i + n, style: { background: SELECT_TINT } });
    }
  }
  if (!ms.length) return text;
  ms.sort((a, b) => a.s - b.s);
  const out: React.ReactNode[] = [];
  let k = 0;
  ms.forEach((m, j) => {
    if (m.s < k) return;
    if (m.s > k) out.push(text.slice(k, m.s));
    out.push(
      <span key={j} style={{ ...m.style, borderRadius: 1.5 }}>
        {text.slice(m.s, m.e)}
      </span>,
    );
    k = m.e;
  });
  if (k < text.length) out.push(text.slice(k));
  return out;
}

export const PDF_FONT = 'Helvetica, Arial, sans-serif';

export const PdfDoc: React.FC<{
  version: 'v01' | 'p01' | 'p02';
  anchors?: Anchor[];
  select?: { span: string; from: F; to: F };
  /** Page height (clipped). */
  height?: number;
}> = ({ version, anchors = [], select, height = 940 }) => {
  const f = useCurrentFrame();
  const sections = WT_MST_TEXT[version];
  return (
    <div
      style={{
        width: 660,
        height,
        boxSizing: 'border-box',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(20,20,20,.10)',
        padding: '61px 0 0 57px',
        fontFamily: PDF_FONT,
        fontSize: 11,
        lineHeight: '13.7px',
        color: '#111',
        overflow: 'hidden',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div style={{ width: 480 }}>
        <div style={{ marginBottom: 13.7 }}>{marked(WT_MST_TEXT.pdfFirstLine, f, anchors, select)}</div>
        {sections.map((s, i) => (
          <div key={i} style={{ marginBottom: 13.7 }}>
            {s.heading ? <div>{marked(s.heading, f, anchors, select)}</div> : null}
            {s.text.split('\n').map((l, j) => (
              <div key={j}>{marked(l, f, anchors, select)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
