/**
 * Clip 02 body: the QA checker (demo/archive/2026-10-sizzle/plan/video-02-qa-checker.md).
 * Frames are body-local (frame 0 = the title card). The film cut drops shot 2
 * (the plan card, 60–119); every later frame is the standalone frame − 60.
 *
 *   shot            standalone   film
 *   1 title          0–59        0–59
 *   2 plan card     60–119       —
 *   3 canvas       120–239      60–179
 *   4 mid-card     240–284     180–224
 *   5 finding      285–380     225–320
 *   6 house style  381–490     321–430
 *   7 fade         491–502     431–442
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import {
  Camera,
  contextStyle,
  Cursor,
  FadeOutToField,
  Field,
  FindingCard,
  FindingGroup,
  Float,
  focalScale,
  SHADOW,
  TitleCard,
  type BodyProps,
  type CameraKey,
} from '../../shared';
import { CARDS, LIB, QA } from '../../data/wrenfield';
import { META } from './meta';
import { STYLE } from './copy';
import { CheckCanvas, ChecksChip, Collapse, Connector, PlanCard, Pin, StyleStrip } from './parts';

type K = (standaloneFrame: number) => number;

/** Camera keys that zoom from ×1 to `scale` about screen point P (P stays put). */
function zoomAbout(from: number, to: number, px: number, py: number, scale: number, easeName: CameraKey['ease'] = 'inOut'): CameraKey[] {
  return [
    { f: from, x: 960, y: 540, scale: 1 },
    {
      f: to,
      x: px - (px - 960) / scale,
      y: py - (py - 540) / scale,
      scale,
      ease: easeName,
    },
  ];
}

// ------------------------------------------------------------------ Shot 2 (standalone only)

/** Measured: "Run the check" sits at x 571–861, y 827–909 with the card at rest. */
const RUN_BUTTON = { x: 790, y: 896 };

const ShotPlan: React.FC = () => (
  <AbsoluteFill>
    <Float x={960} y={540} scale={2.4} at={60}>
      <PlanCard pressAt={82} runAt={84} ticks={[96, 110]} />
    </Float>
    <Cursor
      path={[
        { f: 64, x: 1500, y: 960 },
        { f: 80, x: RUN_BUTTON.x, y: RUN_BUTTON.y },
      ]}
      clicks={[82]}
      showFrom={64}
      hideAfter={90}
    />
  </AbsoluteFill>
);

// ------------------------------------------------------------------ Shot 3

/** Measured: the Required span covers x 290–1579, y 793–914 in shot 3; the push holds its centre still. */
const REQ_SPAN = { x: 935, y: 853 };

const ShotCanvas: React.FC<{ k: K }> = ({ k }) => (
  <Camera keys={zoomAbout(k(170), k(239), REQ_SPAN.x, REQ_SPAN.y, 1.08)}>
    <Float x={960} y={540} scale={2.4}>
      <div style={{ position: 'relative' }}>
        <CheckCanvas marks={{ routewide: k(128), required: k(140), csm: k(152) }} requiredSharpFrom={k(134)} anchor="v02-req" />
        <div style={{ position: 'absolute', top: 16, right: 18 }}>
          <ChecksChip runFrom={k(120)} at={k(154)} />
        </div>
      </div>
    </Float>
  </Camera>
);

// ------------------------------------------------------------------ Shot 5

const ShotFinding: React.FC<{ k: K }> = ({ k }) => {
  const f = useCurrentFrame();
  // Already blurred on the hard cut: the context blur runs its 9 f before the shot.
  const ctx = contextStyle(f, k(276));
  const zoom = focalScale(f, k(287));
  return (
    <Camera keys={zoomAbout(k(316), k(380), 1100, 540, 1.04)}>
      <AbsoluteFill style={ctx}>
        <Float x={700} y={540} scale={1.8}>
          <CheckCanvas marks={{ routewide: -100, required: -100, csm: -100 }} requiredSharp anchor="v02-req-ctx" />
        </Float>
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: '808px 540px' }}>
        <Float x={1240} y={540} scale={2.4} at={k(287)} shadow="overlay">
          <div data-anchor="v02-acc-card">
            <FindingGroup label="Accuracy" count={1}>
              <FindingCard
                severity="required"
                defect={QA.accuracyDefect}
                defectSharpFrom={k(285)}
                source={{ docRef: LIB.GIR.ref, at: k(300) }}
                suggested={{ text: QA.accuracySuggested }}
                width="100%"
              />
            </FindingGroup>
          </div>
        </Float>
      </AbsoluteFill>
      <Connector fromAnchor="v02-acc-card" toAnchor="v02-req-ctx" yText={QA.accuracyDefect} from={k(297)} to={k(307)} />
    </Camera>
  );
};

// ------------------------------------------------------------------ Shot 6

/** Group pinned by its top-left so the collapse shrinks it downward, never re-centring it. */
const GROUP = { x: 838, y: 96, scale: 2.4 };
const STRIP = { x: 150, y: 812, scale: 2.0 };
/** Measured: "Fix 1 house-style wording" spans x 872–1327, y 218–300; the tip sits under the label. */
const FIX_BUTTON = { x: 1180, y: 284 };

const ShotStyle: React.FC<{ k: K }> = ({ k }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Pin x={GROUP.x} y={GROUP.y} scale={GROUP.scale} style={{ borderRadius: 8 }}>
        <div style={{ boxShadow: SHADOW.overlay, borderRadius: 8 }}>
          <FindingGroup
            label="House style"
            // One of the four is fixed; the three rewrites wait to be read.
            count={f >= k(464) ? 3 : 4}
            primary={{
              label: QA.fixButton,
              pressAt: k(452),
              flipTo: { label: QA.fixedButton, at: k(458) },
            }}
            note={STYLE.note}
          >
            <Collapse at={k(464)}>
              <FindingCard
                severity="advisory"
                defect={QA.styleDefect}
                rule={{
                  clause: QA.styleClause,
                  from: STYLE.ruleFrom,
                  quote: STYLE.ruleQuote,
                }}
                fix={{ text: QA.styleFixLine }}
                collapseAt={k(464)}
                width="100%"
              />
            </Collapse>
          </FindingGroup>
        </div>
      </Pin>
      <Pin x={STRIP.x} y={STRIP.y} scale={STRIP.scale}>
        <StyleStrip markAt={k(375)} fixAt={k(458)} />
      </Pin>
      <Cursor
        path={[
          { f: k(434), x: 1500, y: 980 },
          { f: k(450), x: FIX_BUTTON.x, y: FIX_BUTTON.y },
        ]}
        clicks={[k(452)]}
        showFrom={k(434)}
        hideAfter={k(460)}
      />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ Body

export const Body: React.FC<BodyProps> = ({ cut }) => {
  const f = useCurrentFrame();
  const film = cut === 'film';
  const k: K = (s) => (film ? s - 60 : s);
  const len = META.body[cut];
  return (
    <Field>
      {f < 60 ? <TitleCard text={CARDS.v02.title} /> : null}
      {!film && f >= 60 && f < 120 ? <ShotPlan /> : null}
      {f >= k(120) && f < k(240) ? <ShotCanvas k={k} /> : null}
      {f >= k(240) && f < k(285) ? <TitleCard text={CARDS.v02.mid} from={k(240)} /> : null}
      {f >= k(285) && f < k(381) ? <ShotFinding k={k} /> : null}
      {f >= k(381) ? <ShotStyle k={k} /> : null}
      <FadeOutToField from={len - 12} />
    </Field>
  );
};
