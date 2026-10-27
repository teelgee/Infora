/**
 * W1's modals on a local frame matching the captures: Bind (`07`), Promote to
 * review (`13a`, P01 and P02), Close & issue the round (`21`, `25`).
 * Scrim and modal fade together over 5 f (§2.7). Put them in the Shell's
 * `overlay` (the scrim covers the rail, as captured).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ChevronDown, Search, X } from 'lucide-react';
import { C, FONT, RADIUS, SHADOW, type F } from '../../shared';
import { WT_DATES, WT_DOC } from '../../data/wrenfield';
import { StatusPill } from '../shared';
import { Av, Button, fade, Micro } from './parts';

const W = { md: 520, lg: 760 } as const;

export const ModalFrame: React.FC<{
  size: 'md' | 'lg';
  at: F;
  exitAt?: F;
  title: React.ReactNode;
  headerH: number;
  /** Body height (scrolls); omit for content height. */
  bodyH?: number;
  bodyScroll?: number;
  bodyPad?: string;
  footer: React.ReactNode;
  footerH: number;
  footerLeft?: React.ReactNode;
  children: React.ReactNode;
}> = ({ size, at, exitAt, title, headerH, bodyH, bodyScroll = 0, bodyPad = '0 24px', footer, footerH, footerLeft, children }) => {
  const f = useCurrentFrame();
  const o = fade(f, at, exitAt);
  if (o <= 0) return null;
  const w = W[size];
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, fontFamily: FONT.sans }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,20,.28)' }} />
      <div
        style={{
          position: 'absolute',
          left: (1536 - w) / 2,
          top: 64,
          width: w,
          background: C.pane,
          borderRadius: 12,
          boxShadow: SHADOW.overlay,
          overflow: 'hidden',
          color: C.text,
        }}
      >
        <div style={{ height: headerH, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, fontSize: 15.5, fontWeight: 600, lineHeight: '18px' }}>{title}</div>
          <X size={17} strokeWidth={1.7} color={C.text2} style={{ flex: 'none' }} />
        </div>
        <div style={{ height: bodyH, overflow: 'hidden', position: 'relative' }}>
          <div style={{ padding: bodyPad, transform: `translateY(${-bodyScroll}px)` }}>{children}</div>
        </div>
        <div style={{ height: footerH, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, padding: '0 24px', borderTop: `1px solid ${C.border}` }}>
          {footerLeft ? <span style={{ marginRight: 'auto', fontSize: 12.5, color: C.text2 }}>{footerLeft}</span> : null}
          {footer}
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ Bind (`07`)

export const BindModal: React.FC<{ at: F; exitAt?: F; hoverPrimary?: boolean; pressAt?: F }> = ({ at, exitAt, hoverPrimary, pressAt }) => (
  <ModalFrame
    size="md"
    at={at}
    exitAt={exitAt}
    headerH={76}
    title={<>Bind “{WT_DOC.workingTitle}”</>}
    footerH={65}
    footer={
      <>
        <Button label="Cancel" />
        <Button kind="primary" label={`Bind to ${WT_DOC.ref}`} hover={hoverPrimary} pressAt={pressAt} pad="0 17px" style={{ height: 32 }} />
      </>
    }
    bodyPad="24px 24px 24px"
  >
    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text2, lineHeight: '15px', marginTop: 1 }}>Planned deliverable</div>
    <div
      style={{
        marginTop: 9,
        height: 31,
        boxSizing: 'border-box',
        border: '1px solid rgba(20,20,20,.12)',
        borderRadius: RADIUS.control,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 11px',
        fontSize: 13,
      }}
    >
      <Search size={13} strokeWidth={1.8} color={C.text2} />
      {WT_DOC.ref}
    </div>
    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 7 }}>Pre-selected from the deliverable folder this draft sits in — confirm it, or pick another.</div>
    <div style={{ marginTop: 21, border: `1px solid ${C.border}`, borderRadius: RADIUS.control, padding: '9px 14px 10px', fontSize: 13, lineHeight: '20px', color: C.text2 }}>
      <div style={{ color: C.text }}>
        <span style={{ fontFamily: FONT.mono, fontWeight: 600, fontSize: 12.5, color: C.text2 }}>{WT_DOC.ref}</span> {WT_DOC.title}
      </div>
      <div>Security classification: OFFICIAL</div>
      <div>Role / Discipline: EEN</div>
      <div>Suitability code: S2</div>
      <div>Native format: DOCX</div>
      <div>Authors: Eleanor Price (lead)</div>
      <div>Reviewers: Rachel Bowen (lead)</div>
      <div style={{ color: C.text, marginTop: 4, lineHeight: '16px' }}>
        On bind, this draft becomes the deliverable’s working draft: it wears the reference and shows the plan row’s title and metadata by reference — the title is then edited on the plan row, not here. Binding is one-way; promotion is a later, separate act.
      </div>
    </div>
  </ModalFrame>
);

// ------------------------------------------------------------------ Promote to review (`13a`)

const Sel: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ flex: 1 }}>
    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text2 }}>{label}</div>
    <div style={{ marginTop: 3, height: 34, boxSizing: 'border-box', border: '1px solid rgba(20,20,20,.12)', borderRadius: RADIUS.control, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13 }}>
      —
      <ChevronDown size={14} strokeWidth={1.8} color={C.text2} style={{ marginLeft: 'auto' }} />
    </div>
  </div>
);

const SunkBox: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: '#efeee9', borderRadius: RADIUS.pane, boxShadow: SHADOW.soft, padding: '10px 12px', ...style }}>{children}</div>
);

export const PromotionWindow: React.FC<{ version: 'P01' | 'P02'; at: F; exitAt?: F; scrollY?: number; promoteHover?: boolean; pressAt?: F }> = ({ version, at, exitAt, scrollY = 0, promoteHover, pressAt }) => {
  const p2 = version === 'P02';
  const plan: Array<[string, string]> = [
    ['Reference', WT_DOC.ref],
    ['Title', WT_DOC.title],
    ['Role / Discipline', 'EEN'],
    ['Suitability code', 'S2'],
    ['Security classification', 'OFFICIAL'],
    ['Native format', 'DOCX'],
    ['Producing organisation', 'Calder & Hale'],
  ];
  return (
    <ModalFrame
      size="lg"
      at={at}
      exitAt={exitAt}
      headerH={68}
      title={
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          Promote to review <span style={{ fontFamily: FONT.mono, fontSize: 12.5, fontWeight: 400, color: C.text2 }}>{WT_DOC.ref}</span>
        </span>
      }
      bodyH={603}
      bodyScroll={scrollY}
      bodyPad="24px 24px 40px"
      footerH={65}
      footerLeft="1 reviewer, all confirmed"
      footer={
        <>
          <Button label="Cancel" />
          <Button kind="primary" label="Promote" hover={promoteHover} pressAt={pressAt} pad="0 17px" style={{ height: 32 }} />
        </>
      }
    >
      <div style={{ fontSize: 13, lineHeight: '19.5px', color: C.text, marginTop: 1 }}>
        Promoting freezes {version} from the version internal QA accepted, renders the PDF the review runs on, and submits it to Trentmoor Energy.{' '}
        <b style={{ fontWeight: 600 }}>The round opens when the lead reviewer accepts the appointment and acknowledges the submission — not on this click.</b>
      </div>

      <Micro style={{ marginTop: 43 }}>What promotes</Micro>
      <SunkBox style={{ marginTop: 9, padding: '10px 12px 11px', lineHeight: '17px' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Source version {version} — accepted by internal QA</div>
        <div style={{ fontSize: 12, color: C.text2 }}>Accepted by Owen Vance, Calder &amp; Hale · {p2 ? 'Sep 17, 2026' : 'Sep 02, 2026'}</div>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 6 }}>The gate is on for this sandbox, so promotion takes the version QA accepted — never the head as it has drifted since.</div>
      </SunkBox>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 44 }}>
        <Micro>From the plan</Micro>
        <StatusPill tone="neutral" label="Locked" size={12.5} />
      </div>
      <SunkBox style={{ marginTop: 6, padding: '9px 12px 12px' }}>
        {plan.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', height: 26, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: C.text2 }}>{k}</span>
            <span style={{ marginLeft: 'auto', color: C.text }}>{v}</span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: C.text2, marginTop: 7 }}>These belong to the plan row and cannot change here. Change them on the plan and the draft follows.</div>
      </SunkBox>

      <Micro style={{ marginTop: 34 }}>This revision</Micro>
      <div style={{ display: 'flex', gap: 10, marginTop: 9 }}>
        <Sel label="Suitability code" />
        <Sel label="Security classification" />
        <Sel label="Native format" />
      </div>
      <div style={{ fontSize: 12, color: C.text2, marginTop: 5 }}>Authoring metadata. It rides along on the version and is yours to set.</div>

      <Micro style={{ marginTop: 40 }}>Review group</Micro>
      <SunkBox style={{ marginTop: 10, padding: '11px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Av initials="RB" />
          <div style={{ lineHeight: '15px' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Rachel Bowen</div>
            <div style={{ fontSize: 12, color: C.text2 }}>Trentmoor Energy · Lead reviewer</div>
          </div>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <StatusPill tone="success" label="Confirmed" size={12.5} />
            <span style={{ fontSize: 13, color: C.text2, marginRight: 12 }}>Change</span>
          </span>
        </div>
        <div style={{ fontSize: 13, color: C.text2, margin: '19px 0 0 12px' }}>+ Propose a reviewer</div>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 15 }}>Naming someone proposes them. Access begins when Trentmoor Energy confirms — a proposal on its own confers nothing.</div>
      </SunkBox>

      <Micro style={{ marginTop: 34 }}>Review period</Micro>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 11, fontSize: 13 }}>
        <span style={{ width: 89, height: 32, boxSizing: 'border-box', border: '1px solid rgba(20,20,20,.12)', borderRadius: RADIUS.control, display: 'inline-flex', alignItems: 'center', padding: '0 12px' }}>10</span>
        <span style={{ color: C.text2 }}>working days</span>
        <span>
          Target <b style={{ fontWeight: 600 }}>{p2 ? WT_DATES.round2Target : WT_DATES.round1Target}</b>
        </span>
      </div>
      <div style={{ fontSize: 12, color: C.text2, marginTop: 7 }}>The project default. It chases the review group and flags the round overdue: it never closes a round.</div>
    </ModalFrame>
  );
};

// ------------------------------------------------------------------ Close & issue the round (`21`, `25`)

export const IssueModal: React.FC<{ at: F; exitAt?: F; kind: 'S0' | 'A1'; hover?: boolean; pressAt?: F }> = ({ at, exitAt, kind, hover, pressAt }) => {
  const s0 = kind === 'S0';
  return (
    <ModalFrame
      size="md"
      at={at}
      exitAt={exitAt}
      headerH={68}
      title="Close & issue the round"
      bodyPad={s0 ? '23px 24px 24px' : '24px 24px 24px'}
      footerH={65}
      footer={
        <>
          <Button label="Cancel" />
          <Button kind="primary" label={s0 ? 'Issue for revision' : 'Accept & publish'} hover={hover} pressAt={pressAt} pad="0 17px" style={{ height: 32 }} />
        </>
      }
    >
      {s0 ? (
        <>
          <div style={{ fontSize: 14.5, lineHeight: '20px' }}>Verdict:</div>
          <StatusPill tone="warning" label="S0 — Work in progress — not yet suitable to share outside the task team" size={12.5} />
          <div style={{ fontSize: 14.5, lineHeight: '17px', marginTop: 15 }}>
            The snapshot freezes and the pen returns to the authors for another round. This does <b style={{ fontWeight: 600 }}>not</b> publish to the library.
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, lineHeight: '20px' }}>
            Verdict: <StatusPill tone="success" label="A1 — Published — authorized and accepted" size={12.5} />
          </div>
          <div style={{ fontSize: 14.5, lineHeight: '17px', marginTop: 13 }}>
            This <b style={{ fontWeight: 600 }}>accepts the deliverable</b>: the contractual revision is issued and it enters the <b style={{ fontWeight: 600 }}>project library</b>. The review is complete — no further edits.
          </div>
        </>
      )}
    </ModalFrame>
  );
};
