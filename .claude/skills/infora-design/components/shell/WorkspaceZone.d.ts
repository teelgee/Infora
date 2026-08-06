import type { ReactNode } from 'react';

/** Names the organisation whose workspace is open. */
export interface WorkspaceZoneProps {
  organisation: string;
  action?: ReactNode;
}
export function WorkspaceZone(props: WorkspaceZoneProps): JSX.Element;
