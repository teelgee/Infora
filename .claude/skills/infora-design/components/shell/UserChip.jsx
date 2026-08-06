import React from 'react';

/** The signed-in user, bottom of the rail. */
export function UserChip({ initials, name, onClick }) {
  return (
    <button type="button" className="user-chip" onClick={onClick}>
      <span className="avatar">{initials}</span>
      <span>{name}</span>
    </button>
  );
}
