import React from 'react';

/** The inline pill after a claim it backs. */
export function SourceChip({ corpus, onClick, children }) {
  const lib = corpus === 'library';
  return (
    <span className={`cite ${lib ? 'lib' : 'auth'}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {lib ? '▤' : '§'} {children}
    </span>
  );
}
