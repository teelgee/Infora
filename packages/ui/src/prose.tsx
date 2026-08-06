// The document body treatment (semantic.type.body.prose): serif, so the
// canvas reads as the document of record rather than as interface; 560px
// measure, centred regardless of pane width (design-rules.md §A Type / §C).
// Tracked changes ride inside as .ins/.del spans.
import type { ReactNode } from 'react';

export function Prose(props: { children: ReactNode }) {
  return <div className="prose">{props.children}</div>;
}
