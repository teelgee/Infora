/**
 * The document creator page (BUILT `t1-02`…`t1-14`; VISION work-package field
 * and the ontology-grouped sources, flows A.11 route 2). ONE component for W2
 * (chapter 3) and W4 (Workflow), drawn as W2 §4.6. Copy: WT_CREATOR_PAGE;
 * sources: WT_CREATOR_SOURCES. Put it inside a <Shell>; native px, page y
 * scrolls with `scrollY` (ease it with `keyed()` in your video).
 *
 * The two videos differ only in state:
 *   W2: style guide unticked, work package `—` → picked on camera, outline
 *       empty, brief empty, nothing ticked → ticked on camera.
 *   W4: style guide ticked, work package `Land quality`, the firm outline
 *       clicked on camera, the brief filled, the two sources ticked, plus the
 *       proposal and result cards passed in `after`.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT, RADIUS, SHADOW, ui, type F } from '../../shared';
import { WT_CREATOR_PAGE, WT_LIB, type WtLibDoc } from '../../data/wrenfield';
import { Btn, Checkbox, Field, Page, PageHeader, Select, SelectMenu, StatusPill, TextInput } from './ui';

const LIB_BY_REF: Record<string, WtLibDoc> = Object.fromEntries(Object.values(WT_LIB).map((d) => [d.ref, d as WtLibDoc]));

export interface CreatorSection {
  n: string;
  heading: string;
  purpose: string;
}

export interface CreatorScreenProps {
  /** Page scroll (native px). */
  scrollY?: number;
  /** Style guide ticked: true, or the frame it ticks. */
  styleGuide?: boolean | F;
  /** The VISION work-package select. `value` shows until `pickAt`, then `pick`. The list is open from `openAt` until `pickAt`. */
  workPackage?: { value?: string; pick?: string; openAt?: F; pickAt?: F; hover?: string };
  /** Outline: the firm outline button's hover / press, and the sections (fading in 4 f apart from `sectionsAt`). */
  outline?: { firmHover?: boolean; firmPressAt?: F; sections?: readonly CreatorSection[]; sectionsAt?: F };
  /** The brief (W4 fills it; W2 leaves it empty). */
  brief?: { forText?: React.ReactNode; title?: React.ReactNode };
  /** Sources: ref → the frame it ticks, or true for ticked from the start. */
  ticked?: Record<string, F | boolean>;
  /** Source row under the cursor. */
  hoverRef?: string;
  seePlan?: { hover?: boolean; pressAt?: F };
  /** Cards after `See the plan` (W4's proposal and result). */
  after?: React.ReactNode;
}

const P = WT_CREATOR_PAGE;

/** A sunken built card (`.card`): radius 8, popout shadow. */
export const SunkenCard: React.FC<{ title?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }> = ({ title, children, style }) => (
  <div style={{ background: C.sunken, borderRadius: RADIUS.pane, boxShadow: SHADOW.popout, padding: '18px 16px 20px', marginTop: 14, ...style }}>
    {title ? <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>{title}</div> : null}
    {children}
  </div>
);

const ReasonChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: 11.5,
      lineHeight: '17px',
      fontWeight: 500,
      color: C.text2,
      background: C.sunken,
      border: `1px solid ${C.border}`,
      borderRadius: 999,
      padding: '0 8px',
      marginLeft: 8,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

const isOn = (f: number, v: F | boolean | undefined) => (v === undefined || v === false ? false : v === true ? true : f >= v);

const SourceRow: React.FC<{ docRef: string; why?: string; ticked: F | boolean | undefined; hover?: boolean }> = ({ docRef, why, ticked, hover }) => {
  const f = useCurrentFrame();
  const d = LIB_BY_REF[docRef];
  return (
    <div style={{ display: 'flex', gap: 10, padding: '7px 8px', borderRadius: RADIUS.control, background: hover ? C.frameHover : undefined }}>
      <span style={{ marginTop: 2 }}>
        <Checkbox checked={isOn(f, ticked)} at={typeof ticked === 'number' ? ticked : undefined} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 12.5, fontWeight: 600, color: C.text }}>{docRef}</span>
          {why ? <ReasonChip>{why}</ReasonChip> : null}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.muted, marginTop: 2, maxWidth: 820 }}>{d?.description}</div>
      </div>
    </div>
  );
};

const Micro: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.muted, margin: '10px 0 4px 8px' }}>{children}</div>
);

export const CreatorScreen: React.FC<CreatorScreenProps> = ({ scrollY = 0, styleGuide = false, workPackage = {}, outline = {}, brief = {}, ticked = {}, hoverRef, seePlan = {}, after }) => {
  const f = useCurrentFrame();
  const wpPicked = workPackage.pickAt !== undefined && f >= workPackage.pickAt;
  const wpValue = wpPicked ? workPackage.pick ?? workPackage.value : workPackage.value ?? P.characteristics.workPackage.empty;
  const wpOpen = workPackage.openAt !== undefined && f >= workPackage.openAt && !wpPicked;
  const sectionsOn = outline.sections && (outline.sectionsAt === undefined || f >= outline.sectionsAt);
  return (
    <Page scrollY={scrollY}>
      <PageHeader title={P.title} sub={P.sub} />

      {/* What this document is */}
      <SunkenCard title={P.characteristics.card}>
        <div style={{ display: 'grid', gap: 16 }}>
          {(P.characteristics.fields as ReadonlyArray<{ label: string; value: string; hint: string; badge?: string }>).map((fl) =>
            fl.badge ? (
              <Field key={fl.label} label={fl.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Checkbox checked={isOn(f, styleGuide)} at={typeof styleGuide === 'number' ? styleGuide : undefined} />
                  <span>{fl.value}</span>
                  <StatusPill tone="neutral" label={fl.badge} dot={false} size={11.5} />
                </div>
              </Field>
            ) : (
              <Field key={fl.label} label={fl.label} hint={fl.hint}>
                <Select value={fl.value} />
              </Field>
            ),
          )}
          <Field label={P.characteristics.workPackage.label} hint={P.characteristics.workPackage.hint}>
            <div style={{ position: 'relative' }}>
              <Select value={wpValue} muted={wpValue === P.characteristics.workPackage.empty} focused={wpOpen} />
              {wpOpen ? (
                <SelectMenu x={0} y={38} width={778} at={workPackage.openAt!} options={P.characteristics.workPackage.options} hover={workPackage.hover} />
              ) : null}
            </div>
          </Field>
        </div>
      </SunkenCard>

      {/* The outline */}
      <SunkenCard title={P.outline.card}>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.text2, maxWidth: 780 }}>{P.outline.intro}</div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14, fontSize: 13, color: C.text2 }}>
          <span>{P.outline.startFromLabel}</span>
          {P.outline.startFrom.map((o) =>
            typeof o === 'string' ? (
              <Btn key={o} variant="quiet" label={o} />
            ) : (
              <span key={o.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Btn variant="quiet" label={o.label} hover={outline.firmHover} pressAt={outline.firmPressAt} style={{ color: C.text, fontWeight: 600 }} />
                <StatusPill tone="neutral" label={o.badge} size={11.5} />
              </span>
            ),
          )}
          <span style={{ color: C.muted }}>{P.outline.startFromTrailer}</span>
        </div>
        {sectionsOn ? (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {outline.sections!.map((s, i) => {
              const o = outline.sectionsAt === undefined ? 1 : ui(f, outline.sectionsAt + i * 4);
              const sub = s.n.includes('.');
              return (
                <div key={s.n} style={{ opacity: o, marginLeft: sub ? 28 : 0, background: C.pane, borderRadius: RADIUS.lg, padding: '12px 14px', display: 'flex', gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.muted, width: 26 }}>{s.n}</span>
                  <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                    <TextInput value={s.heading} />
                    <TextInput value={s.purpose} multiline={2} />
                    {!sub ? <span style={{ fontSize: 12, color: C.text2 }}>{P.outline.addSub}</span> : null}
                  </div>
                  <span style={{ color: C.muted, fontSize: 12, letterSpacing: 4 }}>↑↓×</span>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 18, fontSize: 13, color: C.text2, marginTop: 2 }}>
              <span>{P.outline.addSection}</span>
              <span>{P.outline.save}</span>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, fontSize: 13, color: C.muted }}>
            {P.outline.empty}
            <div style={{ marginTop: 8, color: C.text2 }}>{P.outline.addSection}</div>
          </div>
        )}
      </SunkenCard>

      {/* The brief */}
      <SunkenCard title={P.brief.card}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label={P.brief.forLabel}>
            <TextInput value={brief.forText} multiline={3} />
          </Field>
          <Field label={P.brief.titleLabel}>
            <TextInput value={brief.title} />
          </Field>
          <Field label={P.brief.whereLabel} hint={P.brief.whereHint}>
            <Select value={P.brief.whereValue} />
          </Field>
        </div>
      </SunkenCard>

      {/* Sources this draft may use */}
      <SunkenCard title={P.sources.card}>
        <Micro>{P.sources.relatedLabel}</Micro>
        {P.sources.related.map((r) => (
          <SourceRow key={r.ref} docRef={r.ref} why={r.why} ticked={ticked[r.ref]} hover={hoverRef === r.ref} />
        ))}
        <Micro>{P.sources.otherLabel}</Micro>
        {P.sources.other.map((ref) => (
          <SourceRow key={ref} docRef={ref} ticked={ticked[ref]} hover={hoverRef === ref} />
        ))}
      </SunkenCard>

      <div style={{ marginTop: 20 }}>
        <Btn variant="primary" label={P.seePlan} hover={seePlan.hover} pressAt={seePlan.pressAt} />
      </div>
      {after}
    </Page>
  );
};
