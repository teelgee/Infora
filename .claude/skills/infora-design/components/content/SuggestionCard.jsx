import React from 'react';

/** An AI suggestion inline in the editor canvas. */
export function SuggestionCard({ title, children, actions, stale }) {
  return (
    <div className={stale ? 'suggestion stale' : 'suggestion'}>
      <div className="head">
        <span className="num-badge">✓</span>
        <span className="title">{title}</span>
      </div>
      <div className="body">{children}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
