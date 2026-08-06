import React from 'react';

/** The two-layer shell: rail flush on the frame, panes floating on top. */
export function AppFrame({ rail, width, height, children }) {
  return (
    <div className="app-frame" style={{ width, height }}>
      {rail}
      <div className="frame-content">{children}</div>
    </div>
  );
}
