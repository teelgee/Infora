// T-468 — HoverCard: a small card that opens beside what you point at.
//
// *In plain terms: hover a citation (or tab to it) and a card with the cited
// passage appears; move away, press Escape or tab on and it goes.*
//
// Behaviour rules, kept as a pure reducer so they can be tested without a
// browser: open after a short pause on hover (so crossing a page of citations
// does not flicker a card per chip), open at once on keyboard focus, close on
// leave/blur after a short grace (so the pointer can travel from the chip into
// the card to select text), and close at once on Escape.
//
// Placement reuses the dropdown menu's approach: the card is portalled to
// <body>, fixed-positioned from the trigger's rect, and flips above the
// trigger when there is no room below. No new dependency.
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';

export const HOVER_OPEN_DELAY_MS = 150;
export const HOVER_CLOSE_DELAY_MS = 120;

export type HoverCardState = { open: boolean };
export type HoverCardEvent =
  | { type: 'hover-delay-elapsed' } // the pointer stayed on the trigger long enough
  | { type: 'focus' }
  | { type: 'leave-delay-elapsed' } // the pointer / focus left and did not return
  | { type: 'escape' }
  | { type: 'click' }; // the trigger was clicked and has nothing else to do — the card toggles

/** The open/closed rule. Pure — the timers that raise these events live in the component. */
export function hoverCardReducer(state: HoverCardState, event: HoverCardEvent): HoverCardState {
  switch (event.type) {
    case 'hover-delay-elapsed':
    case 'focus':
      return state.open ? state : { open: true };
    case 'leave-delay-elapsed':
    case 'escape':
      return state.open ? { open: false } : state;
    case 'click':
      return { open: !state.open };
  }
}

export function HoverCard(props: {
  /** the accessible name of the card (`role="dialog"`) */
  label: string;
  /** what the card shows — mounted only while open, so a lazy fetch starts on first open */
  card: ReactNode;
  /** when the trigger has no action of its own, a click (or Enter / Space on
   * the button) toggles the card — so "clickable" is true on every pointer,
   * not only ones that focus a button on click (review fix, T-468) */
  toggleOnClick?: boolean;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(hoverCardReducer, { open: false });
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<number | null>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const after = (ms: number, event: HoverCardEvent) => {
    clear();
    timer.current = window.setTimeout(() => dispatch(event), ms);
  };
  useEffect(() => clear, []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clear();
        dispatch({ type: 'escape' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open]);

  useLayoutEffect(() => {
    if (!state.open) {
      setStyle(null);
      return;
    }
    const trigger = rootRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const next: CSSProperties = { position: 'fixed', zIndex: 1000, left, width };
    if (window.innerHeight - r.bottom < 300) next.bottom = window.innerHeight - r.top + 6;
    else next.top = r.bottom + 6;
    setStyle(next);
  }, [state.open]);

  const keepOpen = () => clear();
  const scheduleClose = () => after(HOVER_CLOSE_DELAY_MS, { type: 'leave-delay-elapsed' });

  return (
    <span
      ref={rootRef}
      className="hover-card-trigger"
      onMouseEnter={() => (state.open ? keepOpen() : after(HOVER_OPEN_DELAY_MS, { type: 'hover-delay-elapsed' }))}
      onMouseLeave={scheduleClose}
      onFocus={() => {
        clear();
        dispatch({ type: 'focus' });
      }}
      onBlur={scheduleClose}
      onClick={
        props.toggleOnClick
          ? () => {
              clear();
              dispatch({ type: 'click' });
            }
          : undefined
      }
    >
      {props.children}
      {state.open &&
        createPortal(
          <div
            role="dialog"
            aria-label={props.label}
            className="hover-card"
            style={style ?? { position: 'fixed', opacity: 0 }}
            onMouseEnter={keepOpen}
            onMouseLeave={scheduleClose}
          >
            {props.card}
          </div>,
          document.body,
        )}
    </span>
  );
}
