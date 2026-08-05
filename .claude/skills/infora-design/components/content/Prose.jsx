import React from 'react';

/** The editor canvas document body: capped measure, sans, relaxed leading. */
export function Prose({ children }) {
  return <div className="prose">{children}</div>;
}
