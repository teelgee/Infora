import React from 'react';

/** «/» control that collapses the rail or a panel. */
export function CollapseToggle({ direction = 'left', onClick, label }) {
  return (
    <button type="button" className="collapse-toggle" onClick={onClick} aria-label={label} title={label}>
      {direction === 'left' ? '«' : '»'}
    </button>
  );
}
