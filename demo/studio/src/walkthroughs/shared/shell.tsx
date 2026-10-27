/**
 * The persistent app shell for every seat (walkthroughs master-plan §3),
 * copied from 02-plan.png, 18-round-open.png, 26-library.png and 09-editor.png.
 * Native 1536 × 864; native coordinates equal the screenshots' CSS px (the
 * extra 96 px of width goes to the main pane). Split windows use 752 × 832
 * with the collapsed (64 px) rail.
 *
 * Rail elements are absolutely positioned at the screenshots' y values, so a
 * director can author cursor targets straight off the PNGs:
 *   nav row n (project view) centre = (108, 185 + 39n)   — `navPoint(item)`
 *   user chip                       = x 10–206, y (H − 71) → (H − 12)
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import {
  Archive,
  Bell,
  BookMarked,
  BookOpen,
  Check,
  ClipboardCheck,
  ClipboardList,
  History,
  House,
  LayoutTemplate,
  LockOpen,
  MessageSquare,
  PenLine,
  Snowflake,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react';
import { C, FONT, pressScale, RADIUS, SHADOW, type F } from '../../shared';
import { WT_PEOPLE, PROJECT, type WtPerson, type WtPersonKey } from '../../data/wrenfield';
import { NATIVE, SPLIT_NATIVE } from './geometry';
import { StatusPill } from './ui';

type IconC = React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;

export type NavItem =
  | 'Home'
  | 'Ask'
  | 'Editor'
  | 'Plan'
  | 'Project library'
  | 'Review'
  | 'Notifications'
  | 'Sandbox'
  | 'Tools'
  | 'Knowledge'
  | 'History';
export type WorkspaceNavItem = 'Home' | 'Ask' | 'Editor' | 'Personal sandbox' | 'Tools' | 'Your knowledge' | 'Playbooks';

export const PROJECT_NAV: Array<{ label: NavItem; Icon: IconC; drill?: boolean }> = [
  { label: 'Home', Icon: House },
  { label: 'Ask', Icon: Sparkles },
  { label: 'Editor', Icon: PenLine },
  { label: 'Plan', Icon: ClipboardList },
  { label: 'Project library', Icon: BookOpen, drill: true },
  { label: 'Review', Icon: ClipboardCheck },
  { label: 'Notifications', Icon: Bell },
  { label: 'Sandbox', Icon: Archive, drill: true },
  { label: 'Tools', Icon: Wrench },
  { label: 'Knowledge', Icon: BookMarked },
  { label: 'History', Icon: History },
];

/** Workspace nav (§3.6). `Playbooks` applies the CONTEXT ruling (built label "Kept apps"; flagged §7). */
export const WORKSPACE_NAV: Array<{ label: WorkspaceNavItem; Icon: IconC }> = [
  { label: 'Home', Icon: House },
  { label: 'Ask', Icon: Sparkles },
  { label: 'Editor', Icon: PenLine },
  { label: 'Personal sandbox', Icon: Archive },
  { label: 'Tools', Icon: Wrench },
  { label: 'Your knowledge', Icon: BookOpen },
  { label: 'Playbooks', Icon: LayoutTemplate },
];

/** Rail geometry (native). */
export const RAIL = {
  w: 216,
  collapsedW: 64,
  navY0: 185,
  navPitch: 39,
  navRowH: 32,
  collapsedNavY0: 86,
  workspaceNavY0: 143,
} as const;

/** The pane and its fixed bars (native). */
export const PANE = {
  x: 216,
  y: 12,
  right: 12,
  bottom: 12,
  topbarH: 56,
  workspaceTopbarH: 45,
  secondBarH: 52,
  /** The 1120 content box, centred in the pane: x 310–1430; its text area x 342–1398. */
  contentW: 1120,
} as const;

/** Native centre of a project-nav row (expanded or collapsed rail). */
export function navPoint(item: NavItem, collapsed = false): { x: number; y: number } {
  const n = PROJECT_NAV.findIndex((r) => r.label === item);
  return collapsed ? { x: 32, y: RAIL.collapsedNavY0 + RAIL.navPitch * n } : { x: 100, y: RAIL.navY0 + RAIL.navPitch * n };
}
/** Native centre of a workspace-nav row. */
export function workspaceNavPoint(item: WorkspaceNavItem): { x: number; y: number } {
  const n = WORKSPACE_NAV.findIndex((r) => r.label === item);
  return { x: 100, y: RAIL.workspaceNavY0 + RAIL.navPitch * n };
}

const person = (seat: WtPersonKey | WtPerson): WtPerson => (typeof seat === 'string' ? WT_PEOPLE[seat] : seat);

export interface ShellProps {
  seat: WtPersonKey | WtPerson;
  /** Active rail item. Flip it on the click frame (§2.7). `null` lights nothing (editor, cycle, status and record screens). */
  nav: NavItem | WorkspaceNavItem | null;
  /** 1536 × 864 (single window) or 752 × 832 (split). */
  width?: number;
  height?: number;
  /** Collapsed 64 px rail; defaults to true when width < 1000. */
  collapsed?: boolean;
  /** `project` (default): project pill + owner; `{ crumb }`: app pages (W4); `workspace`: the org's own environment. */
  topbar?: 'project' | { crumb: string[] } | 'workspace';
  /** The workspace rail and topbar (W4's playbook shelf, §3.6). */
  workspace?: boolean;
  /** Notifications unread count (pill when > 0; a 7 px dot on the bell in the collapsed rail). */
  unread?: number;
  /** The unread count appears (ui, 5 f) from this frame. */
  unreadAt?: F;
  /** Rail item under the cursor (hover fill). */
  hoverNav?: NavItem | WorkspaceNavItem;
  /** Rail item pressed at a frame (hover fill then the active flip is the director's). */
  /** Under the topbar: e.g. <EditorBar/>. */
  secondBar?: React.ReactNode;
  /** Main pane body tone (pages: pane; the editor: sunken). */
  contentTone?: 'pane' | 'sunken';
  /** Extra items at the topbar's right, before the role badge. */
  topbarRight?: React.ReactNode;
  children?: React.ReactNode;
  /** Full-plate overlay (modal scrims cover the rail too, as in 07-bind.png). */
  overlay?: React.ReactNode;
}

/** The persistent shell. Everything inside is native px. */
export const Shell: React.FC<ShellProps> = ({
  seat,
  nav,
  width = NATIVE.w,
  height = NATIVE.h,
  collapsed,
  topbar = 'project',
  workspace = false,
  unread = 0,
  unreadAt,
  hoverNav,
  secondBar,
  contentTone = 'pane',
  topbarRight,
  children,
  overlay,
}) => {
  const p = person(seat);
  const frame = useCurrentFrame();
  const unreadO = unreadAt === undefined ? 1 : Math.min(1, Math.max(0, (frame - unreadAt) / 5));
  const isCollapsed = collapsed ?? width < 1000;
  const railW = isCollapsed ? RAIL.collapsedW : RAIL.w;
  const ws = workspace || topbar === 'workspace';
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        background: C.frame,
        overflow: 'hidden',
        fontFamily: FONT.sans,
        fontSize: 14,
        color: C.text,
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {isCollapsed ? (
        <CollapsedRail person={p} nav={nav} hoverNav={hoverNav} unread={unreadO > 0 ? unread : 0} unreadO={unreadO} height={height} />
      ) : ws ? (
        <WorkspaceRail person={p} nav={nav as WorkspaceNavItem | null} hoverNav={hoverNav} height={height} />
      ) : (
        <ProjectRail person={p} nav={nav as NavItem | null} hoverNav={hoverNav} unread={unreadO > 0 ? unread : 0} unreadO={unreadO} height={height} />
      )}
      <div
        style={{
          position: 'absolute',
          left: railW,
          top: PANE.y,
          width: width - railW - PANE.right,
          height: height - PANE.y - PANE.bottom,
          background: C.pane,
          borderRadius: RADIUS.pane,
          boxShadow: SHADOW.pane,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Topbar person={p} topbar={ws ? 'workspace' : topbar} right={topbarRight} />
        {secondBar}
        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            background: contentTone === 'sunken' ? C.sunken : C.pane,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>
      {overlay ? <div style={{ position: 'absolute', inset: 0 }}>{overlay}</div> : null}
    </div>
  );
};

// ------------------------------------------------------------------ rail parts

const RailWordmark: React.FC = () => (
  <>
    <div style={{ position: 'absolute', left: 18, top: 16, height: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, background: C.ink, flex: 'none' }} />
      <span style={{ fontFamily: FONT.serif, fontSize: 21, letterSpacing: 0.2, lineHeight: '22px', color: C.text, transform: 'translateY(-1px)' }}>
        Infora
      </span>
    </div>
    <span style={{ position: 'absolute', left: 186, top: 8, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.muted }}>
      «
    </span>
  </>
);

const NavRow: React.FC<{
  y: number;
  label: string;
  Icon: IconC;
  active: boolean;
  hover: boolean;
  drill?: boolean;
  count?: number;
  countO?: number;
  collapsed?: boolean;
}> = ({ y, label, Icon, active, hover, drill, count, countO = 1, collapsed }) => (
  <div
    style={{
      position: 'absolute',
      left: 8,
      width: collapsed ? 48 : 200,
      top: y - RAIL.navRowH / 2,
      height: RAIL.navRowH,
      boxSizing: 'border-box',
      padding: collapsed ? 0 : '0 10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: collapsed ? 'center' : undefined,
      gap: 9,
      borderRadius: RADIUS.control,
      background: active ? C.frameActive : hover ? C.frameHover : undefined,
      color: active ? C.text : C.text2,
      fontSize: 14.5,
      fontWeight: active ? 700 : 500,
      whiteSpace: 'nowrap',
    }}
  >
    <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: active ? C.text : C.muted }}>
      <Icon size={16} strokeWidth={1.8} />
    </span>
    {collapsed ? null : <span>{label}</span>}
    {!collapsed && drill ? <span style={{ marginLeft: 'auto', fontSize: 8, color: C.muted, marginRight: 2 }}>▶</span> : null}
    {count && count > 0 ? (
      collapsed ? (
        <span style={{ position: 'absolute', top: 5, right: 12, width: 7, height: 7, borderRadius: 999, background: C.ink, opacity: countO }} />
      ) : (
        <span
          style={{
            marginLeft: 'auto',
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            boxSizing: 'border-box',
            borderRadius: 999,
            background: C.ink,
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontVariantNumeric: 'tabular-nums',
            opacity: countO,
          }}
        >
          {count}
        </span>
      )
    ) : null}
  </div>
);

const UserChip: React.FC<{ person: WtPerson; height: number; line: string; twoLine?: boolean }> = ({ person: p, height, line }) => (
  <div
    style={{
      position: 'absolute',
      left: 10,
      width: 196,
      bottom: 12,
      boxSizing: 'border-box',
      padding: '9px 10px',
      minHeight: 45,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: C.frameHover,
      borderRadius: RADIUS.control,
    }}
  >
    <RoundAvatar initials={p.initials} size={30} />
    <div style={{ lineHeight: 1.25, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{p.name}</div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{line}</div>
    </div>
  </div>
);

/** Near-black circle with white initials (user chip, people rows). */
export const RoundAvatar: React.FC<{ initials: string; size?: number; tone?: 'ink' | 'sunken'; ring?: boolean; style?: React.CSSProperties }> = ({
  initials,
  size = 28,
  tone = 'ink',
  ring,
  style,
}) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: 999,
      background: tone === 'ink' ? C.ink : C.sunken,
      color: tone === 'ink' ? '#fff' : C.text2,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: Math.round(size * 0.4 * 2) / 2,
      fontWeight: 600,
      flex: 'none',
      boxSizing: 'border-box',
      border: ring ? `2px solid ${C.pane}` : undefined,
      fontFamily: FONT.sans,
      letterSpacing: 0.2,
      ...style,
    }}
  >
    {initials}
  </span>
);

const ProjectRail: React.FC<{ person: WtPerson; nav: NavItem | null; hoverNav?: string; unread: number; unreadO: number; height: number }> = ({ person: p, nav, hoverNav, unread, unreadO, height }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: RAIL.w, height }}>
    <RailWordmark />
    {/* Org line (y ≈ 68). Owner seats run it together, as captured in 18 and 26. */}
    {p.owner ? (
      <div style={{ position: 'absolute', left: 20, top: 59, fontSize: 12.5, fontWeight: 600, color: C.text2, whiteSpace: 'nowrap' }}>
        {p.org} All projects <span style={{ fontSize: 8, color: C.muted }}>▶</span>
      </div>
    ) : (
      <div style={{ position: 'absolute', left: 20, right: 20, top: 59, display: 'flex', gap: 10, fontSize: 12.5, color: C.text2, whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{p.org}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 500, flex: 'none' }}>
          All projects <span style={{ fontSize: 8, color: C.muted }}>▶</span>
        </span>
      </div>
    )}
    {/* Project switcher (y 88–150). */}
    <div
      style={{
        position: 'absolute',
        left: 10,
        top: 88,
        width: 196,
        height: 62,
        boxSizing: 'border-box',
        padding: '8px 12px',
        background: C.frameHover,
        borderRadius: RADIUS.control,
        lineHeight: 1.3,
      }}
    >
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8, color: C.muted, fontWeight: 500 }}>Project</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, width: 150, lineHeight: '17.5px', marginTop: 1 }}>{PROJECT}</div>
      <span style={{ position: 'absolute', right: 12, top: 33, fontSize: 9, color: C.muted }}>▼</span>
    </div>
    {PROJECT_NAV.map((r, n) => (
      <NavRow
        key={r.label}
        y={RAIL.navY0 + RAIL.navPitch * n}
        label={r.label}
        Icon={r.Icon}
        drill={r.drill}
        active={r.label === nav}
        hover={r.label === hoverNav && r.label !== nav}
        count={r.label === 'Notifications' ? unread : undefined}
        countO={unreadO}
      />
    ))}
    <UserChip person={p} height={height} line={p.chipLine} />
  </div>
);

const WorkspaceRail: React.FC<{ person: WtPerson; nav: WorkspaceNavItem | null; hoverNav?: string; height: number }> = ({ person: p, nav, hoverNav, height }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: RAIL.w, height }}>
    <RailWordmark />
    <div
      style={{
        position: 'absolute',
        left: 10,
        top: 60,
        width: 196,
        height: 48,
        boxSizing: 'border-box',
        padding: '8px 12px',
        background: C.frameHover,
        borderRadius: RADIUS.control,
        lineHeight: 1.3,
      }}
    >
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8, color: C.muted, fontWeight: 500 }}>Workspace</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{p.org}</div>
      <span style={{ position: 'absolute', right: 12, top: 19, fontSize: 9, color: C.muted }}>▼</span>
    </div>
    {WORKSPACE_NAV.map((r, n) => (
      <NavRow
        key={r.label}
        y={RAIL.workspaceNavY0 + RAIL.navPitch * n}
        label={r.label}
        Icon={r.Icon}
        active={r.label === nav}
        hover={r.label === hoverNav && r.label !== nav}
      />
    ))}
    <UserChip person={p} height={height} line={p.org} />
  </div>
);

const CollapsedRail: React.FC<{ person: WtPerson; nav: NavItem | WorkspaceNavItem | null; hoverNav?: string; unread: number; unreadO: number; height: number }> = ({
  person: p,
  nav,
  hoverNav,
  unread,
  unreadO,
  height,
}) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: RAIL.collapsedW, height }}>
    <span style={{ position: 'absolute', left: 23, top: 18, width: 18, height: 18, borderRadius: 4, background: C.ink }} />
    {PROJECT_NAV.map((r, n) => (
      <NavRow
        key={r.label}
        collapsed
        y={RAIL.collapsedNavY0 + RAIL.navPitch * n}
        label={r.label}
        Icon={r.Icon}
        active={r.label === nav}
        hover={r.label === hoverNav && r.label !== nav}
        count={r.label === 'Notifications' ? unread : undefined}
        countO={unreadO}
      />
    ))}
    <div style={{ position: 'absolute', left: 8, width: 48, bottom: 12, height: 46, borderRadius: RADIUS.control, background: C.frameHover, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <RoundAvatar initials={p.initials} size={30} />
    </div>
  </div>
);

// ------------------------------------------------------------------ topbar

/** The outlined project pill (topbar left). */
export const ProjectPill: React.FC<{ label?: string }> = ({ label = PROJECT }) => (
  <span
    style={{
      display: 'inline-block',
      border: '1px solid rgba(20,20,20,.09)',
      borderRadius: 999,
      padding: '2px 10px',
      fontSize: 13,
      lineHeight: '19px',
      fontWeight: 600,
      color: C.text2,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </span>
);

const Topbar: React.FC<{ person: WtPerson; topbar: ShellProps['topbar']; right?: React.ReactNode }> = ({ person: p, topbar, right }) => {
  if (topbar === 'workspace') {
    return (
      <div
        style={{
          height: PANE.workspaceTopbarH,
          flex: 'none',
          boxSizing: 'border-box',
          padding: '0 20px 0 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderBottom: `1px solid ${C.border}`,
          fontSize: 12.5,
          color: C.text2,
          whiteSpace: 'nowrap',
        }}
      >
        <b style={{ fontWeight: 600, color: C.text2 }}>{p.org}</b>
        <span>— workspace · the organisation’s own environment</span>
        <span style={{ marginLeft: 'auto' }}>
          <StatusPill tone="neutral" label="Org-private — no project context reachable here" />
        </span>
      </div>
    );
  }
  return (
    <div
      style={{
        height: PANE.topbarH,
        flex: 'none',
        boxSizing: 'border-box',
        padding: '0 20px 0 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        borderBottom: `1px solid ${C.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      <ProjectPill />
      {topbar === 'project' || topbar === undefined ? (
        <span style={{ color: C.text2, fontSize: 13 }}>· Owner: Trentmoor Energy</span>
      ) : (
        <span style={{ color: C.muted, fontSize: 13 }}>
          {topbar.crumb.map((c, i) => (
            <React.Fragment key={i}>
              {i === 0 ? '· ' : ' / '}
              {i === topbar.crumb.length - 1 ? <b style={{ color: C.text2, fontWeight: 600 }}>{c}</b> : c}
            </React.Fragment>
          ))}
        </span>
      )}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {right}
        <StatusPill tone={p.badge === 'Owner' ? 'info' : 'success'} label={p.badge} />
      </span>
    </div>
  );
};

// ------------------------------------------------------------------ editor bar (§3.5)

export interface EditorBarProps {
  /** `Calder & Hale — project sandbox` (the built quirk), or the shared sandbox's own name. */
  location: string;
  docRef?: string;
  title: string;
  /** The presence stack (W3). */
  presence?: React.ReactNode;
  frozen?: boolean;
  /** Promote shows only when bound. */
  bound?: boolean;
  promotePressAt?: F;
  /** Hover fill on a control: 'freeze' | 'promote' | 'release'. */
  hover?: 'freeze' | 'promote' | 'release';
  /** Replace the right-hand pill (default `No document controls`). */
  pill?: React.ReactNode;
  /** Max title width before the ellipsis (split: 190). */
  titleMax?: number;
}

/** The editor's second bar (y 68–120): location chip / reference + title; presence, Freeze, Promote, the controls pill. */
export const EditorBar: React.FC<EditorBarProps> = ({ location, docRef, title, presence, frozen, bound, promotePressAt, hover, pill, titleMax }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        height: PANE.secondBarH,
        flex: 'none',
        boxSizing: 'border-box',
        padding: '0 20px 0 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderBottom: `1px solid ${C.border}`,
        fontSize: 13,
        whiteSpace: 'nowrap',
        background: C.pane,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid rgba(20,20,20,.09)',
          background: C.neutral50,
          borderRadius: 999,
          padding: '2px 10px',
          fontSize: 12.5,
          lineHeight: '19px',
          color: C.text2,
        }}
      >
        <Archive size={13} strokeWidth={1.8} />
        {location}
      </span>
      <span style={{ color: C.muted }}>/</span>
      {docRef ? <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.text2 }}>{docRef}</span> : null}
      <span style={{ fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, maxWidth: titleMax }}>{title}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flex: 'none' }}>
        {presence}
        {frozen ? (
          <>
            <StatusPill tone="warning" label="Checked out — frozen, read-only" />
            <QuietAction icon={<LockOpen size={14} strokeWidth={1.8} />} label="Release" hover={hover === 'release'} />
          </>
        ) : (
          <>
            <QuietAction icon={<Snowflake size={14} strokeWidth={1.8} />} label="Freeze" hover={hover === 'freeze'} />
            {bound ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: hover === 'promote' ? '#000' : C.ink,
                  color: '#fff',
                  borderRadius: RADIUS.control,
                  padding: '4px 18px',
                  lineHeight: '19px',
                  fontWeight: 700,
                  fontSize: 13,
                  transform: `scale(${pressScale(f, promotePressAt)})`,
                }}
              >
                <Upload size={14} strokeWidth={2} />
                Promote
              </span>
            ) : null}
            {pill ?? <StatusPill tone="neutral" label="No document controls" />}
          </>
        )}
      </span>
    </div>
  );
};

/** An icon + label control with no border (Freeze, Coding scheme, Metadata…). */
export const QuietAction: React.FC<{ icon?: React.ReactNode; label: React.ReactNode; hover?: boolean; size?: number; style?: React.CSSProperties }> = ({
  icon,
  label,
  hover,
  size = 13,
  style,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: '4px 10px',
      borderRadius: RADIUS.control,
      fontSize: size,
      lineHeight: '19px',
      fontWeight: 500,
      color: hover ? C.text : C.text2,
      background: hover ? C.sunken : undefined,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {icon}
    {label}
  </span>
);

// ------------------------------------------------------------------ editor body (§3.5)

export interface PanelTabs {
  active: 'Review' | 'Chat' | 'Comments' | 'Checks';
  review?: number;
  comments?: number;
  checks?: number;
  /** Right-aligned muted note, e.g. `1 pending in the document`. */
  pending?: string;
}

export interface EditorBodyProps {
  /** The canvas below the format bar (put a <Prose> in it). */
  canvas: React.ReactNode;
  /** The side panel below the tabs. */
  panel?: React.ReactNode;
  tabs?: PanelTabs;
  /** Panel width: 348 (single window) or 300 (split). Defaults from the pane width. */
  panelW?: number;
  /** Hide the format bar (e.g. a review PDF). */
  formatBar?: boolean;
  /** Canvas vertical scroll in native px (ease it yourself; ≤ 600 px per move). */
  scrollY?: number;
  /** Narrow (split) metrics: tighter canvas padding. */
  narrow?: boolean;
}

const FORMAT: Array<string> = ['B', 'I', '|', 'H2', 'H3', '|', '• List', '1. List', '❝ Quote', '|', 'Comment', '✓ Check'];

/** The editor's sunken band with the canvas pane and the side panel. Put it inside a Shell with contentTone="sunken". */
export const EditorBody: React.FC<EditorBodyProps> = ({ canvas, panel, tabs = { active: 'Chat' }, panelW, formatBar = true, scrollY = 0, narrow }) => {
  const pw = panelW ?? (narrow ? 300 : 348);
  return (
    <div style={{ flex: 1, display: 'flex', gap: 8, padding: 12, minWidth: 0, boxSizing: 'border-box' }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          background: C.pane,
          borderRadius: RADIUS.pane,
          boxShadow: SHADOW.soft,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: narrow ? '22px 22px 0' : '42px 52px 0',
          boxSizing: 'border-box',
        }}
      >
        {formatBar ? <FormatBar narrow={narrow} /> : null}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
          <div style={{ transform: `translateY(${-scrollY}px)` }}>{canvas}</div>
        </div>
      </div>
      <div
        style={{
          width: pw,
          flex: 'none',
          background: C.pane,
          borderRadius: RADIUS.pane,
          boxShadow: SHADOW.soft,
          padding: '18px 18px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <PanelTabBar tabs={tabs} />
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>{panel}</div>
      </div>
    </div>
  );
};

const FormatBar: React.FC<{ narrow?: boolean }> = ({ narrow }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: narrow ? 10 : 22,
      padding: narrow ? '0 0 8px' : '0 0 10px',
      borderBottom: `1px solid ${C.border}`,
      color: C.text2,
      fontSize: 12.5,
      lineHeight: '24px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    }}
  >
    {(narrow ? ['B', 'I', '|', 'H2', 'H3', '|', 'Comment'] : FORMAT).map((x, i) =>
      x === '|' ? (
        <span key={i} style={{ width: 1, height: 14, background: C.border, flex: 'none' }} />
      ) : (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: x === 'B' ? 700 : 500, fontStyle: x === 'I' ? 'italic' : undefined }}>
          {x === 'Comment' ? <MessageSquare size={13} strokeWidth={1.8} /> : null}
          {x === '✓ Check' ? <Check size={13} strokeWidth={2} /> : null}
          {x === '✓ Check' ? 'Check' : x}
        </span>
      ),
    )}
    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flex: 'none' }}>
      <span style={{ background: C.sunken, borderRadius: 6, padding: '0 9px', color: C.text, fontWeight: 500 }}>Write</span>
      <span style={{ padding: '0 9px' }}>Preview</span>
    </span>
  </div>
);

export const PanelTabBar: React.FC<{ tabs: PanelTabs }> = ({ tabs }) => {
  const list: Array<{ k: PanelTabs['active']; label: string }> = [];
  if (tabs.review !== undefined) list.push({ k: 'Review', label: `Review (${tabs.review})` });
  list.push({ k: 'Chat', label: 'Chat' });
  list.push({ k: 'Comments', label: tabs.comments ? `Comments (${tabs.comments})` : 'Comments' });
  list.push({ k: 'Checks', label: tabs.checks ? `Checks (${tabs.checks})` : 'Checks' });
  return (
    <div style={{ display: 'flex', gap: tabs.pending ? 16 : 22, borderBottom: `1px solid ${C.border}`, marginBottom: 20, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flex: 'none' }}>
      {list.map((t) => (
        <span
          key={t.k}
          style={{
            paddingBottom: 9,
            color: t.k === tabs.active ? C.text : C.text2,
            borderBottom: t.k === tabs.active ? `2px solid ${C.ink}` : '2px solid transparent',
            marginBottom: -1,
          }}
        >
          {t.label}
        </span>
      ))}
      {tabs.pending ? (
        <span style={{ marginLeft: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: C.muted, fontWeight: 500, fontSize: 11.5, alignSelf: 'center', paddingBottom: 9 }}>
          {tabs.pending}
        </span>
      ) : null}
    </div>
  );
};

/** The 640-max serif prose column (Source Serif 4 15.5 / 1.72), centred in the canvas. */
export const Prose: React.FC<{ children: React.ReactNode; width?: number; style?: React.CSSProperties }> = ({ children, width = 640, style }) => (
  <div
    style={{
      maxWidth: width,
      margin: '12px auto 0',
      fontFamily: FONT.serif,
      fontSize: 15.5,
      lineHeight: 1.72,
      color: C.text,
      ...style,
    }}
  >
    {children}
  </div>
);
