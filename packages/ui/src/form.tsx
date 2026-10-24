// Form controls — the labelled field, text/number inputs, a styled native
// select, and a searchable Combobox (the bind picker). All emit the class
// vocabulary in styles.css; none carry business logic. These replace the
// phantom `.input` class the surfaces referenced and the `window.prompt` flows.
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export function Field(props: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.error !== undefined ? (
        <span className="field-error">{props.error}</span>
      ) : props.hint !== undefined ? (
        <span className="field-hint">{props.hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  onEnter?: () => void;
  /** T-472 — names a field that has no visible label of its own (a cell in a table) */
  ariaLabel?: string;
}) {
  return (
    <input
      className={`field-input${props.mono ? ' mono' : ''}`}
      aria-label={props.ariaLabel}
      value={props.value}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && props.onEnter) props.onEnter();
      }}
    />
  );
}

export function TextArea(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  // T-405 — a read-only viewer sees the words and cannot type over them. Every
  // other control here already had this; the textarea did not, which is only
  // because nothing had yet put prose behind a permission.
  disabled?: boolean;
}) {
  return (
    <textarea
      className="field-input field-textarea"
      rows={props.rows ?? 3}
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

/**
 * T-421 — SEGMENTED CONTROL: pick exactly one of two or three, drawn as ONE
 * control rather than a row of buttons.
 *
 * *In plain terms: where a choice is "this one or that one, never both", two
 * buttons side by side read as two separate actions. This reads as one switch
 * with two positions, which is what the choice actually is.*
 *
 * Built on-system per design-rules §F.4, and its entry is in §B:
 * - **Elevation 1.** It is a control, not a card, so it carries no shadow (§A).
 * - **Radius:** `sm` on the track, `xs` on a segment — §A's rule that a nested
 *   control never carries a bigger radius than the container it sits in.
 * - **No token of its own.** Every value is a straight pass-through of an
 *   existing semantic token, which §F.3 says to reference directly rather than
 *   wrap; dark mode is therefore mechanical, with nothing new to remap.
 * - **Every state:** default, hover, focus, pressed, selected, disabled.
 *
 * **A radiogroup, not a row of buttons** (§D): a screen reader hears "one of
 * two" rather than two unrelated commands, the arrow keys move the selection
 * the way they do in any radio group, and only the selected position is in the
 * tab order — so the control is one tab stop, not one per option.
 */
/**
 * Which position an arrow key lands on: wraps at both ends, and an unknown
 * key moves nowhere. Pure and exported so the keyboard behaviour is PINNED
 * by a test — the first build's record claimed the arrow keys were verified
 * and nothing repeatable backed the claim (review, 2026-09-01).
 */
export function segmentStep(key: string, index: number, count: number): number {
  if (count <= 0) return index;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1 + count) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count;
  return index;
}

export function SegmentedControl<T extends string>(props: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  /** Names the group for a screen reader — the question, not the answers. */
  label: string;
  disabled?: boolean;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const index = props.options.findIndex((option) => option.value === props.value);

  const move = (delta: number) => {
    const count = props.options.length;
    if (count === 0) return;
    const nextIndex = (index + delta + count) % count;
    const next = props.options[nextIndex];
    if (next === undefined) return;
    props.onChange(next.value);
    // the moved-to position is already in the DOM, so it can take focus now:
    // a roving tab index that leaves focus on the position you just left is
    // worse than none at all
    buttons.current[nextIndex]?.focus();
  };

  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((option, i) => {
        const selected = option.value === props.value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={props.disabled}
            tabIndex={selected ? 0 : -1}
            className={selected ? 'segment segment--on' : 'segment'}
            onClick={() => props.onChange(option.value)}
            onKeyDown={(e) => {
              const nextIndex = segmentStep(e.key, index, props.options.length);
              if (nextIndex !== index) {
                e.preventDefault();
                move(nextIndex - index);
              }
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SelectInput(props: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  /** T-472 — names a select that has no visible label of its own (a cell in a table) */
  ariaLabel?: string;
}) {
  return (
    <div className="field-select-wrap">
      <select
        className="field-input field-select"
        aria-label={props.ariaLabel}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.placeholder !== undefined && <option value="">{props.placeholder}</option>}
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="field-select-chev" size={14} strokeWidth={2} />
    </div>
  );
}

// A searchable single-select — the bind picker (choose a TIDP row from the
// accessible set) and any other "pick one from many" that a plain <select>
// makes unwieldy. Fully keyboard-operable (design-rules §D): ↑/↓ move the active
// option, Enter selects it, Escape closes; ARIA combobox/listbox roles.
export function Combobox(props: {
  value: string | null;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string; sub?: string }>;
  placeholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.options;
    return props.options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q),
    );
  }, [query, props.options]);
  const selected = props.options.find((o) => o.value === props.value);

  const choose = (value: string) => {
    props.onChange(value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const pick = filtered[active];
      if (open && pick) {
        e.preventDefault();
        choose(pick.value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="combobox">
      <div className="field-input combobox-control">
        <Search size={13} strokeWidth={2} className="combobox-icon" />
        <input
          className="combobox-input"
          role="combobox"
          aria-expanded={open}
          aria-controls="combobox-list"
          aria-activedescendant={open && filtered[active] ? `cbo-${filtered[active]!.value}` : undefined}
          value={open ? query : (selected?.label ?? '')}
          placeholder={props.placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
        />
      </div>
      {open && (
        <div className="combobox-list" id="combobox-list" role="listbox">
          {filtered.map((o, i) => (
            <button
              key={o.value}
              id={`cbo-${o.value}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`combobox-option${i === active ? ' active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o.value)}
            >
              <span className="combobox-option-label">{o.label}</span>
              {o.sub !== undefined && <span className="combobox-sub">{o.sub}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="combobox-empty">{props.emptyText ?? 'No matches'}</div>
          )}
        </div>
      )}
    </div>
  );
}
