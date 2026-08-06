import React from 'react';

/** Filterable picker for long lists — sources, documents, organisations. */
export function Combobox({ value, onChange, options, placeholder, emptyText = 'No matches' }) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const shown = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  const selected = options.find((o) => o.value === value);
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" placeholder={placeholder} value={open ? query : selected?.label ?? ''}
        onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} />
      {open && (
        <div className="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 200, overflow: 'auto' }}>
          {shown.length === 0 && <div className="menu-item" style={{ color: 'var(--text-muted)' }}>{emptyText}</div>}
          {shown.map((o) => (
            <button type="button" key={o.value} className="menu-item"
              onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}>
              <span>{o.label}</span>
              {o.sub && <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 'var(--text-label)' }}>{o.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
