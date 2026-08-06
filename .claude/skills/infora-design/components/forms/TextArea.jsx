import React from 'react';

export function TextArea({ value, onChange, placeholder, rows = 4, disabled }) {
  return (
    <textarea className="input" value={value} placeholder={placeholder} rows={rows} disabled={disabled}
      onChange={(e) => onChange(e.target.value)} />
  );
}
