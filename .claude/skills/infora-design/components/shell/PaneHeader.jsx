import React from 'react';

/** A pane's top bar: location chip, title, primary action. */
export function PaneHeader({ location, title, action }) {
  return (
    <div className="pane-header">
      {location && <span className="location-chip">{location}</span>}
      {location && title && <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-ui)' }}>/</span>}
      {title && <b style={{ fontSize: 'var(--text-ui)', color: 'var(--text-primary)' }}>{title}</b>}
      {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
    </div>
  );
}
