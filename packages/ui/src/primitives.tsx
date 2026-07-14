// T-049 — base components. Each is a thin, stateless wrapper emitting the
// mockups' exact class vocabulary (styles.css is the visual spec); behaviour
// arrives via props from the surface, never inside the kit.
import type { ReactNode } from 'react';
import { badgeTone } from './tokens';
import type { BadgeTone } from './tokens';

export function Badge(props: { tone: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`badge ${badgeTone[props.tone]}`}>
      {(props.dot ?? true) && <span className="dot" />}
      {props.children}
    </span>
  );
}

export function Chip(props: { children: ReactNode }) {
  return <span className="chip">{props.children}</span>;
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

export function Card(props: { className?: string; children: ReactNode }) {
  return <div className={props.className ? `card ${props.className}` : 'card'}>{props.children}</div>;
}

/** The ✦ command bar — presentation only; the surface owns the input. */
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
