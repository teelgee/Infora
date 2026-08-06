import React from 'react';

/** Label + control + hint/error. */
export function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
