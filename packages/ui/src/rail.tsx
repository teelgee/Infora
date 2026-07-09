// T-049 — the left rail per the mockups: wordmark, workspace zone, project
// switcher, the seven-item nav, and the user chip pinned to the foot.
import type { MouseEvent, ReactNode } from 'react';

export type RailNavItem = {
  label: string;
  glyph: string;
  href: string;
  active?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; // routers preventDefault here
};

export function Rail(props: { children: ReactNode }) {
  return (
    <aside className="rail">
      <div className="wordmark">
        In<span>fora</span>
      </div>
      {props.children}
    </aside>
  );
}

export function WorkspaceZone(props: { organisation: string; action?: ReactNode }) {
  return (
    <div className="ws-zone">
      <b>{props.organisation}</b> {props.action}
    </div>
  );
}

export function ProjectSwitcher(props: { name: string; kicker?: string; onClick?: () => void }) {
  return (
    <div className="project-switcher" onClick={props.onClick}>
      <div className="kicker">{props.kicker ?? 'Project'}</div>
      <div className="name">{props.name}</div>
      <div className="chev">▾</div>
    </div>
  );
}

export function RailNav(props: { items: RailNavItem[] }) {
  return (
    <nav>
      {props.items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          className={item.active ? 'active' : undefined}
          onClick={item.onClick}
        >
          <span className="glyph">{item.glyph}</span> {item.label}
        </a>
      ))}
    </nav>
  );
}

export function RailSpacer() {
  return <div className="spacer" />;
}

export function UserChip(props: {
  initials: string;
  name: string;
  org: string;
  onClick?: () => void; // opens personal settings (T-092)
}) {
  return (
    <div
      className="user-chip"
      onClick={props.onClick}
      style={props.onClick !== undefined ? { cursor: 'pointer' } : undefined}
      title={props.onClick !== undefined ? 'Personal settings' : undefined}
    >
      <div className="avatar">{props.initials}</div>
      <div className="who">
        <div className="name">{props.name}</div>
        <div className="org">{props.org}</div>
      </div>
    </div>
  );
}
