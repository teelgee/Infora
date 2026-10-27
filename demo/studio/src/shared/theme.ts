/**
 * The shared theme: colours, shadows, radii, type sizes and fonts
 * (master-plan §4.1, §4.2, §4.6). The colour palette (C, CHART) is read from
 * docs/design/design-tokens.json. Shadows, radii and the type scale are still
 * typed in here from the same tokens, and some video folders use one-off
 * colours of their own; moving those onto the token file is unfinished.
 *
 * Fonts are loaded once, here, through @remotion/google-fonts so renders are
 * deterministic. Source Serif 4 matches the kit; Inter and JetBrains Mono are
 * the plan's stated stand-ins for the system sans and SF Mono (§4.2).
 */
import { loadFont as loadSerif } from '@remotion/google-fonts/SourceSerif4';
import { loadFont as loadSans } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { continueRender, delayRender } from 'remotion';
import tokens from '../../../../docs/design/design-tokens.json';

const serif = loadSerif('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] });
const serifItalic = loadSerif('italic', { weights: ['400'], subsets: ['latin', 'latin-ext'] });
const sans = loadSans('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] });
const mono = loadMono('normal', { weights: ['400', '500'], subsets: ['latin', 'latin-ext'] });

/**
 * Resolves once every face is downloaded AND registered. `document.fonts.load`
 * alone can resolve before @remotion/google-fonts has registered a face, so a
 * measurement taken then reads the fallback serif (found by clip 02). Anything
 * that measures text awaits this; the module-level delayRender below also holds
 * every frame until it settles, so no frame paints in a fallback face.
 */
export const fontsReady: Promise<unknown> = Promise.all([
  serif.waitUntilDone(),
  serifItalic.waitUntilDone(),
  sans.waitUntilDone(),
  mono.waitUntilDone(),
]).then(() => document.fonts.ready);
const fontHandle = delayRender('fonts: Source Serif 4, Inter, JetBrains Mono');
fontsReady.then(
  () => continueRender(fontHandle),
  () => continueRender(fontHandle),
);

export const FONT = {
  serif: `"${serif.fontFamily}", Georgia, serif`,
  sans: `"${sans.fontFamily}", -apple-system, "Segoe UI", sans-serif`,
  mono: `"${mono.fontFamily}", Menlo, monospace`,
  /** Bare family names, for canvas / document.fonts measurement. */
  family: { serif: serif.fontFamily, sans: sans.fontFamily, mono: mono.fontFamily },
} as const;

/** Colour tokens (§4.6). Seat colours are overlays only, never inside recreated UI. */
// Colours come from the design system's own token file, so the videos can't
// drift from it. Two groups are video-only and stay local: `prose` (the
// editor's body ink, from packages/ui styles, not a named token) and the seat
// colours, which tag whose window is on screen and never appear inside the UI.
const P = tokens.primitive.color;
const S = tokens.semantic.color;

export const C = {
  field: P.neutral['100'],
  ink: P.neutral['900'],
  frame: S['surface.frame'].light,
  frameHover: S['surface.frameHover'].light,
  frameActive: S['surface.frameActive'].light,
  pane: P.neutral['0'],
  sunken: P.neutral['150'],
  active: P.neutral['200'],
  neutral50: P.neutral['50'],
  text: P.neutral['900'],
  text2: P.neutral['600'],
  muted: P.neutral['500'],
  faint: P.neutral['400'],
  prose: '#2c2b28',
  border: P.neutral['200'],
  borderSubtle: P.neutral['100'],
  borderStrong: P.neutral['300'],
  success: { text: P.green['600'], dot: P.green['500'], tint: P.green.tint },
  warning: { text: P.amber['600'], dot: P.amber['500'], tint: P.amber.tint },
  danger: { text: P.red['500'], tint: P.red.tint },
  info: { text: P.slate['500'], tint: P.slate.tint },
  seat: { consultant: '#6d5dd3', client: '#159a74', supplier: '#8a6d3b', redgate: '#3a6ea5', qa: '#b8622f' },
} as const;

/** Chart palette (§4.6), on the same tokens. */
export const CHART = {
  s1: P.neutral['900'],
  s2: P.neutral['500'],
  s3: P.neutral['400'],
  s4: P.neutral['300'],
  s4Outline: P.neutral['400'],
  trend: P.neutral['600'],
  flag: P.amber['500'],
} as const;

export const SHADOW = {
  pane: '0 10px 26px rgba(20,20,20,.12)',
  popout: '0 10px 28px rgba(20,20,20,.09)',
  soft: '0 8px 22px rgba(20,20,20,.07)',
  overlay: '0 4px 8px rgba(0,0,0,.08), 0 24px 60px -12px rgba(0,0,0,.35)',
} as const;
export type ShadowName = keyof typeof SHADOW;

export const RADIUS = { xs: 4, control: 8, card: 8, pane: 8, lg: 10, full: 999 } as const;

/** Native UI type scale (px), from tokens/typography.css. */
export const TYPE = {
  micro: 10.5,
  label: 11.5,
  ui: 12.5,
  dense: 13,
  prose: 15.5,
  heading: 18,
  display: 24,
  displayLg: 29,
} as const;

/** Film geometry. */
export const STAGE = { w: 1920, h: 1080, fps: 30, cx: 960, cy: 540 } as const;

/** Focal text must render at ≥ 30 px on screen (§4.3). */
export const FOCAL_MIN_PX = 30;
/** Scales from §4.3. */
export const SCALE = { context: 1.8, focal: 2.4, shell: 1.2 } as const;
