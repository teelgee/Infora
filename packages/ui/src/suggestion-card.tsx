// T-049 — the suggestion card of the Editor's right panel: numbered, titled,
// described, with the resolution actions supplied by the surface (T-053).
import type { ReactNode } from 'react';

export function NumBadge(props: { children: ReactNode }) {
  return <span className="num-badge">{props.children}</span>;
}

export function SuggestionCard(props: {
  number: number;
  title: string;
  description: string;
  active?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className={props.active ? 's-card active' : 's-card'}>
      <div className="s-title">
        <NumBadge>{props.number}</NumBadge> {props.title}
      </div>
      <div className="s-desc">{props.description}</div>
      {props.actions !== undefined && <div className="s-actions">{props.actions}</div>}
    </div>
  );
}
