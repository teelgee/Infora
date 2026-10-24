// T-470 — the scope control: ONE way to say which part of the library a run may
// read, on Ask, the document creator and the checker.
//
// *In plain terms: a button that says what the run will read ("Scope: whole
// library", "Scope: Geotechnical · 2 documents"). Open it, type a word, press
// Enter, and that discipline, document type or document is in. Underneath, one
// line says how many documents that reaches — counted by the server, before
// anything is asked — and if the answer is none, it says so and the Send button
// stays off.*
//
// It replaces three controls that each did a piece of this: Ask's Data sources
// chip, the creator's "Sources this draft may use" tick-list and the checker's
// library tick-list. Three lists meant three ways to be wrong; this is the one.
//
// Where the pieces live:
//   • the keyboard-first multi-select is `MultiPicker` in `@infora/ui` — it
//     holds no data. This file fetches (the vocabulary, the documents the
//     answer could draw on, the person's saved scopes) and so lives here;
//   • what the choice REACHES is never computed in the browser. The wall is
//     applied in SQL, so the preview is a server call (`POST /scope-preview`)
//     that runs no search and spends nothing;
//   • a scope only NARROWS. Nothing here widens what a person may read — the
//     server intersects whatever is sent with what they could already open.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClassificationSchemeResponse, ReachCounts, SavedView, Scope } from '@infora/contracts';
import { reachStatement } from '@infora/contracts';
import { MultiPicker } from '@infora/ui';
import type { PickerGroup } from '@infora/ui';
import { FloatingPanel, useOutsideClose } from './floating-panel';
import { api } from './api';
import { useGroundingScope } from './composer-chips';
import type { GroundingScope } from './composer-chips';
import { SaveViewModal } from './saved-views-menu';

/** The sentence a scope that reaches nothing is met with — in the control and on the run button. */
export const NOTHING_TO_READ = 'Nothing to read in this scope';

/** What a person has chosen. Empty and unnamed is the whole library. */
export type ScopeValue = {
  termIds: string[];
  containerIds: string[];
  /** set when the choice IS a saved scope, until the person edits it */
  saved: { id: string; name: string } | null;
};
export const WHOLE_LIBRARY: ScopeValue = { termIds: [], containerIds: [], saved: null };

export const isWholeLibrary = (value: ScopeValue) =>
  value.termIds.length === 0 && value.containerIds.length === 0 && value.saved === null;

/**
 * The request body's `scope`. Absent for the whole library — the one
 * convention: absent is everything you can read, present is exactly it, and an
 * empty scope is a 400, so this never builds one. A saved scope stands alone
 * (the server refuses it mixed with loose ids).
 */
export function scopeOf(value: ScopeValue): Scope | undefined {
  if (value.saved !== null) return { savedScopeId: value.saved.id };
  const scope: Scope = {
    ...(value.termIds.length > 0 && { termIds: value.termIds }),
    ...(value.containerIds.length > 0 && { containerIds: value.containerIds }),
  };
  return scope.termIds === undefined && scope.containerIds === undefined ? undefined : scope;
}

/**
 * The scope as a request-body fragment: `{ scope }`, or nothing at all for the
 * whole library. Every surface spreads this into its body, so none of them can
 * build an empty scope (a 400) or send the choice under a different name.
 */
export const scopeField = (scope: Scope | undefined): { scope?: Scope } => (scope === undefined ? {} : { scope });

const toggled = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** The picker's rows are namespaced so one list can hold three kinds of thing. */
const TERM = 'term:';
const DOC = 'doc:';
const SAVED = 'saved:';

/** The three groups, in the ruled order: Vocabulary, Documents, Saved scopes. */
export function scopeGroups(input: {
  scheme: ClassificationSchemeResponse | null;
  grounding: GroundingScope;
  saved: SavedView[];
}): PickerGroup[] {
  const counts = input.grounding?.termCounts ?? {};
  return [
    {
      id: 'vocabulary',
      heading: 'Vocabulary',
      options: (input.scheme?.facets ?? []).flatMap((facet) =>
        facet.terms
          // a retired term is no longer offered — it names nothing new can carry
          .filter((term) => term.retiredAt === null)
          .map((term) => ({
            id: `${TERM}${term.id}`,
            label: term.label,
            hint: facet.name,
            count: counts[term.id] ?? 0,
          })),
      ),
    },
    {
      id: 'documents',
      heading: 'Documents',
      options: (input.grounding?.sources ?? []).map((source) => ({
        id: `${DOC}${source.containerId}`,
        label: source.documentReference,
        ...(source.title !== null && { hint: source.title }),
        // what the document IS, typed by whoever filed it (T-405): searched, not shown
        ...(source.description !== null && { keywords: source.description }),
      })),
    },
    {
      id: 'saved',
      heading: 'Saved scopes',
      options: input.saved.map((view) => ({
        id: `${SAVED}${view.id}`,
        label: view.name,
        ...(view.shared && { hint: view.mine ? 'shared with your firm' : `${view.savedBy.name}'s` }),
      })),
    },
  ].filter((group) => group.options.length > 0);
}

/** The chip's words. */
export function scopeLabel(value: ScopeValue, termLabels: ReadonlyMap<string, string>): string {
  if (value.saved !== null) return `Scope: ${value.saved.name}`;
  if (isWholeLibrary(value)) return 'Scope: whole library';
  const terms = value.termIds.map((id) => termLabels.get(id) ?? 'a term');
  const parts: string[] = [];
  if (terms.length > 0) parts.push(terms.length > 2 ? `${terms.slice(0, 2).join(', ')} +${terms.length - 2}` : terms.join(', '));
  if (value.containerIds.length > 0) {
    parts.push(`${value.containerIds.length} document${value.containerIds.length === 1 ? '' : 's'}`);
  }
  return `Scope: ${parts.join(' · ')}`;
}

/** Everything a surface needs from the control: the choice, and what it reaches. */
export type ScopeState = {
  projectId: string;
  value: ScopeValue;
  setValue: (next: ScopeValue) => void;
  grounding: GroundingScope;
  scheme: ClassificationSchemeResponse | null;
  saved: SavedView[];
  reloadSaved: () => void;
  /** null until the server has counted (or if it could not) — no claim is made then */
  reach: ReachCounts | null;
  /** the `scope` to put on the request; undefined = the whole library */
  scope: Scope | undefined;
  /** a declared scope that the server counted as reaching nothing */
  nothingToRead: boolean;
  /** set when the run button must stay off, and why */
  blockedReason: string | undefined;
};

export function useScopeState(projectId: string): ScopeState {
  const grounding = useGroundingScope(projectId);
  const [scheme, setScheme] = useState<ClassificationSchemeResponse | null>(null);
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [value, setValue] = useState<ScopeValue>(WHOLE_LIBRARY);
  const [reach, setReach] = useState<ReachCounts | null>(null);

  useEffect(() => {
    setScheme(null);
    setValue(WHOLE_LIBRARY);
    if (projectId === '') return;
    void api.classificationScheme(projectId).then(setScheme).catch(() => setScheme(null));
  }, [projectId]);

  const reloadSaved = () => {
    if (projectId === '') return;
    void api
      .savedViews(projectId, 'scope')
      .then((r) => setSaved(r.items))
      .catch(() => setSaved([]));
  };
  useEffect(reloadSaved, [projectId]);

  const scope = useMemo(() => scopeOf(value), [value]);
  const key = JSON.stringify(scope ?? null);
  useEffect(() => {
    if (projectId === '') return;
    const abort = new AbortController();
    setReach(null);
    // a failed count is NOT zero: the line is a claim about the corpus, and a
    // claim we could not check must not be made
    void api
      .scopePreview(projectId, scope, abort.signal)
      .then(setReach)
      .catch(() => undefined);
    return () => abort.abort();
    // re-asked when the project or the chosen scope changes; `scope` is its key
  }, [projectId, key]);

  const nothingToRead = scope !== undefined && reach !== null && reach.inScope === 0;
  return {
    projectId,
    value,
    setValue,
    grounding,
    scheme,
    saved,
    reloadSaved,
    reach,
    scope,
    nothingToRead,
    blockedReason: nothingToRead ? NOTHING_TO_READ : undefined,
  };
}

export function ScopeControl(props: {
  state: ScopeState;
  /** which way the panel opens: up from the composer, down from a form */
  placement?: 'top' | 'bottom';
  /** render open — for tests that read the list's markup */
  initiallyOpen?: boolean;
}) {
  const { state } = props;
  const [open, setOpen] = useState(props.initiallyOpen ?? false);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);

  const close = () => {
    setOpen(false);
    // the keyboard returns to where it was: the chip that opened this
    chipRef.current?.focus();
  };

  const panelRef = useRef<HTMLDivElement | null>(null);
  useOutsideClose(open, [rootRef, panelRef], () => setOpen(false));

  const groups = useMemo(
    () => scopeGroups({ scheme: state.scheme, grounding: state.grounding, saved: state.saved }),
    [state.scheme, state.grounding, state.saved],
  );
  const termLabels = useMemo(
    () =>
      new Map((state.scheme?.facets ?? []).flatMap((facet) => facet.terms.map((term) => [term.id, term.label] as const))),
    [state.scheme],
  );
  const selected = [
    ...state.value.termIds.map((id) => `${TERM}${id}`),
    ...state.value.containerIds.map((id) => `${DOC}${id}`),
    ...(state.value.saved === null ? [] : [`${SAVED}${state.value.saved.id}`]),
  ];

  const onToggle = (id: string) => {
    const { value } = state;
    if (id.startsWith(TERM)) {
      state.setValue({ termIds: toggled(value.termIds, id.slice(TERM.length)), containerIds: value.containerIds, saved: null });
    } else if (id.startsWith(DOC)) {
      state.setValue({ termIds: value.termIds, containerIds: toggled(value.containerIds, id.slice(DOC.length)), saved: null });
    } else if (id.startsWith(SAVED)) {
      const savedId = id.slice(SAVED.length);
      if (value.saved?.id === savedId) return state.setValue(WHOLE_LIBRARY);
      const view = state.saved.find((candidate) => candidate.id === savedId);
      if (view === undefined) return;
      // applying a saved scope REPLACES the choice and names it
      const filter = view.filter as { termIds?: string[]; containerIds?: string[] };
      state.setValue({
        termIds: filter.termIds ?? [],
        containerIds: filter.containerIds ?? [],
        saved: { id: view.id, name: view.name },
      });
    }
  };

  // the empty-library case keeps the old chip's honesty: it says so, in a
  // warning tone, and offers nothing to open
  if (state.grounding !== null && state.grounding.sources.length === 0) {
    return (
      <button
        type="button"
        className="chip chip-warning disabled"
        disabled
        title="Nothing in this project's library is in scope for a grounded answer — an answer now would rest on model knowledge alone."
      >
        ▤ No sources in scope
      </button>
    );
  }

  const label = scopeLabel(state.value, termLabels);
  const warn = state.nothingToRead;
  const status = state.nothingToRead ? (
    <span className="multi-picker-status--warning">{NOTHING_TO_READ}</span>
  ) : state.reach !== null ? (
    reachStatement(state.reach)
  ) : (
    'Counting what this reaches…'
  );

  return (
    <div className="scope-control" ref={rootRef}>
      <button
        ref={chipRef}
        type="button"
        className={`chip${warn ? ' chip-warning' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Which part of the library this run may read. Choosing only narrows — it never reaches a document you could not open yourself."
        onClick={() => setOpen((o) => !o)}
      >
        {`▤ ${label}${warn ? ' · nothing to read' : ''}`}
      </button>
      {open && (
        <FloatingPanel anchorRef={chipRef} panelRef={panelRef} placement={props.placement ?? 'bottom'}>
          <MultiPicker
            label="Scope"
            placeholder="Type a discipline, a document type, a code or a title"
            groups={groups}
            selected={selected}
            onToggle={onToggle}
            onClose={close}
            status={status}
            emptyText={state.scheme === null || state.grounding === null ? 'Loading the vocabulary and the library…' : undefined}
            footer={
              <>
                {!isWholeLibrary(state.value) && (
                  <button
                    type="button"
                    className="chip"
                    // the search keeps the focus through a click, as the rows do
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => state.setValue(WHOLE_LIBRARY)}
                  >
                    Use the whole library
                  </button>
                )}
                {!isWholeLibrary(state.value) && state.value.saved === null && (
                  <button type="button" className="chip" onClick={() => setSaving(true)}>
                    Save this scope…
                  </button>
                )}
              </>
            }
          />
        </FloatingPanel>
      )}
      {saving && (
        <SaveViewModal
          projectId={state.projectId}
          register="scope"
          filter={{
            ...(state.value.termIds.length > 0 && { termIds: state.value.termIds }),
            ...(state.value.containerIds.length > 0 && { containerIds: state.value.containerIds }),
          }}
          title="Save this scope"
          hint="The disciplines, document types and documents you chose are kept under this name."
          placeholder="e.g. Geotechnical only"
          onClose={() => setSaving(false)}
          onSaved={() => {
            setSaving(false);
            state.reloadSaved();
          }}
        />
      )}
    </div>
  );
}
