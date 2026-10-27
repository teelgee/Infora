/**
 * The camera context: WalkthroughFrame publishes the main window's camera keys
 * so cursors (and anything else screen-space) ride with the camera.
 */
import React, { createContext, useContext } from 'react';
import { useCurrentFrame } from 'remotion';
import type { F } from '../../shared';
import { cameraAt, isScreenPt, mainToScreen, splitToScreen, type Pt, type ScreenPt, type WindowId, type WtCameraKey } from './geometry';

const CameraCtx = createContext<WtCameraKey[] | undefined>(undefined);

export const CameraProvider: React.FC<{ keys?: WtCameraKey[]; children: React.ReactNode }> = ({ keys, children }) => (
  <CameraCtx.Provider value={keys}>{children}</CameraCtx.Provider>
);

/** The main window's camera keys (from the nearest WalkthroughFrame). */
export const useCameraKeys = () => useContext(CameraCtx);

/** Map any point to stage px through a window at frame f (pure; pass the keys). */
export function toScreen(p: Pt, win: WindowId, f: number, keys: WtCameraKey[] | undefined): ScreenPt {
  if (isScreenPt(p)) return p;
  if (win === 'main') return mainToScreen(p, cameraAt(f, keys));
  return splitToScreen(p, win);
}

/**
 * `const at = useAppPoint('main'); at({ x: 1160, y: 520 })` → stage px at the
 * current frame (or at frame `f`). Split windows ignore the camera.
 */
export function useAppPoint(win: WindowId = 'main'): (p: Pt, f?: F) => ScreenPt {
  const keys = useCameraKeys();
  const frame = useCurrentFrame();
  return (p, f) => toScreen(p, win, f ?? frame, keys);
}
