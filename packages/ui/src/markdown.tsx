// The chat/draft prose renderer (T-088): agent output is markdown-ish —
// paragraphs, headings, emphasis, lists — and reads as formatted text, not a
// single block. Styling rides .md in styles.css so every surface renders it
// the same way.
//
// T-475 — a gap-marker line ("[Gap: …]" on its own paragraph) is drawn as a
// dashed box with a warning glyph and its words, never as ordinary prose. The
// recognising is `parseGapLine`, the one function the editor, the renditions,
// the checker and the promotion gate also use.
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { parseGapLine } from '@infora/contracts';

/** The gap marker as read views draw it. Colour is never the only signal: the
 * box is dashed, the glyph is a warning sign and the words say "Gap". */
export function GapMarkerLine(props: { children: ReactNode }) {
  return (
    <p className="gap-marker" role="note" data-gap>
      <span aria-hidden className="gap-marker-glyph">⚠</span>
      <span className="gap-marker-label">Gap</span>
      <span className="gap-marker-text">{props.children}</span>
    </p>
  );
}

export function Markdown(props: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        components={{
          p: ({ children }) => {
            const only = Array.isArray(children) ? children : [children];
            if (only.length === 1 && typeof only[0] === 'string') {
              const gap = parseGapLine(only[0]);
              if (gap !== null) return <GapMarkerLine>{gap}</GapMarkerLine>;
            }
            return <p>{children}</p>;
          },
        }}
      >
        {props.children}
      </ReactMarkdown>
    </div>
  );
}
