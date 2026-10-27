/**
 * Chapter 3 opening: Eleanor's Sandbox (BUILT t1-13-landing, +48 in x), with
 * the folders only (DEV: the W4 draft row is dropped, W2 §4.5).
 */
import React from 'react';
import { Building2, ChevronRight, Folder, Lock, Plus, Settings, Sparkles, Upload, User, Users, FilePlus2 } from 'lucide-react';
import { C, FONT, RADIUS } from '../../shared';
import { Btn, Page, PageHeader, SectionLabel } from '../shared';

const SANDBOX_SUB =
  'Work in progress across your sandboxes. Separation is by a narrower sandbox, never a wall inside a shared one; the AI never grounds on anything here.';

const Card: React.FC<{ title: string; lines: Array<[React.ReactNode, string]>; selected?: boolean }> = ({ title, lines, selected }) => (
  <div
    style={{
      width: 254,
      boxSizing: 'border-box',
      padding: '12px 14px 12px',
      borderRadius: RADIUS.control,
      border: selected ? `2px solid ${C.ink}` : `1px solid ${C.border}`,
      margin: selected ? 0 : 1,
      background: C.pane,
      boxShadow: selected ? undefined : '0 1px 2px rgba(20,20,20,.04)',
    }}
  >
    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
    {lines.map(([icon, t]) => (
      <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.text2, lineHeight: '21px' }}>
        {icon}
        {t}
      </div>
    ))}
  </div>
);

const ic = { size: 13, strokeWidth: 1.7, color: C.muted } as const;

export const SandboxPage: React.FC<{ createHover?: boolean; createPressAt?: number }> = ({ createHover, createPressAt }) => (
  <Page>
    <PageHeader
      title="Sandbox"
      sub={<span style={{ display: 'block', maxWidth: 760 }}>{SANDBOX_SUB}</span>}
      actions={
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 14 }}>
          <Btn variant="primary" icon={<FilePlus2 size={14} strokeWidth={2} />} label="New document" />
          <Btn variant="quiet" icon={<Sparkles size={14} strokeWidth={1.8} />} label="Create with AI" hover={createHover} pressAt={createPressAt} style={{ fontWeight: 500, marginLeft: 6 }} />
          <Btn variant="quiet" icon={<Upload size={14} strokeWidth={1.8} />} label="Upload file" style={{ fontWeight: 500 }} />
          <Btn variant="quiet" icon={<Plus size={14} strokeWidth={1.8} />} label="Sandbox" style={{ fontWeight: 500 }} />
        </span>
      }
    />
    <SectionLabel style={{ marginTop: 26 }}>Sandboxes</SectionLabel>
    <div style={{ display: 'flex', gap: 12 }}>
      <Card title="Personal workspace" lines={[[<Building2 key="b" {...ic} />, 'Calder & Hale'], [<User key="u" {...ic} />, 'Personal']]} />
      <Card title="Calder & Hale — working area" selected lines={[[<Building2 key="b" {...ic} />, 'Calder & Hale'], [<Lock key="l" {...ic} />, 'Single organisation']]} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 14, fontSize: 12.5, color: C.muted, whiteSpace: 'nowrap' }}>
      <span>1 in scope</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.text2, fontWeight: 500 }}>
        <Users size={14} strokeWidth={1.7} />
        Manage access
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.text2, fontWeight: 500, marginLeft: 10 }}>
        <Settings size={14} strokeWidth={1.7} />
        Settings
      </span>
      <span>Locked to the plan — the tree follows the deliverables</span>
    </div>
    <div style={{ marginTop: 22, marginLeft: 8, fontSize: 13, fontWeight: 600, color: C.text }}>Calder &amp; Hale — working area</div>
    <div style={{ marginTop: 12, background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.pane, overflow: 'hidden', fontFamily: FONT.sans }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 33, padding: '0 8px', borderBottom: `1px solid ${C.border}`, fontSize: 10.5, letterSpacing: 0.6, fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>
        <span style={{ flex: 1 }}>Name</span>
        <span style={{ width: 250 }}>Deliverable</span>
        <span style={{ width: 60, textAlign: 'right' }}>Actions</span>
      </div>
      {['EDR', 'EEN', 'EGE'].map((n, i) => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', height: 41, padding: '0 8px', gap: 10, borderBottom: i < 2 ? `1px solid ${C.borderSubtle}` : undefined, fontSize: 13.5, fontWeight: 600, color: C.text }}>
          <ChevronRight size={14} strokeWidth={1.8} color={C.muted} />
          <Folder size={16} strokeWidth={1.6} color={C.muted} />
          {n}
        </div>
      ))}
    </div>
  </Page>
);
