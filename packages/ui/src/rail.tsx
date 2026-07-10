// T-049 — the left rail per the mockups: wordmark, workspace zone, project
// switcher, the seven-item nav, and the user chip pinned to the foot.
// T-099: the switcher is a real menu (workspace ⇄ member projects) and nav
// items can drill down a layer — the Harvey pattern the owner named.
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

export type RailNavChild = { label: string; active?: boolean; onClick: () => void };

export type RailNavItem = {
  label: string;
  glyph: string;
  href: string;
  active?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; // routers preventDefault here
  // drill-down (T-099): a chevron toggles the next layer beneath the item
  onToggle?: () => void;
  expanded?: boolean;
  children?: RailNavChild[];
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

export type SwitcherItem = { label: string; kicker: string; current?: boolean; onSelect: () => void };

export function ProjectSwitcher(props: {
  name: string;
  kicker?: string;
  onClick?: () => void; // simple-click fallback when no items are given
  items?: SwitcherItem[]; // the menu: this workspace + the member projects (T-099)
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        className="project-switcher"
        onClick={props.items !== undefined ? () => setOpen((o) => !o) : props.onClick}
      >
        <div className="kicker">{props.kicker ?? 'Project'}</div>
        <div className="name">{props.name}</div>
        <div className="chev">▾</div>
      </div>
      {open && props.items !== undefined && (
        <div className="switcher-menu">
          {props.items.map((item) => (
            <a
              key={`${item.kicker}:${item.label}`}
              className={item.current ? 'current' : undefined}
              onClick={() => {
                setOpen(false);
                if (!item.current) item.onSelect();
              }}
            >
              <span className="kicker">{item.kicker}</span>
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function RailNav(props: { items: RailNavItem[] }) {
  return (
    <nav>
      {props.items.map((item) => (
        <div key={item.label}>
          <a href={item.href} className={item.active ? 'active' : undefined} onClick={item.onClick}>
            <span className="glyph">{item.glyph}</span> {item.label}
            {item.onToggle !== undefined && (
              <span
                className="drill"
                title={item.expanded ? 'Collapse' : 'Expand'}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  item.onToggle!();
                }}
              >
                {item.expanded ? '▾' : '▸'}
              </span>
            )}
          </a>
          {item.expanded &&
            item.children?.map((child) => (
              <a
                key={child.label}
                className={child.active ? 'sub active' : 'sub'}
                onClick={child.onClick}
              >
                {child.label}
              </a>
            ))}
          {item.expanded && item.children !== undefined && item.children.length === 0 && (
            <a className="sub empty">nothing here yet</a>
          )}
        </div>
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
