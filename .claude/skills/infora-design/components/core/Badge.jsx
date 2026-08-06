import React from 'react';

export const badgeTone = {
  success: 'b-success',
  warning: 'b-warning',
  danger: 'b-danger',
  info: 'b-info',
  neutral: 'b-neutral',
};

/** Status label. Colour never stands alone — always dot + text. */
export function Badge({ tone, dot = true, pill = false, children }) {
  return (
    <span className={['badge', badgeTone[tone], pill ? 'pill' : ''].filter(Boolean).join(' ')}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}
