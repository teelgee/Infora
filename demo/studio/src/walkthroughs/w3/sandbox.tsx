/**
 * W3 chapters 1–2 (local): the Sandbox page in its two views (flat overview,
 * a sandbox selected), the three-step "New sandbox" modal, the "New document"
 * modal and the row menu. BUILT-NP `sandbox.tsx` on the BUILT `08`/`06`/`07`
 * layouts, shifted +48 for the 1536 plate (plan §3.2–§3.4).
 *
 * Everything is absolutely placed in PLATE coordinates (native px of the
 * 1536 × 864 Shell), so the cursor targets in Video.tsx come from the same
 * numbers: `sandboxGeom` returns them.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import {
  Building2,
  Ellipsis,
  FilePen,
  FilePlus2,
  FileText,
  FolderInput,
  FolderPlus,
  FolderTree,
  Link,
  Lock,
  Pencil,
  Plus,
  Send,
  Settings,
  Sparkles,
  Upload,
  User,
  Users,
  X,
  Check,
  ChevronDown,
} from 'lucide-react';
import { appear, C, ease, FONT, pressScale, RADIUS, SHADOW, ui, type F } from '../../shared';
import { WT_COLLAB } from '../../data/wrenfield';
import { Checkbox, Dropdown, HumanTyped, StatusPill } from '../shared';
import { tw } from './measure';
import { T, TY } from './timeline';

const SB = WT_COLLAB.sandboxPage;
const WZ = WT_COLLAB.wizard;
/** The Shell's content origin on the plate (rail 216, pane top 12 + topbar 56). */
const O = { x: 216, y: 68 };
const pos = (x: number, y: number): React.CSSProperties => ({ position: 'absolute', left: x - O.x, top: y - O.y });

// ------------------------------------------------------------------ header buttons

type HKey = 'newDoc' | 'createAi' | 'upload' | 'sandbox';
const HB: Record<HKey, { label: string; Icon: typeof Plus; primary?: boolean }> = {
  newDoc: { label: SB.buttons.newDoc, Icon: FilePlus2, primary: true },
  createAi: { label: SB.buttons.createAi, Icon: Sparkles },
  upload: { label: SB.buttons.upload, Icon: Upload },
  sandbox: { label: SB.buttons.sandbox, Icon: Plus },
};
const HB_GAP = 6;
const hbWidth = (k: HKey) => (HB[k].primary ? 28 : 20) + 14 + 7 + tw(HB[k].label, { size: 13, weight: HB[k].primary ? 700 : 500 });

/** Header buttons, right-aligned to x 1398, y 102–131 (centre 116.5). */
export function headerButtons(selected: boolean, isSuper: boolean) {
  const keys: HKey[] = ['newDoc', ...(selected ? (['createAi'] as HKey[]) : []), 'upload', ...(isSuper ? (['sandbox'] as HKey[]) : [])];
  let x = 1398;
  const out: Array<{ k: HKey; x0: number; x1: number; cx: number; cy: number }> = [];
  for (let i = keys.length - 1; i >= 0; i--) {
    const w = hbWidth(keys[i]);
    out.unshift({ k: keys[i], x0: x - w, x1: x, cx: x - w / 2, cy: 116.5 });
    x -= w + HB_GAP;
  }
  return out;
}

const HeaderButton: React.FC<{ k: HKey; x: number; hover?: boolean; pressAt?: F }> = ({ k, x, hover, pressAt }) => {
  const f = useCurrentFrame();
  const b = HB[k];
  return (
    <span
      style={{
        ...pos(x, 102),
        height: 29,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: b.primary ? '0 14px' : '0 10px',
        borderRadius: RADIUS.control,
        background: b.primary ? (hover ? '#000' : C.ink) : hover ? C.sunken : 'transparent',
        color: b.primary ? '#fff' : C.text2,
        fontSize: 13,
        fontWeight: b.primary ? 700 : 500,
        whiteSpace: 'nowrap',
        transform: `scale(${pressScale(f, pressAt)})`,
      }}
    >
      <b.Icon size={14} strokeWidth={b.primary ? 2 : 1.8} />
      {b.label}
    </span>
  );
};

// ------------------------------------------------------------------ cards

export interface CardSpec {
  name: string;
  org: string;
  kind: string;
}
const KIND_ICON: Record<string, typeof User> = { Personal: User, 'Single organisation': Lock, Shared: Users };
export const CARD_X = [342, 609, 876];
export const CARD = { y: 240, w: 254, h: 84 };
export const cardCentre = (i: number) => ({ x: CARD_X[i] + CARD.w / 2, y: CARD.y + CARD.h / 2 });

/** Exported for W5 (its narrow sandbox split). */
export const Card: React.FC<{ c: CardSpec; x: number; selected?: boolean; hover?: boolean; at?: F }> = ({ c, x, selected, hover, at }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  const KIcon = KIND_ICON[c.kind] ?? Users;
  return (
    <div
      style={{
        ...pos(x, CARD.y),
        width: CARD.w,
        height: CARD.h,
        boxSizing: 'border-box',
        padding: '13px 14px',
        background: hover && !selected ? C.neutral50 : C.pane,
        border: selected ? `2px solid ${C.ink}` : `1px solid ${C.borderStrong}`,
        borderRadius: RADIUS.pane,
        boxShadow: selected ? SHADOW.popout : '0 1px 2px rgba(20,20,20,.04)',
        opacity: o,
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: '18px', margin: selected ? '-1px 0 0 -1px' : 0, whiteSpace: 'nowrap' }}>{c.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12.5, color: C.text2, lineHeight: '17px', marginLeft: selected ? -1 : 0 }}>
        <Building2 size={13} strokeWidth={1.7} color={C.muted} />
        {c.org}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12.5, color: C.text2, lineHeight: '17px', marginLeft: selected ? -1 : 0 }}>
        <KIcon size={13} strokeWidth={1.7} color={C.muted} />
        {c.kind}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ table

const TABLE = { x: 342, w: 1056 };
/** Deliverable column: 980 on the flat overview (08: three actions), 1109 on a sandbox's tree (06/07). */
const FLAT_DELIV = 980;
const TREE_DELIV = 1109;
const Micro: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ fontSize: 10.5, lineHeight: '13px', letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.muted, whiteSpace: 'nowrap', ...style }}>
    {children}
  </span>
);

const TableBox: React.FC<{ top: number; heads: [string, string, string]; delivX: number; children: React.ReactNode }> = ({ top, heads, delivX, children }) => (
  <div style={{ ...pos(TABLE.x, top), width: TABLE.w, background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.pane, overflow: 'hidden' }}>
    <div style={{ position: 'relative', height: 32, borderBottom: `1px solid ${C.border}` }}>
      <Micro style={{ position: 'absolute', left: 9, top: 9.5 }}>{heads[0]}</Micro>
      <Micro style={{ position: 'absolute', left: delivX - TABLE.x - 1, top: 9.5 }}>{heads[1]}</Micro>
      <Micro style={{ position: 'absolute', right: 9, top: 9.5 }}>{heads[2]}</Micro>
    </div>
    {children}
  </div>
);

const RowShell: React.FC<{ hover?: boolean; opacity?: number; children: React.ReactNode }> = ({ hover, opacity = 1, children }) => (
  <div style={{ position: 'relative', height: 47, background: hover ? C.neutral50 : undefined, opacity, fontSize: 13 }}>{children}</div>
);

const Quiet: React.FC<{ Icon?: typeof Lock; label?: string; hover?: boolean; style?: React.CSSProperties }> = ({ Icon, label, hover, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: '4px 10px',
      borderRadius: RADIUS.control,
      fontSize: 13,
      lineHeight: '19px',
      fontWeight: 500,
      color: hover ? C.text : C.text2,
      background: hover ? C.sunken : undefined,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {Icon ? <Icon size={14} strokeWidth={1.8} /> : null}
    {label}
  </span>
);

/** The flat-overview document row (Owen's and Eleanor's view): an accepted, bound document. */
const FlatDocRow: React.FC = () => (
  <RowShell>
    <FileText size={15} strokeWidth={1.7} color={C.muted} style={{ position: 'absolute', left: 371 - TABLE.x, top: 16 }} />
    <span style={{ position: 'absolute', left: 399 - TABLE.x, top: 13, display: 'flex', alignItems: 'baseline', gap: 12, whiteSpace: 'nowrap' }}>
      <b style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{WT_COLLAB.calderHaleRow.title}</b>
      <span style={{ fontSize: 12, color: C.muted }}>{WT_COLLAB.calderHaleRow.meta}</span>
    </span>
    <span style={{ position: 'absolute', left: FLAT_DELIV - TABLE.x, top: 14, display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT.mono, fontSize: 12.5, color: C.text2 }}>
      <Link size={13} strokeWidth={1.8} />
      {WT_COLLAB.calderHaleRow.ref}
    </span>
    <span style={{ position: 'absolute', right: 6, top: 10, display: 'flex', alignItems: 'center', gap: 2 }}>
      <Quiet Icon={Lock} label="Freeze" />
      <Quiet Icon={Send} label="Promote" />
      <Quiet Icon={Ellipsis} style={{ padding: '4px 8px' }} />
    </span>
  </RowShell>
);

/** Eleanor's new document row (BUILT-NP, `07` row on a selected sandbox). */
export const DOTS = { x: 1369, y: 464 };
const NewDocRow: React.FC<{ at: F; dotsHover?: boolean }> = ({ at, dotsHover }) => {
  const f = useCurrentFrame();
  return (
    <RowShell opacity={appear(f, at, 3, ease.linear)}>
      <FileText size={15} strokeWidth={1.7} color={C.muted} style={{ position: 'absolute', left: 371 - TABLE.x, top: 16 }} />
      <span style={{ position: 'absolute', left: 399 - TABLE.x, top: 13, display: 'flex', alignItems: 'baseline', gap: 14, whiteSpace: 'nowrap' }}>
        <b style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{WT_COLLAB.docTitle}</b>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.text2 }}>{WT_COLLAB.docRow.rev}</span>
        <span style={{ fontSize: 12, color: C.muted, marginLeft: -4 }}>{WT_COLLAB.docRow.meta}</span>
      </span>
      <span style={{ position: 'absolute', left: 1110 - TABLE.x, top: 14 }}>
        <StatusPill tone="neutral" label={WT_COLLAB.docRow.state} />
      </span>
      <span style={{ position: 'absolute', right: 6, top: 10, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Quiet Icon={Lock} label="Freeze" />
        <Quiet Icon={Ellipsis} hover={dotsHover} style={{ padding: '4px 8px' }} />
      </span>
    </RowShell>
  );
};

const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
  <RowShell>
    <span style={{ position: 'absolute', left: 9, top: 14, fontSize: 13, color: C.muted, whiteSpace: 'nowrap' }}>{text}</span>
  </RowShell>
);

// ------------------------------------------------------------------ the page

export interface SandboxPageProps {
  org: string;
  isSuper: boolean;
  cards: CardSpec[];
  /** Index of the selected card (null = flat overview). */
  selected: number | null;
  /** Card fading in (the new sandbox). */
  cardAt?: { i: number; at: F };
  hoverCard?: number;
  /** Header button under the cursor / pressed. */
  hoverBtn?: HKey;
  pressBtn?: { k: HKey; at: F };
  /** Flat-overview rows: Rachel's empty project or the Calder & Hale document. */
  flat: 'empty' | 'calderHale';
  /** Selected-view toolbar variant. */
  toolbar?: 'owner' | 'member';
  /** Eleanor's new document row. */
  docRowAt?: F;
  dotsHover?: boolean;
  /** Row menu open / item hover. */
  menu?: { at: F; hover?: number };
  overlay?: React.ReactNode;
}

export const SandboxPage: React.FC<SandboxPageProps> = ({ org, isSuper, cards, selected, cardAt, hoverCard, hoverBtn, pressBtn, flat, toolbar = 'owner', docRowAt, dotsHover, menu }) => {
  const f = useCurrentFrame();
  const btns = headerButtons(selected !== null, isSuper);
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: FONT.sans, color: C.text }}>
      <div style={{ ...pos(342, 98), fontFamily: FONT.serif, fontSize: 29, fontWeight: 500, letterSpacing: 0.1, lineHeight: '38px', whiteSpace: 'nowrap' }}>{SB.title}</div>
      {btns.map((b) => (
        <HeaderButton key={b.k} k={b.k} x={b.x0} hover={hoverBtn === b.k} pressAt={pressBtn?.k === b.k ? pressBtn.at : undefined} />
      ))}
      <div style={{ ...pos(342, 145), width: 760, fontSize: 13, lineHeight: 1.55, color: C.muted }}>{SB.sub}</div>
      <Micro style={{ ...pos(342, 217) }}>{SB.sectionLabel}</Micro>
      {cards.map((c, i) => (
        <Card key={c.name} c={c} x={CARD_X[i]} selected={selected === i} hover={hoverCard === i} at={cardAt?.i === i ? cardAt.at : undefined} />
      ))}
      {selected === null ? (
        <>
          <Micro style={{ ...pos(342, 342) }}>{SB.allDocs(org)}</Micro>
          <TableBox top={366} heads={['Document', 'Deliverable', 'Actions']} delivX={FLAT_DELIV}>
            {flat === 'empty' ? <EmptyRow text={SB.flatEmpty} /> : <FlatDocRow />}
          </TableBox>
        </>
      ) : (
        <>
          <div style={{ ...pos(342, 337), display: 'flex', alignItems: 'center', gap: 2, height: 22, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 12.5, color: C.muted, marginRight: 8 }}>{SB.inScope}</span>
            <Quiet Icon={Users} label={SB.toolbarOwner[0]} />
            {toolbar === 'owner' ? (
              <>
                <Quiet Icon={FolderPlus} label={SB.toolbarOwner[1]} />
                <Quiet Icon={FolderTree} label={SB.toolbarOwner[2]} />
                <Quiet Icon={Settings} label={SB.toolbarOwner[3]} />
              </>
            ) : (
              <span style={{ fontSize: 12.5, color: C.muted, marginLeft: 10 }}>{SB.lockedStructure}</span>
            )}
          </div>
          <div style={{ ...pos(350, 375), fontSize: 13, fontWeight: 600, color: C.text, lineHeight: '18px' }}>{cards[selected].name}</div>
          <TableBox top={408} heads={['Name', 'Deliverable', 'Actions']} delivX={TREE_DELIV}>
            {docRowAt !== undefined && f >= docRowAt ? <NewDocRow at={docRowAt} dotsHover={dotsHover} /> : <EmptyRow text={SB.treeEmpty} />}
          </TableBox>
        </>
      )}
      {menu ? (
        <div style={{ position: 'absolute', left: -O.x, top: -O.y }}>
          <Dropdown
            x={1169}
            y={482}
            width={219}
            at={menu.at}
            items={WT_COLLAB.rowMenu.map((label, i) => ({
              label,
              hover: menu.hover !== undefined && i === menu.hover && f >= T.openHover,
              icon: [<FileText size={14} key="a" />, <FolderInput size={14} key="b" />, <FilePen size={14} key="c" />, <Pencil size={14} key="d" />, <Link size={14} key="e" />][i],
            }))}
          />
        </div>
      ) : null}
    </div>
  );
};

/** Row-menu item centre (07: items 32 tall from y 488). */
export const menuItem = (i: number) => ({ x: 1240, y: 503.5 + i * 29.7 });

// ------------------------------------------------------------------ modal frame

const FOOT_GAP = 8;
export type FKind = 'primary' | 'quiet' | 'disabled';
const fbWidth = (label: string, k: FKind) => 28 + tw(label, { size: 13, weight: k === 'quiet' ? 600 : 700 });

/** Footer buttons right-aligned to `right`, centre y `cy`; returns each button's box. */
export function footer(labels: Array<[string, FKind]>, right: number, cy: number) {
  let x = right;
  const out: Array<{ label: string; k: FKind; x0: number; x1: number; cx: number; cy: number }> = [];
  for (let i = labels.length - 1; i >= 0; i--) {
    const w = fbWidth(labels[i][0], labels[i][1]);
    out.unshift({ label: labels[i][0], k: labels[i][1], x0: x - w, x1: x, cx: x - w / 2, cy });
    x -= w + FOOT_GAP;
  }
  return out;
}

const FootBtn: React.FC<{ b: ReturnType<typeof footer>[number]; hover?: boolean; pressAt?: F }> = ({ b, hover, pressAt }) => {
  const f = useCurrentFrame();
  const primary = b.k !== 'quiet';
  return (
    <span
      style={{
        position: 'absolute',
        left: b.x0,
        top: b.cy - 16,
        width: b.x1 - b.x0,
        height: 32,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: RADIUS.control,
        fontSize: 13,
        fontWeight: primary ? 700 : 600,
        whiteSpace: 'nowrap',
        background: b.k === 'disabled' ? C.faint : primary ? (hover ? '#000' : C.ink) : hover ? C.sunken : 'transparent',
        color: primary ? '#fff' : C.text2,
        transform: `scale(${pressScale(f, pressAt)})`,
      }}
    >
      {b.label}
    </span>
  );
};

/**
 * The built modal (scrim + white card, radius 10, level-4 overlay), with the
 * header fixed at 54 px (y 64–118) so the plan's native y values hold.
 * Children are absolutely placed in PLATE coordinates.
 */
const W3Modal: React.FC<{ x: number; w: number; bottom: number; title: string; at: F; exitAt?: F; children: React.ReactNode }> = ({ x, w, bottom, title, at, exitAt, children }) => {
  const f = useCurrentFrame();
  const o = ui(f, at) * (exitAt === undefined ? 1 : 1 - ui(f, exitAt));
  if (o <= 0) return null;
  const top = 64;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, fontFamily: FONT.sans, color: C.text }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(28,27,24,.32)' }} />
      <div style={{ position: 'absolute', left: x, top, width: w, height: bottom - top, background: C.pane, borderRadius: RADIUS.lg, boxShadow: SHADOW.overlay, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 24, right: 24, top: 0, height: 54, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{title}</div>
          <X size={16} strokeWidth={1.8} color={C.muted} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 54, height: 1, background: C.border }} />
        <div style={{ position: 'absolute', left: -x, top: -top }}>{children}</div>
      </div>
    </div>
  );
};

const Label: React.FC<{ x: number; y: number; children: React.ReactNode }> = ({ x, y, children }) => (
  <div style={{ position: 'absolute', left: x, top: y - 7, fontSize: 11.5, lineHeight: '14px', fontWeight: 600, color: C.text2, letterSpacing: 0.1, whiteSpace: 'nowrap' }}>{children}</div>
);
const Hint: React.FC<{ x: number; y: number; w: number; children: React.ReactNode }> = ({ x, y, w, children }) => (
  <div style={{ position: 'absolute', left: x, top: y - 8, width: w, fontSize: 11.5, lineHeight: '16px', color: C.muted }}>{children}</div>
);
const Divider: React.FC<{ x: number; w: number; y: number }> = ({ x, w, y }) => <div style={{ position: 'absolute', left: x, top: y, width: w, height: 1, background: C.border }} />;

/** A text line that crossfades from `a` to `b` at `at` (ui). */
const Flip: React.FC<{ a: React.ReactNode; b: React.ReactNode; at: F }> = ({ a, b, at }) => {
  const f = useCurrentFrame();
  const p = ui(f, at);
  return (
    <span style={{ display: 'inline-grid' }}>
      <span style={{ gridArea: '1/1', opacity: 1 - p }}>{a}</span>
      <span style={{ gridArea: '1/1', opacity: p }}>{b}</span>
    </span>
  );
};

const FieldBox: React.FC<{ x: number; y0: number; y1: number; w: number; focused?: boolean; select?: boolean; children: React.ReactNode }> = ({ x, y0, y1, w, focused, select, children }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y0,
      width: w,
      height: y1 - y0,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      padding: select ? '0 10px 0 12px' : '0 12px',
      border: `1px solid ${focused ? C.muted : C.borderStrong}`,
      boxShadow: focused ? '0 0 0 3px rgba(28,27,24,.08)' : undefined,
      borderRadius: RADIUS.control,
      background: C.pane,
      fontSize: 13,
      color: C.text,
      whiteSpace: 'nowrap',
    }}
  >
    <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    {select ? <ChevronDown size={14} strokeWidth={1.8} color={C.muted} /> : null}
  </div>
);

/** The open list of a native select, drawn as the system Dropdown (DEV): 32 px rows, 4 px padding. */
const SelectList: React.FC<{ x: number; top: number; w: number; at: F; exitAt: F; options: string[]; selected: number; hover?: { i: number; from: F } }> = ({
  x,
  top,
  w,
  at,
  exitAt,
  options,
  selected,
  hover,
}) => {
  const f = useCurrentFrame();
  const o = appear(f, at, 4, ease.linear) * (1 - appear(f, exitAt, 4, ease.linear));
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: x, top, width: w, padding: 4, boxSizing: 'border-box', background: C.pane, borderRadius: RADIUS.control, boxShadow: SHADOW.overlay, opacity: o, zIndex: 5 }}>
      {options.map((opt, i) => (
        <div
          key={opt}
          style={{
            height: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 10px',
            borderRadius: 6,
            fontSize: 13,
            background: hover && hover.i === i && f >= hover.from ? C.sunken : undefined,
          }}
        >
          <span style={{ flex: 1 }}>{opt}</span>
          {i === selected ? <Check size={14} strokeWidth={2} color={C.text} /> : null}
        </div>
      ))}
    </div>
  );
};

/** A pick-list row (`.pick-row`): checkbox centre x 555, label at x 570, 31 tall. */
const PickRow: React.FC<{ y: number; name: string; sub?: string; at?: F; hover?: boolean }> = ({ y, name, sub, at, hover }) => (
  <div
    style={{
      position: 'absolute',
      left: 539,
      top: y - 15.5,
      width: 458,
      height: 31,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 8px',
      borderRadius: 6,
      background: hover ? C.sunken : undefined,
      fontSize: 13,
    }}
  >
    <Checkbox at={at} />
    <span style={{ color: C.text, whiteSpace: 'nowrap' }}>{name}</span>
    {sub ? <span style={{ color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{sub}</span> : null}
  </div>
);

const ListBox: React.FC<{ y0: number; y1: number }> = ({ y0, y1 }) => (
  <div style={{ position: 'absolute', left: 532, top: y0, width: 472, height: y1 - y0, boxSizing: 'border-box', border: `1px solid ${C.borderStrong}`, borderRadius: RADIUS.control }} />
);

// ------------------------------------------------------------------ the wizard (§3.3)

const WIZ = { x: 508, w: 520, bodyX: 532, bodyW: 472, right: 1004 } as const;
/** Pick-row centre y for row i in a list box starting at y0 (border 1, padding 6, 31 + 2). */
export const pickY = (y0: number, i: number) => y0 + 1 + 6 + 15.5 + i * 33;

/** Modal bottom by frame (the modal grows / shrinks with `ui`, 5 f). */
function wizardBottom(f: number) {
  const ease5 = (at: number, a: number, b: number) => a + (b - a) * ui(f, at);
  if (f < T.step2) return 394;
  if (f < T.step3) return ease5(T.step2, 394, 494);
  if (f < T.whoPick) return ease5(T.step3, 494, 304);
  return ease5(T.whoPick, 304, 500);
}

/** Cursor targets inside the wizard (plate coordinates). */
export function wizardGeom() {
  const s1 = footer([[WZ.buttons.cancel, 'quiet'], [WZ.buttons.next, 'primary']], WIZ.right, 362);
  const s2 = footer([[WZ.buttons.cancel, 'quiet'], [WZ.buttons.back, 'quiet'], [WZ.buttons.next, 'primary']], WIZ.right, 462);
  const s3 = footer([[WZ.buttons.cancel, 'quiet'], [WZ.buttons.back, 'quiet'], [WZ.buttons.create, 'primary']], WIZ.right, 468);
  return {
    name: { x: 768, y: 200 },
    access: { x: 768, y: 270 },
    accessOpt2: { x: 768, y: 338 },
    next1: { x: s1[1].cx, y: 362 },
    calder: { x: 555, y: pickY(184, 0) },
    redgate: { x: 555, y: pickY(184, 1) },
    next2: { x: s2[2].cx, y: 462 },
    who: { x: 768, y: 200 },
    whoOpt2: { x: 768, y: 268 },
    eleanor: { x: 555, y: pickY(254, 1) },
    nadia: { x: 555, y: pickY(254, 3) },
    create: { x: s3[2].cx, y: 468 },
  };
}

export const NewSandboxWizard: React.FC<{ hoverNext1?: boolean; hoverNext2?: boolean; hoverCreate?: boolean; hoverRow?: string }> = ({ hoverNext1, hoverNext2, hoverCreate, hoverRow }) => {
  const f = useCurrentFrame();
  const bottom = wizardBottom(f);
  const footY = bottom - 32;
  const step = f < T.step2 ? 1 : f < T.step3 ? 2 : 3;
  const bx = WIZ.bodyX;
  const typedAny = f >= TY.sandboxName.from;
  let foot: ReturnType<typeof footer>;
  if (step === 1) foot = footer([[WZ.buttons.cancel, 'quiet'], [WZ.buttons.next, typedAny ? 'primary' : 'disabled']], WIZ.right, footY);
  else if (step === 2) foot = footer([[WZ.buttons.cancel, 'quiet'], [WZ.buttons.back, 'quiet'], [WZ.buttons.next, 'primary']], WIZ.right, footY);
  else foot = footer([[WZ.buttons.cancel, 'quiet'], [WZ.buttons.back, 'quiet'], [WZ.buttons.create, 'primary']], WIZ.right, footY);
  const primaryHover = step === 1 ? hoverNext1 : step === 2 ? hoverNext2 : hoverCreate;
  const stepLine = (t: React.ReactNode) => <div style={{ position: 'absolute', left: bx, top: 135, fontSize: 12, lineHeight: '14px', color: C.muted, whiteSpace: 'nowrap' }}>{t}</div>;
  return (
    <W3Modal x={WIZ.x} w={WIZ.w} bottom={bottom} title={WZ.title} at={T.wizardIn} exitAt={T.wizardOut}>
      {step === 1 ? (
        <>
          {stepLine(<Flip a={WZ.step(1, 2)} b={WZ.step(1, 3)} at={T.accessPick} />)}
          <Label x={bx} y={166}>
            {WZ.nameLabel}
          </Label>
          <FieldBox x={bx} y0={184} y1={216} w={WIZ.bodyW} focused={f < 387}>
            <HumanTyped text={TY.sandboxName.text} from={TY.sandboxName.from} seed={TY.sandboxName.seed} placeholder={WZ.namePlaceholder} caretFrom={T.wizardIn + 5} caretUntil={387} />
          </FieldBox>
          <Label x={bx} y={243}>
            {WZ.accessLabel}
          </Label>
          <FieldBox x={bx} y0={254} y1={286} w={WIZ.bodyW} focused={f >= 387} select>
            <Flip a={WZ.access.private} b={WZ.access.shared} at={T.accessPick} />
          </FieldBox>
          <Hint x={bx} y={300} w={WIZ.bodyW}>
            <Flip a={WZ.accessHint.private} b={WZ.accessHint.shared} at={T.accessPick} />
          </Hint>
          <SelectList x={bx} top={286} w={WIZ.bodyW} at={T.accessOpen} exitAt={T.accessPick} options={[WZ.access.private, WZ.access.shared]} selected={0} hover={{ i: 1, from: 404 }} />
        </>
      ) : step === 2 ? (
        <>
          {stepLine(WZ.step(2, 3))}
          <Label x={bx} y={166}>
            {WZ.orgsLabel}
          </Label>
          <ListBox y0={184} y1={392} />
          {WZ.orgs.map((o, i) => (
            <PickRow key={o} y={pickY(184, i)} name={o} at={i === 0 ? T.tickCalder : i === 1 ? T.tickRedgate : undefined} hover={hoverRow === o} />
          ))}
          <Hint x={bx} y={408} w={WIZ.bodyW}>
            {WZ.orgsHint}
          </Hint>
        </>
      ) : (
        <>
          {stepLine(WZ.step(3, 3))}
          <Label x={bx} y={166}>
            {WZ.whoLabel}
          </Label>
          <FieldBox x={bx} y0={184} y1={216} w={WIZ.bodyW} focused={f >= 593 && f < T.whoPick + 30} select>
            <Flip a={WZ.who.everyone} b={WZ.who.specific} at={T.whoPick} />
          </FieldBox>
          {f >= T.whoPick ? (
            <div style={{ opacity: ui(f, T.whoPick) }}>
              <Label x={bx} y={243}>
                {WZ.peopleLabel}
              </Label>
              <ListBox y0={254} y1={396} />
              {WZ.people.map(([name, org], i) => (
                <PickRow key={name} y={pickY(254, i)} name={name} sub={org} at={i === 1 ? T.tickEleanor : i === 3 ? T.tickNadia : undefined} hover={hoverRow === name} />
              ))}
              <Hint x={bx} y={412} w={WIZ.bodyW}>
                {WZ.peopleHint}
              </Hint>
            </div>
          ) : null}
          <SelectList x={bx} top={216} w={WIZ.bodyW} at={T.whoOpen} exitAt={T.whoPick} options={[WZ.who.everyone, WZ.who.specific]} selected={0} hover={{ i: 1, from: 610 }} />
        </>
      )}
      <Divider x={WIZ.x} w={WIZ.w} y={footY - 32} />
      {foot.map((b) => (
        <FootBtn key={b.label} b={b} hover={b.k === 'primary' && primaryHover} pressAt={b.label === WZ.buttons.create ? T.createPress : undefined} />
      ))}
    </W3Modal>
  );
};

// ------------------------------------------------------------------ New document modal (§3.4)

const ND = { x: 568, w: 400, right: 944 } as const;
export function newDocGeom() {
  const b = footer([[WT_COLLAB.newDocModal.cancel, 'quiet'], [WT_COLLAB.newDocModal.cta, 'primary']], ND.right, 244);
  return { title: { x: 768, y: 176 }, create: { x: b[1].cx, y: 244 } };
}

export const NewDocModal: React.FC<{ hoverCreate?: boolean }> = ({ hoverCreate }) => {
  const f = useCurrentFrame();
  const m = WT_COLLAB.newDocModal;
  const typedAny = f >= TY.docTitle.from;
  const b = footer([[m.cancel, 'quiet'], [m.cta, typedAny ? 'primary' : 'disabled']], ND.right, 244);
  return (
    <W3Modal x={ND.x} w={ND.w} bottom={276} title={m.title} at={T.newDocModal} exitAt={T.newDocOut}>
      <Label x={592} y={142}>
        {m.label}
      </Label>
      <FieldBox x={592} y0={160} y1={192} w={352} focused>
        <HumanTyped text={TY.docTitle.text} from={TY.docTitle.from} seed={TY.docTitle.seed} placeholder={m.placeholder} caretFrom={T.newDocModal + 5} caretUntil={T.newDocOut} />
      </FieldBox>
      <Divider x={ND.x} w={ND.w} y={216} />
      {b.map((x) => (
        <FootBtn key={x.label} b={x} hover={x.k === 'primary' && hoverCreate} pressAt={x.k === 'primary' ? T.createDocPress : undefined} />
      ))}
    </W3Modal>
  );
};

