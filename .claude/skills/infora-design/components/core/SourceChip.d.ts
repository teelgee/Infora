import type { ReactNode } from 'react';

/**
 * A source — the inline pill immediately after the claim it grounds. Library
 * facts are green (▤), external authority is slate (§). Clicking opens the
 * source panel.
 */
export interface SourceChipProps {
  corpus: 'library' | 'authority';
  onClick?: () => void;
  children: ReactNode;
}
export function SourceChip(props: SourceChipProps): JSX.Element;
