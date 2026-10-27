/**
 * The app shell, recreated from docs/architecture/user-story-screens/09-editor.png
 * at 1440 × 900 native: the frame, the rail, the topbar and an optional second
 * bar. `greekChrome` Greeks every control except labels passed in `keep`.
 */
import React, { createContext, useContext } from 'react';
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
  PenLine,
  Snowflake,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, TYPE } from '../theme';
import { GreekText } from '../focus';
import type { Person } from '../../data/wrenfield';
import { AgentGlyph, Avatar, Badge, Chip, MicroLabel } from './primitives';

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

const NAV: Array<{ label: NavItem; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; more?: boolean }> = [
  { label: 'Home', Icon: House },
  { label: 'Ask', Icon: Sparkles },
  { label: 'Editor', Icon: PenLine },
  { label: 'Plan', Icon: ClipboardList },
  { label: 'Project library', Icon: BookOpen, more: true },
  { label: 'Review', Icon: ClipboardCheck },
  { label: 'Notifications', Icon: Bell },
  { label: 'Sandbox', Icon: Archive, more: true },
  { label: 'Tools', Icon: Wrench },
  { label: 'Knowledge', Icon: BookMarked },
  { label: 'History', Icon: History },
];

interface GreekCtx {
  greek: boolean;
  keep: string[];
}
const ChromeCtx = createContext<GreekCtx>({ greek: false, keep: [] });

/** A chrome label: Greek'd under `greekChrome` unless listed in `keep`. */
export const L: React.FC<{ children: string; style?: React.CSSProperties; force?: boolean }> = ({ children, style, force }) => {
  const { greek, keep } = useContext(ChromeCtx);
  const g = force || (greek && !keep.includes(children));
  return <GreekText text={children} greek={g} style={style} />;
};

export interface AppShellProps {
  seat: Person;
  nav: NavItem;
  topbar: { project: string; owner: string; role: 'Owner' | 'Member' };
  /** The second bar under the topbar (e.g. EditorSecondBar). */
  secondBar?: React.ReactNode;
  greekChrome?: boolean;
  /** Labels kept legible under greekChrome. */
  keep?: string[];
  /** Content area background (default sunken, as in the editor). */
  contentTone?: 'pane' | 'sunken';
  children?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ seat, nav, topbar, secondBar, greekChrome = false, keep = [], contentTone = 'sunken', children }) => (
  <ChromeCtx.Provider value={{ greek: greekChrome, keep }}>
    <div
      style={{
        width: 1440,
        height: 900,
        background: C.frame,
        borderRadius: RADIUS.lg,
        display: 'flex',
        overflow: 'hidden',
        fontFamily: FONT.sans,
        fontSize: TYPE.ui,
        color: C.text,
      }}
    >
      {/* Rail: part of the frame, no fill, no shadow. */}
      <div style={{ width: 216, padding: '12px 10px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 20px', fontFamily: FONT.serif, fontSize: 21 }}>
          <span style={{ width: 18, height: 18, borderRadius: 4, background: C.ink }} />
          <span>Infora</span>
          <span style={{ marginLeft: 'auto', color: C.muted, fontFamily: FONT.sans, fontSize: 12 }}>«</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px 12px', fontSize: 12, fontWeight: 600, color: C.text2 }}>
          <L>{seat.org}</L>
          <span style={{ fontWeight: 500 }}>
            <L>All projects ▸</L>
          </span>
        </div>
        <div style={{ background: C.frameHover, borderRadius: RADIUS.control, padding: '9px 12px', marginBottom: 18 }}>
          <MicroLabel style={{ fontWeight: 600 }}>
            <L>Project</L>
          </MicroLabel>
          <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.35, marginTop: 2, color: C.text }}>
            <L>{topbar.project}</L>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ label, Icon, more }) => {
            const active = label === nav;
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '9px 10px',
                  borderRadius: RADIUS.control,
                  background: active ? C.frameActive : undefined,
                  color: active ? C.text : C.text2,
                  fontSize: 14.5,
                  fontWeight: active ? 700 : 500,
                }}
              >
                <Icon size={16} strokeWidth={1.8} />
                <L>{label}</L>
                {more ? <span style={{ marginLeft: 'auto', fontSize: 9, color: C.muted }}>▸</span> : null}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.frameHover, borderRadius: RADIUS.control, padding: '10px 10px' }}>
          <Avatar initials={seat.initials} size={30} round />
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              <L>{seat.name}</L>
            </div>
            <div style={{ color: C.muted, fontSize: 11.5 }}>
              <L>{seat.chipLine}</L>
            </div>
          </div>
        </div>
      </div>

      {/* Main pane, inset 12 px top/right/bottom, flush left. */}
      <div style={{ flex: 1, padding: '12px 12px 12px 0', display: 'flex', minWidth: 0 }}>
        <div
          style={{
            flex: 1,
            background: C.pane,
            borderRadius: RADIUS.pane,
            boxShadow: SHADOW.pane,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 20px 14px 28px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: '5px 12px', fontWeight: 600, fontSize: 13 }}>
              <L>{topbar.project}</L>
            </span>
            <span style={{ color: C.text2, fontSize: 13 }}>
              · <L>{`Owner: ${topbar.owner}`}</L>
            </span>
            <span style={{ marginLeft: 'auto' }}>
              {greekChrome && !keep.includes(topbar.role) ? (
                <L force>{topbar.role}</L>
              ) : (
                <Badge tone={topbar.role === 'Owner' ? 'info' : 'success'} label={topbar.role} pill />
              )}
            </span>
          </div>
          {secondBar}
          <div style={{ flex: 1, background: contentTone === 'sunken' ? C.sunken : C.pane, display: 'flex', minHeight: 0 }}>{children}</div>
        </div>
      </div>
    </div>
  </ChromeCtx.Provider>
);

/** The editor's second bar: location chip / reference + title; Freeze, Promote (always Greek'd: §4.10). */
export const EditorSecondBar: React.FC<{ docRef: string; title: string }> = ({ docRef, title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 12px 28px', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
    <span style={{ background: C.sunken, borderRadius: 999, padding: '4px 12px', color: C.text2, display: 'flex', gap: 6, alignItems: 'center' }}>
      <Archive size={13} />
      <L>Calder & Hale — project sandbox</L>
    </span>
    <span style={{ color: C.muted }}>/</span>
    <span style={{ fontFamily: FONT.mono, color: C.text2, fontSize: 12.5 }}>
      <L force>{docRef}</L>
    </span>
    <span style={{ fontWeight: 600 }}>
      <L>{title}</L>
    </span>
    <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', color: C.text2 }}>
        <Snowflake size={14} />
        <L force>Freeze</L>
      </span>
      <span
        style={{ background: C.ink, color: '#fff', borderRadius: RADIUS.control, padding: '7px 16px', display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}
      >
        <Upload size={14} />
        <GreekText text="Promote" greek barColour="#57564f" />
      </span>
    </span>
  </div>
);

const FORMAT = ['B', 'I', '|', 'H2', 'H3', '|', '• List', '1. List', 'Quote', '|', 'Comment', 'Check'];

export interface EditorPanesProps {
  /** Canvas content (serif prose). */
  canvas: React.ReactNode;
  /** Side panel content below the tabs; defaults to SideChat. */
  side?: React.ReactNode;
  activeTab?: 'Chat' | 'Comments' | 'Checks';
}

/** The editor's two floating panes: canvas with format bar, 308 px side panel. */
export const EditorPanes: React.FC<EditorPanesProps> = ({ canvas, side, activeTab = 'Chat' }) => (
  <div style={{ flex: 1, display: 'flex', gap: 8, padding: 12, minWidth: 0 }}>
    <div style={{ flex: 1, background: C.pane, borderRadius: RADIUS.pane, boxShadow: SHADOW.soft, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: '18px 56px 10px', borderBottom: `1px solid ${C.border}`, color: C.text2, fontSize: 12.5 }}>
        {FORMAT.map((x, i) =>
          x === '|' ? (
            <span key={i} style={{ width: 1, height: 14, background: C.border }} />
          ) : (
            <span key={i}>
              <L>{x}</L>
            </span>
          ),
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <span style={{ background: C.sunken, borderRadius: 6, padding: '3px 9px' }}>
            <L>Write</L>
          </span>
          <span style={{ padding: '3px 9px' }}>
            <L>Preview</L>
          </span>
        </span>
      </div>
      <div style={{ flex: 1, padding: '12px 80px', overflow: 'hidden', fontFamily: FONT.serif, fontSize: TYPE.prose, lineHeight: 1.75, color: C.prose }}>{canvas}</div>
    </div>
    <div style={{ width: 340, background: C.pane, borderRadius: RADIUS.pane, boxShadow: SHADOW.soft, padding: '16px 18px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 24, borderBottom: `1px solid ${C.border}`, marginBottom: 20, fontSize: 13.5, fontWeight: 600 }}>
        {(['Chat', 'Comments', 'Checks'] as const).map((t) => (
          <span key={t} style={{ paddingBottom: 9, color: t === activeTab ? C.text : C.text2, borderBottom: t === activeTab ? `2px solid ${C.ink}` : '2px solid transparent', marginBottom: -1 }}>
            <L>{t}</L>
          </span>
        ))}
      </div>
      {side ?? <SideChat />}
    </div>
  </div>
);

export interface SideChatProps {
  placeholder?: string;
  value?: React.ReactNode;
  chips?: string[];
  activeChip?: string;
  /** Content above the composer (e.g. a receipt). */
  children?: React.ReactNode;
}

/** The editor side panel's chat: composer and the source-row chips. */
export const SideChat: React.FC<SideChatProps> = ({
  placeholder = 'Ask for a draft into this document',
  value,
  chips = ['From the library', 'Attach a file', 'Prompts', 'Style', 'Web search', 'Sandbox search', 'Model'],
  activeChip = 'From the library',
  children,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ background: C.sunken, borderRadius: RADIUS.lg, boxShadow: SHADOW.popout, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <AgentGlyph size={13} />
      <span style={{ flex: 1, color: value ? C.text : C.text2, fontSize: 13 }}>{value ?? <L>{placeholder}</L>}</span>
      <span style={{ width: 30, height: 30, borderRadius: RADIUS.control, background: C.faint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        ↵
      </span>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {chips.map((c) => (
        <Chip key={c} label={<L>{c}</L>} active={c === activeChip} />
      ))}
    </div>
    {children}
  </div>
);

/** Small receipt row ("✓ …") used in side panels and chat. */
export const Receipt: React.FC<{ label: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ label, size = TYPE.ui, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT.sans, fontSize: size, color: C.text2, fontWeight: 500, ...style }}>
    <span
      style={{
        width: size * 1.35,
        height: size * 1.35,
        borderRadius: 999,
        background: C.success.tint,
        color: C.success.text,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <Check size={size * 0.9} strokeWidth={3} />
    </span>
    {label}
  </div>
);
