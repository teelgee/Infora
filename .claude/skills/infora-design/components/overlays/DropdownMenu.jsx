import React from 'react';

/** Overlay menu (elevation 4). Must not be clipped by its container. */
export function DropdownMenu({ trigger, open, align = 'start', children }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {trigger}
      {open && (
        <div className="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', [align === 'end' ? 'right' : 'left']: 0 }}>
          {children}
        </div>
      )}
    </div>
  );
}
