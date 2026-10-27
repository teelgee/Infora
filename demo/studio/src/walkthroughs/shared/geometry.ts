/**
 * Walkthrough geometry and the camera (walkthroughs master-plan §2.2, §2.6).
 *
 * Three coordinate spaces:
 *   native  the app's own CSS px. The Shell is 1536 × 864 (split: 752 × 832).
 *           Directors author every point here — it equals the screenshot's px
 *           (the extra 96 px of width goes to the main pane).
 *   window  px inside the app window (1680 × 945), before it is placed.
 *   screen  px on the 1920 × 1080 stage.
 *
 * At Wide the plate shows at K = 1.09375 screen px per native px. The camera
 * magnifies the plate inside the fixed window by m (Work 1.3–1.6, Detail
 * 1.8–2.0), so on-screen scale is K × m.
 */
import { ease, type F } from '../../shared';

export const NATIVE = { w: 1536, h: 864 } as const;
export const SPLIT_NATIVE = { w: 752, h: 832 } as const;

/** Screen px per native px at Wide (= 1.25 × 0.875). */
export const K = 1.09375;

/** The single app window on the stage (§2.2). */
export const WINDOW = { x: 120, y: 24, w: 1680, h: 945, r: 12 } as const;
/** Window centre on the stage. */
export const WINDOW_CENTRE = { x: WINDOW.x + WINDOW.w / 2, y: WINDOW.y + WINDOW.h / 2 } as const; // (960, 496.5)

/** The split pair (§2.2): each 822 × 910, 36 px apart, seat tags above at y 24–52. */
export const SPLIT = {
  left: { x: 120, y: 60, w: 822, h: 910 },
  right: { x: 978, y: 60, w: 822, h: 910 },
  tagY: 24,
} as const;

export const WINDOW_SHADOW = '0 1px 2px rgba(20,20,20,.06), 0 18px 48px -14px rgba(20,20,20,.22)';

/** Caption band: y 969–1080, free of UI at all times. */
export const CAPTION_BAND = { top: 969, labelTop: 988, lineTop: 1014, x: 120, baseline: 1039.5 } as const;

// ------------------------------------------------------------------ points

/** A point in native app px (the default for every director-authored point). */
export interface NativePt {
  x: number;
  y: number;
}
/** A point in stage px (rarely needed: off-window targets). */
export interface ScreenPt {
  sx: number;
  sy: number;
}
export type Pt = NativePt | ScreenPt;
export const isScreenPt = (p: Pt): p is ScreenPt => 'sx' in p;

export type WindowId = 'main' | 'left' | 'right';

// ------------------------------------------------------------------ camera

/**
 * A camera key: native centre + magnification relative to Wide. The move INTO
 * this state starts at `f` and lasts `dur` frames (default: the §2.6 duration
 * for the kind of move — Wide↔Work 21, Work pan 18, Work↔Detail 15,
 * Detail→Wide 24). The first key is the starting state (no move).
 */
export interface WtCameraKey {
  f: F;
  cx: number;
  cy: number;
  m: number;
  dur?: number;
}

export interface CameraState {
  cx: number;
  cy: number;
  m: number;
}

export const WIDE: CameraState = { cx: NATIVE.w / 2, cy: NATIVE.h / 2, m: 1 };

/** Work state on a native centre (m 1.3–1.6, default 1.4). */
export const work = (cx: number, cy: number, m = 1.4): CameraState => clampCam({ cx, cy, m });
/** Detail state on a native centre (m 1.8–2.0, default 1.9). ≤ 120 f per use, ≤ 4 per video. */
export const detail = (cx: number, cy: number, m = 1.9): CameraState => clampCam({ cx, cy, m });
/** Build a key: `key(300, work(1100, 500))` or `key(300, WIDE)`. */
export const key = (f: F, s: CameraState, dur?: number): WtCameraKey => ({ f, ...clampCam(s), dur });

const kind = (m: number) => (m < 1.15 ? 'wide' : m < 1.7 ? 'work' : 'detail');

/** §2.6 move duration between two states. */
export function moveFrames(a: CameraState, b: CameraState): number {
  const ka = kind(a.m);
  const kb = kind(b.m);
  if (ka === kb) return ka === 'wide' ? 21 : ka === 'work' ? 18 : 15;
  if (ka === 'detail' && kb === 'wide') return 24;
  if (ka === 'wide' && kb === 'detail') return 24;
  if (ka === 'detail' || kb === 'detail') return 15;
  return 21;
}

/** Keep the visible region inside the plate (§2.6). */
export function clampCam(s: CameraState): CameraState {
  const m = Math.max(1, s.m);
  const hw = NATIVE.w / 2 / m;
  const hh = NATIVE.h / 2 / m;
  return {
    m,
    cx: Math.min(NATIVE.w - hw, Math.max(hw, s.cx)),
    cy: Math.min(NATIVE.h - hh, Math.max(hh, s.cy)),
  };
}

/**
 * The camera at frame f. Moves interpolate the visible rectangle (left, top,
 * width) with ease.inOut, so a zoom reads as a straight push rather than a
 * swing.
 */
export function cameraAt(f: number, keys: WtCameraKey[] | undefined): CameraState {
  if (!keys || keys.length === 0) return WIDE;
  let state: CameraState = clampCam(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    const target = clampCam(k);
    const dur = k.dur ?? moveFrames(state, target);
    const t = dur <= 0 ? 1 : Math.min(1, (f - k.f) / dur);
    state = t >= 1 ? target : lerpCam(state, target, ease.inOut(t));
  }
  return state;
}

function lerpCam(a: CameraState, b: CameraState, t: number): CameraState {
  const ra = rect(a);
  const rb = rect(b);
  const w = ra.w + (rb.w - ra.w) * t;
  const left = ra.left + (rb.left - ra.left) * t;
  const top = ra.top + (rb.top - ra.top) * t;
  const m = NATIVE.w / w;
  return { m, cx: left + w / 2, cy: top + NATIVE.h / m / 2 };
}

function rect(s: CameraState) {
  const w = NATIVE.w / s.m;
  const h = NATIVE.h / s.m;
  return { left: s.cx - w / 2, top: s.cy - h / 2, w };
}

/** Is the camera moving at f? (Directors: never type, stream or move the cursor while true.) */
export function cameraMoving(f: number, keys: WtCameraKey[] | undefined): boolean {
  const a = cameraAt(f, keys);
  const b = cameraAt(f + 1, keys);
  return Math.abs(a.m - b.m) > 1e-6 || Math.abs(a.cx - b.cx) > 1e-6 || Math.abs(a.cy - b.cy) > 1e-6;
}

/** Native → stage px through the main window at a camera state (§2.6 mapping). */
export function mainToScreen(p: NativePt, cam: CameraState): ScreenPt {
  const s = K * cam.m;
  return { sx: WINDOW_CENTRE.x + (p.x - cam.cx) * s, sy: WINDOW_CENTRE.y + (p.y - cam.cy) * s };
}

/** Native → stage px for a split window (no camera in split). */
export function splitToScreen(p: NativePt, side: 'left' | 'right'): ScreenPt {
  const w = SPLIT[side];
  return { sx: w.x + p.x * K, sy: w.y + p.y * K };
}

/** The CSS transform that puts the plate in the main window at a camera state. */
export function plateTransform(cam: CameraState): string {
  const s = K * cam.m;
  const tx = WINDOW.w / 2 - cam.cx * s;
  const ty = WINDOW.h / 2 - cam.cy * s;
  return `translate(${tx}px, ${ty}px) scale(${s})`;
}

// ------------------------------------------------------------------ timeline helpers

export interface Chapter {
  name: string;
  from: F;
  /** Exclusive: the next chapter's first frame. */
  to: F;
}

/** Skeleton frames (§2.1). */
export const SKELETON = {
  titleEnd: 90,
  glimpseFrom: 90,
  glimpseOutFrom: 195,
  chaptersFrom: 207,
  close: 150,
  logo: 90,
} as const;

/** Lay chapters end to end from frame 207 (`frames` wins over `seconds`). */
export function layChapters(list: Array<{ name: string; frames?: number; seconds?: number }>, from: F = SKELETON.chaptersFrom): Chapter[] {
  let f = from;
  return list.map(({ name, frames, seconds }) => {
    const c = { name, from: f, to: f + (frames ?? Math.round((seconds ?? 0) * 30)) };
    f = c.to;
    return c;
  });
}

/** Total frames for a video whose chapters end at `closeFrom`. */
export const totalFrames = (closeFrom: F) => closeFrom + SKELETON.close + SKELETON.logo;
