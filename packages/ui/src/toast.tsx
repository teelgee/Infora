// T-465 — THE TOAST, with Undo for as long as the act is reversible.
//
// *In plain terms: when you do something that can be undone — withdraw a
// document, rename or move a draft, delete one to the bin — a small message
// appears at the foot of the screen saying what happened, with an Undo button.
// Press it and the act is reversed; both acts stay on the record. The message
// goes away on its own after a few seconds, or when you dismiss it.*
//
// One host per app frame; screens call `useToast()` and never render their own.
// Undo is the reverse ACT through the same API, never a client-side rollback of
// something the server already did — reversibility that is not offered at the
// moment of the act does not feel reversible, and reversibility that lies is
// worse than none.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './primitives';

export type ToastInput = {
  text: string;
  tone?: 'neutral' | 'success' | 'error';
  /** the reverse act; the button says `undoLabel` or "Undo" */
  undo?: (() => Promise<void> | void) | undefined;
  undoLabel?: string;
  /** milliseconds before it goes on its own (default 8000; errors stay until dismissed) */
  ttl?: number;
};
type ToastRow = ToastInput & { id: number; undone: boolean };

const ToastContext = createContext<{ push: (t: ToastInput) => void } | null>(null);

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(ToastContext);
  // outside a provider (a unit render) the toast is a no-op rather than a crash
  return ctx?.push ?? (() => undefined);
}

export function ToastProvider(props: { children: ReactNode }) {
  const [rows, setRows] = useState<ToastRow[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setRows((rs) => rs.filter((r) => r.id !== id)), []);
  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setRows((rs) => [...rs.slice(-2), { ...t, id, undone: false }]);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <div className="toast-host" role="region" aria-label="Notifications" aria-live="polite">
        {rows.map((r) => (
          <Toast key={r.id} row={r} onDismiss={() => dismiss(r.id)} onUndone={() => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, undone: true, undo: undefined } : x)))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast(props: { row: ToastRow; onDismiss: () => void; onUndone: () => void }) {
  const { row } = props;
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (row.tone === 'error' && !row.undone) return;
    const t = setTimeout(props.onDismiss, row.ttl ?? 8000);
    return () => clearTimeout(t);
  }, [row.ttl, row.tone, row.undone, props.onDismiss]);
  return (
    <div className={`toast toast--${row.tone ?? 'neutral'}`} role="status">
      <span className="toast-text">{row.undone ? 'Undone.' : row.text}</span>
      {row.undo && !row.undone && (
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await row.undo!();
              props.onUndone();
            } finally {
              setBusy(false);
            }
          }}
        >
          {row.undoLabel ?? 'Undo'}
        </Button>
      )}
      <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={props.onDismiss}>
        ×
      </button>
    </div>
  );
}
