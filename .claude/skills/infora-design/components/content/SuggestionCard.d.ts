import type { ReactNode } from 'react';

/**
 * A drafted suggestion awaiting accept/edit/refine/reject, rendered inline in
 * the document flow at popout elevation. May contain tracked-change spans.
 * @startingPoint section="Content" subtitle="Pending suggestion with accept/edit/reject actions" viewport="700x220"
 */
export interface SuggestionCardProps {
  /** State line, e.g. "Suggestion ready · pending your decision". */
  title: string;
  /** The proposed prose. */
  children: ReactNode;
  actions?: ReactNode;
  /** Superseded by a later refine — dimmed, softer shadow. */
  stale?: boolean;
}
export function SuggestionCard(props: SuggestionCardProps): JSX.Element;
