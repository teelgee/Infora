// Modal — the elevation-4 overlay every in-app dialog uses (design-rules.md §A,
// §D, §F.8): floats above the panes, portalled to <body> so no pane's overflow
// clips it, closes on Escape or backdrop click, traps Tab focus within itself
// while open, and restores focus to the trigger on close. The primitive that
// retires every `window.prompt()`/`confirm()` in the app.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!props.open) return;
    // remember what had focus so we can restore it when the dialog closes
    restoreRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        props.onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      // trap Tab within the dialog
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreRef.current?.focus?.();
    };
  }, [props.open, props.onClose]);

  if (!props.open) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className={`modal modal-${props.size ?? 'md'}`}
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
      >
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button type="button" className="modal-x" aria-label="Close" onClick={props.onClose}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer !== undefined && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
