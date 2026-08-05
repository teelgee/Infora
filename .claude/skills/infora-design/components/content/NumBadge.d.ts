import type { ReactNode } from 'react';

/** The 20px numeral/check circle used by suggestions and traces. */
export interface NumBadgeProps {
  /** Not yet done — muted fill instead of near-black. */
  pending?: boolean;
  children: ReactNode;
}
export function NumBadge(props: NumBadgeProps): JSX.Element;
