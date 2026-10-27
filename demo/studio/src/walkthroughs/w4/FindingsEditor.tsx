/**
 * S3 · the Editor with the checker's findings (BUILT t2-07, t2-10, t2-12;
 * VISION the Accuracy group copy and the pill hover card, flows B.4; DEV the
 * paragraphs reflowed). Rail unlit (`nav: null`). This is an older working
 * copy: it still says "south of the Wrenfield substation" (W1's accepted text
 * reads "in three trial pits at Wrenfield Sidings"); it never reads WT_MST_TEXT.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, MessageSquare } from 'lucide-react';
import { C, FONT, Mark, RADIUS, SHADOW, SourceChip, appear, ease, ui, type F } from '../../shared';
import { WT_TOOLS } from '../../data/wrenfield';
import { Btn, EditorBar, Prose, Shell, StatusPill } from '../shared';
import { prog, Probe } from './kit';

const FD = WT_TOOLS.findings;
const SP = FD.canvasSpans;

export interface FindingsTimes {
  mechHoverFrom: F;
  mechClick: F;
  tracked1: F;
  settle1: F;
  cardFade: F;
  closeUp: [F, F];
  panelScroll: [F, F];
  pillHoverFrom: F;
  hoverIn: F;
  hoverOut: F;
  accHoverFrom: F;
  accClick: F;
  tracked2: F;
  settle2: F;
  resolve2: F;
}

// ------------------------------------------------------------------ canvas

/** A tracked substitution: struck deletion + green insert from `at`; settles to plain `ins` over 8 f from `settle`. */
const Tracked: React.FC<{ del: string; ins: string; at: F; settle: F }> = ({ del, ins, at, settle }) => {
  const f = useCurrentFrame();
  if (f < at) return <span>{del}</span>;
  const s = prog(f, settle, settle + 8);
  const p = ui(f, at);
  const delGone = f >= settle + 8;
  return (
    <span>
      {delGone ? null : (
        <span style={{ background: C.danger.tint, color: C.danger.text, textDecoration: 'line-through', borderRadius: 2, padding: '0 1px', opacity: 1 - s }}>{del}</span>
      )}
      {delGone ? null : ' '}
      <span
        style={{
          background: `rgba(232,245,234,${p * (1 - s)})`,
          color: s >= 1 ? C.text : C.success.text,
          textDecoration: s < 1 ? 'underline' : 'none',
          textDecorationColor: `rgba(47,158,82,${1 - s})`,
          textDecorationThickness: 1.5,
          textUnderlineOffset: 3,
          padding: '0 1px',
          borderRadius: 2,
        }}
      >
        {ins}
      </span>
    </span>
  );
};

const H: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ marginTop: 22, fontWeight: 500 }}>{children}</div>;

const Canvas: React.FC<{ t: FindingsTimes }> = ({ t }) => {
  const f = useCurrentFrame();
  const ON = -100;
  return (
    <Prose style={{ marginTop: 14 }}>
      <div>
        <Mark kind="advisory" at={ON}>
          EIA Scoping Method Statement - Land Quality
        </Mark>
      </div>
      <div>Routewide, Wrenfield-Ashcombe 400kV Connection</div>
      <H>1. Purpose and scope</H>
      <div>
        This method statement sets out the approach to scoping the Land Quality chapter of the Environmental Impact Assessment for{' '}
        {f < t.tracked1 ? (
          <Mark kind="advisory" at={ON}>
            the {SP.routewide}
          </Mark>
        ) : (
          <>
            the <Tracked del={SP.routewide} ins="scheme" at={t.tracked1} settle={t.settle1} />
          </>
        )}
        . It draws on the accepted ground investigation and contamination records held in the project library and identifies the assessment framework for land contamination,
        soils and geology along the route corridor.
      </div>
      <H>2. Baseline sources</H>
      <div>
        The desk study draws on the Phase 2 Ground Investigation Report (WA-GEO-GIR-004), the Environmental Baseline Report (WA-ENV-BAS-003) and the Flood Risk Assessment
        (WA-WAT-FRA-001). The GIR records{' '}
        <Mark kind="required" at={ON}>
          {SP.unit}
        </Mark>{' '}
        {f < t.tracked2 ? (
          <Mark kind="required" at={ON} anchor="fx-acc-span">
            {SP.accuracy}
          </Mark>
        ) : (
          <Tracked del={SP.accuracy} ins={SP.accuracyFixed} at={t.tracked2} settle={t.settle2} />
        )}{' '}
        and a perched water table within the made ground west of Ashcombe Lane.
      </div>
      <H>3. Conceptual site model</H>
      <div>
        <Mark kind="advisory" at={ON}>
          {SP.passive}
        </Mark>{' '}
        Sources considered include historic landfill, agricultural fuel storage and made ground associated with the former works. Pathways assessed are direct contact,
        leaching to controlled waters and ground gas migration. Receptors are construction workers, future maintenance staff, adjacent residents and the underlying
        secondary aquifer.
      </div>
      <H>4. Assessment methodology</H>
      <div>
        Significance will be assessed following the Land Contamination Risk Management (LCRM) framework. Where the preliminary risk assessment identifies a potentially
        unacceptable risk, …
      </div>
    </Prose>
  );
};

// ------------------------------------------------------------------ panel

const Collapse: React.FC<{ fade?: [F, number]; close?: [F, F]; children: React.ReactNode }> = ({ fade, close, children }) => {
  const f = useCurrentFrame();
  const o = fade ? 1 - prog(f, fade[0], fade[0] + fade[1]) : 1;
  const c = close ? prog(f, close[0], close[1], ease.inOut) : 0;
  if (c >= 1) return null;
  return (
    <div style={{ display: 'grid', gridTemplateRows: `${1 - c}fr` }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <div style={{ opacity: o }}>{children}</div>
      </div>
    </div>
  );
};

const GoTo: React.FC = () => <span style={{ fontSize: 12.5, color: C.text, textDecoration: 'underline', textUnderlineOffset: 2 }}>Go to it</span>;

const FCard: React.FC<{ tone: 'Advisory' | 'Required'; children: React.ReactNode; a?: string }> = ({ tone, children, a }) => (
  <div data-w4={a} style={{ background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, padding: '12px 12px 14px', marginTop: 10, boxShadow: '0 1px 2px rgba(20,20,20,.03)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <StatusPill tone={tone === 'Required' ? 'warning' : 'neutral'} label={tone} size={12} />
      <GoTo />
    </div>
    <div style={{ fontSize: 13, lineHeight: '17.5px', color: C.text, marginTop: 10 }}>{children}</div>
  </div>
);

const Rule: React.FC<{ clause: string; source: string; quote: string }> = ({ clause, source, quote }) => (
  <div style={{ background: C.sunken, borderRadius: 4, padding: '8px 12px', marginTop: 8, fontSize: 12.5, lineHeight: '16.5px', color: C.text2 }}>
    <span style={{ fontFamily: FONT.mono, fontSize: 12 }}>{clause}</span> {source}
    <div style={{ fontStyle: 'italic', color: C.text }}>{quote}</div>
  </div>
);

const Actions: React.FC<{ list: string[]; hover?: string; pressAt?: F; a?: string }> = ({ list, hover, pressAt, a }) => (
  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
    {list.map((x) => (
      <span key={x} data-w4={x === 'Accept' ? a : undefined} style={{ display: 'inline-flex' }}>
        <Btn variant="secondary" label={x} hover={hover === x} pressAt={x === 'Accept' ? pressAt : undefined} style={{ padding: '5px 13px', fontWeight: 500, color: C.text }} />
      </span>
    ))}
  </div>
);

const Quote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginTop: 6, paddingLeft: 9, borderLeft: `2px solid ${C.borderStrong}`, fontSize: 13, lineHeight: '17.5px', color: C.text }}>{children}</div>
);

const GroupHead: React.FC<{ label: string; n: number }> = ({ label, n }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
    <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text2 }}>
      ⌄ {label} <span style={{ fontWeight: 500, color: C.muted }}>({n})</span>
    </span>
    <span style={{ marginLeft: 'auto' }}>
      <Btn variant="secondary" label="Dismiss all" style={{ fontWeight: 500, color: C.text }} />
    </span>
  </div>
);

const Panel: React.FC<{ t: FindingsTimes }> = ({ t }) => {
  const f = useCurrentFrame();
  const stage = f >= t.resolve2 ? 2 : f >= t.closeUp[0] ? 1 : 0;
  const scroll = prog(f, t.panelScroll[0], t.panelScroll[1], ease.inOut) * 600;
  const [g1, g2, g3] = FD.groups;
  const h = g1.findings;
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        <div style={{ fontSize: 12.5, lineHeight: '16px', color: C.muted, paddingTop: 2 }}>{FD.counters[stage]}</div>
        <GroupHead label={g1.label} n={stage === 0 ? 3 : 2} />
        <Collapse fade={[t.cardFade, 5]} close={t.closeUp}>
          <div style={{ marginTop: 12 }} data-w4="fx-mech">
            <span style={{ display: 'inline-flex' }}>
              <Btn variant="primary" label={FD.bulk} hover={f >= t.mechHoverFrom && f < t.mechClick + 6} pressAt={t.mechClick} style={{ padding: '6px 16px' }} />
            </span>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: '16px', color: C.muted, marginTop: 6 }}>{FD.bulkNote}</div>
          <FCard tone="Advisory">
            {h[0].text}
            <Rule clause={h[0].clause!} source={h[0].source!} quote={h[0].rule} />
            <div style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.text, marginTop: 10 }}>{h[0].fix}</div>
            <Actions list={['Accept', 'Edit', 'Dismiss']} />
          </FCard>
        </Collapse>
        <div style={{ fontSize: 12.5, lineHeight: '16px', color: C.muted, marginTop: 12 }}>{FD.rewriteDivider}</div>
        <FCard tone="Advisory">
          {h[1].text}
          <div style={{ color: C.muted, marginTop: 8, fontSize: 12.5, lineHeight: '16.5px' }}>{h[1].rule}</div>
          <div style={{ color: C.muted, marginTop: 8, fontSize: 12.5, lineHeight: '16.5px' }}>{FD.suggestedLead}</div>
          <Quote>{h[1].suggested}</Quote>
          <Actions list={['Accept', 'Edit', 'Dismiss']} />
        </FCard>
        <FCard tone="Required">
          {h[2].text}
          <Rule clause={h[2].clause!} source={h[2].source!} quote={h[2].rule} />
          <Actions list={['Dismiss']} />
        </FCard>
        <Collapse fade={[t.resolve2, 5]} close={[t.resolve2 + 5, t.resolve2 + 17]}>
          <GroupHead label={g2.label} n={1} />
          <FCard tone="Required" a="fx-acc-card">
            {g2.findings[0].text}
            <div style={{ marginTop: 9 }}>
              <span data-w4="fx-acc-pill" style={{ display: 'inline-flex' }}>
                <SourceChip docRef={g2.findings[0].ref!} size={11.5} activeAt={f >= t.pillHoverFrom && f < t.hoverOut + 4 ? t.pillHoverFrom : undefined} />
              </span>
            </div>
            <div style={{ color: C.muted, marginTop: 9, fontSize: 12.5, lineHeight: '16.5px' }}>{FD.suggestedLead}</div>
            <Quote>{g2.findings[0].suggested}</Quote>
            <Actions list={['Accept', 'Edit', 'Dismiss']} hover={f >= t.accHoverFrom && f < t.accClick + 6 ? 'Accept' : undefined} pressAt={t.accClick} a="fx-acc-accept" />
          </FCard>
        </Collapse>
        <GroupHead label={g3.label} n={1} />
        <FCard tone="Advisory">{g3.findings[0].text}</FCard>
        {f >= t.resolve2 ? (
          <div style={{ fontSize: 12.5, lineHeight: '16px', color: C.muted, marginTop: 14, opacity: ui(f, t.resolve2 + 6) }}>{FD.resolvedNote}</div>
        ) : null}
      </div>
    </div>
  );
};

/** The local tab bar: as t2-07, `Checks (n)` and the pending note wrap rather than truncate. */
const Tabs: React.FC<{ checks: number; pending: string }> = ({ checks, pending }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 22, borderBottom: `1px solid ${C.border}`, marginBottom: 14, fontSize: 13, fontWeight: 600, flex: 'none' }}>
    <span style={{ paddingBottom: 9, color: C.text2 }}>Chat</span>
    <span style={{ paddingBottom: 9, color: C.text2 }}>Comments</span>
    <span style={{ paddingBottom: 9, color: C.text, borderBottom: `2px solid ${C.ink}`, marginBottom: -1, whiteSpace: 'nowrap' }}>Checks ({checks})</span>
    <span style={{ marginLeft: 'auto', width: 88, color: C.muted, fontWeight: 500, fontSize: 12, lineHeight: '15px', paddingBottom: 9 }}>{pending}</span>
  </div>
);

const FormatBar: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '0 0 10px', borderBottom: `1px solid ${C.border}`, color: C.text2, fontSize: 12.5, lineHeight: '24px', whiteSpace: 'nowrap' }}>
    <b>B</b>
    <i>I</i>
    <span style={{ width: 1, height: 14, background: C.border }} />
    <span>H2</span>
    <span>H3</span>
    <span style={{ width: 1, height: 14, background: C.border }} />
    <span>• List</span>
    <span>1. List</span>
    <span>❝ Quote</span>
    <span style={{ width: 1, height: 14, background: C.border }} />
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <MessageSquare size={13} strokeWidth={1.8} />
      Comment
    </span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <Check size={13} strokeWidth={2} />
      Check
    </span>
    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
      <span style={{ background: C.sunken, borderRadius: 6, padding: '0 9px', color: C.text, fontWeight: 500 }}>Write</span>
      <span style={{ padding: '0 9px' }}>Preview</span>
    </span>
  </div>
);

/** VISION (small): the pill's passage hover card, above-left of the pill. */
const HoverCard: React.FC<{ at: F; exitAt: F }> = ({ at, exitAt }) => {
  const f = useCurrentFrame();
  const o = appear(f, at, 4, ease.linear) * (1 - appear(f, exitAt, 4, ease.linear));
  if (o <= 0) return null;
  const hv = FD.hover;
  return (
    <div
      style={{
        position: 'absolute',
        left: 860,
        top: 368,
        width: 320,
        background: C.pane,
        borderRadius: RADIUS.control,
        boxShadow: SHADOW.overlay,
        padding: '12px 14px',
        opacity: o,
        fontFamily: FONT.sans,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: C.text }}>{hv.head}</span>
        <StatusPill tone="success" label={hv.state} size={11.5} />
      </div>
      <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 14, lineHeight: '20px', color: C.text, marginTop: 8 }}>{hv.quote}</div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>{hv.locator}</div>
    </div>
  );
};

export const FindingsEditor: React.FC<{ t: FindingsTimes }> = ({ t }) => {
  const f = useCurrentFrame();
  const stage = f >= t.resolve2 ? 2 : f >= t.closeUp[0] ? 1 : 0;
  return (
    <Shell
      seat="ELEANOR"
      nav={null}
      contentTone="sunken"
      secondBar={<EditorBar location="Calder & Hale — project sandbox" title={FD.docTitle} />}
      overlay={
        <>
          <HoverCard at={t.hoverIn} exitAt={t.hoverOut} />
          <Probe tag="fx" />
        </>
      }
    >
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
            padding: '42px 52px 0',
            boxSizing: 'border-box',
          }}
        >
          <FormatBar />
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Canvas t={t} />
          </div>
        </div>
        <div
          style={{
            width: 348,
            flex: 'none',
            background: C.pane,
            borderRadius: RADIUS.pane,
            boxShadow: SHADOW.soft,
            padding: '18px 18px 0',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Tabs checks={FD.checksTab[stage]} pending={FD.pending[stage]} />
          <Panel t={t} />
        </div>
      </div>
    </Shell>
  );
};
