import React from 'react';

/** A floating content pane (elevation 2). */
export function Pane({ variant = 'canvas', width, children }) {
  return (
    <div className={`pane ${variant}`} style={width ? { width, minWidth: width } : undefined}>
      {children}
    </div>
  );
}
