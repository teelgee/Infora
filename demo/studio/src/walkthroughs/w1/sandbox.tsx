/**
 * S2 / S4 / S8 / S10 — the Sandbox page in Calder & Hale's working area
 * (`07-bind` background, `08-sandbox`, `13a` background, `14-promoted`), and
 * its row menu. Native px: the screenshots' x + 48.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import {
  Building2,
  FileText,
  FilePen,
  FilePlus2,
  FolderInput,
  FolderPlus,
  Link2,
  Lock,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Settings,
  Sparkles,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, type F } from '../../shared';
import { WT_DOC } from '../../data/wrenfield';
import { Page, StatusPill } from '../shared';
import { Button, fade, InlineBanner, Micro } from './parts';

export const SANDBOX_DESC =
  'Work in progress across your sandboxes. Separation is by a narrower sandbox, never a wall inside a shared one; the AI never grounds on anything here.';
export const PROMOTED_BANNER =
  'Promoted the QA-accepted frozen version as P01 — later head edits stayed in the sandbox. The round opens when the lead reviewer accepts and acknowledges.';

const SandboxCard: React.FC<{ name: string; line: string; icon: React.ReactNode; selected?: boolean }> = ({ name, line, icon, selected }) => (
  <div
    style={{
      width: 254,
      height: 83,
      boxSizing: 'border-box',
      padding: '13px 14px',
      borderRadius: RADIUS.pane,
      background: C.pane,
      border: selected ? `2px solid ${C.ink}` : `1px solid ${C.border}`,
      boxShadow: selected ? undefined : SHADOW.soft,
      fontSize: 12.5,
      lineHeight: '21px',
      color: C.text2,
    }}
  >
    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginTop: selected ? -1 : 0, marginLeft: selected ? -1 : 0 }}>{name}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: selected ? -1 : 0 }}>
      <Building2 size={13} strokeWidth={1.6} color={C.muted} />
      Calder &amp; Hale
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: selected ? -1 : 0 }}>
      {icon}
      {line}
    </div>
  </div>
);

export interface SandboxProps {
  bound: boolean;
  /** Banner text and its appear frame (ui). */
  banner?: { text: string; at?: F };
  /** The bound state takes over from this frame (unbound before). */
  boundAt?: F;
  /** Row menu open (4 f fade) from `at` to `exitAt`; the hovered item. */
  menu?: { at: F; exitAt?: F; hover?: string; hoverAt?: F };
  /** Hover on the row's Promote action. */
  promoteHover?: boolean;
  promotePressAt?: F;
  kebabHover?: boolean;
}

const ROW_MENU_UNBOUND = [
  { label: 'Open in Editor', Icon: FileText },
  { label: 'Move…', Icon: FolderInput },
  { label: 'Metadata…', Icon: FilePen },
  { label: 'Rename…', Icon: Pencil },
  { label: 'Bind…', Icon: Link2 },
];
const ROW_MENU_BOUND = ROW_MENU_UNBOUND.slice(0, 4);

/** The row's ⋯ menu (`07`): 219 wide, 32 px items, top 18 below the row centre. */
const RowMenu: React.FC<{ rowY: number; bound: boolean; at: F; exitAt?: F; hover?: string; hoverAt?: F }> = ({ rowY, bound, at, exitAt, hover, hoverAt }) => {
  const f = useCurrentFrame();
  const o = fade(f, at, exitAt, 4);
  if (o <= 0) return null;
  const items = bound ? ROW_MENU_BOUND : ROW_MENU_UNBOUND;
  const lit = hover && (hoverAt === undefined || f >= hoverAt) ? hover : undefined;
  return (
    <div
      style={{
        position: 'absolute',
        left: 1169 - 216,
        top: rowY + 18,
        width: 219,
        boxSizing: 'border-box',
        padding: 6,
        background: C.pane,
        borderRadius: RADIUS.control,
        boxShadow: SHADOW.overlay,
        border: `1px solid ${C.border}`,
        opacity: o,
      }}
    >
      {items.map(({ label, Icon }) => (
        <div
          key={label}
          style={{
            height: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 10px',
            borderRadius: 6,
            fontSize: 13,
            color: C.text,
            background: lit === label ? C.sunken : undefined,
          }}
        >
          <Icon size={13} strokeWidth={1.7} color={C.text2} />
          {label}
        </div>
      ))}
    </div>
  );
};

/** The page. Absolute y values follow `07`/`08` (banner shifts everything below by 54). */
export const SandboxPage: React.FC<SandboxProps> = ({ bound: boundProp, banner, boundAt, menu, promoteHover, promotePressAt, kebabHover }) => {
  const f = useCurrentFrame();
  const bound = boundAt !== undefined ? f >= boundAt : boundProp;
  const bO = banner ? fade(f, banner.at) : 0;
  const shift = 54 * bO;
  const rowY = 464 + shift; // row centre (native)
  const swap = boundAt !== undefined ? fade(f, boundAt) : 1;
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <Page>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', height: 38 }}>
          <h1 style={{ margin: 0, fontFamily: FONT.serif, fontSize: 29, fontWeight: 500, lineHeight: '38px', color: C.text, letterSpacing: 0.1 }}>Sandbox</h1>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Button kind="primary" icon={<FilePlus2 size={15} strokeWidth={1.9} />} label="New document" pad="4px 12px" style={{ height: 27, marginRight: 12 }} />
            <Button icon={<Sparkles size={15} strokeWidth={1.7} />} label="Create with AI" style={{ marginRight: 8 }} />
            <Button icon={<Upload size={15} strokeWidth={1.7} />} label="Upload file" style={{ marginRight: 8 }} />
            <Button icon={<Plus size={15} strokeWidth={1.7} />} label="Sandbox" />
          </span>
        </div>
        <div style={{ marginTop: 7, maxWidth: 760, fontSize: 13, lineHeight: '20px', color: C.muted }}>{SANDBOX_DESC}</div>
      </Page>
      {/* Absolute body, so the banner can push it down by 54 exactly. */}
      {banner && bO > 0 ? (
        <div style={{ position: 'absolute', left: 342 - 216, top: 183 - 68, width: 1056, opacity: bO }}>
          <InlineBanner text={banner.text} />
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: 342 - 216, top: 0, width: 1056, transform: `translateY(${shift}px)` }}>
        <Micro style={{ position: 'absolute', top: 223 - 68 - 6, left: 0 }}>Sandboxes</Micro>
        <div style={{ position: 'absolute', top: 240 - 68, left: 0, display: 'flex', gap: 13 }}>
          <SandboxCard name="Personal workspace" line="Personal" icon={<User size={13} strokeWidth={1.6} color={C.muted} />} />
          <SandboxCard name="Calder & Hale — working area" line="Single organisation" icon={<Lock size={13} strokeWidth={1.6} color={C.muted} />} selected />
        </div>
        {/* Toolbar y 348 */}
        <div style={{ position: 'absolute', top: 348 - 68 - 10, left: 0, height: 20, display: 'flex', alignItems: 'center', fontSize: 13, color: C.text2, whiteSpace: 'nowrap' }}>
          <span style={{ color: C.muted, width: 77 }}>1 in scope</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, width: 140 }}>
            <Users size={14} strokeWidth={1.7} />
            Manage access
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, width: 116 }}>
            <FolderPlus size={14} strokeWidth={1.7} />
            New folder
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, width: 87 }}>
            <Settings size={14} strokeWidth={1.7} />
            Settings
          </span>
          <span style={{ color: C.muted }}>Locked to the plan — the tree follows the deliverables</span>
        </div>
        {/* Crumb y 384 */}
        <div style={{ position: 'absolute', top: 384 - 68 - 10, left: 8, height: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.text2, whiteSpace: 'nowrap' }}>
          <span>Calder &amp; Hale — working area</span>
          <span style={{ color: C.faint }}>/</span>
          <span>EEN</span>
          <span style={{ color: C.faint }}>/</span>
          <span style={{ fontWeight: 600, color: C.text }}>WA-EIA-MST-001 — EIA Scoping Method Statement — Land Quality</span>
        </div>
        {/* Table y 408–488 */}
        <div
          style={{
            position: 'absolute',
            top: 408 - 68,
            left: 0,
            width: 1056,
            height: 81,
            boxSizing: 'border-box',
            border: `1px solid ${C.border}`,
            borderRadius: RADIUS.pane,
            background: C.pane,
            fontSize: 13,
          }}
        >
          <div style={{ position: 'relative', height: 32, borderBottom: `1px solid ${C.border}` }}>
            <Micro style={{ position: 'absolute', left: 8, top: 10, letterSpacing: 0.6 }}>Name</Micro>
            <Micro style={{ position: 'absolute', left: bound ? 637 : 766, top: 10, letterSpacing: 0.6 }}>Deliverable</Micro>
            <Micro style={{ position: 'absolute', right: 8, top: 10, letterSpacing: 0.6 }}>Actions</Micro>
          </div>
          <div style={{ position: 'relative', height: 47 }}>
            {/* Unbound row, then the bound row crossfading in (ui) */}
            {(['unbound', 'bound'] as const).map((k) => {
              const o = k === 'bound' ? (bound ? swap : 0) : bound ? 1 - swap : 1;
              if (o <= 0) return null;
              const isB = k === 'bound';
              return (
                <div key={k} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', opacity: o, whiteSpace: 'nowrap' }}>
                  <FileText size={15} strokeWidth={1.5} color={C.muted} style={{ position: 'absolute', left: 27 }} />
                  <span style={{ position: 'absolute', left: 56, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5, color: C.text }}>{isB ? WT_DOC.title : WT_DOC.workingTitle}</span>
                    <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.text2 }}>v0.1</span>
                    <span style={{ fontSize: 11.5, color: C.muted }}>{WT_DOC.draftRow}</span>
                  </span>
                  {isB ? (
                    <>
                      <span style={{ position: 'absolute', left: 637, display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT.mono, fontSize: 12, color: C.text2 }}>
                        <Link2 size={13} strokeWidth={1.8} />
                        {WT_DOC.ref}
                      </span>
                      <span style={{ position: 'absolute', left: 826, display: 'inline-flex', alignItems: 'center', gap: 6, color: C.text2 }}>
                        <LockKeyhole size={14} strokeWidth={1.7} />
                        Freeze
                      </span>
                      <span
                        style={{
                          position: 'absolute',
                          left: 920,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          color: promoteHover ? C.text : C.text2,
                          background: promoteHover ? C.sunken : undefined,
                          borderRadius: 6,
                          padding: '3px 6px',
                          margin: '0 -6px',
                          transform: promotePressAt !== undefined && f >= promotePressAt && f < promotePressAt + 3 ? 'scale(.97)' : undefined,
                        }}
                      >
                        <Send size={14} strokeWidth={1.7} />
                        Promote
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ position: 'absolute', left: 766 }}>
                        <StatusPill tone="neutral" label="Unbound" />
                      </span>
                      <span style={{ position: 'absolute', left: 931, display: 'inline-flex', alignItems: 'center', gap: 6, color: C.text2 }}>
                        <LockKeyhole size={14} strokeWidth={1.7} />
                        Freeze
                      </span>
                    </>
                  )}
                  <span
                    style={{
                      position: 'absolute',
                      left: 1013,
                      width: 28,
                      height: 24,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: kebabHover ? C.sunken : undefined,
                    }}
                  >
                    <MoreHorizontal size={16} strokeWidth={2} color={C.text2} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {menu ? <RowMenu rowY={rowY - 68} bound={bound} at={menu.at} exitAt={menu.exitAt} hover={menu.hover} hoverAt={menu.hoverAt} /> : null}
    </div>
  );
};
