import React from 'react';

/** The output-target chip on the Ask composer. */
export function OutChip({ onRemove, children }) {
  return (
    <span className="out-chip">
      ⌇ {children}
      {onRemove && (
        <span className="x" onClick={onRemove} role="button" aria-label="Remove target">✕</span>
      )}
    </span>
  );
}
