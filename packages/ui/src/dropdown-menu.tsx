// component.dropdownMenu (design-rules.md §B) — elevation-4 overlay, closes on
// an outside click. Uncontrolled: owns its own open state so every call site
// (ProjectSwitcher, the composer source picker, any future "..." menu) gets
// the outside-click-to-close and clipping-safe positioning for free instead
// of reimplementing it per menu.
//
// Two positioning modes:
//  - default: the panel is absolutely positioned relative to the trigger
//    (fine when no ancestor clips it — the rail switcher, the composer).
//  - fixed: the panel is portalled to <body> and positioned `fixed` from the
//    trigger's rect, with vertical auto-flip. Use this inside a scroll/overflow
//    container (e.g. a table row) where an absolute panel would be clipped.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';

export function DropdownMenu(props: {
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end'; // horizontal anchor relative to the trigger; default 'start'
  placement?: 'bottom' | 'top'; // vertical anchor; default 'bottom' (e.g. a composer near the
  // viewport bottom, like ComposerSources's picker, wants 'top' so it opens upward)
  fixed?: boolean; // portal + fixed positioning, for use inside a clipping container
  // T-477 — close the menu when an item is chosen. A menu whose items open a modal is
  // closed by the modal's first click; one whose item acts in place (an inline rename)
  // would otherwise be left hanging open over the row it just changed. It closes on
  // ANY click inside the panel, so use it only where every item is a one-shot choice.
  closeOnSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [fixedStyle, setFixedStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      // the portalled panel lives outside rootRef — treat clicks inside it as inside
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  // position the fixed panel from the trigger's rect, flipping up when there
  // isn't room below (best-in-class menu behaviour; also solves bottom-of-table)
  useLayoutEffect(() => {
    if (!open || !props.fixed) return;
    const trigger = rootRef.current?.firstElementChild as HTMLElement | undefined;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const flipUp = props.placement === 'top' || spaceBelow < 280;
    // reset every anchor so the .dropdown-menu CSS defaults (left/right/top) don't leak
    const style: CSSProperties = { position: 'fixed', zIndex: 1000, left: 'auto', right: 'auto', top: 'auto', bottom: 'auto' };
    if (props.align === 'end') style.right = window.innerWidth - r.right;
    else style.left = r.left;
    if (flipUp) style.bottom = window.innerHeight - r.top + 4;
    else style.top = r.bottom + 4;
    setFixedStyle(style);
  }, [open, props.fixed, props.align, props.placement]);

  const classes = ['dropdown-menu', props.align === 'end' && 'align-end', props.placement === 'top' && 'placement-top']
    .filter(Boolean)
    .join(' ');

  const panel = (
    <div
      ref={panelRef}
      className={classes}
      style={props.fixed ? (fixedStyle ?? { position: 'fixed', opacity: 0 }) : undefined}
      onClick={props.closeOnSelect ? () => setOpen(false) : undefined}
    >
      {props.children}
    </div>
  );

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {props.trigger(() => setOpen((o) => !o), open)}
      {open && (props.fixed ? createPortal(panel, document.body) : panel)}
    </div>
  );
}

export function DropdownMenuItem(props: { onClick?: () => void; active?: boolean; children: ReactNode }) {
  return (
    <a className={props.active ? 'dropdown-menu-item current' : 'dropdown-menu-item'} onClick={props.onClick}>
      {props.children}
    </a>
  );
}
