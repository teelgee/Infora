/**
 * W5 screens (demo/plans/w5-ethical-walls/plan.md §3).
 *   OwnerLibrary   ch.1  26-library (owner) + the built Transmit modal (library.tsx 43–80, 681–699)
 *   OwnerStatus    ch.1  W1's accepted status page + the Redgate transmittal row (deliverable-status.tsx 730–890)
 *   LibrarySplit   ch.2–3  the access-resolved library at half width (DEV narrow reflow), three seats
 *   SandboxSplit   ch.4  the sandbox page at half width (DEV narrow reflow), two seats
 *
 * The wall rule (§0): a seat's list simply lacks what it may not see. No
 * greyed rows, no counts, no placeholders.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FilePlus2, FileText, Link, Lock, Search, Upload, Users } from 'lucide-react';
import { appear, C, ease, FONT, RADIUS, ui, type F } from '../../shared';
import { WT_COLLAB, WT_LIB, WT_LIB_PAGE, WT_MEMBER_ORGS, WT_WALL, type WtLibKey } from '../../data/wrenfield';
import { Btn, Field, HumanTyped, LibraryPage, Modal, Page, PageHeader, RefCell, SectionLabel, SelectMenu, Shell, StatusPill, Table, TextInput, typedEndsAt, type Column } from '../shared';
import { PlateLayer } from '../w2/common';
import { DeliverableStatus } from '../w1/status';
import { Collapse } from '../w1/parts';
import { Card, type CardSpec } from '../w3/sandbox';

const between = (f: number, a: number, b: number) => f >= a && f < b;

// ------------------------------------------------------------------ ch.1 timeline (frames, video-local)

export const T1 = {
  peaHover: 240,
  transmitClick: 353,
  modalIn: 355,
  comboClick: 396,
  menuIn: 398,
  typedFrom: 402,
  typedSeed: 51,
  optionHover: 429,
  optionClick: 437,
  picked: 439,
  transmitHover: 458,
  transmitPress: 466,
  modalOut: 468,
  noteIn: 470,
  openHover: 557,
  openClick: 565,
  statusCut: 567,
  scrollFrom: 585,
  scrollTo: 612,
};
export const TYPED_END = typedEndsAt(WT_WALL.transmit.typed, T1.typedFrom, T1.typedSeed);
/** Status-page scroll at rest (native px). */
export const STATUS_SCROLL = 300;

/** Native targets for ch.1 (plate px, measured from stills). */
export const P1 = {
  start: { x: 760, y: 600 },
  peaTitle: { x: 470, y: 349 },
  transmit: { x: 1062, y: 453 },
  combo: { x: 768, y: 185 },
  option: { x: 700, y: 222 },
  transmitBtn: { x: 900, y: 300 },
  open: { x: 972, y: 453 },
  recipient: { x: 875, y: 583 },
};

// ------------------------------------------------------------------ ch.1: the owner's library + Transmit

const TransmitModal: React.FC = () => {
  const f = useCurrentFrame();
  const W = WT_WALL.transmit;
  const typing = f >= T1.typedFrom && f < T1.picked;
  const filtered = f >= TYPED_END;
  const picked = f >= T1.picked;
  const value = picked ? <span>{W.pick}</span> : typing ? <HumanTyped text={W.typed} from={T1.typedFrom} seed={T1.typedSeed} /> : undefined;
  return (
    <>
      <Modal
        size="sm"
        title={W.title}
        at={T1.modalIn}
        exitAt={T1.modalOut}
        footer={
          <>
            <Btn variant="quiet" label={W.buttons.cancel} />
            <Btn variant={picked ? 'primary' : 'disabled'} label={W.buttons.transmit} hover={between(f, T1.transmitHover - 4, T1.modalOut)} pressAt={T1.transmitPress} />
          </>
        }
      >
        <Field label={W.label} hint={W.hint}>
          <TextInput focused={f >= T1.comboClick + 2 && !picked} value={value} placeholder={W.placeholder} icon={<Search size={14} strokeWidth={1.8} />} />
        </Field>
      </Modal>
      {f < T1.modalOut ? (
        <SelectMenu
          x={592}
          y={206}
          width={352}
          at={T1.menuIn}
          exitAt={T1.picked}
          options={filtered ? [W.pick] : WT_MEMBER_ORGS}
          hover={between(f, T1.optionHover - 4, T1.picked) ? W.pick : undefined}
        />
      ) : null}
    </>
  );
};

export const OwnerLibrary: React.FC = () => {
  const f = useCurrentFrame();
  const hover = between(f, T1.peaHover - 4, 318) ? { table: 'live' as const, row: 0 } : between(f, 337, T1.statusCut) ? { table: 'live' as const, row: 1 } : undefined;
  return (
    <Shell seat="RACHEL" nav="Project library" overlay={f >= T1.modalIn && f < T1.modalOut + 6 ? <TransmitModal /> : null}>
      <LibraryPage owner hoverRow={hover} />
      {f >= T1.noteIn ? (
        <PlateLayer>
          <div style={{ position: 'absolute', left: 342, top: 206, fontSize: 13, lineHeight: '18px', color: C.muted, whiteSpace: 'nowrap', opacity: ui(f, T1.noteIn) }}>{WT_WALL.transmit.note}</div>
        </PlateLayer>
      ) : null}
    </Shell>
  );
};

/** The Redgate row, appended to W1's built transmittals table (same column widths). */
const RedgateRow: React.FC<{ ackAt?: F }> = () => {
  const H = WT_WALL.history;
  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 60, padding: '0 16px', lineHeight: '16px', borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
      <span style={{ width: 113, whiteSpace: 'nowrap' }}>{H.row.date}</span>
      <span style={{ width: 136, paddingRight: 8, boxSizing: 'border-box' }}>{H.row.kind}</span>
      <span style={{ width: 88, fontFamily: FONT.mono, fontSize: 12.5 }}>{H.row.version}</span>
      <span style={{ width: 112, whiteSpace: 'nowrap' }}>{H.row.by}</span>
      <span style={{ width: 115, whiteSpace: 'nowrap' }}>{H.row.recipient}</span>
      <span>
        <StatusPill tone="warning" label={H.awaiting} size={12.5} />
      </span>
    </div>
  );
};

export const OwnerStatus: React.FC = () => {
  const f = useCurrentFrame();
  const scroll = STATUS_SCROLL * appear(f, T1.scrollFrom, T1.scrollTo - T1.scrollFrom, ease.inOut);
  return (
    <Shell seat="RACHEL" nav="Project library">
      <DeliverableStatus variant="accepted" scrollY={scroll} transmittalRows={<RedgateRow />} ownerFoot />
    </Shell>
  );
};

// ------------------------------------------------------------------ ch.2–3: the library at half width

export type LibVariant = 'owner' | 'calder' | 'redgate';

const LIVE_COLS: Column[] = [
  { key: 'ref', label: 'Reference', w: 160 },
  { key: 'title', label: 'Title' },
  { key: 'rev', label: 'Revision', w: 78 },
  { key: 'prod', label: 'Producer', w: 132 },
];
const REF_COLS: Column[] = [
  { key: 'ref', label: 'Reference' },
  { key: 'rev', label: 'Revision', w: 78 },
  { key: 'held', label: 'Held by', w: 150 },
];
const ACK_COLS: Column[] = [
  { key: 'ref', label: 'Reference', w: 200, mono: true },
  { key: 'ver', label: 'Version', w: 100, mono: true },
  { key: 'act', label: '', align: 'right' },
];

/** Split-native targets (each seat's own 752 × 832 shell). */
export const P2 = {
  start: { x: 400, y: 640 },
  firstLiveTitle: { x: 330, y: 330 },
  ackBtn: { x: 640, y: 316 },
};

export const LibrarySplit: React.FC<{ variant: LibVariant; ackHover?: [F, F]; ackAt?: F; hoverLive?: { row: number; from: F; to: F } }> = ({ variant, ackHover, ackAt, hoverLive }) => {
  const f = useCurrentFrame();
  const seat = variant === 'owner' ? 'RACHEL' : variant === 'calder' ? 'ELEANOR' : 'NADIA';
  const acked = variant === 'redgate' && ackAt !== undefined && f >= ackAt;
  const live: WtLibKey[] = variant === 'owner' ? ['PEA', 'MST'] : variant === 'calder' ? ['MST'] : acked ? ['PEA', 'MST'] : ['PEA'];
  const showAck = variant === 'redgate';
  const ackNoteAt = ackAt !== undefined ? ackAt + 2 : undefined;
  return (
    <Shell seat={seat} nav="Project library" width={752} height={832}>
      <Page width={676} pad="24px 16px 40px">
        <PageHeader title={WT_LIB_PAGE.title} sub={WT_LIB_PAGE.sub} />
        {showAck && ackNoteAt !== undefined && f >= ackNoteAt ? (
          <div style={{ marginTop: 8, fontSize: 13, color: C.muted, opacity: ui(f, ackNoteAt) }}>{WT_WALL.ack.note}</div>
        ) : null}
        {showAck ? (
          <Collapse at={ackNoteAt} h={142}>
            <SectionLabel style={{ marginTop: 26 }}>{WT_WALL.ack.label}</SectionLabel>
            <Table
              columns={ACK_COLS}
              rowH={44}
              rows={[
                {
                  ref: WT_LIB.MST.ref,
                  ver: WT_LIB.MST.rev,
                  act: <Btn size="sm" label={WT_WALL.ack.button} hover={ackHover ? between(f, ackHover[0], ackHover[1]) : false} pressAt={ackAt} />,
                },
              ]}
            />
          </Collapse>
        ) : null}
        <SectionLabel style={{ marginTop: 26 }}>{WT_LIB_PAGE.liveLabel}</SectionLabel>
        <Table
          columns={LIVE_COLS}
          rowH={52}
          hoverRow={hoverLive && between(f, hoverLive.from, hoverLive.to) ? hoverLive.row : undefined}
          rowAt={live.map((k) => (variant === 'redgate' && k === 'MST' && ackAt !== undefined ? ackAt + 9 : undefined))}
          rows={live.map((k) => {
            const d = WT_LIB[k];
            return {
              ref: <RefCell docRef={d.ref} wrap={false} />,
              title: <span style={{ lineHeight: '16px' }}>{d.title}</span>,
              rev: <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.text2 }}>{d.rev}</span>,
              prod: <span style={{ lineHeight: '16px' }}>{d.heldBy}</span>,
            };
          })}
        />
        <SectionLabel style={{ marginTop: 26 }}>{WT_LIB_PAGE.refLabel}</SectionLabel>
        <Table
          columns={REF_COLS}
          rowH={40}
          rows={(['SCC', 'SCP', 'BAS', 'GIR', 'FRA'] as WtLibKey[]).map((k) => {
            const d = WT_LIB[k];
            return {
              ref: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <RefCell docRef={d.ref} icon="book" wrap={false} />
                  <StatusPill tone="neutral" label="Reference" size={11.5} />
                </span>
              ),
              rev: <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.text2 }}>{d.rev}</span>,
              held: d.heldBy,
            };
          })}
        />
      </Page>
    </Shell>
  );
};

// ------------------------------------------------------------------ ch.4: the sandbox page at half width

/** W3's Card places itself at (x − 216, 240 − 68) inside its parent: pass x = content-left + 216. */
const CARD_W = 254;
const cardX = (contentLeft: number) => contentLeft + 216;
/** Split-native (shell) centres of the three cards: row 1 personal, working area; row 2 shared. */
export const SB_CARDS = {
  personal: { x: 80 + CARD_W / 2, y: 282 },
  working: { x: 346 + CARD_W / 2, y: 282 },
  shared: { x: 80 + CARD_W / 2, y: 378 },
};

const Quiet: React.FC<{ Icon?: typeof Lock; label: string }> = ({ Icon, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px', fontSize: 13, lineHeight: '19px', fontWeight: 500, color: C.text2, whiteSpace: 'nowrap' }}>
    {Icon ? <Icon size={14} strokeWidth={1.8} /> : null}
    {label}
  </span>
);

const Micro: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ fontSize: 10.5, lineHeight: '13px', letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.muted, whiteSpace: 'nowrap', ...style }}>{children}</span>
);

const DocRow: React.FC<{ title: string; meta: string; refLink?: string; rev?: string; pill?: string }> = ({ title, meta, refLink, rev, pill }) => (
  <div style={{ position: 'relative', height: 47, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontSize: 13 }}>
    <FileText size={15} strokeWidth={1.7} color={C.muted} style={{ flex: 'none' }} />
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      <b style={{ fontSize: 13.5, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</b>
      {rev ? <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.text2 }}>{rev}</span> : null}
      <span style={{ fontSize: 12, color: C.muted, flex: 'none' }}>{meta}</span>
    </span>
    {refLink ? (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT.mono, fontSize: 12.5, color: C.text2, flex: 'none' }}>
        <Link size={13} strokeWidth={1.8} />
        {refLink}
      </span>
    ) : null}
    {pill ? <StatusPill tone="neutral" label={pill} /> : null}
  </div>
);

const Box: React.FC<{ heads: [string, string]; children: React.ReactNode }> = ({ heads, children }) => (
  <div style={{ background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.pane, overflow: 'hidden' }}>
    <div style={{ position: 'relative', height: 32 }}>
      <Micro style={{ position: 'absolute', left: 12, top: 9.5 }}>{heads[0]}</Micro>
      <Micro style={{ position: 'absolute', right: 12, top: 9.5 }}>{heads[1]}</Micro>
    </div>
    {children}
  </div>
);

export const SandboxSplit: React.FC<{ seat: 'ELEANOR' | 'NADIA'; selectAt?: F; hoverCard?: Array<{ card: 'working' | 'shared'; from: F; to: F }> }> = ({ seat, selectAt, hoverCard = [] }) => {
  const f = useCurrentFrame();
  const eleanor = seat === 'ELEANOR';
  const org = eleanor ? 'Calder & Hale' : 'Redgate Ecology';
  const own: readonly CardSpec[] = eleanor ? WT_COLLAB.cards.calderHale : WT_WALL.cards.redgate;
  const shared: CardSpec = WT_COLLAB.cards.shared;
  const selected = selectAt !== undefined && f >= selectAt;
  const hov = hoverCard.find((h) => between(f, h.from, h.to))?.card;
  const SB = WT_COLLAB.sandboxPage;
  return (
    <Shell seat={seat} nav="Sandbox" width={752} height={832}>
      <div style={{ position: 'absolute', inset: 0, fontFamily: FONT.sans, color: C.text }}>
        <div style={{ position: 'absolute', left: 16, top: 30, fontFamily: FONT.serif, fontSize: 29, fontWeight: 500, letterSpacing: 0.1, lineHeight: '38px' }}>{SB.title}</div>
        <div style={{ position: 'absolute', right: 16, top: 34, display: 'flex', gap: 6 }}>
          <Btn variant="primary" label={SB.buttons.newDoc} icon={<FilePlus2 size={14} strokeWidth={2} />} />
          <Btn variant="quiet" label={SB.buttons.upload} icon={<Upload size={14} strokeWidth={1.8} />} />
        </div>
        <div style={{ position: 'absolute', left: 16, top: 77, width: 644, fontSize: 13, lineHeight: 1.55, color: C.muted }}>{SB.sub}</div>
        <Micro style={{ position: 'absolute', left: 16, top: 149 }}>{SB.sectionLabel}</Micro>
        <Card c={own[0]} x={cardX(16)} />
        <Card c={own[1]} x={cardX(282)} hover={hov === 'working'} />
        <div style={{ position: 'absolute', left: 0, top: 96, width: '100%' }}>
          <Card c={shared} x={cardX(16)} selected={selected} hover={hov === 'shared'} />
        </div>
        <div style={{ position: 'absolute', left: 16, top: 372, width: 644 }}>
          {selected ? (
            <div style={{ opacity: ui(f, selectAt!) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 22, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 12.5, color: C.muted, marginRight: 8 }}>{SB.inScope}</span>
                <Quiet Icon={Users} label={SB.toolbarMember[0]} />
                <span style={{ fontSize: 12.5, color: C.muted, marginLeft: 10 }}>{SB.lockedStructure}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, margin: '16px 0 12px 8px' }}>{shared.name}</div>
              <Box heads={['Name', 'Actions']}>
                <DocRow title={WT_COLLAB.docTitle} rev={WT_COLLAB.docRow.rev} meta={WT_COLLAB.docRow.meta} pill={WT_COLLAB.docRow.state} />
              </Box>
            </div>
          ) : (
            <>
              <Micro style={{ display: 'block', marginBottom: 12 }}>{SB.allDocs(org)}</Micro>
              <Box heads={['Document', 'Actions']}>
                {eleanor ? (
                  <DocRow title={WT_COLLAB.calderHaleRow.title} meta={WT_COLLAB.calderHaleRow.meta} refLink={WT_COLLAB.calderHaleRow.ref} />
                ) : (
                  <DocRow title={WT_WALL.redgateRow.title} meta={WT_WALL.redgateRow.meta} />
                )}
                <DocRow title={WT_COLLAB.docTitle} rev={WT_COLLAB.docRow.rev} meta={WT_COLLAB.docRow.meta} pill={WT_COLLAB.docRow.state} />
              </Box>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
};
