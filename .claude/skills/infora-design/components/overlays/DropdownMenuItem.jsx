import React from 'react';

export function DropdownMenuItem({ active, onClick, children }) {
  return (
    <button type="button" className={active ? 'menu-item active' : 'menu-item'} onClick={onClick}>
      {children}
    </button>
  );
}
