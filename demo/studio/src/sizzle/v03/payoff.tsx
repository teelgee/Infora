/**
 * Shot 7, the payoff card: one project-library row whose badge flips from
 * "In review" to "Accepted", then who accepted it, then the hinge line "The
 * AI can now cite this." with its source pill. Frames are LOCAL to the shot
 * (0 = standalone 528 = film 408).
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { BookOpen } from 'lucide-react';
import { Badge, C, Camera, FONT, Float, GreekText, RADIUS, SourceChip, TYPE, appear, type CameraKey } from '../../shared';
import { DOC_REF, DOC_TITLE } from '../../data/wrenfield';
import { COPY } from './copy';

/** Shot-local beats (standalone − 528, film − 408). */
export const PT = {
  enter: 0,
  flip: 12,
  line1: 16,
  line2: 64,
  chip: 72,
  chipActive: 84,
  pushFrom: 32,
  pushTo: 111,
} as const;

const PAY = { x: 960, y: 520, scale: 2.4, w: 640 } as const;

/** Zoom about a fixed screen point P: camera centre x = P − (P − 960) / s. */
const fixedPoint = (px: number, py: number, s: number) => ({ x: px - (px - 960) / s, y: py - (py - 540) / s, scale: s });

const LINE: React.CSSProperties = {
  fontFamily: FONT.sans,
  fontSize: TYPE.prose,
  lineHeight: 1.35,
  fontWeight: 500,
  color: C.text,
  whiteSpace: 'nowrap',
};

const rise = (f: number, at: number): React.CSSProperties => {
  const p = appear(f, at, 9);
  return { opacity: p, transform: `translateY(${(1 - p) * 6}px)` };
};

export const Payoff: React.FC = () => {
  const f = useCurrentFrame();
  const keys: CameraKey[] = [
    { f: PT.pushFrom, x: 960, y: 540, scale: 1 },
    { f: PT.pushTo, ...fixedPoint(PAY.x, PAY.y, 1.05), ease: 'inOut' },
  ];
  // The line before the focal one turns Greek (§4.3 rule 3); labels sit at 0.6 beside a focal line.
  const labelO = f >= PT.line1 ? 0.6 : 1;
  return (
    <Camera keys={keys}>
      <Float x={PAY.x} y={PAY.y} scale={PAY.scale} at={PT.enter} shadow="pane" radius={RADIUS.lg} background={C.pane}>
        <div style={{ width: PAY.w, fontFamily: FONT.sans, color: C.text }}>
          {/* library row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 20px',
              borderBottom: `1px solid ${C.border}`,
              fontSize: TYPE.ui,
            }}
          >
            <span style={{ fontFamily: FONT.mono, fontSize: TYPE.ui, opacity: labelO }}>
              <GreekText text={DOC_REF} greek barColour={C.borderStrong} />
            </span>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', opacity: labelO }}>{DOC_TITLE}</span>
            <span style={{ color: C.muted, opacity: labelO }}>
              <GreekText text={COPY.revision} greek barColour={C.borderStrong} />
            </span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>
              <Badge tone="info" label="In review" pill size={TYPE.ui} flipTo={{ tone: 'success', label: 'Accepted', at: PT.flip }} />
            </span>
          </div>
          {/* who, where, and what it means */}
          <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, height: 21 }}>
              <span style={LINE}>
                {/* Greek until it is focal (544), sharp for its 48 f, Greek again when line 2 takes over. */}
                {f < PT.line2 ? (
                  <GreekText text={COPY.acceptedLine} sharpFrom={PT.line1} colour={C.text} />
                ) : (
                  <GreekText text={COPY.acceptedLine} greekFrom={PT.line2} colour={C.text} />
                )}
              </span>
              <span style={{ fontSize: TYPE.ui, color: C.muted, whiteSpace: 'nowrap', ...rise(f, PT.line1), opacity: appear(f, PT.line1, 9) * (f >= PT.line2 ? 0.6 : 1) }}>
                {COPY.acceptedDate}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 18, fontSize: TYPE.ui, color: C.text2, opacity: f >= PT.line2 ? 0.6 : 1 }}>
              <BookOpen size={14} strokeWidth={2} color={C.text2} />
              <GreekText text={COPY.libraryLabel} sharpFrom={PT.line2} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 24 }}>
              <span style={LINE}>
                <GreekText text={COPY.citeLine} sharpFrom={PT.line2} colour={C.text} />
              </span>
              <SourceChip docRef={DOC_REF} at={PT.chip} activeAt={PT.chipActive} size={TYPE.ui} />
            </div>
          </div>
        </div>
      </Float>
    </Camera>
  );
};
