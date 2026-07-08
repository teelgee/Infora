// T-049 — the design tokens of the approved mockups (third cut, 2026-07-06),
// typed for code that needs the values; the CSS custom properties in
// styles.css remain the styling source of truth.

export const color = {
  paper: '#faf9f6',
  panel: '#ffffff',
  ink: '#1c1b18',
  inkSoft: '#55524a',
  muted: '#8a867c',
  hairline: '#e7e4de',
  hairlineSoft: '#f0eee9',
  accent: '#14563f',
  accentSoft: '#e9f1ed',
  accentInk: '#0f4432',
  authority: '#274a6d',
  authoritySoft: '#e9eff6',
  amber: '#8a5a12',
  amberSoft: '#f8efdd',
  danger: '#8c2f2f',
  dangerSoft: '#f7e9e9',
} as const;

export const radius = { base: '10px', sm: '6px' } as const;

export const font = {
  sans: '-apple-system, "Segoe UI", "Inter", Roboto, Helvetica, Arial, sans-serif',
  serif: '"Iowan Old Style", "Source Serif Pro", Georgia, "Times New Roman", serif',
  mono: '"SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
} as const;

/** Badge tones and their mockup class names. */
export const badgeTone = {
  green: 'b-green',
  slate: 'b-slate',
  amber: 'b-amber',
  grey: 'b-grey',
  red: 'b-red',
} as const;
export type BadgeTone = keyof typeof badgeTone;
