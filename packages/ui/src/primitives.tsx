// Base components. Each is a thin, stateless wrapper emitting a fixed class
// vocabulary (styles.css is the visual spec); behaviour arrives via props
// from the surface, never inside the kit.
import type { ReactNode } from 'react';

// The five-variant closed set from design-tokens.json's component.badge.status
// (design-rules.md §A/§F.6) — not a token value itself, so it lives here next
// to the component that consumes it rather than in the generated tokens.ts.
export const badgeTone = {
  success: 'b-success',
  warning: 'b-warning',
  danger: 'b-danger',
  info: 'b-info',
  neutral: 'b-neutral',
} as const;
export type BadgeTone = keyof typeof badgeTone;

export function Badge(props: { tone: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`badge ${badgeTone[props.tone]}`}>
      {(props.dot ?? true) && <span className="dot" />}
      {props.children}
    </span>
  );
}

/** Attach-context tokens beside a composer or ask-bar (design-rules.md §B) —
 * never for navigation or primary actions. Interactive: a `disabled` chip
 * still shows its `title` (e.g. "waits on X") via `cursor: help`, it just
 * can't be clicked. */
export function Chip(props: { children: ReactNode; onClick?: () => void; title?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={props.disabled ? 'chip disabled' : 'chip'}
      onClick={props.onClick}
      title={props.title}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

/** A source — the inline pill after the claim it backs (named "source" per the
 * 2026-07-13 ruling; formerly the citation chip): library fact (▤, green) or
 * external authority (§, slate). Clicking one opens the source panel. */
export function SourceChip(props: {
  corpus: 'library' | 'authority';
  children: ReactNode;
  onClick?: () => void;
}) {
  const lib = props.corpus === 'library';
  return (
    <span className={`cite ${lib ? 'lib' : 'auth'}`} onClick={props.onClick}>
      {lib ? '▤' : '§'} {props.children}
    </span>
  );
}

export function Button(props: {
  variant?: 'primary' | 'quiet' | 'danger';
  size?: 'sm';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  children: ReactNode;
}) {
  const classes = ['btn', props.variant, props.size].filter(Boolean).join(' ');
  return (
    <button
      className={classes}
      onClick={props.onClick}
      type={props.type ?? 'button'}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

/** Card-shaped content only (nested-card elevation) — for tabular data use
 * `Table` instead; the two are no longer the same visual role. */
export function Card(props: { className?: string; children: ReactNode }) {
  return <div className={props.className ? `card ${props.className}` : 'card'}>{props.children}</div>;
}

/** The ✦ command bar — presentation only; the surface owns the input.
 * Renders the askBar visual treatment (see `ChatComposer` for the real
 * controlled-input version of the same look). */
export function CommandBar(props: { hint?: string; onClick?: () => void; children: ReactNode }) {
  return (
    <div className="command" style={{ marginTop: 0 }} onClick={props.onClick}>
      <span className="glyph">✦</span> {props.children}
      {props.hint !== undefined && <span className="hint">{props.hint}</span>}
    </div>
  );
}

export function SectionLabel(props: { children: ReactNode }) {
  return <div className="section-label">{props.children}</div>;
}

/** The amber withheld notice (Ask trace, Editor panel). */
export function WithheldNotice(props: { children: ReactNode }) {
  return <div className="withheld">{props.children}</div>;
}

/** The output-target chip on the Ask composer (T-052). */
export function OutChip(props: { onRemove?: () => void; children: ReactNode }) {
  return (
    <span className="out-chip">
      ⌇ {props.children}
      {props.onRemove && (
        <span className="x" onClick={props.onRemove}>
          ✕
        </span>
      )}
    </span>
  );
}

/** The "draft created" card linking into the Editor (T-052). */
export function MadeCard(props: { title: string; subtitle: string; action: ReactNode }) {
  return (
    <div className="made-card">
      <div className="icon">⌇</div>
      <div>
        <div className="t">{props.title}</div>
        <div className="s">{props.subtitle}</div>
      </div>
      <span className="go">{props.action}</span>
    </div>
  );
}
