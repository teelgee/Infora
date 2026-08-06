import React from 'react';

/** Centred overlay dialog (elevation 4). */
export function Modal({ open, onClose, title, size = 'md', footer, children }) {
  if (!open) return null;
  const widths = { sm: 380, md: 520, lg: 720 };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,20,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40 }} onClick={onClose}>
      <div className="menu" style={{ width: widths[size], padding: 0, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="pane-header">
          <b style={{ fontSize: 'var(--text-dense)' }}>{title}</b>
          <button type="button" className="collapse-toggle" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ padding: 'var(--card-padding)' }}>{children}</div>
        {footer && <div style={{ padding: 'var(--space-3) var(--card-padding)', borderTop: '1px solid var(--border-default)', display: 'flex', gap: 'var(--gap-default)', justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}
