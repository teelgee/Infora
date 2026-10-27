/**
 * Clip 01's Editor: the AppShell on Eleanor's seat with section 2 either
 * waiting (heading + one shimmer bar, shot 2) or landed (five Greek'd
 * sentences with their pills and a success flash, shot 10).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import {
  AppShell,
  appear,
  C,
  EditorPanes,
  EditorSecondBar,
  FONT,
  Greek,
  GreekText,
  Receipt,
  Shimmer,
  SideChat,
  SourceChip,
  SuccessFlash,
  TYPE,
  type F,
} from '../../shared';
import { ACCEPT_RECEIPT, DOC_REF, DOC_TITLE, DRAFT_SEGMENTS, PEOPLE, PROJECT } from '../../data/wrenfield';

const Heading: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ fontFamily: FONT.serif, fontSize: 18, fontWeight: 600, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>
    <GreekText text={text} greek />
  </div>
);

/** Section 2 body once accepted: plain prose, pills sharp, words Greek'd. */
const LandedSection: React.FC<{ at: F; flashAt: F }> = ({ at, flashAt }) => {
  const f = useCurrentFrame();
  const o = appear(f, at, 9);
  return (
    <div style={{ opacity: o }}>
      {DRAFT_SEGMENTS.map((s, i) => (
        <span key={i}>
          <SuccessFlash at={flashAt}>
            <GreekText text={s.text} greek />
          </SuccessFlash>{' '}
          <SourceChip docRef={s.source} size={11} />
          {i < DRAFT_SEGMENTS.length - 1 ? ' ' : null}
        </span>
      ))}
    </div>
  );
};

export interface EditorShellProps {
  /** Keep the shot-2 labels legible (project, title, composer placeholder, library chip). */
  shotTwoLabels?: boolean;
  /** Section 2 lands at this frame (else the shimmer bar). */
  landAt?: F;
  flashAt?: F;
  /** The accept receipt in the side panel. */
  receipt?: { at: F; focalAt: F; size: number };
}

export const EditorShell: React.FC<EditorShellProps> = ({ shotTwoLabels = false, landAt, flashAt, receipt }) => {
  const f = useCurrentFrame();
  const keep = shotTwoLabels ? [PROJECT, DOC_TITLE, 'Ask for a draft into this document', 'From the library'] : ['From the library'];
  const rO = receipt ? appear(f, receipt.at, 9) : 0;
  const focal = receipt ? appear(f, receipt.focalAt, 9) : 0;
  return (
    <AppShell
      seat={PEOPLE.ELEANOR}
      nav="Editor"
      topbar={{ project: PROJECT, owner: 'Trentmoor Energy', role: 'Member' }}
      secondBar={<EditorSecondBar docRef={DOC_REF} title={DOC_TITLE} />}
      greekChrome
      keep={keep}
    >
      <EditorPanes
        canvas={
          <div style={{ paddingTop: 8 }}>
            <Heading text="1. Purpose and scope" />
            <Greek lines={3} lineHeight={TYPE.prose * 1.75} seed={2} />
            <div style={{ height: 20 }} />
            <Heading text="2. Baseline sources" />
            <div data-anchor="section-2" style={{ minHeight: TYPE.prose * 1.75 * 5 }}>
              {landAt !== undefined && f >= landAt ? (
                <LandedSection at={landAt} flashAt={flashAt ?? landAt} />
              ) : (
                <div style={{ height: TYPE.prose * 1.75, display: 'flex', alignItems: 'center' }}>
                  <Shimmer w={520} h={14} />
                </div>
              )}
            </div>
            <div style={{ height: 20 }} />
            <Heading text="3. Assessment method" />
            <Greek lines={5} lineHeight={TYPE.prose * 1.75} seed={9} />
          </div>
        }
        side={
          <SideChat>
            {receipt && rO > 0 ? (
              <div style={{ marginTop: 14, opacity: rO, transform: `translateY(${(1 - rO) * 6}px)` }}>
                <Receipt
                  size={receipt.size}
                  label={<span style={{ color: focal > 0.5 ? C.text : C.text2, lineHeight: 1.3 }}>{ACCEPT_RECEIPT}</span>}
                  style={{ alignItems: 'flex-start' }}
                />
              </div>
            ) : null}
          </SideChat>
        }
      />
    </AppShell>
  );
};
