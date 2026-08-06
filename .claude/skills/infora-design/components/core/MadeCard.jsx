import React from 'react';

/** The "draft created" card linking into the Editor. */
export function MadeCard({ title, subtitle, action }) {
  return (
    <div className="card quiet" style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-loose)' }}>
      <div className="num-badge">⌇</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'var(--text-dense)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: 'var(--text-ui)', color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div>
      </div>
      <span>{action}</span>
    </div>
  );
}
