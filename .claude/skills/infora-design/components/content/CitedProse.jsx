import React from 'react';
import { SourceChip } from '../core/SourceChip.jsx';

/** Prose with grounding pills after the claims they back. */
export function CitedProse({ paragraphs }) {
  return (
    <div className="prose">
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.text}
          {p.source && <> <SourceChip corpus={p.source.corpus}>{p.source.label}</SourceChip></>}
        </p>
      ))}
    </div>
  );
}
