import React from 'react';

/** The editor canvas document body: capped measure, serif, relaxed leading. */
export function Prose({ children }) {
  return <div className="prose">{children}</div>;
}
