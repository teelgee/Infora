/**
 * A PDF rendition page (BUILT renditions `12`, `17`, `18`, `23`, `25`): a white
 * page in the sans PDF face, ~11 px. Used by W1 (the method statement, with
 * comment anchors and the select-to-quote drag) and W2 (GIR page 1 in the
 * document modal). Native px; `scale` shrinks it for the split (W1: 0.46).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT, type F } from '../../shared';

export type AnchorState = 'pending' | 'saved' | 'active';

export interface PdfAnchor {
  /** Exact text on the page (first occurrence is marked). */
  span: string;
  /** A fixed state, or a timeline of states by frame (ascending). Before the first entry the span is unmarked. */
  state: AnchorState | Array<{ from: F; state: AnchorState }>;
}

export interface PdfPageProps {
  /** Body sections: `WT_MST_TEXT.v01 | p01 | p02`, or your own. A section with an empty heading renders its text as the title block. */
  sections: ReadonlyArray<{ heading: string; text: string }>;
  /** First line above everything (`WT_MST_TEXT.pdfFirstLine`). */
  firstLine?: string;
  /** Small running head, left and right (`WT_GIR_PDF_P1.runningHead`). */
  runningHead?: readonly [string, string] | readonly string[];
  /** A cover-style title block (GIR page 1): title 20 px / 600, then muted lines. */
  cover?: { title: string; lines: string[] };
  anchors?: PdfAnchor[];
  /** Select-to-quote drag: the tint grows across `span` from `from` to `to`, then holds. */
  select?: { span: string; from: F; to: F; until?: F };
  /** Page width (W1: 660). */
  width?: number;
  /** Clip height (none by default). */
  height?: number;
  scale?: number;
  fontSize?: number;
  style?: React.CSSProperties;
}

const ANCHOR_LOOK: Record<AnchorState, React.CSSProperties> = {
  pending: { background: C.success.tint, outline: `1px dashed ${C.success.dot}`, outlineOffset: 0 },
  saved: { background: C.warning.tint, outline: `1px dashed ${C.warning.dot}`, outlineOffset: 0 },
  active: { background: C.info.tint, outline: `1px solid ${C.info.text}`, outlineOffset: 0 },
};
const SELECT_TINT = 'rgba(39,74,109,.20)';

function stateAt(f: number, s: PdfAnchor['state']): AnchorState | null {
  if (typeof s === 'string') return s;
  let cur: AnchorState | null = null;
  for (const e of s) if (f >= e.from) cur = e.state;
  return cur;
}

/** Split `text` into plain runs and marked spans. */
function renderMarked(text: string, f: number, anchors: PdfAnchor[], select?: PdfPageProps['select']): React.ReactNode {
  type Mark = { start: number; end: number; node: (t: string) => React.ReactNode };
  const marks: Mark[] = [];
  for (const a of anchors) {
    const i = text.indexOf(a.span);
    const st = stateAt(f, a.state);
    if (i < 0 || !st) continue;
    marks.push({ start: i, end: i + a.span.length, node: (t) => <span style={{ ...ANCHOR_LOOK[st], borderRadius: 2 }}>{t}</span> });
  }
  if (select && f >= select.from && (select.until === undefined || f < select.until)) {
    const i = text.indexOf(select.span);
    if (i >= 0) {
      const p = Math.min(1, (f - select.from) / Math.max(1, select.to - select.from));
      const n = Math.round(select.span.length * p);
      if (n > 0) marks.push({ start: i, end: i + n, node: (t) => <span style={{ background: SELECT_TINT }}>{t}</span> });
    }
  }
  if (!marks.length) return text;
  marks.sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let at = 0;
  marks.forEach((m, k) => {
    if (m.start < at) return; // overlapping marks: first wins
    if (m.start > at) out.push(text.slice(at, m.start));
    out.push(<React.Fragment key={k}>{m.node(text.slice(m.start, m.end))}</React.Fragment>);
    at = m.end;
  });
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export const PdfPage: React.FC<PdfPageProps> = ({ sections, firstLine, runningHead, cover, anchors = [], select, width = 660, height, scale = 1, fontSize = 11, style }) => {
  const f = useCurrentFrame();
  const lh = Math.round(fontSize * 1.27 * 10) / 10;
  return (
    <div style={{ width: width * scale, height: height !== undefined ? height * scale : undefined, overflow: 'hidden', ...style }}>
      <div
        style={{
          width,
          height,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: '0 0',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(20,20,20,.12)',
          padding: '48px 57px 60px',
          boxSizing: 'border-box',
          fontFamily: FONT.sans,
          fontSize,
          lineHeight: `${lh}px`,
          color: '#111',
          overflow: 'hidden',
        }}
      >
        {runningHead ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: C.muted, marginBottom: 18 }}>
            <span>{runningHead[0]}</span>
            <span>{runningHead[1]}</span>
          </div>
        ) : null}
        {cover ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 20, lineHeight: '26px', fontWeight: 600, marginBottom: 8 }}>{cover.title}</div>
            {cover.lines.map((l) => (
              <div key={l} style={{ color: C.text2 }}>
                {l}
              </div>
            ))}
          </div>
        ) : null}
        {firstLine ? <div style={{ marginBottom: lh }}>{renderMarked(firstLine, f, anchors, select)}</div> : null}
        {sections.map((s, i) => (
          <div key={i} style={{ marginBottom: lh }}>
            {s.heading ? <div>{renderMarked(s.heading, f, anchors, select)}</div> : null}
            {s.text.split('\n').map((line, j) => (
              <div key={j}>{renderMarked(line, f, anchors, select)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
