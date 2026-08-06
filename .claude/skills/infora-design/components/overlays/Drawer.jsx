import React from 'react';

/** Right-edge overlay panel (elevation 4). */
export function Drawer({ open, onClose, title, footer, children }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,20,.28)', zIndex: 40 }} onClick={onClose}>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '92vw', background: 'var(--surface-pane)', boxShadow: 'var(--elevation-4)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="pane-header">
          <b style={{ fontSize: 'var(--text-dense)' }}>{title}</b>
          <button type="button" className="collapse-toggle" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--card-padding)' }}>{children}</div>
        {footer && <div style={{ padding: 'var(--space-3) var(--card-padding)', borderTop: '1px solid var(--border-default)', display: 'flex', gap: 'var(--gap-default)', justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}
