import React from 'react';

/** Primary/secondary/quiet/danger action. One primary per view. */
export function Button({ variant, size, disabled, onClick, type = 'button', title, children, ...rest }) {
  const classes = ['btn', variant, size].filter(Boolean).join(' ');
  return (
    <button className={classes} onClick={onClick} type={type} disabled={disabled} title={title} {...rest}>
      {children}
    </button>
  );
}
