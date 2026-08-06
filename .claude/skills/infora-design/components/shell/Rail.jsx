import React from 'react';

/** The primary nav rail — part of the frame, never a card. */
export function Rail({ collapsed, children }) {
  return <div className={collapsed ? 'rail collapsed' : 'rail'}>{children}</div>;
}
