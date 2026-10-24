// The panel behind the scope control and the working-set picker.
//
// *In plain terms: a card on the page cuts off anything that hangs out of its
// edge, so a list that opens from a button inside a card was shown half-hidden.
// This puts the list on top of the whole page instead, placed just under (or
// just over) the button, and keeps it there if the page scrolls.*
//
// Same method as `DropdownMenu`'s `fixed` mode: portalled to <body>, `fixed`,
// placed from the trigger's rect, flipped up when there is no room below.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Roughly the tallest the panel grows (search + status + a 320px list + footer). */
const ROOM_NEEDED = 440;
// z 39: above the page, below modals (z 40), so "Save this scope…" still opens over it
const GAP = 6;
const MARGIN = 16;

export type PanelRect = { left: number; top: number; bottom: number };

/** Pure: where the fixed panel goes for a trigger rect in a viewport. */
export function panelStyle(
  trigger: PanelRect,
  viewport: { width: number; height: number },
  placement: 'top' | 'bottom',
  panelWidth = 460,
): CSSProperties {
  const spaceBelow = viewport.height - trigger.bottom;
  const spaceAbove = trigger.top;
  const flipUp = placement === 'top' || (spaceBelow < ROOM_NEEDED && spaceAbove > spaceBelow);
  const width = Math.min(panelWidth, viewport.width - 2 * MARGIN);
  const left = Math.max(MARGIN, Math.min(trigger.left, viewport.width - width - MARGIN));
  const style: CSSProperties = { position: 'fixed', zIndex: 39, left, right: 'auto', top: 'auto', bottom: 'auto' };
  if (flipUp) {
    style.bottom = viewport.height - trigger.top + GAP;
    style.maxHeight = Math.max(160, spaceAbove - GAP - 8);
  } else {
    style.top = trigger.bottom + GAP;
    style.maxHeight = Math.max(160, spaceBelow - GAP - 8);
  }
  return style;
}

export function FloatingPanel(props: {
  /** the button the panel hangs from */
  anchorRef: RefObject<HTMLElement | null>;
  placement?: 'top' | 'bottom';
  /** called with the panel's element, so the owner's outside-click test can count it as inside */
  panelRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const placement = props.placement ?? 'bottom';
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const localRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = props.anchorRef.current;
      if (anchor === null) return;
      const rect = anchor.getBoundingClientRect();
      setStyle(panelStyle(rect, { width: window.innerWidth, height: window.innerHeight }, placement));
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [props.anchorRef, placement]);

  const className = `scope-panel scope-panel--${placement}`;
  // no document (static markup in tests): render in place, there is nothing to escape
  if (typeof document === 'undefined') return <div className={className}>{props.children}</div>;

  return createPortal(
    <div
      ref={(el) => {
        localRef.current = el;
        props.panelRef.current = el;
      }}
      className={className}
      // hidden until measured, so it never flashes at the wrong place
      style={style ?? { position: 'fixed', opacity: 0 }}
    >
      {props.children}
    </div>,
    document.body,
  );
}

/** Outside-click close that counts the portalled panel as inside. */
export function useOutsideClose(
  open: boolean,
  roots: ReadonlyArray<RefObject<HTMLElement | null>>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (roots.some((ref) => ref.current?.contains(target))) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
}
