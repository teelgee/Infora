/**
 * S4 · the document creator from the firm's own outline (BUILT t1-02…t1-12;
 * VISION work-package field and grouped sources, drawn exactly as W2 through
 * the shared CreatorScreen). W4 adds the proposal and result cards (`after`).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, Shimmer, ui, type F } from '../../shared';
import { WT_TOOLS } from '../../data/wrenfield';
import { Btn, CreatorScreen, Crossfade, Shell, SunkenCard } from '../shared';
import { Probe } from './kit';

const CR = WT_TOOLS.creator;

const Muted: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 13, lineHeight: '19px', color: C.text2, maxWidth: 790, ...style }}>{children}</div>
);

const SectionBlock: React.FC<{ heading: string; purpose: string; sub?: boolean }> = ({ heading, purpose, sub }) => (
  <div style={{ marginLeft: sub ? 32 : 0, marginTop: 10, padding: '12px 13px 14px', background: 'rgba(255,255,255,.35)', borderRadius: 8 }}>
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{heading}</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: C.text2, border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: '3px 10px' }}>{CR.askAgent}</span>
    </div>
    <div
      style={{
        marginTop: 10,
        width: sub ? 746 : 778,
        background: C.pane,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: '9px 12px 18px',
        boxSizing: 'border-box',
        fontSize: 13,
        lineHeight: '17px',
        color: C.text,
      }}
    >
      {purpose}
      {sub ? ' It sits under “Baseline”.' : ''} {CR.sectionSuffix}
    </div>
  </div>
);

/** The proposal card, then the result (Working… → What was made). */
const After: React.FC<{ planAt?: F; acceptHoverFrom?: F; acceptPressAt?: F; workingAt?: F; resultAt?: F }> = ({ planAt, acceptHoverFrom, acceptPressAt, workingAt, resultAt }) => {
  const f = useCurrentFrame();
  if (planAt === undefined) return null;
  const S = CR.sections;
  if (f < planAt) return <div data-w4="cr-after" style={{ height: 1 }} />;
  return (
    <div data-w4="cr-after" style={{ opacity: ui(f, planAt) }}>
      <SunkenCard title={CR.proposalCard}>
        <Muted style={{ color: C.text }}>{CR.overview}</Muted>
        {S.map((s) => (
          <SectionBlock key={s.n} heading={s.heading} purpose={s.purpose} sub={s.n.includes('.')} />
        ))}
        <Muted style={{ marginTop: 12 }}>{CR.redraw}</Muted>
        <Muted style={{ marginTop: 12 }}>{CR.runIntro}</Muted>
        <div style={{ fontSize: 13, color: C.text, marginTop: 6 }}>{CR.runStep}</div>
        <div style={{ fontSize: 13, color: C.text, marginTop: 12 }} data-w4="cr-covers">
          <b>Covers:</b> {CR.coversPlan}
        </div>
        <Muted style={{ marginTop: 4 }}>{CR.writtenAs}</Muted>
        <Muted style={{ marginTop: 6 }}>{CR.styleNote}</Muted>
        <div style={{ marginTop: 14 }}>
          <span data-w4="cr-accept" style={{ display: 'inline-flex' }}>
            <Btn
              variant="primary"
              label={CR.accept}
              hover={acceptHoverFrom !== undefined && f >= acceptHoverFrom && f < (acceptPressAt ?? 0) + 6}
              pressAt={acceptPressAt}
              style={{ borderRadius: 999, padding: '4px 12px', fontSize: 12.5 }}
            />
          </span>
        </div>
      </SunkenCard>
      {workingAt !== undefined && f >= workingAt ? (
        <SunkenCard style={{ opacity: ui(f, workingAt) }}>
          <div data-w4="cr-result">
            {resultAt !== undefined && f >= resultAt ? (
              <div style={{ opacity: ui(f, resultAt) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{CR.resultCard}</div>
                <div style={{ fontSize: 13, color: C.text2, marginTop: 8 }}>
                  <b style={{ color: C.text }}>Covered:</b> {CR.covered}
                </div>
                <div style={{ fontSize: 14, color: C.text, marginTop: 6 }}>{CR.open}</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: C.text2 }}>Working…</div>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <Shimmer w={420} h={10} />
                  <Shimmer w={300} h={10} offset={8} />
                </div>
              </div>
            )}
          </div>
        </SunkenCard>
      ) : null}
    </div>
  );
};

export interface CreatorTimes {
  firmHoverFrom: F;
  firmPressAt: F;
  sectionsAt: F;
  /** Scroll before the skip (0 → 600). */
  scrollA: number;
  /** The skip: crossfade 12 f from here to the filled state. */
  skipAt: F;
  scrollB: number;
  seePlanHoverFrom: F;
  seePlanPressAt: F;
  planAt: F;
  acceptHoverFrom: F;
  acceptPressAt: F;
  workingAt: F;
  resultAt: F;
}

export const Creator: React.FC<{ t: CreatorTimes }> = ({ t }) => {
  const f = useCurrentFrame();
  const sections = CR.sections;
  const before = (
    <Shell seat="ELEANOR" nav="Tools" overlay={<Probe tag="crA" texts={['Land quality technical note', 'Sources this draft may use']} />}>
      <CreatorScreen
        scrollY={t.scrollA}
        styleGuide
        workPackage={{ value: CR.startState.workPackage }}
        outline={{ firmHover: f >= t.firmHoverFrom && f < t.firmPressAt + 6, firmPressAt: t.firmPressAt, sections, sectionsAt: t.sectionsAt }}
      />
    </Shell>
  );
  const ticked: Record<string, boolean> = Object.fromEntries(CR.ticked.map((r) => [r, true]));
  const after = (
    <Shell seat="ELEANOR" nav="Tools" overlay={<Probe tag="crB" texts={['See the plan', 'Sources this draft may use']} />}>
      <CreatorScreen
        scrollY={t.scrollB}
        styleGuide
        workPackage={{ value: CR.startState.workPackage }}
        outline={{ sections }}
        brief={{ forText: CR.brief, title: CR.docTitle }}
        ticked={ticked}
        seePlan={{ hover: f >= t.seePlanHoverFrom && f < t.seePlanPressAt + 6, pressAt: t.seePlanPressAt }}
        after={<After planAt={t.planAt} acceptHoverFrom={t.acceptHoverFrom} acceptPressAt={t.acceptPressAt} workingAt={t.workingAt} resultAt={t.resultAt} />}
      />
    </Shell>
  );
  return <Crossfade at={t.skipAt} a={before} b={after} />;
};
