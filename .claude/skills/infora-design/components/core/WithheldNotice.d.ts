import type { ReactNode } from 'react';

/** Amber notice for content deliberately withheld by an ethical wall or grant. */
export interface WithheldNoticeProps {
  children: ReactNode;
}
export function WithheldNotice(props: WithheldNoticeProps): JSX.Element;
