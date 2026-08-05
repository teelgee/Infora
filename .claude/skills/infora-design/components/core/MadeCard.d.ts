import type { ReactNode } from 'react';

/** Confirms a run wrote a draft, and links into it. */
export interface MadeCardProps {
  title: string;
  subtitle: string;
  action: ReactNode;
}
export function MadeCard(props: MadeCardProps): JSX.Element;
