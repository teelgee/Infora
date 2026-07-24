// Form controls — the labelled field, text/number inputs, a styled native
// select, and a searchable Combobox (the bind picker). All emit the class
// vocabulary in styles.css; none carry business logic. These replace the
// phantom `.input` class the surfaces referenced and the `window.prompt` flows.
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
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
}) {
  return (
    <input
      className={`field-input${props.mono ? ' mono' : ''}`}
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
}) {
  return (
    <textarea
      className="field-input field-textarea"
      rows={props.rows ?? 3}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

export function SelectInput(props: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="field-select-wrap">
      <select
        className="field-input field-select"
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
