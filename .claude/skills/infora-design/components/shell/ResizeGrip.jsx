import React from 'react';

/** Drag handle between the rail and a pane, or between two panes. */
export function ResizeGrip({ onPointerDown }) {
  return (
    <div className="grip" title="Drag to resize" onPointerDown={onPointerDown} role="separator" aria-orientation="vertical">
      <svg width="4" height="18" viewBox="0 0 4 18" aria-hidden="true">
        {[2, 6, 10].map((y) => (
          <React.Fragment key={y}>
            <circle cx="1" cy={y} r="0.9" fill="var(--text-faint)" />
            <circle cx="3" cy={y + 2} r="0.9" fill="var(--text-faint)" />
          </React.Fragment>
        ))}
      </svg>
    </div>
  );
}
