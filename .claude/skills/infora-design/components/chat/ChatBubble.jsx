import React from 'react';

/** A message in the chat panel. */
export function ChatBubble({ from = 'user', children }) {
  return from === 'user'
    ? <div className="bubble mine">{children}</div>
    : <div className="reply">{children}</div>;
}
