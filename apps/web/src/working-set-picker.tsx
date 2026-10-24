// T-471 — the working-set picker: ONE way to hand a run some of your own drafts,
// on Ask, the document creator, the checker and the editor.
//
// *In plain terms: a "Working set" button. Open it, type a few letters of a
// draft's title, click the drafts you want, and press Done. The list shows the
// drafts in every working area you are part of — yours and any that has been
// shared with you — each with the name of the working area it sits in. The AI
// reads what you pick as background you vouch for. It never cites it, and the
// answer says it drew on your working area.*
//
// It replaces three controls that each did a piece of this: the editor's
// attach dialog with its box for typing a raw document id, the checker's
// tick-list of the organisation's own drafts, and the kind menu in front of
// that box.
// Library documents are not pinned here — they are named through the Scope
// control's Documents group, where they can be cited.
//
// Where the pieces live:
//   • the keyboard-first multi-select is `MultiPicker` in `@infora/ui`; this
//     file owns the search (the server narrows, 50 at a time, because the list
//     is every draft in every working area the person is in);
//   • the server decides what the list contains. The page asks
//     `GET /working-area?q=` and shows what comes back: a draft from a working
//     area the person is not in is never selected, so it can neither be
//     searched into existence nor pinned. The server checks reach again when a
//     pin is made and when a run starts;
//   • NOTHING IS PINNED FOR THE PERSON. Every entry is a click.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AttachedSource, WorkingAreaDocument } from '@infora/contracts';
import { MultiPicker } from '@infora/ui';
import type { PickerGroup } from '@infora/ui';
import { FloatingPanel, useOutsideClose } from './floating-panel';
import { api, RequestError } from './api';

/** A document in the set: its id and the title it is shown by. */
export type PinnedDoc = { id: string; title: string };

/** The words for a run being handed a set, on the chip. */
export const workingSetChipLabel = (count: number) => (count === 0 ? 'Working set' : `Working set · ${count}`);

/**
 * The picker's rows. One group of what the search found — each row titled, with
 * the working area it sits in beside it — and, only if something pinned is not
 * in the current results, a second group so it can still be unticked. A pinned
 * document stays in its place in the first group while it is in the results, so
 * rows do not jump when one is clicked.
 */
export function workingSetGroups(input: { rows: WorkingAreaDocument[]; pinned: PinnedDoc[]; exclude?: readonly string[] }): PickerGroup[] {
  const excluded = new Set(input.exclude ?? []);
  const found = input.rows.filter((row) => !excluded.has(row.id));
  const inResults = new Set(found.map((row) => row.id));
  const elsewhere = input.pinned.filter((doc) => !inResults.has(doc.id));
  return [
    {
      id: 'working-area',
      heading: 'Drafts in your working areas',
      options: found.map((row) => ({ id: row.id, label: row.title, hint: row.sandboxName })),
    },
    {
      id: 'pinned-elsewhere',
      heading: 'Also in your working set',
      options: elsewhere.map((doc) => ({ id: doc.id, label: doc.title })),
    },
  ].filter((group) => group.options.length > 0);
}

export function WorkingSetPicker(props: {
  projectId: string;
  /** the current set */
  pinned: PinnedDoc[];
  /** titles a colleague pinned from a working area THIS reader is not in —
   *  listed, marked "not open to you", and neither openable nor removable here */
  colleagues?: string[];
  /** pin (`pinned: true`) or unpin one document; the caller does the work */
  onToggle: (doc: PinnedDoc, pinned: boolean) => Promise<void> | void;
  /** documents that must not be offered (e.g. the draft being checked) */
  exclude?: readonly string[];
  /** a refusal or failure from the last change, in words */
  error?: string | null;
  placement?: 'top' | 'bottom';
  /** render open — for tests that read the list's markup */
  initiallyOpen?: boolean;
  /** rows to show without asking the server — for tests */
  initialRows?: WorkingAreaDocument[];
}) {
  const [open, setOpen] = useState(props.initiallyOpen ?? false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<WorkingAreaDocument[]>(props.initialRows ?? []);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(props.initialRows !== undefined);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const inFlight = useRef(new Set<string>());

  const close = () => {
    setOpen(false);
    chipRef.current?.focus();
  };

  const panelRef = useRef<HTMLDivElement | null>(null);
  useOutsideClose(open, [rootRef, panelRef], () => setOpen(false));

  // the server narrows the list: asked when the panel opens and, after a short
  // pause, as the person types. A stale answer is aborted, never shown.
  useEffect(() => {
    if (!open || props.projectId === '') return;
    if (props.initialRows !== undefined && query === '') return;
    const abort = new AbortController();
    const timer = window.setTimeout(
      () => {
        setFailed(false);
        void api
          .workingArea(props.projectId, query, 1, abort.signal)
          .then((res) => {
            setRows(res.items);
            setHasMore(res.hasMore);
            setLoaded(true);
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setFailed(true);
            setLoaded(true);
          });
      },
      query === '' ? 0 : 180,
    );
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [open, props.projectId, query, props.initialRows]);

  const groups = useMemo(
    () => workingSetGroups({ rows, pinned: props.pinned, ...(props.exclude !== undefined && { exclude: props.exclude }) }),
    [rows, props.pinned, props.exclude],
  );
  const titleOf = useMemo(() => {
    const map = new Map<string, string>(props.pinned.map((doc) => [doc.id, doc.title]));
    for (const row of rows) map.set(row.id, row.title);
    return map;
  }, [rows, props.pinned]);
  const pinnedIds = props.pinned.map((doc) => doc.id);

  const onToggle = useCallback(
    (id: string) => {
      if (inFlight.current.has(id)) return;
      inFlight.current.add(id);
      const isPinned = props.pinned.some((doc) => doc.id === id);
      void Promise.resolve(props.onToggle({ id, title: titleOf.get(id) ?? id }, !isPinned)).finally(() =>
        inFlight.current.delete(id),
      );
    },
    [props.onToggle, props.pinned, titleOf],
  );

  const count = props.pinned.length + (props.colleagues?.length ?? 0);
  const status = (
    <>
      {props.error != null && <span className="multi-picker-status--warning">{props.error} </span>}
      {failed
        ? 'The list could not be loaded — try again.'
        : `${props.pinned.length} in your working set. Read as background you vouch for — never cited.`}
      {(props.colleagues?.length ?? 0) > 0 && (
        <ul className="working-set-card-list">
          {props.colleagues!.map((title, at) => (
            <li key={`${at}-${title}`}>
              {title}
              <span className="working-set-mark">not open to you</span>
            </li>
          ))}
        </ul>
      )}
      {hasMore && ' Showing the first 50 — type to narrow.'}
    </>
  );

  return (
    <div className="scope-control" ref={rootRef}>
      <button
        ref={chipRef}
        type="button"
        className="chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Hand the AI some of your own drafts to read as background. It never cites them, and says it drew on your working area."
        onClick={() => setOpen((o) => !o)}
      >
        {`▤ ${workingSetChipLabel(count)}`}
      </button>
      {open && (
        <FloatingPanel anchorRef={chipRef} panelRef={panelRef} placement={props.placement ?? 'bottom'}>
          <MultiPicker
            label="Working set"
            placeholder="Search your drafts by title"
            groups={groups}
            selected={pinnedIds}
            onToggle={onToggle}
            onClose={close}
            onQueryChange={setQuery}
            status={status}
            emptyText={
              !loaded
                ? 'Loading your drafts…'
                : query.trim() === ''
                  ? 'You have no drafts in the working areas you are part of.'
                  : 'No draft matches that — try another word.'
            }
            footer={
              <button type="button" className="chip" onMouseDown={(event) => event.preventDefault()} onClick={close}>
                Done
              </button>
            }
          />
        </FloatingPanel>
      )}
    </div>
  );
}

const refusalWords = (error: unknown) =>
  error instanceof RequestError && typeof error.body?.detail === 'string'
    ? error.body.detail
    : 'That change could not be made.';

/**
 * The picker bound to a CONVERSATION — Ask and the editor. A pin is a row on the
 * conversation, so it persists across turns and rides every run the conversation
 * starts. The conversation may not exist yet (Ask opens one on the first
 * question), so the first pin asks the parent to open it.
 */
export function ConversationWorkingSet(props: {
  projectId: string;
  conversationId: string | null;
  /** open the conversation if it is not open yet, and return its id */
  ensureConversationId: () => Promise<string>;
  placement?: 'top' | 'bottom';
  exclude?: readonly string[];
}) {
  const [sources, setSources] = useState<AttachedSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(props.conversationId);
  useEffect(() => setConvId(props.conversationId), [props.conversationId]);

  const load = useCallback(
    async (id: string) => {
      const res = await api.attachedSources(id);
      setSources(res.items);
    },
    [],
  );
  useEffect(() => {
    if (convId === null) {
      setSources([]);
      return;
    }
    void load(convId).catch(() => setSources([]));
  }, [convId, load]);

  const sandboxPins = sources.filter((source) => source.kind === 'sandbox');
  const pinned: PinnedDoc[] = sandboxPins
    .filter((source) => source.openToYou !== false)
    .map((source) => ({ id: source.ref, title: source.label ?? source.ref }));
  const colleagues = sandboxPins.filter((source) => source.openToYou === false).map((source) => source.label ?? 'A document');

  return (
    <WorkingSetPicker
      projectId={props.projectId}
      pinned={pinned}
      colleagues={colleagues}
      error={error}
      {...(props.placement !== undefined && { placement: props.placement })}
      {...(props.exclude !== undefined && { exclude: props.exclude })}
      onToggle={async (doc, pin) => {
        setError(null);
        try {
          const id = await props.ensureConversationId();
          setConvId(id);
          if (pin) {
            await api.pinAttachedSource(id, { kind: 'sandbox', ref: doc.id, label: doc.title });
          } else {
            const source = sandboxPins.find((candidate) => candidate.ref === doc.id);
            if (source !== undefined) await api.unpinAttachedSource(source.id);
          }
          await load(id);
        } catch (failure) {
          setError(refusalWords(failure));
        }
      }}
    />
  );
}
