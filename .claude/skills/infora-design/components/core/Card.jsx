import React from 'react';

/** Card-shaped content at nested-card elevation. For rows of data use Table. */
export function Card({ quiet, className, children }) {
  return <div className={['card', quiet ? 'quiet' : '', className].filter(Boolean).join(' ')}>{children}</div>;
}
