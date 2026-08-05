import type { ReactNode } from 'react';

/**
 * Long-form document body. Sans (not the serif), 15.5px, 1.75 leading, capped
 * at a 560px measure and centred regardless of pane width. Tracked changes use
 * `.ins` / `.del` spans inside it.
 * @startingPoint section="Content" subtitle="Document body with tracked insertions and deletions" viewport="700x200"
 */
export interface ProseProps {
  children: ReactNode;
}
export function Prose(props: ProseProps): JSX.Element;
