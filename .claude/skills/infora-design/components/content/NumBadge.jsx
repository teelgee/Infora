import React from 'react';

/** A small filled circle carrying a numeral or check. */
export function NumBadge({ pending, children }) {
  return <span className="num-badge" style={pending ? { background: 'var(--surface-active)', color: 'var(--text-primary)' } : undefined}>{children}</span>;
}
