// Base components. Each is a thin, stateless wrapper emitting a fixed class
// vocabulary (styles.css is the visual spec); behaviour arrives via props
// from the surface, never inside the kit.
import type { ReactNode } from 'react';
import { currencyMarkTitle, currencyWords } from '@infora/contracts';
import type { Currency } from '@infora/contracts';
import { HoverCard } from './hover-card';

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
/**
 * T-292 — `tone: 'warning'` exists for exactly one statement: the composer's
 * Data-sources chip saying **no sources are in scope**. A grounded answer over
 * an empty scope is the most misleading state Ask can be in, and a chip reading
 * "0 sources" in the same grey as every other chip is a warning nobody sees.
 */
export function Chip(props: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  /**
   * T-404 — `primary` joins `warning`. A chip is normally a quiet control, and
   * the creator's plan page put the page's ONE primary action in one (the owner
   * asked for a chip by name), so the strongest thing on the screen was
   * rendering as the faintest. Design-rules §A reserves the near-black accent
   * for a primary action; this is that accent, in a chip's shape.
   */
  tone?: 'warning' | 'primary';
}) {
  return (
    <button
      type="button"
      className={
        `chip${props.disabled ? ' disabled' : ''}${props.tone !== undefined ? ` chip-${props.tone}` : ''}`
      }
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
  /** T-468 — the card that opens on hover or keyboard focus (a `SourceCard`);
   * `cardLabel` is its accessible name */
  card?: ReactNode;
  cardLabel?: string;
  /** T-473 — the cited document's currency as of the read. A document nobody has
   * confirmed current, or whose re-check is overdue, carries a small mark. */
  currency?: Currency | null | undefined;
}) {
  const lib = props.corpus === 'library';
  const markTitle = currencyMarkTitle(props.currency);
  // a real button (T-468): reachable by keyboard, so the card is too
  const chip = (
    <button type="button" className={`cite ${lib ? 'lib' : 'auth'}`} onClick={props.onClick}>
      {lib ? '▤' : '§'} {props.children}
      {markTitle !== null && (
        // a visible glyph with words, not colour alone: the short name is read
        // out, the full sentence (with dates) is the hover title
        <span
          className={`cite-currency ${props.currency!.state}`}
          role="img"
          aria-label={markTitle}
          title={currencyWords(props.currency) ?? markTitle}
        >
          {props.currency!.state === 'overdue' ? '↻' : '?'}
        </span>
      )}
    </button>
  );
  return props.card === undefined ? (
    chip
  ) : (
    <HoverCard label={props.cardLabel ?? 'Source'} card={props.card} toggleOnClick={props.onClick === undefined}>
      {chip}
    </HoverCard>
  );
}

/** T-468 — a quoted rule from the firm's rulebook or the project's style guide
 * (ADR-0048 §5). Deliberately NOT a source chip and not styled like one: a rule
 * steers the author, asserts nothing about the scheme and resolves to no
 * document, so it carries its own label saying it is a rule and not a citation. */
export function RuleCard(props: {
  clause: string | null;
  scope: 'organisation' | 'project';
  children: ReactNode;
}) {
  return (
    <blockquote className="quoted-rule rule-card finding-evidence">
      <div className="rule-card-label">
        {props.scope === 'project'
          ? 'From the project style guide — a rule, not a citation'
          : 'From your firm’s rulebook — a rule, not a citation'}
      </div>
      {props.clause !== null && (
        <div>
          <span className="mono">{props.clause}</span>
        </div>
      )}
      <div>“{props.children}”</div>
    </blockquote>
  );
}

export function Button(props: {
  variant?: 'primary' | 'quiet' | 'danger';
  size?: 'sm';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  // an explicit accessible name — for icon-led buttons that repeat a generic
  // label (e.g. a per-row "Move") a screen reader needs the row's context
  'aria-label'?: string;
  title?: string;
  children: ReactNode;
}) {
  const classes = ['btn', props.variant, props.size].filter(Boolean).join(' ');
  return (
    <button
      className={classes}
      onClick={props.onClick}
      type={props.type ?? 'button'}
      disabled={props.disabled}
      aria-label={props['aria-label']}
      title={props.title}
    >
      {props.children}
    </button>
  );
}

/** A 30px square icon-only button — send, close, overflow. The label is
 * required: there is no visible text for a screen reader to fall back on. */
export function IconButton(props: {
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  'aria-label': string;
  children: ReactNode;
}) {
  const classes = ['btn', 'icon-btn', props.variant].filter(Boolean).join(' ');
  return (
    <button
      className={classes}
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props['aria-label']}
      title={props.title}
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
