import type { ReactNode } from 'react';

/**
 * The in-context composer at the foot of a chat panel. Filled, soft-cornered,
 * popout elevation — the attach chips sit inside it, on its fill.
 * @startingPoint section="Chat" subtitle="Composer with attach chips and send button" viewport="700x160"
 */
export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  /** A run is in flight — send is disabled. */
  pending?: boolean;
  /** Override the default attach chips. */
  sources?: ReactNode;
}
export function ChatComposer(props: ChatComposerProps): JSX.Element;
