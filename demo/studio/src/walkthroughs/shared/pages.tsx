/**
 * Built pages shared by more than one video, recreated from their screenshots:
 *   PlanPage     02-plan.png      (W1)
 *   LibraryPage  26-library.png   (W1 close, W2 library)
 * Put them inside a <Shell nav="Plan" | "Project library">. Native px.
 */
import React from 'react';
import { BookOpen, Columns3, FilePen, FileText, FileUp, Plus, Send, Share2, SlidersHorizontal } from 'lucide-react';
import { C, FONT } from '../../shared';
import { WT_LIB, WT_LIB_ORDER, WT_LIB_PAGE, WT_PLAN_PAGE, WT_PLAN_ROWS, type WtLibDoc, type WtLibKey, type WtPlanRow } from '../../data/wrenfield';
import { QuietAction } from './shell';
import { Btn, Page, PageHeader, SearchInput, SectionLabel, StatusPill, Table, type Column, type Tone } from './ui';
import type { F } from '../../shared';

const PLAN_COLS: Column[] = [
  { key: 'ref', label: 'Reference', w: 111 },
  { key: 'title', label: 'Title', w: 205 },
  { key: 'disc', label: 'Role / Discipline', w: 105 },
  { key: 'suit', label: 'Suitability code', w: 109 },
  { key: 'sec', label: 'Security classification', w: 147 },
  { key: 'status', label: 'Status', w: 121 },
  { key: 'rev', label: 'Revision', w: 73 },
  { key: 'verdict', label: 'Verdict', w: 78 },
  { key: 'act', label: '' },
];

/** A mono reference wrapped after its second hyphen, with a file icon (as in 02/26). */
export const RefCell: React.FC<{ docRef: string; icon?: 'file' | 'book'; wrap?: boolean }> = ({ docRef, icon = 'file', wrap = true }) => {
  const parts = docRef.split('-');
  const Icon = icon === 'file' ? FileText : BookOpen;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, fontFamily: FONT.mono, fontSize: 12.5, color: C.text2, lineHeight: '16px' }}>
      <Icon size={14} strokeWidth={1.6} color={C.muted} style={{ marginTop: 1, flex: 'none' }} />
      {wrap ? (
        <span>
          {parts.slice(0, 2).join('-')}-
          <br />
          {parts.slice(2).join('-')}
        </span>
      ) : (
        <span style={{ whiteSpace: 'nowrap' }}>{docRef}</span>
      )}
    </span>
  );
};

const statusTone = (s: string): Tone => (s === 'In production' ? 'success' : s === 'Accepted' ? 'success' : s === 'In review' || s === 'Submitted' ? 'info' : 'neutral');

export interface PlanPageProps {
  rows?: WtPlanRow[];
  hoverRow?: number;
  /** Override a row's status pill (e.g. `{ 1: { tone: 'info', label: 'Submitted', at: 900 } }` flips with `ui`). */
  statusFlip?: Record<number, { tone: Tone; label: string; at: F }>;
  /** Hover on a toolbar action. */
  hoverAction?: string;
  /** A banner under the header (e.g. <Banner tone="success" text={WT_DOC.boundBanner}/>). */
  banner?: React.ReactNode;
  scrollY?: number;
}

/** The Deliverable plan (`02-plan.png`). */
export const PlanPage: React.FC<PlanPageProps> = ({ rows = WT_PLAN_ROWS, hoverRow, statusFlip = {}, hoverAction, banner, scrollY }) => (
  <Page scrollY={scrollY}>
    <PageHeader title={WT_PLAN_PAGE.title} pill={{ tone: 'neutral', label: WT_PLAN_PAGE.pill }} sub={WT_PLAN_PAGE.sub} />
    {banner ? <div style={{ marginTop: 16 }}>{banner}</div> : null}
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 14, gap: 4 }}>
      <SearchInput placeholder={WT_PLAN_PAGE.search} />
      <span style={{ marginLeft: 'auto' }} />
      <QuietAction icon={<SlidersHorizontal size={15} strokeWidth={1.7} />} label="Coding scheme" hover={hoverAction === 'Coding scheme'} />
      <QuietAction icon={<Columns3 size={15} strokeWidth={1.7} />} label="Columns" hover={hoverAction === 'Columns'} />
      <QuietAction icon={<FileUp size={15} strokeWidth={1.7} />} label="Import from Excel" hover={hoverAction === 'Import from Excel'} />
      <Btn variant="primary" icon={<Plus size={14} strokeWidth={2.4} />} label={WT_PLAN_PAGE.primary} hover={hoverAction === 'New deliverable'} style={{ marginLeft: 12 }} />
    </div>
    <Table
      style={{ marginTop: 12 }}
      columns={PLAN_COLS}
      rowH={53}
      hoverRow={hoverRow}
      rows={rows.map((r, i) => {
        const flip = statusFlip[i];
        return {
          ref: <RefCell docRef={r.ref} />,
          title: r.title,
          disc: r.discipline,
          suit: r.suitability,
          sec: r.security,
          status: <StatusPill tone={statusTone(r.status)} label={r.status} flipTo={flip ? { tone: flip.tone, label: flip.label, at: flip.at } : undefined} />,
          rev: <span style={{ color: C.text2 }}>{r.revision}</span>,
          verdict: <span style={{ color: C.text2 }}>{r.verdict}</span>,
          act: <QuietAction icon={<FilePen size={14} strokeWidth={1.7} />} label="Metadata" style={{ padding: '4px 0' }} />,
        };
      })}
    />
  </Page>
);

// ------------------------------------------------------------------ library

export interface LibraryPageProps {
  /** Owner seats see the owner actions and Redgate's PEA; members see Open only and no PEA. */
  owner?: boolean;
  hoverRow?: { table: 'live' | 'ref'; row: number };
  /** Override MST-001's revision (e.g. before acceptance it is absent: pass `hideMst`). */
  hideMst?: boolean;
  /** Fade the MST-001 row in at a frame (W1 close). */
  mstAt?: F;
  scrollY?: number;
}

const LIVE_COLS_OWNER: Column[] = [
  { key: 'ref', label: 'Reference', w: 86 },
  { key: 'title', label: 'Title', w: 86 },
  { key: 'rev', label: 'Revision', w: 73 },
  { key: 'suit', label: 'Suitability', w: 90 },
  { key: 'disc', label: 'Discipline', w: 84 },
  { key: 'prod', label: 'Producer', w: 81 },
  { key: 'issued', label: 'Issued', w: 104 },
  { key: 'act', label: '' },
];
const LIVE_COLS_MEMBER: Column[] = [
  { key: 'ref', label: 'Reference', w: 150 },
  { key: 'title', label: 'Title', w: 300 },
  { key: 'rev', label: 'Revision', w: 90 },
  { key: 'suit', label: 'Suitability', w: 110 },
  { key: 'disc', label: 'Discipline', w: 100 },
  { key: 'prod', label: 'Producer', w: 130 },
  { key: 'issued', label: 'Issued', w: 120 },
  { key: 'act', label: '' },
];
const REF_COLS: Column[] = [
  { key: 'ref', label: 'Reference', w: 416 },
  { key: 'rev', label: 'Revision', w: 125 },
  { key: 'held', label: 'Held by', w: 219 },
  { key: 'loaded', label: 'Loaded', w: 200 },
  { key: 'act', label: '', align: 'right' },
];

const OwnerActions: React.FC = () => (
  <span style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: C.text2, whiteSpace: 'nowrap' }}>
    <span style={{ width: 58 }}>Open</span>
    <span style={{ width: 104, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <Send size={13} strokeWidth={1.7} />
      Transmit
    </span>
    <span style={{ width: 110, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <Share2 size={13} strokeWidth={1.7} />
      <span style={{ textAlign: 'center', lineHeight: '15px' }}>
        Issue
        <br />
        externally…
      </span>
    </span>
    <span style={{ width: 96 }}>Supersede…</span>
    <span>Withdraw</span>
  </span>
);

/** The Project library (`26-library.png`). */
export const LibraryPage: React.FC<LibraryPageProps> = ({ owner = true, hoverRow, hideMst, mstAt, scrollY }) => {
  const live = WT_LIB_ORDER.deliverables.filter((k) => (owner || k !== 'PEA') && !(hideMst && k === 'MST'));
  const cols = owner ? LIVE_COLS_OWNER : LIVE_COLS_MEMBER;
  return (
    <Page scrollY={scrollY}>
      <PageHeader title={WT_LIB_PAGE.title} sub={WT_LIB_PAGE.sub} />
      <SectionLabel style={{ marginTop: 34 }}>{WT_LIB_PAGE.liveLabel}</SectionLabel>
      <Table
        columns={cols}
        rowH={owner ? 80 : 53}
        hoverRow={hoverRow?.table === 'live' ? hoverRow.row : undefined}
        rowAt={live.map((k) => (k === 'MST' ? mstAt : undefined))}
        rows={live.map((k: WtLibKey) => {
          const d: WtLibDoc = WT_LIB[k];
          return {
            ref: <RefCell docRef={d.ref} wrap={owner} />,
            title: <span style={{ lineHeight: '16px' }}>{d.title}</span>,
            rev: <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.text2 }}>{d.rev}</span>,
            suit: d.suitability && d.suitability !== '—' ? <StatusPill tone="info" label={d.suitability} /> : <span style={{ color: C.text2 }}>—</span>,
            disc: <span style={{ color: C.text2 }}>{d.discipline ?? '—'}</span>,
            prod: <span style={{ lineHeight: '16px' }}>{d.heldBy}</span>,
            issued: <span style={{ whiteSpace: 'nowrap' }}>{d.date}</span>,
            act: owner ? <OwnerActions /> : <span style={{ color: C.text2, fontSize: 13 }}>Open</span>,
          };
        })}
      />
      <SectionLabel style={{ marginTop: 40, marginBottom: 4 }}>{WT_LIB_PAGE.refLabel}</SectionLabel>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, maxWidth: 780, marginBottom: 10 }}>{WT_LIB_PAGE.refSub}</div>
      <Table
        columns={REF_COLS}
        rowH={47}
        hoverRow={hoverRow?.table === 'ref' ? hoverRow.row : undefined}
        rows={WT_LIB_ORDER.references.map((k) => {
          const d: WtLibDoc = WT_LIB[k];
          return {
            ref: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <RefCell docRef={d.ref} icon="book" wrap={false} />
                <StatusPill tone="neutral" label="Reference" size={11.5} />
              </span>
            ),
            rev: <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.text2 }}>{d.rev}</span>,
            held: d.heldBy,
            loaded: d.date,
            act: <span style={{ color: C.text2, fontSize: 13, paddingRight: 12 }}>Open</span>,
          };
        })}
      />
    </Page>
  );
};
