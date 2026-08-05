// The two-layer shell (design-rules.md §C "Shell z-order"): the rail sits
// flush on the frame — no card, no radius, no shadow — and the content panes
// float on it at elevation 2, inset from the top/right/bottom edges only.
// These five are the redesign's shell additions (design-system readme,
// "Intentional additions"). Rail keeps owning its own collapse/resize; the
// CollapseToggle and ResizeGrip here are for panes — a panel's collapse
// control and the drag gutter between two panes.
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

/** The canonical app shell. `rail` renders flush — never wrap it in a pane. */
export function AppFrame(props: {
  rail: ReactNode;
  width?: number | string;
  height?: number | string;
  /** One or two `Pane` elements (plus an optional `ResizeGrip` between). */
  children: ReactNode;
}) {
  return (
    <div className="app-frame" style={{ width: props.width, height: props.height }}>
      {props.rail}
      <div className="frame-content">{props.children}</div>
    </div>
  );
}

/** A white content pane floating on the frame at elevation 2. `canvas` fills
 * the remaining width; `panel` is the fixed side column (308px, §C). `width`
 * overrides the default — live drag-resize state, not a token. */
export function Pane(props: { variant?: 'canvas' | 'panel'; width?: number | string; children: ReactNode }) {
  return (
    <div
      className={`pane ${props.variant ?? 'canvas'}`}
      style={props.width !== undefined ? { width: props.width, minWidth: props.width } : undefined}
    >
      {props.children}
    </div>
  );
}

/** The per-pane header — location chip, title, the pane's one primary action.
 * Replaces the old full-width topbar as screens move onto the shell. */
export function PaneHeader(props: { location?: ReactNode; title?: ReactNode; action?: ReactNode }) {
  return (
    <div className="pane-header">
      {props.location !== undefined && <span className="location-chip">{props.location}</span>}
      {props.location !== undefined && props.title !== undefined && (
        <span style={{ color: 'var(--text-faint)', fontSize: 'var(--ui-default-size)' }}>/</span>
      )}
      {props.title !== undefined && (
        <b style={{ fontSize: 'var(--ui-default-size)', color: 'var(--text-primary)' }}>{props.title}</b>
      )}
      {props.action !== undefined && <span style={{ marginLeft: 'auto' }}>{props.action}</span>}
    </div>
  );
}

/** «/» control that collapses a panel (top-right of a pane header — the rail
 * has its own toggle). `label` is the accessible name and is required. */
export function CollapseToggle(props: { direction?: 'left' | 'right'; onClick?: () => void; label: string }) {
  return (
    <button
      type="button"
      className="collapse-toggle"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
    >
      {(props.direction ?? 'left') === 'left' ? '«' : '»'}
    </button>
  );
}

/** The 12px drag gutter between two panes — it carries the whole gap, so the
 * containing flex row's `gap` must be 0 or the gutter doubles (§C). */
export function ResizeGrip(props: { onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      className="grip"
      title="Drag to resize"
      onPointerDown={props.onPointerDown}
      role="separator"
      aria-orientation="vertical"
    >
      <svg width="4" height="18" viewBox="0 0 4 18" aria-hidden="true">
        <circle cx="1" cy="2" r="0.9" fill="var(--text-faint)" />
        <circle cx="3" cy="4" r="0.9" fill="var(--text-faint)" />
        <circle cx="1" cy="6" r="0.9" fill="var(--text-faint)" />
        <circle cx="3" cy="8" r="0.9" fill="var(--text-faint)" />
        <circle cx="1" cy="10" r="0.9" fill="var(--text-faint)" />
        <circle cx="3" cy="12" r="0.9" fill="var(--text-faint)" />
      </svg>
    </div>
  );
}
