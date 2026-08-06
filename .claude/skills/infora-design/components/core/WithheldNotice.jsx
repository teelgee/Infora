import React from 'react';

/** The amber withheld notice — content exists but is out of reach. */
export function WithheldNotice({ children }) {
  return <div className="withheld">{children}</div>;
}
