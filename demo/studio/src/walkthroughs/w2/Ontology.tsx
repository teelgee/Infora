/**
 * Chapter 2: "How the library connects" (VISION screen, W2 §4.4), drawn in
 * the built language, with the BUILT-NP OntologyPanel controls in the detail
 * card (read-only classification for Rachel's seat; Relationships with
 * Confirm / Reject → Retire). Rachel's seat only: the PEA node appears here
 * because it is in Trentmoor's library. Eleanor never sees this view.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ChevronDown } from 'lucide-react';
import { appear, C, ease, FONT, RADIUS, SHADOW, ui, type F } from '../../shared';
import { WT_ASK, WT_LIB } from '../../data/wrenfield';
import { Btn, Page, PageHeader, Shell, StatusPill } from '../shared';
import { Abs, lin, Micro, PlateLayer, SuggestedTag, TextAt } from './common';
import { LibrarySwitch } from './Library';

const O = WT_ASK.ontology;

// ------------------------------------------------------------------ layout (W2 §4.4)

export const NODE = { w: 168, h: 54 } as const;

interface NodeDef {
  ref: string;
  label: string;
  title: string;
  x: number;
  y: number;
  /** Width (default NODE.w); the newest node is wider so its reference clears the status dot. */
  w?: number;
}

export const NODES: NodeDef[] = [
  { ref: 'WA-GEO-GIR-004', label: 'WA-GEO-GIR-004', title: WT_LIB.GIR.title, x: 620, y: 290 },
  { ref: 'WA-ENV-BAS-003', label: 'WA-ENV-BAS-003', title: WT_LIB.BAS.title, x: 620, y: 530 },
  { ref: 'WA-EIA-SCP-001', label: 'WA-EIA-SCP-001', title: WT_LIB.SCP.title, x: 800, y: 600 },
  { ref: 'WA-EIA-MST-001', label: 'WA-EIA-MST-001 · C01', title: WT_LIB.MST.title, x: 790, y: 410, w: 190 },
  { ref: 'WA-WAT-FRA-001', label: 'WA-WAT-FRA-001', title: WT_LIB.FRA.title, x: 991, y: 290 },
  { ref: 'WA-ECO-PEA-001', label: 'WA-ECO-PEA-001', title: WT_LIB.PEA.title, x: 991, y: 540 },
  { ref: 'WA-CON-SCC-002', label: 'WA-CON-SCC-002', title: WT_LIB.SCC.title, x: 620, y: 740 },
];
const nodeAt = (ref: string) => NODES.find((n) => n.ref === ref)!;

/** The facet column rows: y = row centre (native). */
type FacetRow = { y: number; kind: 'micro' | 'facet' | 'term'; text: string; before?: number; after?: number; lines?: 2 };
/**
 * Facet counts, before → after the method statement arrives. The method statement is classified as W1 shows it
 * (discipline EEN, document type MS — a method statement), so it adds an EEN and an MS row rather than another
 * V / RP. (WT_ASK.ontology.facetCounts still holds the earlier V 3→4 / RP 6→7 values.)
 */
const COUNTS: Array<{ term: string; before: number; after: number }> = [
  ...O.facetCounts
    .map((c) => ({ term: c.term, before: c.before, after: c.term === 'V Environmental' || c.term === 'RP Report' ? c.before : c.after })),
  { term: 'EEN Env. engineering', before: 0, after: 1 },
  { term: 'MS Method statement', before: 0, after: 1 },
];
const count = (term: string) => COUNTS.find((c) => c.term === term)!;
/** The method statement's classification in the detail card (W1: discipline EEN; a method statement). */
export const MST_CLASSIFICATION = ['EEN — Environmental engineering', 'Ss_15 — Earthworks and remediation systems', 'MS — Method statement', '2 — Concept design', 'Land quality'];
const term = (y: number, t: string, lines?: 2): FacetRow => ({ y, kind: 'term', text: t, before: count(t).before, after: count(t).after, lines });
const FACET_ROWS: FacetRow[] = [
  { y: 228, kind: 'micro', text: 'Classification' },
  { y: 254, kind: 'facet', text: 'Discipline' },
  term(272, 'V Environmental'),
  term(290, 'G Geotechnical'),
  term(308, 'D Drainage'),
  term(326, 'Z General / Multidiscipline'),
  term(344, 'EEN Env. engineering'),
  { y: 370, kind: 'facet', text: 'System (Uniclass Ss)' },
  term(395, 'Ss_15 Earthworks and remediation systems', 2),
  term(429, 'Ss_50 Disposal and drainage systems', 2),
  { y: 464, kind: 'facet', text: 'Document type' },
  term(482, 'RP Report'),
  term(500, 'MS Method statement'),
  { y: 526, kind: 'facet', text: 'Project stage' },
  term(544, '2 Concept design'),
  { y: 570, kind: 'facet', text: 'Work package' },
  term(588, 'Land quality'),
  term(606, 'Water environment'),
  term(624, 'Ecology'),
  term(642, 'Consultation'),
];
/** LINKS legend top (moved down 36 for the two added facet rows). */
const LINKS_Y = 676;

// ------------------------------------------------------------------ edges

export interface EdgeTiming {
  /** Dashed stroke grows from the source over 15 f from here. Omit: present from the start. */
  drawAt?: F;
  /** Chip + `suggested` tag fade in (5 f). */
  chipAt?: F;
  /** Dashed → solid crossfade (5 f) and the tag fades. */
  confirmAt?: F;
}

/** Clip a segment from centre a toward centre b at a's node rectangle (with a small gap). */
function exitPoint(ax: number, ay: number, bx: number, by: number, pad = 4, w: number = NODE.w) {
  const dx = bx - ax;
  const dy = by - ay;
  const hw = w / 2 + pad;
  const hh = NODE.h / 2 + pad;
  const t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  return { x: ax + dx * t, y: ay + dy * t };
}

const EDGE_COL = C.faint; // #c7c5be

const EdgeLine: React.FC<{ from: string; to: string; t: EdgeTiming }> = ({ from, to, t }) => {
  const f = useCurrentFrame();
  const a = nodeAt(from);
  const b = nodeAt(to);
  const p0 = exitPoint(a.x, a.y, b.x, b.y, 4, a.w);
  const p1 = exitPoint(b.x, b.y, a.x, a.y, 6, b.w);
  const grow = t.drawAt === undefined ? 1 : ease.inOut(lin(f, t.drawAt, 15));
  if (grow <= 0) return null;
  const solid = t.drawAt === undefined ? 1 : t.confirmAt === undefined ? 0 : lin(f, t.confirmAt, 5);
  const ex = p0.x + (p1.x - p0.x) * grow;
  const ey = p0.y + (p1.y - p0.y) * grow;
  const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const head = (o: number) => {
    const L = 8;
    const W = 4.2;
    const bx = p1.x - Math.cos(ang) * L;
    const by = p1.y - Math.sin(ang) * L;
    const nx = -Math.sin(ang) * W;
    const ny = Math.cos(ang) * W;
    return <path d={`M${p1.x},${p1.y} L${bx + nx},${by + ny} L${bx - nx},${by - ny} Z`} fill={EDGE_COL} opacity={o} />;
  };
  return (
    <g>
      {solid < 1 ? <line x1={p0.x} y1={p0.y} x2={ex} y2={ey} stroke={EDGE_COL} strokeWidth={1.5} strokeDasharray="5 4" opacity={1 - solid} /> : null}
      {solid > 0 ? <line x1={p0.x} y1={p0.y} x2={ex} y2={ey} stroke={EDGE_COL} strokeWidth={1.5} opacity={solid} /> : null}
      {grow >= 1 ? head(1) : null}
    </g>
  );
};

const EdgeChip: React.FC<{ x: number; y: number; type: string; t: EdgeTiming; suggested: boolean }> = ({ x, y, type, t, suggested }) => {
  const f = useCurrentFrame();
  const o = t.chipAt === undefined ? 1 : ui(f, t.chipAt);
  if (o <= 0) return null;
  const tagO = suggested ? (t.confirmAt === undefined ? 1 : 1 - ui(f, t.confirmAt)) : 0;
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', opacity: o, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: '17px', color: C.text2, background: C.sunken, borderRadius: 4, padding: '0 6px' }}>{type}</span>
      {tagO > 0 ? (
        <span style={{ position: 'absolute', left: '100%', opacity: tagO }}>
          <SuggestedTag style={{ marginLeft: 4 }} />
        </span>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ nodes

const NodeCard: React.FC<{ n: NodeDef; at?: F; selectedAt?: F }> = ({ n, at, selectedAt }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : appear(f, at, 12, ease.out);
  if (o <= 0) return null;
  const sel = selectedAt !== undefined && f >= selectedAt;
  return (
    <div
      style={{
        position: 'absolute',
        left: n.x - (n.w ?? NODE.w) / 2,
        top: n.y - NODE.h / 2,
        width: n.w ?? NODE.w,
        height: NODE.h,
        boxSizing: 'border-box',
        padding: '9px 22px 0 11px',
        background: C.sunken,
        borderRadius: RADIUS.control,
        boxShadow: sel ? `${SHADOW.popout}, 0 0 0 1.5px ${C.ink}` : SHADOW.popout,
        opacity: o,
        fontFamily: FONT.sans,
      }}
    >
      <span style={{ position: 'absolute', right: 8, top: 8, width: 6, height: 6, borderRadius: 999, background: C.success.dot }} />
      <div style={{ fontFamily: FONT.mono, fontSize: 12.5, lineHeight: '17px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap', letterSpacing: -0.2 }}>{n.label}</div>
      <div style={{ fontSize: 12, lineHeight: '17px', color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{n.title}</div>
    </div>
  );
};

// ------------------------------------------------------------------ detail card (BUILT-NP ontology-panel.tsx)

/** Centres of the quiet Confirm / Reject buttons (native x). */
export const CONFIRM_X = 1424;
export const REJECT_X = 1475;

export interface RelRow {
  type: string;
  to: string;
  /** Row confirmed: tag + Confirm go, Reject → Retire. */
  confirmAt?: F;
  /** Confirm button hover from (cursor arrival) until confirm. */
  hoverFrom?: F;
  pressAt?: F;
}

const DisabledSelect: React.FC<{ value: string }> = ({ value }) => (
  <div
    style={{
      position: 'absolute',
      left: 1250,
      width: 238,
      height: 28,
      transform: 'translateY(-50%)',
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px 0 10px',
      border: `1px solid ${C.border}`,
      borderRadius: RADIUS.control,
      background: C.neutral50,
      fontSize: 12.5,
      color: C.muted,
    }}
  >
    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    <ChevronDown size={13} strokeWidth={1.8} color={C.faint} />
  </div>
);

export const OntologyDetailCard: React.FC<{ selectedAt?: F; headerAt?: F; classAt?: F; relAt?: F; rows: RelRow[] }> = ({ selectedAt, headerAt, classAt, relAt, rows }) => {
  const f = useCurrentFrame();
  const selected = selectedAt !== undefined && f >= selectedAt;
  const mst = WT_LIB.MST;
  const cls = MST_CLASSIFICATION;
  const facets = O.facets;
  const hO = headerAt === undefined ? 1 : ui(f, headerAt);
  const cO = classAt === undefined ? 1 : ui(f, classAt);
  const rO = relAt === undefined ? 1 : ui(f, relAt);
  return (
    <>
      <Abs x={1104} y={212} w={400} h={418} style={{ background: C.pane, borderRadius: RADIUS.lg, boxShadow: `${SHADOW.popout}, 0 0 0 1px ${C.border}` }} />
      {!selected ? (
        <TextAt x={1120} y={240} size={12.5} style={{ color: C.muted }}>
          {O.detailPlaceholder}
        </TextAt>
      ) : (
        <>
          <div style={{ opacity: hO }}>
            <TextAt x={1120} y={230} size={13} style={{ fontFamily: FONT.mono, fontWeight: 700 }}>
              {mst.ref} · {mst.rev}
            </TextAt>
            <TextAt x={1120} y={250} size={12.5} style={{ color: C.muted }}>
              {mst.title}
            </TextAt>
            <Abs x={1120} y={267}>
              <StatusPill tone="success" label={O.usedPill} />
            </Abs>
          </div>
          <div style={{ opacity: cO }}>
            <Abs x={1120} y={298} w={368} style={{ borderTop: `1px solid ${C.border}` }} />
            <TextAt x={1120} y={312} size={11.5} style={{ fontWeight: 600, color: C.text2 }}>
              Classification
            </TextAt>
            {facets.map((fc, i) => {
              const y = 336 + i * 34;
              return (
                <React.Fragment key={fc}>
                  <TextAt x={1120} y={y} size={12} style={{ color: C.text2 }}>
                    {fc}
                  </TextAt>
                  <div style={{ position: 'absolute', left: 0, top: y }}>
                    <DisabledSelect value={cls[i]} />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <div style={{ opacity: rO }}>
            <TextAt x={1120} y={512} size={11.5} style={{ fontWeight: 600, color: C.text2 }}>
              Relationships
            </TextAt>
            {rows.map((r, i) => {
              const y = 540 + i * 30;
              const done = r.confirmAt !== undefined && f >= r.confirmAt;
              const hover = r.hoverFrom !== undefined && f >= r.hoverFrom && !done;
              return (
                <React.Fragment key={r.to}>
                  <TextAt x={1120} y={y} size={12.5} style={{ color: C.muted }}>
                    →
                  </TextAt>
                  <TextAt x={1139} y={y} size={12} style={{ color: C.text, display: 'flex', alignItems: 'center' }}>
                    <span>
                      {r.type} <strong style={{ fontWeight: 700 }}>{r.to}</strong>
                    </span>
                    {!done ? <SuggestedTag style={{ marginLeft: 5, fontSize: 10.5, padding: '0 4px' }} /> : null}
                  </TextAt>
                  {!done ? (
                    <div style={{ position: 'absolute', left: CONFIRM_X, top: y, transform: 'translate(-50%, -50%)' }}>
                      <Btn variant="quiet" size="sm" label="Confirm" hover={hover} pressAt={r.pressAt} style={{ padding: '3px 6px' }} />
                    </div>
                  ) : null}
                  <div style={{ position: 'absolute', left: REJECT_X, top: y, transform: 'translate(-50%, -50%)' }}>
                    <Btn variant="quiet" size="sm" label={done ? 'Retire' : 'Reject'} style={{ padding: '3px 6px' }} />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};

// ------------------------------------------------------------------ the view

export interface OntologyViewProps {
  /** MST node fades in (12 f) and the counts tick to "after" (5 f). */
  mstAt: F;
  /** The three suggested edges: MST→GIR, MST→BAS, MST→FRA. */
  edges: [EdgeTiming, EdgeTiming, EdgeTiming];
  selectedAt?: F;
  detail: { headerAt: F; classAt: F; relAt: F };
  rows: RelRow[];
}

const FacetColumn: React.FC<{ countsAt: F }> = ({ countsAt }) => {
  const f = useCurrentFrame();
  const p = ui(f, countsAt);
  return (
    <>
      <Abs x={236} y={212} w={240} h={604} style={{ background: C.sunken, borderRadius: RADIUS.control }} />
      {FACET_ROWS.map((r, i) => {
        if (r.kind === 'micro')
          return (
            <TextAt key={i} x={252} y={r.y} size={10.5}>
              <Micro>{r.text}</Micro>
            </TextAt>
          );
        if (r.kind === 'facet')
          return (
            <TextAt key={i} x={252} y={r.y} size={12} style={{ fontWeight: 700, color: C.text }}>
              {r.text}
            </TextAt>
          );
        const changes = r.before !== r.after;
        const top = r.lines === 2 ? r.y - 9 : r.y;
        return (
          <React.Fragment key={i}>
            <span
              style={{
                position: 'absolute',
                left: 252,
                top: top - 6.5,
                width: 13,
                height: 13,
                boxSizing: 'border-box',
                border: '1.5px solid #8a887f',
                borderRadius: 3,
                background: C.pane,
              }}
            />
            <TextAt x={272} y={top} size={12} lh={r.lines === 2 ? 18 : 17} w={r.lines === 2 ? 160 : undefined} style={{ color: C.text2, ...(r.lines === 2 ? { top: top - 9 } : {}) }}>
              {r.text}
            </TextAt>
            <TextAt x={460} y={top} size={12} right style={{ color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
              {changes ? (
                <span style={{ display: 'inline-grid' }}>
                  <span style={{ gridArea: '1/1', opacity: 1 - p }}>{r.before}</span>
                  <span style={{ gridArea: '1/1', opacity: p }}>{r.after}</span>
                </span>
              ) : (
                r.before
              )}
            </TextAt>
          </React.Fragment>
        );
      })}
      <TextAt x={252} y={LINKS_Y} size={10.5}>
        <Micro>Links</Micro>
      </TextAt>
      {O.edgeTypes.map((t, i) => (
        <React.Fragment key={t}>
          <svg style={{ position: 'absolute', left: 252, top: LINKS_Y + 22 + i * 18 - 5 }} width={26} height={10}>
            <line x1={0} y1={5} x2={19} y2={5} stroke={EDGE_COL} strokeWidth={1.5} />
            <path d="M24,5 L18,1.8 L18,8.2 Z" fill={EDGE_COL} />
          </svg>
          <TextAt x={286} y={LINKS_Y + 22 + i * 18} size={12} style={{ color: C.text2 }}>
            {t}
          </TextAt>
        </React.Fragment>
      ))}
      <svg style={{ position: 'absolute', left: 252, top: LINKS_Y + 118 - 5 }} width={26} height={10}>
        <line x1={0} y1={5} x2={19} y2={5} stroke={EDGE_COL} strokeWidth={1.5} strokeDasharray="5 4" />
        <path d="M24,5 L18,1.8 L18,8.2 Z" fill={EDGE_COL} />
      </svg>
      <TextAt x={286} y={LINKS_Y + 118} size={12} style={{ color: C.text2 }}>
        {O.suggestedTag}
      </TextAt>
    </>
  );
};

/** Links already confirmed before the method statement arrives (review should-fix 6: the map is lived-in). */
const EXISTING = [
  { from: 'WA-ECO-PEA-001', type: 'references', to: 'WA-ENV-BAS-003', chip: { x: 805, y: 535 } },
  { from: 'WA-CON-SCC-002', type: 'responds to', to: 'WA-EIA-SCP-001', chip: { x: 710, y: 670 } },
];

export const OntologyView: React.FC<OntologyViewProps> = ({ mstAt, edges, selectedAt, detail, rows }) => {
  const [gir, bas, fra] = edges;
  const confirmed = O.w2Edges[0];
  return (
    <Shell seat="RACHEL" nav="Project library" overlay={<LibrarySwitch active="How it connects" />}>
      <Page>
        <PageHeader title={O.title} sub={O.sub} />
      </Page>
      <PlateLayer>
        <FacetColumn countsAt={mstAt} />
        {/* work-package regions */}
        {O.regions.map((r) => (
          <Abs key={r.label} x={r.x0} y={r.y0} w={r.x1 - r.x0} h={r.y1 - r.y0} style={{ background: '#f7f6f3', borderRadius: 14 }}>
            <div style={{ position: 'absolute', left: 12, top: 10 }}>
              <Micro>{r.label}</Micro>
            </div>
          </Abs>
        ))}
        {/* edges under the nodes */}
        <svg style={{ position: 'absolute', left: 0, top: 0 }} width={1536} height={864}>
          <EdgeLine from={confirmed.from} to={confirmed.to} t={{}} />
          {EXISTING.map((e) => (
            <EdgeLine key={e.from + e.to} from={e.from} to={e.to} t={{}} />
          ))}
          <EdgeLine from="WA-EIA-MST-001" to="WA-GEO-GIR-004" t={gir} />
          <EdgeLine from="WA-EIA-MST-001" to="WA-ENV-BAS-003" t={bas} />
          <EdgeLine from="WA-EIA-MST-001" to="WA-WAT-FRA-001" t={fra} />
        </svg>
        {NODES.map((n) => (
          <NodeCard key={n.ref} n={n} at={n.ref === 'WA-EIA-MST-001' ? mstAt : undefined} selectedAt={n.ref === 'WA-EIA-MST-001' ? selectedAt : undefined} />
        ))}
        <EdgeChip x={confirmed.chip.x} y={confirmed.chip.y} type={confirmed.type} t={{}} suggested={false} />
        {EXISTING.map((e) => (
          <EdgeChip key={e.from + e.to} x={e.chip.x} y={e.chip.y} type={e.type} t={{}} suggested={false} />
        ))}
        <EdgeChip x={705} y={350} type="derived from" t={gir} suggested />
        <EdgeChip x={705} y={470} type="derived from" t={bas} suggested />
        <EdgeChip x={890} y={350} type="references" t={fra} suggested />
        <OntologyDetailCard selectedAt={selectedAt} headerAt={detail.headerAt} classAt={detail.classAt} relAt={detail.relAt} rows={rows} />
      </PlateLayer>
    </Shell>
  );
};
