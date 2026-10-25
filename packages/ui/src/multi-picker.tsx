// T-470 — MultiPicker: a keyboard-first, searchable multi-select in groups.
//
// *In plain terms: a box you type into. The list under it narrows as you type,
// ↑ and ↓ move through it, Enter ticks the highlighted row, Escape closes — and
// what you ticked stays ticked.*
//
// It holds no data and fetches nothing: the caller hands it groups of options
// and the ticked ids, and is told when one is toggled. That is why it lives
// here and the control that knows about scopes does not. The key handling and
// the filter are pure functions (`multiPickerStep`, `filterPickerGroups`) so
// the behaviour is tested without a browser; the component only wires them.
//
// The idiom is the command palette's (an input that owns the focus, with a
// highlighted row moved by the arrow keys), with the roles the palette's
// single choice does not need: the list is `aria-multiselectable` and a row's
// `aria-selected` means *ticked*, not merely highlighted. The highlight is
// carried by `aria-activedescendant`, so focus never leaves the search box.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export type PickerOption = {
  id: string;
  label: string;
  /** a quiet word beside the label (e.g. the facet a term belongs to) */
  hint?: string;
  /** a number shown at the right (e.g. visible documents carrying a term) */
  count?: number;
  /** extra words the search matches but the row does not show */
  keywords?: string;
};
export type PickerGroup = {
  id: string;
  heading: string;
  options: PickerOption[];
  /**
   * T-486 — in caller-searched mode (`onQueryChange` given) the picker shows
   * every group as it was handed over; a group marked `local` is still filtered
   * by the picker itself. It is for the groups the caller holds whole (the
   * vocabulary, the saved scopes) when they sit beside one it searches on a
   * server (the documents).
   */
  local?: boolean;
  /**
   * T-486 — a line under the group's rows that is not a row: what the group is
   * not showing ("Showing 50 of 312 — type to narrow"). It is never ticked and
   * never highlighted.
   */
  note?: string;
};

/**
 * The search. A row matches when every word typed is found in its label, hint
 * or keywords. Within a group, a label that STARTS with the query comes first
 * (so `geo` puts "Geotechnical" above "Hydro-geology"); order is otherwise
 * kept. A group with no matching row is dropped, headings and all.
 */
export function filterPickerGroups(groups: PickerGroup[], query: string): PickerGroup[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return groups;
  const first = words[0]!;
  return groups
    .map((group) => {
      const hits = group.options.filter((option) => {
        const haystack = `${option.label} ${option.hint ?? ''} ${option.keywords ?? ''}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      });
      const starts = (option: PickerOption) => option.label.toLowerCase().startsWith(first);
      return {
        ...group,
        options: [...hits.filter(starts), ...hits.filter((option) => !starts(option))],
      };
    })
    .filter((group) => group.options.length > 0);
}

/**
 * T-486 — the groups the picker shows for what is typed. Where the picker
 * searches (no `onQueryChange`) that is every group, filtered. Where the caller
 * owns the search it is every group exactly as handed over, EXCEPT the groups
 * marked `local`, which the picker still filters itself — the vocabulary and the
 * saved scopes beside a document list that a server searches.
 */
export function visiblePickerGroups(groups: PickerGroup[], query: string, callerSearches: boolean): PickerGroup[] {
  if (!callerSearches) return filterPickerGroups(groups, query);
  const local = new Map(
    filterPickerGroups(
      groups.filter((group) => group.local === true),
      query,
    ).map((group) => [group.id, group] as const),
  );
  return groups.flatMap((group) => (group.local === true ? (local.has(group.id) ? [local.get(group.id)!] : []) : [group]));
}

export type PickerStep = {
  /** the highlighted row after the key */
  active: number;
  /** what the key asks the caller to do, if anything */
  act: 'toggle' | 'close' | null;
  /** true when the key was handled and the browser's default must be stopped */
  handled: boolean;
};

/**
 * One key, as the picker understands it. Pure. `size` is the number of rows
 * shown. Enter ticks the highlighted row; Space does too, but only while the
 * search is empty — once a word is being typed, a space is part of the word.
 */
export function multiPickerStep(state: { active: number; size: number; query: string }, key: string): PickerStep {
  const last = Math.max(state.size - 1, 0);
  const active = Math.min(Math.max(state.active, 0), last);
  switch (key) {
    case 'ArrowDown':
      return { active: Math.min(active + 1, last), act: null, handled: true };
    case 'ArrowUp':
      return { active: Math.max(active - 1, 0), act: null, handled: true };
    case 'Enter':
      return { active, act: state.size > 0 ? 'toggle' : null, handled: true };
    case ' ':
      return state.query === '' && state.size > 0
        ? { active, act: 'toggle', handled: true }
        : { active, act: null, handled: false };
    case 'Escape':
      return { active, act: 'close', handled: true };
    default:
      return { active, act: null, handled: false };
  }
}

export function MultiPicker(props: {
  /** the accessible name of the search box and the list */
  label: string;
  placeholder?: string;
  groups: PickerGroup[];
  /** the ids ticked, across every group */
  selected: readonly string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  /** shown between the search and the list — e.g. what the choice reaches */
  status?: ReactNode;
  /** shown under the list */
  footer?: ReactNode;
  /** shown when nothing matches */
  emptyText?: string;
  /**
   * T-471 — when given, the CALLER owns the search: the picker does not filter
   * the groups itself, and reports each change to the search box so the caller
   * can fetch. The working-set picker searches a list too long to hold in the
   * browser (every draft in every working area the person is in), so the server
   * does the narrowing and pages it. Absent, the picker filters what it was
   * given, as the scope control does.
   */
  onQueryChange?: (query: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const remote = props.onQueryChange !== undefined;
  const shown = useMemo(() => visiblePickerGroups(props.groups, query, remote), [remote, props.groups, query]);
  const flat = useMemo(() => shown.flatMap((group) => group.options), [shown]);
  const optionDomId = (id: string) => `${listId}-${id}`;

  // opening focuses the search: that is the first of the three keystrokes
  useEffect(() => inputRef.current?.focus(), []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = multiPickerStep({ active, size: flat.length, query }, event.key);
    if (step.handled) event.preventDefault();
    setActive(step.active);
    if (step.act === 'close') props.onClose();
    else if (step.act === 'toggle') {
      const row = flat[step.active];
      if (row !== undefined) props.onToggle(row.id);
    }
  };

  const activeRow = flat[Math.min(active, Math.max(flat.length - 1, 0))];
  let index = -1;

  return (
    <div className="multi-picker">
      <input
        ref={inputRef}
        className="multi-picker-input"
        type="text"
        role="combobox"
        aria-label={props.label}
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={activeRow === undefined ? undefined : optionDomId(activeRow.id)}
        aria-autocomplete="list"
        placeholder={props.placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          props.onQueryChange?.(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {props.status !== undefined && (
        <div className="multi-picker-status" role="status">
          {props.status}
        </div>
      )}
      <div className="multi-picker-list" id={listId} role="listbox" aria-multiselectable="true" aria-label={props.label}>
        {shown.map((group) => (
          <div key={group.id} role="group" aria-label={group.heading}>
            <div className="multi-picker-heading">{group.heading}</div>
            {group.options.map((option) => {
              index += 1;
              const mine = index;
              const ticked = props.selected.includes(option.id);
              return (
                <div
                  key={option.id}
                  id={optionDomId(option.id)}
                  role="option"
                  aria-selected={ticked}
                  className={`multi-picker-row${mine === active ? ' multi-picker-row--active' : ''}${ticked ? ' multi-picker-row--ticked' : ''}`}
                  // movement, not entry: a list appearing under a resting
                  // pointer must not steal the highlight from Enter
                  onMouseMove={() => setActive((a) => (a === mine ? a : mine))}
                  // the search keeps the focus through a click
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => props.onToggle(option.id)}
                >
                  <span className="multi-picker-tick" aria-hidden="true">
                    {ticked ? '☑' : '☐'}
                  </span>
                  <span className="multi-picker-label">{option.label}</span>
                  {option.hint !== undefined && <span className="multi-picker-hint">{option.hint}</span>}
                  {option.count !== undefined && <span className="multi-picker-count">{option.count}</span>}
                </div>
              );
            })}
            {group.note !== undefined && <div className="multi-picker-note">{group.note}</div>}
          </div>
        ))}
        {flat.length === 0 && (
          <div className="multi-picker-empty">{props.emptyText ?? 'Nothing matches — try another word.'}</div>
        )}
      </div>
      <div className="multi-picker-foot">
        {props.footer}
        <span className="multi-picker-keys">↑↓ move · Enter ticks · Esc closes</span>
      </div>
    </div>
  );
}
