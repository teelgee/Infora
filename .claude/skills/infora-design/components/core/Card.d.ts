import type { ReactNode } from 'react';

/**
 * A nested card inside a pane (elevation 3). Card-shaped content only — tabular
 * data uses `Table`, which stays flat.
 */
export interface CardProps {
  /** Softer shadow, for cards that repeat in a list. */
  quiet?: boolean;
  className?: string;
  children: ReactNode;
}
export function Card(props: CardProps): JSX.Element;
