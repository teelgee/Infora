// Modal — the elevation-4 overlay every in-app dialog uses (design-rules.md §A,
// §F.8): floats above the panes, portalled to <body> so no pane's overflow
// clips it, closes on Escape or backdrop click, and traps initial focus. This
// is the primitive that retires every `window.prompt()`/`confirm()` in the app.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    // focus the first field so keyboard users land inside the dialog
    dialogRef.current
      ?.querySelector<HTMLElement>('input, select, textarea, [data-autofocus]')
      ?.focus();
    return () => document.removeEventListener('keydown', onKey);
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
