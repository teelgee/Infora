import React from 'react';

/** Shimmering placeholder. Never a spinner for content. */
export function Skeleton({ width = '100%', height = 12 }) {
  return <div className="skeleton" style={{ width, height }} />;
}
