import React from 'react';

/** The ✦ ask bar — presentation only; the surface owns the input. */
export function CommandBar({ hint, onClick, children }) {
  return (
    <div className="command" onClick={onClick}>
      <span className="glyph">✦</span>
      <span className="hint">{children}</span>
      {hint !== undefined && <span style={{ marginLeft: 'auto' }}>{hint}</span>}
    </div>
  );
}
