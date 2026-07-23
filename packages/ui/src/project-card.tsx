// component.projectCard (design-rules.md §B) — "your projects" list on the
// workspace landing. The spec's numbered progress-circle badge (drafted/total)
// is NOT rendered here: MeResponse.participants carries no document/deliverable
// counts and no aggregate endpoint exists yet (packages/contracts/src/endpoints.ts)
// — that's a backend addition, not a styling one. Add it once the data exists;
// the CSS (.project-card .badge-circle) is already in place for it.
import type { MouseEvent, ReactNode } from 'react';

export function ProjectCard(props: {
  title: string;
  subtitle?: string;
  href?: string; // plain <a>, same router-aware-onClick pattern as RailNav — no router dependency in this kit
  onClick?: (event: MouseEvent<HTMLAnchorElement | HTMLDivElement>) => void;
  action?: ReactNode;
}) {
  const inner = (
    <>
      <div>
        <div className="title">{props.title}</div>
        {props.subtitle !== undefined && <div className="subtitle">{props.subtitle}</div>}
      </div>
      {props.action}
    </>
  );
  if (props.href !== undefined) {
    return (
      <a className="project-card" href={props.href} onClick={props.onClick}>
        {inner}
      </a>
    );
  }
  return (
    <div className="project-card" onClick={props.onClick}>
      {inner}
    </div>
  );
}
