import React from 'react';

/** Square icon-only button. Always pass an accessible label. */
export function IconButton({ variant, disabled, onClick, title, children, ...rest }) {
  const classes = ['btn', 'icon-btn', variant].filter(Boolean).join(' ');
  return (
    <button className={classes} onClick={onClick} type="button" disabled={disabled} title={title} {...rest}>
      {children}
    </button>
  );
}
