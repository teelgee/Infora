import React from 'react';

/** The org/project switcher at the top of the rail. */
export function ProjectSwitcher({ name, initials, onClick }) {
  return (
    <button type="button" className="project-switcher" onClick={onClick}>
      <span className="avatar" style={{ width: 20, height: 20 }}>{initials}</span>
      <span>{name}</span>
      <span className="caret">▾</span>
    </button>
  );
}
