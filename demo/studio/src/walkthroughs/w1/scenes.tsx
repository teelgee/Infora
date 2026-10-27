/**
 * Window content as a list of scenes joined by cuts or crossfades, without
 * <Sequence> (time is never reset).
 *
 * A crossfade may also change the camera (plan D9: "Work out → Wide in"): the
 * camera key snaps to the new state at the crossfade's first frame, and the
 * outgoing scene is drawn with a counter-transform that keeps it exactly where
 * it was under its old camera, so nothing zooms mid-fade.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { F } from '../../shared';
import { NATIVE, type CameraState } from '../shared';

export interface Scene {
  from: F;
  /** Exclusive. */
  to: F;
  node: React.ReactNode;
  /** How this scene hands over to the next: a 12 f crossfade by default if `fade` is set, else a cut. */
  fade?: { dur?: number; outCam?: CameraState };
}

/** Transform that draws native content under camera `c` while the real camera is Wide. */
const underCam = (c: CameraState) => `translate(${NATIVE.w / 2}px, ${NATIVE.h / 2}px) scale(${c.m}) translate(${-c.cx}px, ${-c.cy}px)`;

export const Scenes: React.FC<{ scenes: Scene[] }> = ({ scenes }) => {
  const f = useCurrentFrame();
  const layers: React.ReactNode[] = [];
  scenes.forEach((s, i) => {
    const prev = scenes[i - 1];
    const inFade = prev?.fade ? { at: prev.to, dur: prev.fade.dur ?? 12 } : null;
    const outFade = s.fade ? { at: s.to, dur: s.fade.dur ?? 12, cam: s.fade.outCam } : null;
    // Visible window: [from, to) plus the outgoing fade.
    const start = inFade ? Math.min(s.from, inFade.at) : s.from;
    const end = outFade ? s.to + outFade.dur : s.to;
    if (f < start || f >= end) return;
    let o = 1;
    if (inFade && f < inFade.at + inFade.dur) o = Math.max(0, (f - inFade.at) / inFade.dur);
    let transform: string | undefined;
    if (outFade && f >= outFade.at) {
      o = 1 - (f - outFade.at) / outFade.dur;
      if (outFade.cam) transform = underCam(outFade.cam);
    }
    if (o <= 0) return;
    layers.push(
      <div key={i} style={{ position: 'absolute', left: 0, top: 0, width: NATIVE.w, height: NATIVE.h, opacity: o, transform, transformOrigin: '0 0' }}>
        {s.node}
      </div>,
    );
  });
  return <div style={{ position: 'relative', width: NATIVE.w, height: NATIVE.h }}>{layers}</div>;
};
