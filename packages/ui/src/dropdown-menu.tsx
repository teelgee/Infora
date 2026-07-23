// component.dropdownMenu (design-rules.md §B) — elevation-4 overlay, closes on
// an outside click. Uncontrolled: owns its own open state so every call site
// (ProjectSwitcher, the composer source picker, any future "..." menu) gets
// the outside-click-to-close and clipping-safe positioning for free instead
// of reimplementing it per menu.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function DropdownMenu(props: {
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end'; // horizontal anchor relative to the trigger; default 'start'
  placement?: 'bottom' | 'top'; // vertical anchor; default 'bottom' (e.g. a composer near the
  // viewport bottom, like ComposerSources's picker, wants 'top' so it opens upward)
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const classes = ['dropdown-menu', props.align === 'end' && 'align-end', props.placement === 'top' && 'placement-top']
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {props.trigger(() => setOpen((o) => !o), open)}
      {open && <div className={classes}>{props.children}</div>}
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
