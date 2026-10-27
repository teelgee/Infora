/**
 * Clip 05's app screens (native size; float them at 2.4):
 * - CommentaryForm: the package lead's commentary screen. A compact,
 *   label-left variant of shared RowForm, because the stacked RowForm is
 *   ~418 native px tall (~1000 px at 2.4) and cannot fit the 1080 frame
 *   under the seat label at the focal scale.
 * - HomeCard: the app's home card with "Generate September's pack".
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, ChevronDown } from 'lucide-react';
import { Badge, Button, C, FONT, GreekText, Highlight, RADIUS, TYPE, TypedText, typedCount, ui, type F } from '../../shared';

const LINE = TYPE.dense; // 13 native → 31 px at 2.4

const FieldBox: React.FC<{ active?: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ active, children, style }) => (
  <div
    style={{
      border: `1px solid ${active ? C.muted : C.border}`,
      borderRadius: RADIUS.control,
      padding: '6px 10px',
      fontSize: TYPE.ui,
      lineHeight: 1.45,
      color: C.text,
      minHeight: TYPE.ui * 1.45,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: C.pane,
      boxShadow: active ? `0 0 0 3px ${C.borderStrong}` : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode; top?: boolean }> = ({ label, children, top }) => (
  <div style={{ display: 'flex', alignItems: top ? 'flex-start' : 'center', gap: 14 }}>
    <div style={{ width: 118, flex: 'none', fontSize: TYPE.label, fontWeight: 600, color: C.text2, paddingTop: top ? 8 : 0 }}>{label}</div>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
);

export interface CommentaryFormProps {
  pkg: string;
  progress: string;
  risk: string;
  decision: string;
  typeFrom: F;
  typeTo: F;
  highlightAt: F;
  pressAt: F;
  savedAt: F;
}

export const CommentaryForm: React.FC<CommentaryFormProps> = ({ pkg, progress, risk, decision, typeFrom, typeTo, highlightAt, pressAt, savedAt }) => {
  const f = useCurrentFrame();
  const saved = f >= pressAt;
  const filled = typedCount(f, risk, typeFrom, typeTo) > 0;
  return (
    <div style={{ width: 520, background: C.pane, borderRadius: RADIUS.pane, padding: '18px 20px', boxSizing: 'border-box', fontFamily: FONT.sans }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: FONT.serif, fontSize: TYPE.heading, fontWeight: 500, color: C.text }}>Write this month’s commentary</div>
        <div style={{ fontSize: TYPE.label, color: C.muted, fontWeight: 500 }}>September 2026</div>
      </div>
      <div style={{ height: 1, background: C.border, margin: '12px 0 14px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Row label="Package">
          <FieldBox>
            <span style={{ flex: 1, fontWeight: 500 }}>{pkg}</span>
            <ChevronDown size={13} color={C.muted} />
          </FieldBox>
        </Row>
        <Row label="Progress this month">
          <FieldBox>
            <GreekText text={progress} greek />
          </FieldBox>
        </Row>
        <Row label="Key risks" top>
          <FieldBox active={filled && !saved} style={{ fontSize: LINE, minHeight: LINE * 1.45 * 2, alignItems: 'flex-start' }}>
            <span style={{ flex: 1 }}>
              {f >= highlightAt ? <Highlight at={highlightAt}>{risk}</Highlight> : <TypedText text={risk} from={typeFrom} to={typeTo} caretUntil={pressAt} />}
            </span>
          </FieldBox>
        </Row>
        <Row label="Decisions needed">
          <FieldBox>
            <GreekText text={decision} greek />
          </FieldBox>
        </Row>
        <Row label="Status">
          <Badge tone="danger" label="Behind" pill />
        </Row>
      </div>
      <div style={{ height: 1, background: C.border, margin: '16px 0 14px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button variant="primary" label="Save" pressAt={pressAt} anchor="rowform-submit" />
        {f >= savedAt ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: TYPE.ui, color: C.success.text, fontWeight: 600, opacity: ui(f, savedAt) }}>
            <Check size={13} strokeWidth={3} /> Saved
          </span>
        ) : null}
        <span style={{ marginLeft: 'auto', fontSize: TYPE.label, color: C.muted }}>
          <GreekText text="Visible to Calder & Hale" greek />
        </span>
      </div>
    </div>
  );
};

export interface HomeCardProps {
  title: string;
  label: string;
  packages: string[];
  primary: string;
  pressAt: F;
}

export const HomeCard: React.FC<HomeCardProps> = ({ title, label, packages, primary, pressAt }) => (
  <div style={{ width: 380, background: C.pane, borderRadius: RADIUS.pane, padding: 18, boxSizing: 'border-box', fontFamily: FONT.sans }}>
    <div style={{ fontFamily: FONT.serif, fontSize: TYPE.heading, fontWeight: 500, color: C.text }}>{title}</div>
    <div style={{ fontSize: TYPE.label, color: C.muted, marginTop: 3, fontWeight: 500 }}>{label}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 12px', margin: '14px 0 16px', padding: '11px 12px', background: C.neutral50, borderRadius: RADIUS.control }}>
      {packages.map((p) => (
        <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: TYPE.label, color: C.text2, opacity: 0.8 }}>
          <span style={{ width: 13, height: 13, borderRadius: 999, background: C.success.tint, color: C.success.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Check size={9} strokeWidth={3.2} />
          </span>
          {p}
        </div>
      ))}
    </div>
    <Button variant="primary" label={primary} pressAt={pressAt} anchor="generate" style={{ width: '100%' }} />
  </div>
);
