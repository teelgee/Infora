// Modal + Drawer — the elevation-4 overlays every in-app dialog uses
// (design-rules.md §A, §D, §F.8): float above the panes, portalled to <body> so
// no pane's overflow clips them, close on Escape or backdrop click, trap Tab
// focus within themselves while open, and restore focus to the trigger on close.
// Modal is centred; Drawer docks to the right as a slide-over.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// shared behaviour: initial focus, Escape to close, Tab-trap, focus restore
function useDialogBehavior(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab') return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restore?.focus?.();
    };
  }, [open, onClose, ref]);
}

function Head(props: { title: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-head">
      <h2>{props.title}</h2>
      <button type="button" className="modal-x" aria-label="Close" onClick={props.onClose}>
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBehavior(props.open, props.onClose, ref);
  if (!props.open) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className={`modal modal-${props.size ?? 'md'}`} role="dialog" aria-modal="true" ref={ref}>
        <Head title={props.title} onClose={props.onClose} />
        <div className="modal-body">{props.children}</div>
        {props.footer !== undefined && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer(props: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBehavior(props.open, props.onClose, ref);
  if (!props.open) return null;
  return createPortal(
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="drawer" role="dialog" aria-modal="true" ref={ref}>
        <Head title={props.title} onClose={props.onClose} />
        <div className="drawer-body">{props.children}</div>
        {props.footer !== undefined && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
