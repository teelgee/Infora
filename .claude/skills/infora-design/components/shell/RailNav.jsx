import React from 'react';

/** The nav item list. Glyphs are Lucide elements. */
export function RailNav({ items }) {
  return (
    <nav className="rail-nav">
      {items.map((it) => (
        <a key={it.label} href={it.href} className={it.active ? 'active' : undefined} onClick={it.onClick} title={it.label}>
          {it.glyph}
          <span className="rail-label">{it.label}</span>
        </a>
      ))}
    </nav>
  );
}
