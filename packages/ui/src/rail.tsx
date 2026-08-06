// The left rail: wordmark, workspace zone, project switcher, the nav, and
// the user chip pinned to the foot. T-099: the switcher is a real menu
// (workspace ⇄ member projects) and nav items can drill down a layer — the
// Harvey pattern the owner named. Resize + collapse (design-rules.md §B
// NavRail) are new behavior, owned here rather than by call sites, so every
// screen gets them for free.
import { useEffect, useState } from 'react';
import type { MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { DropdownMenu, DropdownMenuItem } from './dropdown-menu';

export type RailNavChild = { label: string; active?: boolean; onClick: () => void };

export type RailNavItem = {
  label: string;
  glyph: ReactNode; // a Lucide icon element (design-rules.md §F.7 — always Lucide, 2px stroke, currentColor)
  href: string;
  active?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; // routers preventDefault here
  // drill-down (T-099): a chevron toggles the next layer beneath the item
  onToggle?: () => void;
  expanded?: boolean;
  children?: RailNavChild[];
};

const WIDTH_KEY = 'infora.rail.width';
const COLLAPSED_KEY = 'infora.rail.collapsed';
const WIDTH_MIN = 160;
const WIDTH_MAX = 420;
const WIDTH_DEFAULT = 216;

function readStoredWidth(): number {
  if (typeof localStorage === 'undefined') return WIDTH_DEFAULT;
  const saved = Number(localStorage.getItem(WIDTH_KEY));
  return saved >= WIDTH_MIN && saved <= WIDTH_MAX ? saved : WIDTH_DEFAULT;
}

function readStoredCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(COLLAPSED_KEY) === '1';
}

export function Rail(props: { children: ReactNode }) {
  const [width, setWidth] = useState(readStoredWidth);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const onGripPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const onMove = (moveEvent: PointerEvent) => {
      setWidth(Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, startWidth + (moveEvent.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <aside className={collapsed ? 'rail collapsed' : 'rail'} style={collapsed ? undefined : { width }}>
      <button
        type="button"
        className="rail-collapse-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '»' : '«'}
      </button>
      <div className="wordmark" title="Infora">
        <span className="mark" />
        <span className="word">
          In<span>fora</span>
        </span>
      </div>
      {props.children}
      {!collapsed && (
        <div className="rail-resize-grip" onPointerDown={onGripPointerDown} title="Drag to resize" />
      )}
    </aside>
  );
}

export function WorkspaceZone(props: { organisation: string; action?: ReactNode }) {
  return (
    <div className="ws-zone" title={props.organisation}>
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
  const trigger = (onClick: (() => void) | undefined) => (
    <div className="project-switcher" onClick={onClick} title={props.name}>
      <div className="kicker">{props.kicker ?? 'Project'}</div>
      <div className="name">{props.name}</div>
      <div className="chev">▾</div>
    </div>
  );

  if (props.items === undefined) return trigger(props.onClick);

  const items = props.items;
  return (
    <DropdownMenu trigger={(toggle) => trigger(toggle)}>
      {items.map((item) => (
        <DropdownMenuItem
          key={`${item.kicker}:${item.label}`}
          active={item.current}
          onClick={() => !item.current && item.onSelect()}
        >
          <span className="kicker">{item.kicker}</span>
          {item.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}

export function RailNav(props: { items: RailNavItem[] }) {
  return (
    <nav>
      {props.items.map((item) => (
        <div key={item.label}>
          <a href={item.href} className={item.active ? 'active' : undefined} onClick={item.onClick} title={item.label}>
            <span className="glyph">{item.glyph}</span> <span className="label">{item.label}</span>
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
      title={props.onClick !== undefined ? `${props.name} — personal settings` : props.name}
    >
      <div className="avatar">{props.initials}</div>
      <div className="who">
        <div className="name">{props.name}</div>
        <div className="org">{props.org}</div>
      </div>
    </div>
  );
}
