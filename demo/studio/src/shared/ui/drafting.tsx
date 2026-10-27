/**
 * Drafting and checking UI at native size (master-plan §5.4): CitedProse,
 * SuggestionCard, RunTrace, SourcePanel, DocCanvas, Mark, TrackedChange,
 * SuccessFlash, FindingCard, FindingGroup.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT, RADIUS, SHADOW, TYPE } from '../theme';
import { appear, ease, ui, type F } from '../motion';
import { contextStyle, Greek, GreekText, Highlight, Shimmer } from '../focus';
import { AgentGlyph, Badge, Button, SourceChip, Tick, WithheldNotice } from './primitives';

// ------------------------------------------------------------------ CitedProse

export interface CitedSegment {
  text: string;
  /** Library reference for the pill after the claim. */
  source?: string;
  /** Arrives Greek'd; turns sharp at this frame (with a Highlight wipe if `highlightAt`). */
  focalFrom?: F;
  /** Turns Greek again from this frame. */
  greekFrom?: F;
  /** Arrive Greek'd (pills stay sharp). */
  greek?: boolean;
  highlightAt?: F;
  pillActiveAt?: F;
}

export interface CitedProseProps {
  segments: CitedSegment[];
  /** First segment arrives here; each next one `stagger` frames later. Pill arrives +3 f. */
  revealFrom: F;
  stagger?: number;
  size?: number;
  /** Greek every segment from this frame (e.g. card returns with prose Greek'd). */
  greekAllFrom?: F;
  /** Flow as one paragraph (default) or one claim per line. */
  layout?: 'paragraph' | 'lines';
}

/** Serif prose where each claim ends in its source pill. */
export const CitedProse: React.FC<CitedProseProps> = ({ segments, revealFrom, stagger = 6, size = TYPE.prose, greekAllFrom, layout = 'paragraph' }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ fontFamily: FONT.serif, fontSize: size, lineHeight: 1.75, color: C.prose }}>
      {segments.map((s, i) => {
        const at = revealFrom + i * stagger;
        const o = appear(f, at, 6);
        if (o <= 0) return null;
        let greekNow = !!s.greek;
        if (s.focalFrom !== undefined && f >= s.focalFrom) greekNow = false;
        if (s.greekFrom !== undefined && f >= s.greekFrom) greekNow = true;
        if (greekAllFrom !== undefined && f >= greekAllFrom) greekNow = true;
        const text = <GreekText text={s.text} greek={greekNow} />;
        const Wrap: React.ElementType = layout === 'lines' ? 'div' : 'span';
        return (
          <Wrap key={i} style={{ opacity: o }}>
            {s.highlightAt !== undefined && !greekNow ? <Highlight at={s.highlightAt}>{text}</Highlight> : text}
            {s.source ? (
              <>
                {' '}
                <SourceChip docRef={s.source} at={at + 3} activeAt={s.pillActiveAt} size={size * 0.71} />
              </>
            ) : null}
            {layout === 'paragraph' && i < segments.length - 1 ? ' ' : null}
          </Wrap>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ SuggestionCard

export interface SuggestionCardProps {
  title: string;
  segments: CitedSegment[];
  revealFrom: F;
  stagger?: number;
  withheld?: { text: string; at: F; greekFrom?: F };
  actionsAt?: F;
  acceptAt?: F;
  greekAllFrom?: F;
  width?: number;
}

/** Sunken callout: ✓ badge + title label, cited prose, withheld notice, Accept / Edit / Refine / Reject. */
export const SuggestionCard: React.FC<SuggestionCardProps> = ({ title, segments, revealFrom, stagger = 6, withheld, actionsAt, acceptAt, greekAllFrom, width = 640 }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        width,
        background: C.sunken,
        borderRadius: RADIUS.card,
        boxShadow: SHADOW.popout,
        padding: '14px 16px',
        boxSizing: 'border-box',
        fontFamily: FONT.sans,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Tick size={20} />
        <span style={{ fontSize: TYPE.dense, fontWeight: 600, color: C.text }}>{title}</span>
      </div>
      <CitedProse segments={segments} revealFrom={revealFrom} stagger={stagger} greekAllFrom={greekAllFrom} />
      {withheld && f >= withheld.at ? (
        <WithheldNotice
          at={withheld.at}
          style={{ marginTop: 10 }}
          text={<GreekText text={withheld.text} greekFrom={withheld.greekFrom} barColour="#ecdcb8" />}
        />
      ) : null}
      {actionsAt !== undefined && f >= actionsAt ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, opacity: ui(f, actionsAt) }}>
          <Button variant="primary" size="sm" label="Accept" pressAt={acceptAt} anchor="suggestion-accept" />
          <Button variant="secondary" size="sm" label="Edit" />
          <Button variant="secondary" size="sm" label="Refine" />
          <Button variant="secondary" size="sm" label="Reject" />
        </div>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ RunTrace

export interface RunTraceProps {
  /** Title label, e.g. "Agent · Working" (the ✦ glyph is drawn). */
  title: string;
  /** Title after every step is done (e.g. "Agent · Done") and when it flips. */
  doneTitle?: { text: string; at: F };
  steps: Array<{ label: string; detail?: string; doneAt: F }>;
  startAt: F;
  width?: number;
  /** Keep details legible instead of Greek'd. */
  sharpDetails?: boolean;
}

/** The run checklist: done steps get a filled tick; the current one shimmers; details Greek'd. */
export const RunTrace: React.FC<RunTraceProps> = ({ title, doneTitle, steps, startAt, width = 360, sharpDetails = false }) => {
  const f = useCurrentFrame();
  const shownTitle = doneTitle && f >= doneTitle.at ? doneTitle.text : title;
  return (
    <div style={{ width, background: C.pane, borderRadius: RADIUS.pane, padding: 16, boxSizing: 'border-box', fontFamily: FONT.sans }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: TYPE.label, fontWeight: 600, color: C.muted, marginBottom: 12 }}>
        <AgentGlyph size={11} colour={C.muted} />
        {shownTitle}
      </div>
      {steps.map((s, i) => {
        const done = f >= s.doneAt;
        const prevDone = i === 0 ? f >= startAt : f >= steps[i - 1].doneAt;
        const current = !done && prevDone;
        const last = i === steps.length - 1;
        return (
          <div key={s.label} style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {done ? (
                <Tick size={22} style={{ transform: `scale(${0.8 + 0.2 * ui(f, s.doneAt)})` }} />
              ) : (
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: C.active,
                    color: current ? C.text : C.muted,
                    fontSize: TYPE.label,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 'none',
                  }}
                >
                  {i + 1}
                </span>
              )}
              {!last ? <span style={{ width: 2, flex: 1, minHeight: 14, background: done ? C.ink : C.borderStrong, margin: '3px 0' }} /> : null}
            </div>
            <div style={{ paddingTop: 2, paddingBottom: last ? 0 : 12, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: TYPE.ui, fontWeight: 600, color: done || current ? C.text : C.text2 }}>{s.label}</div>
              {s.detail ? (
                // The detail's space is reserved from the start (hidden text), so the
                // card never changes size as steps tick (no creeping top edge).
                <div style={{ fontSize: TYPE.label, color: C.muted, marginTop: 4, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <span style={{ visibility: done ? 'visible' : 'hidden' }}>
                    <GreekText text={s.detail} greek={!sharpDetails} />
                  </span>
                  {current ? (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
                      <Shimmer w="80%" h={9} offset={i * 7} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ SourcePanel

export interface SourcePanelProps {
  docRef: string;
  title: string;
  badges: Array<{ tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }>;
  /** Locator label, e.g. "p. 14 · §4.3 Groundwater". */
  page: string;
  /**
   * `hl` spans are sharp and highlighted. Per span, `at` overrides `hlAt`
   * (Greek until then, then sharp + wipe) and `greekFrom` Greeks the text
   * again while the highlight stays: one readable line at a time.
   */
  passage: Array<{ text: string; hl?: boolean; at?: F; greekFrom?: F }>;
  /** Frame the hl spans' Highlight wipes in (unless a span sets `at`). */
  hlAt?: F;
  /** Badge labels kept sharp (at opacity 0.6) when the footer rises; the rest blur with the page. */
  keepBadges?: string[];
  /** `riseAt` moves the footer up to become the focal line (15.5 px, primary, Highlight at riseAt + 7). */
  footer?: { text: string; riseAt?: F };
  /** Entry frame (fade, `panel`). */
  at?: F;
  width?: number;
}

/** The page a pill opens to: header labels, badges, locator, passage (non-hl Greek'd), footer. */
export const SourcePanel: React.FC<SourcePanelProps> = ({ docRef, title, badges, page, passage, hlAt, footer, at, width = 380, keepBadges = [] }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : appear(f, at, 9);
  const rise = footer?.riseAt !== undefined ? appear(f, footer.riseAt, 9) : 0;
  const passageStyle = footer?.riseAt !== undefined ? contextStyle(f, footer.riseAt) : {};
  return (
    <div style={{ width, background: C.pane, borderRadius: RADIUS.pane, padding: 20, boxSizing: 'border-box', fontFamily: FONT.sans, position: 'relative', opacity: o }}>
      <div>
        <div style={passageStyle}>
          <div style={{ fontFamily: FONT.mono, fontSize: TYPE.ui, color: C.text2 }}>{docRef}</div>
          <div style={{ fontFamily: FONT.serif, fontSize: TYPE.prose, color: C.text, marginTop: 4, lineHeight: 1.3 }}>{title}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {badges.map((b) => {
            const kept = keepBadges.includes(b.label);
            // A kept badge stays sharp as a label (§4.3 rule 4: non-focal labels at 0.6).
            const st: React.CSSProperties = kept ? { opacity: 1 - 0.4 * rise } : passageStyle;
            return (
              <span key={b.label} style={{ display: 'inline-flex', ...st }}>
                <Badge tone={b.tone} label={b.label} pill />
              </span>
            );
          })}
        </div>
        <div style={passageStyle}>
          <div style={{ fontSize: TYPE.label, color: C.muted, fontWeight: 600, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>{page}</div>
          <div style={{ fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.7, color: C.prose, marginTop: 8 }}>
            {passage.map((p, i) => {
              if (!p.hl) return <GreekText key={i} text={p.text} greek />;
              const hAt = p.at ?? hlAt;
              if (hAt === undefined) return <span key={i}>{p.text}</span>;
              const text =
                f < hAt ? (
                  <GreekText text={p.text} greek />
                ) : p.greekFrom !== undefined ? (
                  <GreekText text={p.text} greekFrom={p.greekFrom} />
                ) : (
                  p.text
                );
              return (
                <Highlight key={i} at={hAt}>
                  <span style={{ color: C.text }}>{text}</span>
                </Highlight>
              );
            })}
          </div>
          {footer ? <div style={{ height: 48 }} /> : null}
        </div>
      </div>
      {footer ? (
        <div
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            top: `calc(${100 - 50 * rise}% - ${(1 - rise) * 40 + rise * 20}px)`,
            fontSize: TYPE.label + (TYPE.prose - TYPE.label) * rise,
            fontWeight: rise > 0.5 ? 600 : 500,
            color: rise > 0 ? C.text : C.muted,
            textAlign: rise > 0.5 ? 'center' : 'left',
            lineHeight: 1.4,
          }}
        >
          {footer.riseAt !== undefined ? <Highlight at={footer.riseAt + 7}>{footer.text}</Highlight> : footer.text}
        </div>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ DocCanvas

export interface DocBlock {
  kind: 'h' | 'p' | 'strip';
  text: React.ReactNode;
}

/** The editor canvas: serif headings and prose at 15.5 / 1.75, 600 px measure. */
export const DocCanvas: React.FC<{ blocks: DocBlock[]; width?: number; pad?: number; background?: string }> = ({ blocks, width = 600, pad = 32, background = C.pane }) => (
  <div style={{ width, padding: pad, boxSizing: 'border-box', background, borderRadius: RADIUS.pane, fontFamily: FONT.serif, fontSize: TYPE.prose, lineHeight: 1.75, color: C.prose }}>
    {blocks.map((b, i) => (
      <div key={i} style={{ marginTop: b.kind === 'h' && i > 0 ? 18 : 0, marginBottom: b.kind === 'h' ? 2 : 0, color: b.kind === 'h' ? C.text : C.prose }}>
        {b.text}
      </div>
    ))}
  </div>
);

/** A `strip` block's content: one Greek line ending in a sharp pill. */
export const GreekStrip: React.FC<{ docRef?: string; width?: string; seed?: number }> = ({ docRef, width = '72%', seed = 3 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Greek lines={1} lineHeight={TYPE.prose * 1.75} widths={[1]} seed={seed} style={{ width }} />
    {docRef ? <SourceChip docRef={docRef} /> : null}
  </div>
);

// ------------------------------------------------------------------ Mark

/**
 * A checker mark on text. Advisory: dashed muted underline with a faint
 * fill. Required: solid red underline with pink tint. Draws in over 6 f.
 */
export const Mark: React.FC<{ kind: 'advisory' | 'required'; at: F; children: React.ReactNode; anchor?: string }> = ({ kind, at, children, anchor }) => {
  const f = useCurrentFrame();
  const p = appear(f, at, 6, ease.linear);
  const req = kind === 'required';
  const line = req ? C.danger.text : C.muted;
  return (
    <span
      data-anchor={anchor}
      style={{
        // Underline layer first (on top), tint second.
        backgroundImage: req
          ? `linear-gradient(${line}, ${line}), linear-gradient(${C.danger.tint}, ${C.danger.tint})`
          : `repeating-linear-gradient(90deg, ${line} 0 4px, transparent 4px 7px), linear-gradient(rgba(20,20,20,0.04), rgba(20,20,20,0.04))`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${p * 100}% 1.5px, ${p * 100}% 100%`,
        backgroundPosition: '0 100%, 0 0',
        borderRadius: 3,
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
        paddingBottom: 1,
      }}
    >
      {children}
    </span>
  );
};

// ------------------------------------------------------------------ TrackedChange

/** Before `at`: the old text plain. From `at`: red strike + green insert (5 f). */
export const TrackedChange: React.FC<{ del?: string; ins?: string; at: F }> = ({ del, ins, at }) => {
  const f = useCurrentFrame();
  if (f < at) return <span>{del}</span>;
  const p = ui(f, at);
  return (
    <span>
      {del ? (
        <span style={{ background: C.danger.tint, color: C.danger.text, textDecoration: 'line-through', borderRadius: 2, padding: '0 1px' }}>{del}</span>
      ) : null}
      {del && ins ? ' ' : null}
      {ins ? (
        <span style={{ background: C.success.tint, color: C.success.text, borderBottom: `1.5px solid ${C.success.dot}`, padding: '0 1px', opacity: p }}>{ins}</span>
      ) : null}
    </span>
  );
};

/** `#e8f5ea` background fading 1 → 0 over 12 f from `at`. */
export const SuccessFlash: React.FC<{ at: F; children: React.ReactNode; dur?: number }> = ({ at, children, dur = 12 }) => {
  const f = useCurrentFrame();
  const o = f < at ? 0 : 1 - appear(f, at, dur, ease.linear);
  return <span style={{ background: o > 0 ? `rgba(232,245,234,${o})` : undefined, borderRadius: 3, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{children}</span>;
};

// ------------------------------------------------------------------ FindingCard

export interface FindingCardProps {
  severity: 'required' | 'advisory';
  /** The defect sentence (the focal line). */
  defect: string;
  /** Greek the defect until / from these frames. */
  defectSharpFrom?: F;
  defectGreekFrom?: F;
  source?: { docRef: string; at?: F };
  /** House rule: clause stays sharp, quote Greek'd unless `sharp`. */
  rule?: { clause: string; from?: string; quote: string; sharp?: boolean };
  /** Mechanical fix line (mono, Greek'd unless `sharp`). */
  fix?: { text: string; sharp?: boolean };
  /** Suggested wording block (Greek'd unless `sharp`). */
  suggested?: { text: string; sharp?: boolean };
  actions?: string[];
  /** Collapse (height + fade) over 8 f from here. */
  collapseAt?: F;
  /** Native width (default 360); '100%' inside a FindingGroup. */
  width?: number | '100%';
}

/** A finding: severity badge + "Go to it", the defect, its evidence, and actions. */
export const FindingCard: React.FC<FindingCardProps> = ({
  severity,
  defect,
  defectSharpFrom,
  defectGreekFrom,
  source,
  rule,
  fix,
  suggested,
  actions = ['Accept', 'Edit', 'Dismiss'],
  collapseAt,
  width = 360,
}) => {
  const f = useCurrentFrame();
  const c = collapseAt === undefined ? 0 : appear(f, collapseAt, 8);
  if (c >= 1) return null;
  return (
    <div
      style={{
        width,
        background: C.pane,
        borderRadius: RADIUS.card,
        boxShadow: SHADOW.soft,
        padding: 14,
        boxSizing: 'border-box',
        fontFamily: FONT.sans,
        fontSize: TYPE.ui,
        opacity: 1 - c,
        transform: `scaleY(${1 - 0.3 * c})`,
        transformOrigin: 'top',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {severity === 'required' ? <Badge tone="danger" label="Required" pill /> : <Badge tone="neutral" label="Advisory" pill />}
        <span style={{ textDecoration: 'underline', color: C.text, fontSize: TYPE.ui }}>Go to it</span>
      </div>
      <div style={{ color: C.text, lineHeight: 1.45 }}>
        <GreekText text={defect} sharpFrom={defectSharpFrom} greekFrom={defectGreekFrom} />
        {source ? (
          <>
            {' '}
            <SourceChip docRef={source.docRef} at={source.at} />
          </>
        ) : null}
      </div>
      {rule ? (
        <div style={{ background: C.sunken, borderRadius: 4, padding: '8px 10px', marginTop: 10, lineHeight: 1.45, fontSize: TYPE.ui }}>
          <span style={{ fontFamily: FONT.mono, color: C.text2 }}>{rule.clause}</span>{' '}
          {rule.from ? <GreekText text={rule.from} greek={!rule.sharp} style={{ color: C.muted }} /> : null}
          <div style={{ fontStyle: 'italic', color: C.text2 }}>
            <GreekText text={rule.quote} greek={!rule.sharp} />
          </div>
        </div>
      ) : null}
      {suggested ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: TYPE.label, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Suggested wording</div>
          <div style={{ background: C.sunken, borderRadius: 4, padding: '8px 10px', fontFamily: FONT.serif, fontSize: 13.5, lineHeight: 1.5, color: C.prose }}>
            <GreekText text={suggested.text} greek={!suggested.sharp} />
          </div>
        </div>
      ) : null}
      {fix ? (
        <div style={{ fontFamily: FONT.mono, fontSize: TYPE.ui, color: C.text, marginTop: 10 }}>
          <GreekText text={fix.text} greek={!fix.sharp} />
        </div>
      ) : null}
      {actions.length ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {actions.map((a) => (
            <Button key={a} variant="secondary" size="sm" label={a} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export interface FindingGroupProps {
  label: string;
  count: number;
  /** Group-level primary action, e.g. "Fix 1 house-style wording". */
  primary?: { label: string; pressAt?: F; flipTo?: { label: string; at: F } };
  /** Muted explanatory line (Greek'd). */
  note?: string;
  width?: number;
  children?: React.ReactNode;
}

/** A findings group header ("House style (4)") with its primary action and cards. */
export const FindingGroup: React.FC<FindingGroupProps> = ({ label, count, primary, note, width = 360, children }) => (
  <div style={{ width, fontFamily: FONT.sans, background: C.pane, borderRadius: RADIUS.pane, padding: 14, boxSizing: 'border-box' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: TYPE.ui, fontWeight: 600, marginBottom: 10 }}>
      <span style={{ color: C.muted }}>⌄</span>
      {label} <span style={{ color: C.muted, fontWeight: 500 }}>({count})</span>
      <span style={{ marginLeft: 'auto' }}>
        <Button variant="secondary" size="sm" label="Dismiss all" />
      </span>
    </div>
    {primary ? (
      <div style={{ marginBottom: 6 }}>
        <Button variant="primary" label={primary.label} pressAt={primary.pressAt} flipTo={primary.flipTo ? { ...primary.flipTo, tone: 'success' } : undefined} anchor="group-primary" />
      </div>
    ) : null}
    {note ? (
      <div style={{ fontSize: TYPE.label, color: C.muted, marginBottom: 10, lineHeight: 1.45 }}>
        <GreekText text={note} greek />
      </div>
    ) : null}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
  </div>
);

