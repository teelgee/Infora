import React from 'react';

/** Attach-context token beside a composer or ask-bar. Never navigation. */
export function Chip({ disabled, onClick, title, children }) {
  return (
    <button type="button" className={disabled ? 'chip disabled' : 'chip'} onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  );
}
