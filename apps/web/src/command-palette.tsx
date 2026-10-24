// T-466 — THE COMMAND PALETTE, and the keyboard moves.
//
// *In plain terms: press ⌘K (Ctrl+K on Windows) anywhere in a project and a
// box opens. Type a code, a title or a few words of what a document says and
// the documents come back, ranked as the registers rank them; type the name of
// a section and it is there to jump to; the actions of the page you are on are
// there to run. Enter takes the first one. Press "?" to see every shortcut;
// press F on a register to land in its search box. Typing in the editor, a
// comment or any text box is never intercepted.*
//
// The documents come from the same two reads the registers use (the plan's
// and the library's ranked search), so what the palette finds is exactly what
// the person could find by hand — access-resolved on the server, never here.
// A page registers its own actions through `usePaletteActions`, so "run the
// current row's actions" means the actions that page offers, no more.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { LibrarySearchItem, PlanRow } from '@infora/contracts';
import { api } from './api';

export type PaletteAction = { id: string; label: string; hint?: string; run: () => void };

// ── the actions a page offers, registered while it is mounted ───────────────
const actionStore: { actions: PaletteAction[]; listeners: Set<() => void> } = { actions: [], listeners: new Set() };
function setActions(actions: PaletteAction[]) {
  actionStore.actions = actions;
  for (const fn of actionStore.listeners) fn();
}
/** a page's actions, offered in the palette for as long as the page is mounted */
export function usePaletteActions(actions: PaletteAction[]): void {
  const key = actions.map((a) => a.id + a.label).join('|');
  useEffect(() => {
    setActions(actions);
    return () => setActions([]);
    // the list is keyed on its ids and labels, so a re-render with the same actions registers once
  }, [key]);
}

export type PaletteSection = { label: string; path: string };

export const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || el.closest('[contenteditable="true"]') !== null;
};

export const SHORTCUTS: Array<{ keys: string; does: string }> = [
  { keys: '⌘K / Ctrl+K', does: 'Open the palette: find a document, jump to a section, run this page’s actions' },
  { keys: 'F', does: 'On a register, land in its search box' },
  { keys: 'J / K', does: 'On a review, move down / up the Threads list (the comment is highlighted in the round)' },
  { keys: 'R', does: 'Respond to the highlighted comment' },
  { keys: 'E', does: 'Respond to the highlighted comment as “no change was made”' },
  { keys: 'Esc', does: 'Close the palette, a panel or a dialog' },
  { keys: '?', does: 'Show these shortcuts' },
];

type Hit =
  | { kind: 'section'; label: string; path: string }
  | { kind: 'action'; action: PaletteAction }
  | { kind: 'document'; containerId: string; reference: string; title: string; where: string };

export function CommandPalette(props: { projectId: string; sections: PaletteSection[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<null | 'find' | 'help'>(null);
  const [q, setQ] = useState('');
  const [docs, setDocs] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [actions, setActionsState] = useState<PaletteAction[]>(actionStore.actions);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const sync = () => setActionsState(actionStore.actions);
    actionStore.listeners.add(sync);
    return () => {
      actionStore.listeners.delete(sync);
    };
  }, []);

  // the global keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => (o === 'find' ? null : 'find'));
        return;
      }
      if (open !== null) {
        if (e.key === 'Escape') setOpen(null);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setOpen('help');
      } else if (e.key === 'f' || e.key === 'F') {
        const box = document.querySelector<HTMLInputElement>('input[type="search"]');
        if (box) {
          e.preventDefault();
          box.focus();
          box.select();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open === 'find') {
      setQ('');
      setDocs([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // the documents, through the registers' own reads
  useEffect(() => {
    if (open !== 'find') return;
    const text = q.trim();
    if (text.length < 2) {
      setDocs([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      void Promise.all([
        api.planPage(props.projectId, { q: text, page: 1, pageSize: 6 }).catch(() => ({ items: [] as PlanRow[] })),
        api.librarySearch(props.projectId, { q: text, page: 1, pageSize: 6 }).catch(() => ({ items: [] as LibrarySearchItem[] })),
      ]).then(([plan, lib]) => {
        if (mine !== seq.current) return;
        const seen = new Set<string>();
        const hits: Hit[] = [];
        for (const r of plan.items) {
          if (seen.has(r.containerId)) continue;
          seen.add(r.containerId);
          hits.push({ kind: 'document', containerId: r.containerId, reference: r.documentReference ?? '', title: r.title ?? 'Reference material', where: r.inLibrary ? 'Library' : 'Plan' });
        }
        for (const r of lib.items) {
          if (seen.has(r.containerId)) continue;
          seen.add(r.containerId);
          hits.push({ kind: 'document', containerId: r.containerId, reference: r.documentReference, title: r.title ?? 'Reference material', where: 'Library' });
        }
        setDocs(hits.slice(0, 8));
        setActive(0);
      });
    }, 120);
    return () => clearTimeout(t);
  }, [q, open, props.projectId]);

  const hits = useMemo<Hit[]>(() => {
    const text = q.trim().toLowerCase();
    const sections: Hit[] = props.sections
      .filter((s) => text === '' || s.label.toLowerCase().includes(text))
      .map((s) => ({ kind: 'section', label: s.label, path: s.path }));
    const acts: Hit[] = actions.filter((a) => text === '' || a.label.toLowerCase().includes(text)).map((a) => ({ kind: 'action', action: a }));
    // documents first when the person typed something: that is what ⌘K is for
    return text === '' ? [...acts, ...sections] : [...docs, ...acts, ...sections];
  }, [q, docs, actions, props.sections]);

  const run = useCallback(
    (hit: Hit) => {
      setOpen(null);
      if (hit.kind === 'section') void navigate(`/projects/${props.projectId}/${hit.path}`);
      else if (hit.kind === 'document') void navigate(`/projects/${props.projectId}/documents/${hit.containerId}`);
      else hit.action.run();
    },
    [navigate, props.projectId],
  );

  if (open === null) return null;
  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(null);
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label={open === 'help' ? 'Keyboard shortcuts' : 'Command palette'}>
        {open === 'help' ? (
          <>
            <div className="palette-head">Keyboard shortcuts</div>
            <ul className="palette-list" aria-label="Shortcuts">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="palette-row">
                  <span className="palette-keys">{s.keys}</span>
                  <span>{s.does}</span>
                </li>
              ))}
            </ul>
            <div className="palette-foot">Esc closes</div>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              className="palette-input"
              aria-label="Find a document, a section or an action"
              placeholder="Type a code, a title, a few words — or a section or action"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(null);
                else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, hits.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  const hit = hits[active];
                  if (hit) run(hit);
                }
              }}
            />
            <ul className="palette-list" role="listbox" aria-label="Results">
              {hits.map((hit, i) => (
                <li
                  key={hit.kind === 'section' ? `s:${hit.path}` : hit.kind === 'action' ? `a:${hit.action.id}` : `d:${hit.containerId}`}
                  role="option"
                  aria-selected={i === active}
                  className={`palette-row${i === active ? ' palette-row--active' : ''}`}
                  // movement, not entry: a list appearing under a resting pointer must not steal the highlight from Enter
                  onMouseMove={() => setActive((a) => (a === i ? a : i))}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(hit)}
                >
                  {hit.kind === 'document' ? (
                    <>
                      <span className="mono">{hit.reference}</span>
                      <span className="palette-title">{hit.title}</span>
                      <span className="palette-kind">{hit.where}</span>
                    </>
                  ) : hit.kind === 'section' ? (
                    <>
                      <span className="palette-title">{hit.label}</span>
                      <span className="palette-kind">Section</span>
                    </>
                  ) : (
                    <>
                      <span className="palette-title">{hit.action.label}</span>
                      <span className="palette-kind">{hit.action.hint ?? 'This page'}</span>
                    </>
                  )}
                </li>
              ))}
              {hits.length === 0 && <li className="palette-row palette-empty">{q.trim().length < 2 ? 'Type to find a document.' : 'Nothing matches — try a code or a different word.'}</li>}
            </ul>
            <div className="palette-foot">↑↓ move · Enter opens · Esc closes · ? shortcuts</div>
          </>
        )}
      </div>
    </div>
  );
}

export function PaletteHint(props: { onOpen: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="palette-hint" onClick={props.onOpen} title="Find a document, jump to a section, run an action">
      {props.children ?? 'Search'} <kbd>⌘K</kbd>
    </button>
  );
}
