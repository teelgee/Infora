import React from 'react';

/** The organisation label above the rail nav. */
export function WorkspaceZone({ organisation, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-default)', padding: '0 6px 10px' }}>
      <span className="section-label">{organisation}</span>
      {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
    </div>
  );
}
