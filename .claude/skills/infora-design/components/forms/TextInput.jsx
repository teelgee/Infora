import React from 'react';

export function TextInput({ value, onChange, placeholder, mono, disabled, onEnter }) {
  return (
    <input
      className={mono ? 'input mono' : 'input'}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onEnter ? (e) => { if (e.key === 'Enter') onEnter(); } : undefined}
    />
  );
}
