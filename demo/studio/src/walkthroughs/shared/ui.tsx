/**
 * Generic product UI for the walkthroughs (master-plan §5.4), native px, in
 * the built language (packages/ui/src/styles.css + the screenshots). Nothing
 * here is Greek'd or blurred. Animated props take video-local frames.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { AgentGlyph, appear, C, ease, FONT, pressScale, RADIUS, SHADOW, SourceChip, ui, type F } from '../../shared';
import { Caret, caretOn, claimsSchedule, streamCount, typingSchedule } from './typing';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE: Record<Tone, { text: string; dot: string; tint: string }> = {
  success: { text: C.success.text, dot: C.success.dot, tint: C.success.tint },
  warning: { text: C.warning.text, dot: C.warning.dot, tint: C.warning.tint },
  danger: { text: C.danger.text, dot: C.danger.text, tint: C.danger.tint },
  info: { text: C.info.text, dot: C.info.text, tint: C.info.tint },
  neutral: { text: C.text2, dot: C.faint, tint: C.sunken },
};

// ------------------------------------------------------------------ StatusPill

const PillFace: React.FC<{ tone: Tone; label: React.ReactNode; size: number; dot: boolean }> = ({ tone, label, size, dot }) => {
  const t = TONE[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: FONT.sans,
        fontSize: size,
        lineHeight: '17px',
        fontWeight: 500,
        color: t.text,
        background: t.tint,
        borderRadius: 999,
        padding: '1px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {dot ? <span style={{ width: 6, height: 6, borderRadius: 999, background: t.dot, flex: 'none' }} /> : null}
      {label}
    </span>
  );
};

/** The built status pill: dot + word on a tint (`.badge`). `flipTo` crossfades tone and label (`ui`, 5 f). */
export const StatusPill: React.FC<{
  tone: Tone;
  label: React.ReactNode;
  size?: number;
  dot?: boolean;
  at?: F;
  flipTo?: { tone: Tone; label: React.ReactNode; at: F };
  style?: React.CSSProperties;
}> = ({ tone, label, size = 12, dot = true, at, flipTo, style }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  if (o <= 0) return null;
  if (!flipTo || f < flipTo.at)
    return (
      <span style={{ display: 'inline-flex', opacity: o, ...style }}>
        <PillFace tone={tone} label={label} size={size} dot={dot} />
      </span>
    );
  const p = ui(f, flipTo.at);
  return (
    <span style={{ display: 'inline-grid', opacity: o, ...style }}>
      <span style={{ gridArea: '1/1', opacity: 1 - p }}>
        <PillFace tone={tone} label={label} size={size} dot={dot} />
      </span>
      <span style={{ gridArea: '1/1', opacity: p }}>
        <PillFace tone={flipTo.tone} label={flipTo.label} size={size} dot={dot} />
      </span>
    </span>
  );
};

/** Fade a child in (and optionally out) with the `ui` transition (5 f linear). */
export const FadeIn: React.FC<{ at: F; exitAt?: F; dur?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, exitAt, dur = 5, children, style }) => {
  const f = useCurrentFrame();
  const o = appear(f, at, dur, ease.linear) * (exitAt === undefined ? 1 : 1 - appear(f, exitAt, dur, ease.linear));
  if (o <= 0) return null;
  return <div style={{ opacity: o, ...style }}>{children}</div>;
};

// ------------------------------------------------------------------ page layout

/** The 1120 content column inside the main pane (padding 30/32/60, centred). `scrollY` scrolls it. */
export const Page: React.FC<{ children: React.ReactNode; scrollY?: number; width?: number; pad?: string }> = ({ children, scrollY = 0, width = 1120, pad = '30px 32px 60px' }) => (
  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
    <div style={{ maxWidth: width, margin: '0 auto', padding: pad, boxSizing: 'border-box', transform: `translateY(${-scrollY}px)` }}>{children}</div>
  </div>
);

export interface PageHeaderProps {
  title: React.ReactNode;
  /** Title in mono (a document reference, `18-round-open.png`). */
  titleMono?: boolean;
  pill?: { tone: Tone; label: React.ReactNode };
  sub?: React.ReactNode;
  /** Right of the title row (buttons). */
  actions?: React.ReactNode;
  /** Under the sub (toolbars, pills). */
  children?: React.ReactNode;
}

/** Serif page title (29 px / 500) + optional pill, muted 13 px description (max ≈ 760). */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, titleMono, pill, sub, actions, children }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <h1
        style={{
          margin: 0,
          fontFamily: titleMono ? FONT.mono : FONT.serif,
          fontSize: titleMono ? 27 : 29,
          fontWeight: titleMono ? 500 : 500,
          letterSpacing: titleMono ? 0 : 0.1,
          lineHeight: '38px',
          color: C.text,
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h1>
      {pill ? <StatusPill tone={pill.tone} label={pill.label} /> : null}
      {actions ? <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div> : null}
    </div>
    {sub ? <div style={{ marginTop: 8, maxWidth: 780, fontSize: 13, lineHeight: 1.55, color: C.muted }}>{sub}</div> : null}
    {children}
  </div>
);

/** Uppercase micro section label (`LIVE DELIVERABLES`). */
export const SectionLabel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      fontSize: 10.5,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontWeight: 700,
      color: C.muted,
      margin: '34px 0 10px',
      ...style,
    }}
  >
    {children}
  </div>
);

/** Search input with a Lucide Search icon. */
export const SearchInput: React.FC<{ placeholder: string; value?: React.ReactNode; width?: number; focused?: boolean }> = ({ placeholder, value, width = 280, focused }) => (
  <div
    style={{
      width,
      height: 32,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 12px',
      border: `1px solid ${focused ? C.muted : C.border}`,
      boxShadow: focused ? '0 0 0 3px rgba(28,27,24,.08)' : undefined,
      borderRadius: RADIUS.control,
      background: C.pane,
      fontSize: 13,
      color: value ? C.text : C.muted,
      whiteSpace: 'nowrap',
    }}
  >
    <Search size={14} strokeWidth={1.8} color={C.muted} />
    {value ?? placeholder}
  </div>
);

/** Primary (near-black) or secondary (hairline) button in the built proportions. */
export const Btn: React.FC<{
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'disabled';
  label: React.ReactNode;
  icon?: React.ReactNode;
  hover?: boolean;
  pressAt?: F;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}> = ({ variant = 'secondary', label, icon, hover, pressAt, size = 'md', style }) => {
  const f = useCurrentFrame();
  const sm = size === 'sm';
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    fontFamily: FONT.sans,
    fontSize: sm ? 12 : 13,
    lineHeight: '19px',
    fontWeight: variant === 'primary' ? 700 : 600,
    borderRadius: RADIUS.control,
    padding: sm ? '3px 11px' : '4px 14px',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    border: '1px solid transparent',
  };
  const look: Record<string, React.CSSProperties> = {
    primary: { background: hover ? '#000' : C.ink, color: '#fff', borderColor: hover ? '#000' : C.ink, transform: `scale(${pressScale(f, pressAt)})` },
    secondary: { background: hover ? C.sunken : C.pane, color: C.text2, borderColor: C.borderStrong },
    quiet: { background: hover ? C.sunken : 'transparent', color: C.text2 },
    danger: { background: C.pane, color: C.danger.text, borderColor: '#ecc9c6' },
    disabled: { background: C.faint, color: '#fff', borderColor: C.faint },
  };
  const pressed = pressAt !== undefined && f >= pressAt && f < pressAt + 6 && variant !== 'primary';
  return (
    <span style={{ ...base, ...look[variant], ...(pressed ? { background: C.active } : {}), ...style }}>
      {icon}
      {label}
    </span>
  );
};

// ------------------------------------------------------------------ Table

export interface Column {
  key: string;
  label: React.ReactNode;
  /** Fixed width (px) or flex share. */
  w?: number;
  mono?: boolean;
  align?: 'left' | 'right';
}

export interface TableProps {
  columns: Column[];
  rows: Array<Record<string, React.ReactNode>>;
  /** Row under the cursor (`#faf9f7`). */
  hoverRow?: number;
  /** Selected row (active fill). */
  selectedRow?: number;
  /** Per-row appear frames (`ui`, 5 f); new rows fade in 3 f apart. */
  rowAt?: Array<F | undefined>;
  /** Row min height (02-plan rows ≈ 53). */
  rowH?: number;
  /** Full-width bands inserted before row n (e.g. a round header). */
  bands?: Array<{ before: number; content: React.ReactNode }>;
  /** Header row hidden. */
  headless?: boolean;
  fontSize?: number;
  style?: React.CSSProperties;
}

/** The built Table: white, hairline border, radius 8; micro uppercase headers; hairline rows. */
export const Table: React.FC<TableProps> = ({ columns, rows, hoverRow, selectedRow, rowAt, rowH = 44, bands = [], headless, fontSize = 13.5, style }) => {
  const f = useCurrentFrame();
  const cell = (c: Column): React.CSSProperties => ({
    width: c.w,
    flex: c.w ? 'none' : 1,
    minWidth: 0,
    padding: '10px 8px',
    boxSizing: 'border-box',
    textAlign: c.align ?? 'left',
    fontFamily: c.mono ? FONT.mono : undefined,
    fontSize: c.mono ? 12.5 : undefined,
    color: c.mono ? C.text2 : undefined,
  });
  return (
    <div style={{ background: C.pane, border: `1px solid ${C.border}`, borderRadius: RADIUS.pane, overflow: 'hidden', fontSize, color: C.text, ...style }}>
      {headless ? null : (
        <div style={{ display: 'flex', alignItems: 'center', padding: '0', minHeight: 44, borderBottom: `1px solid ${C.border}` }}>
          {columns.map((c) => (
            <div
              key={c.key}
              style={{
                ...cell(c),
                fontFamily: FONT.sans,
                fontSize: 10.5,
                lineHeight: '13px',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontWeight: 700,
                color: C.muted,
              }}
            >
              {c.label}
            </div>
          ))}
        </div>
      )}
      {rows.map((r, i) => {
        const at = rowAt?.[i];
        const o = at === undefined ? 1 : ui(f, at);
        const band = bands.filter((b) => b.before === i);
        return (
          <React.Fragment key={i}>
            {band.map((b, j) => (
              <div key={`b${j}`} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
                {b.content}
              </div>
            ))}
            {o > 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0',
                  minHeight: rowH,
                  borderBottom: i === rows.length - 1 ? undefined : `1px solid ${C.borderSubtle}`,
                  background: selectedRow === i ? C.active : hoverRow === i ? C.neutral50 : undefined,
                  opacity: o,
                }}
              >
                {columns.map((c) => (
                  <div key={c.key} style={{ ...cell(c), lineHeight: 1.25 }}>
                    {r[c.key]}
                  </div>
                ))}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ overlays

const MODAL_W = { sm: 400, md: 520, lg: 760 } as const;

export interface ModalProps {
  size?: 'sm' | 'md' | 'lg';
  title: React.ReactNode;
  /** Scrim and modal fade in together over 5 f (linear) from here. */
  at: F;
  exitAt?: F;
  footer?: React.ReactNode;
  /** Muted line above the body (e.g. `Step 1 of 3`). */
  kicker?: React.ReactNode;
  /** Body scroll offset (native px). */
  scrollY?: number;
  /** Shell width, to centre the modal (default 1536). */
  plateW?: number;
  top?: number;
  children?: React.ReactNode;
}

/** Built modal over a full-plate scrim. Put it in the Shell's `overlay`. No scale, no slide (§2.7). */
export const Modal: React.FC<ModalProps> = ({ size = 'md', title, at, exitAt, footer, kicker, scrollY = 0, plateW = 1536, top = 64, children }) => {
  const f = useCurrentFrame();
  const o = ui(f, at) * (exitAt === undefined ? 1 : 1 - ui(f, exitAt));
  if (o <= 0) return null;
  const w = Math.min(MODAL_W[size], plateW - 32);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(28,27,24,.32)' }} />
      <div
        style={{
          position: 'absolute',
          left: (plateW - w) / 2,
          top,
          width: w,
          maxHeight: `calc(100% - ${top * 2}px)`,
          background: C.pane,
          borderRadius: RADIUS.lg,
          boxShadow: SHADOW.overlay,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT.sans,
          color: C.text,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px', borderBottom: `1px solid ${C.border}`, flex: 'none' }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{title}</div>
          <X size={16} strokeWidth={1.8} color={C.muted} />
        </div>
        <div style={{ padding: 24, overflow: 'hidden', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'grid', gap: 16, transform: `translateY(${-scrollY}px)` }}>
            {kicker ? <div style={{ fontSize: 12, color: C.muted }}>{kicker}</div> : null}
            {children}
          </div>
        </div>
        {footer ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '16px 24px', borderTop: `1px solid ${C.border}`, flex: 'none' }}>{footer}</div>
        ) : null}
      </div>
    </div>
  );
};

/** Built banner: tinted bar, 3 px left rule, optional ✕. Fades in with `ui`. */
export const Banner: React.FC<{ tone?: 'success' | 'danger' | 'warning' | 'neutral'; text: React.ReactNode; at?: F; dismissible?: boolean; style?: React.CSSProperties }> = ({
  tone = 'success',
  text,
  at,
  dismissible = true,
  style,
}) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  if (o <= 0) return null;
  const rule = tone === 'success' ? C.success.dot : tone === 'danger' ? C.danger.text : tone === 'warning' ? C.warning.text : C.faint;
  const bg = tone === 'success' ? C.success.tint : tone === 'danger' ? C.danger.tint : tone === 'warning' ? C.warning.tint : C.neutral50;
  return (
    <div
      style={{
        position: 'relative',
        fontSize: 12.5,
        lineHeight: 1.55,
        color: C.prose,
        background: bg,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${rule}`,
        borderRadius: RADIUS.control,
        padding: dismissible ? '12px 42px 12px 16px' : '12px 16px',
        opacity: o,
        ...style,
      }}
    >
      {text}
      {dismissible ? <X size={14} strokeWidth={1.8} color={C.muted} style={{ position: 'absolute', right: 14, top: 14 }} /> : null}
    </div>
  );
};

/**
 * A small level-4 notice (bottom-centre of the pane). NOTE: the built app
 * confirms with banners and receipts, not toasts; use this only where a
 * director's plan cites it.
 */
export const Toast: React.FC<{ text: React.ReactNode; at: F; exitAt?: F; x?: number; y?: number }> = ({ text, at, exitAt, x = 870, y = 800 }) => {
  const f = useCurrentFrame();
  const o = appear(f, at, 4, ease.linear) * (exitAt === undefined ? 1 : 1 - appear(f, exitAt, 4, ease.linear));
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: C.pane,
        borderRadius: RADIUS.control,
        boxShadow: SHADOW.overlay,
        padding: '9px 14px',
        fontSize: 12.5,
        color: C.text,
        whiteSpace: 'nowrap',
        opacity: o,
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: 999, background: C.success.tint, color: C.success.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Check size={11} strokeWidth={3} />
      </span>
      {text}
    </div>
  );
};

export interface DropdownItem {
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Muted line or kicker under the label. */
  sub?: React.ReactNode;
  hover?: boolean;
  selected?: boolean;
  muted?: boolean;
}

/**
 * Level-4 dropdown / popover. Fades over 4 f (§2.7). Native px: (x, y) is the
 * top-left when `direction` is 'down' (default) and the BOTTOM-left when 'up'
 * (menus that open above their control, e.g. the composer's library list).
 */
export const Dropdown: React.FC<{
  x: number;
  y: number;
  width?: number;
  at: F;
  exitAt?: F;
  items?: DropdownItem[];
  children?: React.ReactNode;
  head?: React.ReactNode;
  direction?: 'up' | 'down';
}> = ({ x, y, width = 220, at, exitAt, items = [], children, head, direction = 'down' }) => {
  const f = useCurrentFrame();
  const o = appear(f, at, 4, ease.linear) * (exitAt === undefined ? 1 : 1 - appear(f, exitAt, 4, ease.linear));
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        background: C.pane,
        borderRadius: RADIUS.control,
        boxShadow: SHADOW.overlay,
        padding: 6,
        boxSizing: 'border-box',
        fontSize: 13,
        color: C.text,
        opacity: o,
        zIndex: 10,
        transform: direction === 'up' ? 'translateY(-100%)' : undefined,
      }}
    >
      {head ? <div style={{ padding: '6px 10px 8px', fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>{head}</div> : null}
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: it.sub ? 'flex-start' : 'center',
            gap: 8,
            padding: '7px 10px',
            borderRadius: 6,
            background: it.hover ? C.sunken : it.selected ? C.neutral50 : undefined,
            color: it.muted ? C.muted : C.text,
          }}
        >
          {it.icon ? <span style={{ color: C.text2, display: 'inline-flex', marginTop: it.sub ? 2 : 0 }}>{it.icon}</span> : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: it.sub ? 600 : 400 }}>{it.label}</div>
            {it.sub ? <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{it.sub}</div> : null}
          </div>
          {it.selected ? <Check size={14} strokeWidth={2} color={C.text} /> : null}
        </div>
      ))}
      {children}
    </div>
  );
};

// ------------------------------------------------------------------ forms

/** Field: label (11.5 / 600 text2), control, hint (11.5 muted). */
export const Field: React.FC<{ label?: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }> = ({ label, hint, children, style }) => (
  <div style={{ display: 'grid', gap: 5, ...style }}>
    {label ? <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text2, letterSpacing: 0.1 }}>{label}</div> : null}
    {children}
    {hint ? <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, maxWidth: 780 }}>{hint}</div> : null}
  </div>
);

/** Text input (13 px, hairline, radius 8). Pass a <HumanTyped/> as `value` for typing. */
export const TextInput: React.FC<{ value?: React.ReactNode; placeholder?: string; focused?: boolean; icon?: React.ReactNode; multiline?: number; style?: React.CSSProperties }> = ({
  value,
  placeholder,
  focused,
  icon,
  multiline,
  style,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: multiline ? 'flex-start' : 'center',
      gap: 8,
      minHeight: multiline ? 12 + multiline * 20 : 34,
      boxSizing: 'border-box',
      padding: '7px 12px',
      border: `1px solid ${focused ? C.muted : C.border}`,
      boxShadow: focused ? '0 0 0 3px rgba(28,27,24,.08)' : undefined,
      borderRadius: RADIUS.control,
      background: C.pane,
      fontSize: 13,
      lineHeight: '20px',
      color: C.text,
      maxWidth: 780,
      ...style,
    }}
  >
    {icon ? <span style={{ color: C.muted, display: 'inline-flex', marginTop: multiline ? 2 : 0 }}>{icon}</span> : null}
    <span style={{ flex: 1, minWidth: 0 }}>{value ?? <span style={{ color: C.muted }}>{placeholder}</span>}</span>
  </div>
);

/** Select (closed). Open state: put a Dropdown under it. */
export const Select: React.FC<{ value: React.ReactNode; focused?: boolean; muted?: boolean; style?: React.CSSProperties }> = ({ value, focused, muted, style }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      height: 34,
      boxSizing: 'border-box',
      padding: '0 10px 0 12px',
      border: `1px solid ${focused ? C.muted : C.border}`,
      boxShadow: focused ? '0 0 0 3px rgba(28,27,24,.08)' : undefined,
      borderRadius: RADIUS.control,
      background: C.pane,
      fontSize: 13,
      color: muted ? C.muted : C.text,
      maxWidth: 780,
      ...style,
    }}
  >
    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    <ChevronDown size={14} strokeWidth={1.8} color={C.muted} />
  </div>
);

/**
 * The open list of a built select (`Dropdown` select variant): 318 wide by
 * default, 28 px rows, one line each with an ellipsis. (x, y) as Dropdown.
 */
export const SelectMenu: React.FC<{
  x: number;
  y: number;
  width?: number;
  at: F;
  exitAt?: F;
  options: readonly string[];
  selected?: string;
  /** Option under the cursor. */
  hover?: string;
  direction?: 'up' | 'down';
}> = ({ x, y, width = 318, at, exitAt, options, selected, hover, direction = 'down' }) => {
  const f = useCurrentFrame();
  const o = appear(f, at, 4, ease.linear) * (exitAt === undefined ? 1 : 1 - appear(f, exitAt, 4, ease.linear));
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        background: C.pane,
        borderRadius: RADIUS.control,
        boxShadow: SHADOW.overlay,
        padding: 4,
        boxSizing: 'border-box',
        fontSize: 13,
        color: C.text,
        opacity: o,
        zIndex: 10,
        transform: direction === 'up' ? 'translateY(-100%)' : undefined,
      }}
    >
      {options.map((opt) => (
        <div
          key={opt}
          style={{
            height: 28,
            lineHeight: '28px',
            padding: '0 10px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            background: hover === opt ? C.sunken : selected === opt ? C.neutral50 : undefined,
            fontWeight: selected === opt ? 600 : 400,
          }}
        >
          {opt}
        </div>
      ))}
    </div>
  );
};

/** Segmented switch (white thumb on a sunken track): `List · How it connects`, `Full check · Quick check`. */
export const Segmented: React.FC<{ options: readonly string[]; active: string; hover?: string; size?: number }> = ({ options, active, hover, size = 12.5 }) => (
  <span style={{ display: 'inline-flex', background: C.sunken, borderRadius: RADIUS.control, padding: 3, gap: 2 }}>
    {options.map((o) => (
      <span
        key={o}
        style={{
          padding: '3px 12px',
          borderRadius: 6,
          fontSize: size,
          lineHeight: '19px',
          fontWeight: o === active ? 600 : 500,
          color: o === active ? C.text : C.text2,
          background: o === active ? C.pane : hover === o ? C.frameHover : undefined,
          boxShadow: o === active ? '0 1px 2px rgba(20,20,20,.08)' : undefined,
          whiteSpace: 'nowrap',
        }}
      >
        {o}
      </span>
    ))}
  </span>
);

/** 15 px checkbox (accent ink). `at` flips it checked with `ui`. */
export const Checkbox: React.FC<{ checked?: boolean; at?: F; size?: number }> = ({ checked = false, at, size = 15 }) => {
  const f = useCurrentFrame();
  const on = at === undefined ? (checked ? 1 : 0) : ui(f, at);
  return (
    <span
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 3.5,
        boxSizing: 'border-box',
        border: `1.5px solid ${on > 0.5 ? C.ink : '#8a887f'}`,
        background: C.pane,
        flex: 'none',
        display: 'inline-block',
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: -1.5,
          borderRadius: 3.5,
          background: C.ink,
          opacity: on,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={size - 4} color="#fff" strokeWidth={3} />
      </span>
    </span>
  );
};

/** A pick-list row: checkbox + name + muted sub (`.pick-row`). */
export const PickRow: React.FC<{ name: React.ReactNode; sub?: React.ReactNode; checked?: boolean; at?: F; hover?: boolean }> = ({ name, sub, checked, at, hover }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: RADIUS.control, background: hover ? C.frameHover : undefined, fontSize: 13 }}>
    <Checkbox checked={checked} at={at} />
    <span style={{ flex: 1, color: C.text }}>{name}</span>
    {sub ? <span style={{ color: C.muted, fontSize: 12 }}>{sub}</span> : null}
  </div>
);

/** Sunken key/value card (`13a`, `15`): radius 8, popout shadow, 30 px rows. */
export const KeyValueCard: React.FC<{ label?: React.ReactNode; locked?: boolean; rows: Array<[React.ReactNode, React.ReactNode]>; note?: React.ReactNode; style?: React.CSSProperties }> = ({
  label,
  locked,
  rows,
  note,
  style,
}) => (
  <div style={{ background: C.sunken, borderRadius: RADIUS.pane, boxShadow: SHADOW.popout, padding: '12px 16px', fontSize: 13, ...style }}>
    {label ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.muted }}>{label}</span>
        {locked ? <StatusPill tone="neutral" label="Locked" size={11} /> : null}
      </div>
    ) : null}
    {rows.map(([k, v], i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', minHeight: 30, gap: 16 }}>
        <span style={{ color: C.muted, flex: 'none', width: 170 }}>{k}</span>
        <span style={{ marginLeft: 'auto', textAlign: 'right', color: C.text }}>{v}</span>
      </div>
    ))}
    {note ? <div style={{ marginTop: 6, fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>{note}</div> : null}
  </div>
);

/** Small round number badge (suggestion callout tag). */
export const NumBadge: React.FC<{ n: number | string }> = ({ n }) => (
  <span
    style={{
      width: 18,
      height: 18,
      borderRadius: 999,
      background: C.ink,
      color: '#fff',
      fontSize: 10.5,
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
    }}
  >
    {n}
  </span>
);

// ------------------------------------------------------------------ chat composer

const EDITOR_CHIPS: Array<{ label: string; live?: boolean }> = [
  { label: '▤ From the library', live: true },
  { label: '＋ Attach a file' },
  { label: '≡ Prompts' },
  { label: '✒ Style' },
  { label: '◍ Web search' },
  { label: '▧ Sandbox search' },
  { label: '✳ Model' },
];

/** A source-row chip: hairline, 999 radius. Disabled placeholders are greyed. */
export const ComposerChip: React.FC<{ label: React.ReactNode; disabled?: boolean; active?: boolean; hover?: boolean }> = ({ label, disabled, active, hover }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: `1px solid ${active ? 'rgba(20,20,20,.22)' : 'rgba(20,20,20,.09)'}`,
      background: active || hover ? C.sunken : 'transparent',
      borderRadius: 999,
      padding: '3px 10px',
      fontSize: 11.5,
      lineHeight: '17px',
      fontWeight: 500,
      color: active ? C.text : C.text2,
      opacity: disabled ? 0.45 : 1,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </span>
);

/**
 * The editor side panel's composer (`09-editor.png`): sunken box, ✦,
 * placeholder `Ask for a draft into this document`, 30 px send. Chips below:
 * `▤ From the library` live, the rest greyed (never shown working).
 */
export const PanelComposer: React.FC<{
  value?: React.ReactNode;
  placeholder?: string;
  focused?: boolean;
  /** Send armed (ink) once there is text. */
  armed?: boolean;
  sendPressAt?: F;
  chips?: boolean;
  chipHover?: string;
}> = ({ value, placeholder = 'Ask for a draft into this document', focused, armed, sendPressAt, chips = true, chipHover }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          background: C.sunken,
          borderRadius: RADIUS.lg,
          boxShadow: focused ? `${SHADOW.popout}, 0 0 0 1px rgba(20,20,20,.12)` : SHADOW.popout,
          padding: '11px 11px 11px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          minHeight: 52,
          boxSizing: 'border-box',
        }}
      >
        <AgentGlyph size={12} colour={C.text2} style={{ marginTop: 9 }} />
        <span style={{ flex: 1, minWidth: 0, color: value ? C.text : C.muted, fontSize: 13, lineHeight: '20px', paddingTop: 5 }}>{value ?? placeholder}</span>
        <span
          style={{
            width: 30,
            height: 30,
            flex: 'none',
            borderRadius: RADIUS.control,
            background: armed ? C.ink : C.faint,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            transform: `scale(${pressScale(f, sendPressAt)})`,
          }}
        >
          ↵
        </span>
      </div>
      {chips ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {EDITOR_CHIPS.map((c) => (
            <ComposerChip key={c.label} label={c.label} disabled={!c.live} hover={chipHover === c.label} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

/** A chat log entry in the side panel: small label above; the user's text in a bubble, the agent's plain. */
export const ChatEntry: React.FC<{ who: string; agent?: boolean; children: React.ReactNode; at?: F }> = ({ who, agent, children, at }) => {
  const f = useCurrentFrame();
  const o = at === undefined ? 1 : ui(f, at);
  if (o <= 0) return null;
  return (
    <div style={{ opacity: o, display: 'flex', flexDirection: 'column', alignItems: agent ? 'flex-start' : 'flex-end', gap: 4 }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{who}</div>
      <div
        style={{
          fontSize: 12.5,
          lineHeight: 1.5,
          color: agent ? C.text2 : C.text,
          background: agent ? undefined : C.sunken,
          boxShadow: agent ? undefined : SHADOW.popout,
          borderRadius: RADIUS.control,
          padding: agent ? 0 : '8px 11px',
          maxWidth: agent ? '100%' : '88%',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ cited claims

/**
 * Cited claims streamed one at a time (4 c/f, 4 f gap); each claim's source
 * pill fades in 2 f after its last character. `layout`: one block per claim
 * (Ask) or running prose (a suggestion).
 */
export const CitedClaims: React.FC<{
  claims: Array<{ text: string; refs: readonly string[] }>;
  from: F;
  rate?: number;
  gap?: number;
  layout?: 'blocks' | 'prose';
  /** Ink-outline a pill from a frame (clicked / hovered). */
  activeRef?: { claim: number; ref: string; at: F };
  pillSize?: number;
  /** Frames between a claim's first and second pill (default 3). */
  pillStagger?: number;
  style?: React.CSSProperties;
}> = ({ claims, from, rate = 4, gap = 4, layout = 'blocks', activeRef, pillSize = 11.5, pillStagger = 3, style }) => {
  const f = useCurrentFrame();
  const sched = claimsSchedule(claims, from, rate, gap);
  const parts = claims.map((c, i) => {
    const s = sched[i];
    const n = Math.min(c.text.length, streamCount(f, s.start, rate));
    if (n <= 0) return null;
    return (
      <span key={i} style={layout === 'blocks' ? { display: 'block', marginBottom: 10 } : undefined}>
        {c.text.slice(0, n)}
        {c.refs.map((r, j) =>
          f >= s.pillAt + j * pillStagger ? (
            <React.Fragment key={r}>
              {' '}
              <SourceChip
                docRef={r}
                at={s.pillAt + j * pillStagger}
                size={pillSize}
                activeAt={activeRef && activeRef.claim === i && activeRef.ref === r ? activeRef.at : undefined}
              />
            </React.Fragment>
          ) : null,
        )}
        {layout === 'prose' ? ' ' : null}
      </span>
    );
  });
  return <div style={style}>{parts}</div>;
};

/** Frame the last pill of a claims stream lands (for shot tables). */
export const claimsEndAt = (claims: Array<{ text: string }>, from: F, rate = 4, gap = 4) => {
  const s = claimsSchedule(claims, from, rate, gap);
  return s.length ? s[s.length - 1].pillAt : from;
};

// ------------------------------------------------------------------ presence (W3)

export interface Present {
  initials: string;
  name: string;
  org: string;
  /** Near-black fill while editing (VISION); sunken while viewing (BUILT). */
  editing?: boolean;
  /** Editing fill from this frame (overrides `editing`). */
  editingAt?: F;
  /** Back to the viewing fill from here. */
  editingUntil?: F;
  /** Appears at (ui). */
  at?: F;
}

/** The doc-bar presence stack (`presence.tsx`): 24 px circles, 2 px white ring, −6 px overlap. */
export const PresenceStack: React.FC<{ people: Present[] }> = ({ people }) => {
  const f = useCurrentFrame();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 4 }}>
      {people.map((p, i) => {
        const o = p.at === undefined ? 1 : ui(f, p.at);
        if (o <= 0) return null;
        const editing = p.editingAt !== undefined ? f >= p.editingAt && (p.editingUntil === undefined || f < p.editingUntil) : !!p.editing;
        return (
          <span
            key={p.initials}
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              marginLeft: i === 0 ? 0 : -6,
              boxSizing: 'border-box',
              border: `2px solid ${C.pane}`,
              background: editing ? C.ink : C.sunken,
              color: editing ? '#fff' : C.text2,
              fontSize: 10,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: o,
            }}
          >
            {p.initials}
          </span>
        );
      })}
    </span>
  );
};

/**
 * A remote caret (VISION, flows-docmgmt B.2): 2 px ink bar + an ink flag with
 * the person's name, collapsing to initials after 60 f idle. No per-person hue.
 * Place it inline in the prose at the insertion point.
 */
export const PresenceFlag: React.FC<{ name: string; initials: string; at?: F; idleFrom?: F; hideAt?: F; reshowAt?: F }> = ({ name, initials, at, idleFrom, hideAt, reshowAt }) => {
  const f = useCurrentFrame();
  let o = at === undefined ? 1 : ui(f, at);
  if (hideAt !== undefined && f >= hideAt && (reshowAt === undefined || f < reshowAt)) o *= 1 - ui(f, hideAt);
  if (reshowAt !== undefined && f >= reshowAt) o = ui(f, reshowAt);
  if (o <= 0) return null;
  const short = idleFrom !== undefined && f >= idleFrom + 60;
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 0, height: '1.15em', verticalAlign: '-0.2em', opacity: o }}>
      <span style={{ position: 'absolute', left: -1, top: 0, width: 2, height: '100%', background: C.ink }} />
      <span
        style={{
          position: 'absolute',
          left: -1,
          bottom: '100%',
          background: C.ink,
          color: '#fff',
          fontFamily: FONT.sans,
          fontSize: 10.5,
          fontWeight: 600,
          lineHeight: '15px',
          padding: '1px 6px',
          borderRadius: '4px 4px 4px 0',
          whiteSpace: 'nowrap',
        }}
      >
        {short ? initials : name}
      </span>
    </span>
  );
};

/** Another person's selection (VISION): sunken tint with a 1 px dotted underline, from `at` (or `from`) until `exitAt`. */
export const RemoteSelection: React.FC<{ at?: F; from?: F; exitAt?: F; children: React.ReactNode }> = ({ at, from, exitAt, children }) => {
  const f = useCurrentFrame();
  const start = from ?? at ?? 0;
  const on = f >= start && (exitAt === undefined || f < exitAt);
  return (
    <span style={{ background: on ? C.sunken : undefined, borderBottom: on ? `1px dotted ${C.muted}` : undefined, borderRadius: 2 }}>{children}</span>
  );
};

// ------------------------------------------------------------------ suggestion callout

export interface SuggestionCalloutProps {
  n?: number;
  claims: Array<{ text: string; refs: readonly string[] }>;
  /** First claim starts streaming here (4 c/f, 4 f gaps). Omit for a settled callout. */
  from?: F;
  /** Actions appear (ui) — default: 4 f after the last pill. */
  actionsAt?: F;
  /** Hover / press on an action. */
  hover?: 'accept' | 'edit' | 'refine' | 'reject';
  acceptPressAt?: F;
  /** From here the callout is replaced by the accepted prose as a green tracked insert. */
  acceptAt?: F;
  /** The insert settles to plain ink here (8 f). Default acceptAt + 45. */
  settleAt?: F;
  /** Keep the source pills in the accepted text (default true; W3's built append drops them). */
  acceptedPills?: boolean;
  activeRef?: { claim: number; ref: string; at: F };
  tag?: string;
}

/**
 * The inline suggestion callout (`editor.tsx`, BUILT-NP): sunken card, NumBadge +
 * `SUGGESTION · INSERT · PENDING YOUR DECISION`, cited serif prose, then
 * `✓ Accept · ✎ Edit · ↻ Refine · Reject`. Lives inside <Prose>.
 */
export const SuggestionCallout: React.FC<SuggestionCalloutProps> = ({
  n = 1,
  claims,
  from = -10000,
  actionsAt,
  hover,
  acceptPressAt,
  acceptAt,
  activeRef,
  tag = 'Suggestion · Insert · Pending your decision',
  settleAt,
  acceptedPills = true,
}) => {
  const f = useCurrentFrame();
  const sched = claimsSchedule(claims, from, 4, 4);
  const last = sched.length ? sched[sched.length - 1].pillAt : from;
  const aAt = actionsAt ?? last + 4;
  if (acceptAt !== undefined && f >= acceptAt) {
    const settle = appear(f, settleAt ?? acceptAt + 45, 8, ease.linear);
    return (
      <span
        style={{
          display: 'block',
          margin: '14px 0',
          background: `rgba(232,245,234,${1 - settle})`,
          color: C.text,
          borderRadius: 2,
          textDecoration: settle < 1 ? 'underline' : 'none',
          textDecorationColor: `rgba(47,158,82,${1 - settle})`,
          textUnderlineOffset: 3,
        }}
      >
        {claims.map((c, i) => (
          <React.Fragment key={i}>
            {c.text}
            {acceptedPills
              ? c.refs.map((r) => (
                  <React.Fragment key={r}>
                    {' '}
                    <SourceChip docRef={r} size={11.5} />
                  </React.Fragment>
                ))
              : null}{' '}
          </React.Fragment>
        ))}
      </span>
    );
  }
  return (
    <div style={{ background: C.sunken, borderRadius: RADIUS.pane, boxShadow: SHADOW.popout, padding: '14px 16px', margin: '14px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: FONT.sans,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: C.text2,
          marginBottom: 8,
        }}
      >
        <NumBadge n={n} />
        {tag}
      </div>
      <CitedClaims claims={claims} from={from} layout="prose" activeRef={activeRef} />
      {f >= aAt ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, opacity: ui(f, aAt), fontFamily: FONT.sans }}>
          <Btn variant="primary" size="sm" label="✓ Accept" hover={hover === 'accept'} pressAt={acceptPressAt} />
          <Btn variant="secondary" size="sm" label="✎ Edit" hover={hover === 'edit'} />
          <Btn variant="secondary" size="sm" label="↻ Refine" hover={hover === 'refine'} />
          <Btn variant="danger" size="sm" label="Reject" hover={hover === 'reject'} />
        </div>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ remote typing (W3)

/**
 * Another person's typing, seen live (VISION): the text arrives on the
 * person's own `HumanTyped` timeline, and their flagged caret rides the end
 * of what has arrived. Render the SAME props in both seats: the typist's seat
 * passes `local` (a plain caret, no flag); the other seat shows the flag.
 * The flag collapses to initials 60 f after the last keystroke.
 */
export const RemoteTyped: React.FC<{
  text: string;
  from: F;
  seed?: number;
  name: string;
  initials: string;
  /** This is the typist's own seat: a local caret instead of the flag. */
  local?: boolean;
  /** Flag / caret visible from (default `from`) … */
  showFrom?: F;
  hideAt?: F;
  reshowAt?: F;
  style?: React.CSSProperties;
}> = ({ text, from, seed = 1, name, initials, local, showFrom, hideAt, reshowAt, style }) => {
  const f = useCurrentFrame();
  const sched = typingSchedule(text, from, seed);
  let n = 0;
  while (n < sched.length && sched[n] <= f) n++;
  const last = n > 0 ? sched[n - 1] : from;
  const typed = text.slice(0, n);
  const lines = typed.split('\n');
  const shown = (showFrom ?? from) <= f;
  return (
    <span style={{ whiteSpace: 'pre-wrap', ...style }}>
      {lines.map((l, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <br /> : null}
          {l}
        </React.Fragment>
      ))}
      {!shown ? null : local ? (
        hideAt !== undefined && f >= hideAt && (reshowAt === undefined || f < reshowAt) ? null : (
          <Caret visible={n < sched.length || f - last < 8 || caretOn(f, last)} />
        )
      ) : (
        <PresenceFlag name={name} initials={initials} at={showFrom ?? from} idleFrom={last} hideAt={hideAt} reshowAt={reshowAt} />
      )}
    </span>
  );
};
