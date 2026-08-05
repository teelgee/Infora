import type { ReactNode } from 'react';

/**
 * A chat message. The user's turn is a filled, shadowed bubble aligned right;
 * the agent's reply is plain text — the asymmetry is deliberate, so replies read
 * as content rather than as speech.
 */
export interface ChatBubbleProps {
  from?: 'user' | 'agent';
  children: ReactNode;
}
export function ChatBubble(props: ChatBubbleProps): JSX.Element;
