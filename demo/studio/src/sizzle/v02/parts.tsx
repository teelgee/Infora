/**
 * Clip 02 local pieces: the checker plan card, the checked canvas, the
 * one-line strip, a top-left pin, and the measured connector line.
 * Native sizes; positioned and scaled by Body.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import { Check } from 'lucide-react';
import {
  AgentGlyph,
  appear,
  Button,
  C,
  DocCanvas,
  ease,
  FONT,
  GreekBar,
  GreekStrip,
  GreekText,
  Mark,
  RADIUS,
  SHADOW,
  Shimmer,
  Tick,
  TrackedChange,
  TYPE,
  ui,
  type F,
} from '../../shared';
import { LIB, QA } from '../../data/wrenfield';
import { CANVAS, PLAN, STRIP } from './copy';

// ------------------------------------------------------------------ Fonts

/**
 * True once the web fonts have loaded. Components that measure the DOM
 * re-measure then: a measurement taken against the fallback font wraps lines
 * differently and would otherwise go stale (nothing else re-renders them).
 * Holds the frame (delayRender) until the post-font render has committed.
 */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('v02: fonts for measuring'));
  useEffect(() => {
    // @remotion/google-fonts adds each FontFace to document.fonts only once it
    // has downloaded, so `document.fonts.load()` / `.ready` can resolve while
    // the face is not even registered yet (and `check()` then says true). Poll
    // for the registered, loaded faces instead; time-bounded so a missing font
    // can never hang the render.
    const want = [FONT.family.serif, FONT.family.sans];
    const loaded = () =>
      want.every((fam) => Array.from(document.fonts).some((ff) => ff.family.replace(/["']/g, '') === fam && ff.status === 'loaded'));
    let live = true;
    let tries = 0;
    const poll = () => {
      if (!live) return;
      if (loaded() || tries++ > 200) {
        document.fonts.ready.then(() => live && setReady(true));
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
    return () => {
      live = false;
    };
  }, []);
  useLayoutEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle]);
  return ready;
}

// ------------------------------------------------------------------ Pin

/** Native-size content with its top-left at a screen point, scaled about that corner. */
export const Pin: React.FC<{
  x: number;
  y: number;
  scale: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ x, y, scale, style, children }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `scale(${scale})`,
      transformOrigin: '0 0',
      ...style,
    }}
  >
    {children}
  </div>
);

// ------------------------------------------------------------------ Plan card (shot 2)

/**
 * The shared Shimmer sweeps sunken → neutral50, which vanishes on the sunken
 * plan block; this one sweeps the Greek-bar grey → pane on the same 42 f clock.
 */
const PlanShimmer: React.FC<{ offset?: number }> = ({ offset = 0 }) => {
  const f = useCurrentFrame();
  const t = ((((f + offset) % 42) + 42) % 42) / 42;
  return (
    <div
      style={{
        width: '86%',
        height: 6,
        borderRadius: 4,
        background: `linear-gradient(90deg, ${C.borderStrong} 25%, ${C.pane} 37%, ${C.borderStrong} 63%)`,
        backgroundSize: '300% 100%',
        backgroundPosition: `${100 - t * 100}% 0`,
      }}
    />
  );
};

const CheckBox: React.FC = () => (
  <span
    style={{
      width: 13,
      height: 13,
      borderRadius: 3,
      background: C.ink,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
    }}
  >
    <Check size={9} color="#fff" strokeWidth={3.5} />
  </span>
);

const FieldLabel: React.FC<{ w: number }> = ({ w }) => <GreekBar width={w} lineHeight={14} style={{ marginBottom: 5 }} />;

/** One plan row: numbered circle → shimmer while running → tick. */
const PlanRow: React.FC<{
  n: number;
  text: string;
  greek?: boolean;
  startAt: F;
  doneAt: F;
}> = ({ n, text, greek, startAt, doneAt }) => {
  const f = useCurrentFrame();
  const done = f >= doneAt;
  const running = f >= startAt && !done;
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 20,
          height: 20,
          flex: 'none',
          marginTop: 1,
          position: 'relative',
        }}
      >
        {done ? (
          <Tick size={20} style={{ transform: `scale(${0.8 + 0.2 * ui(f, doneAt)})` }} />
        ) : (
          <span
            style={{
              width: 20,
              height: 20,
              boxSizing: 'border-box',
              borderRadius: 999,
              border: `1.5px solid ${running ? C.ink : C.faint}`,
              color: running ? C.text : C.muted,
              fontSize: TYPE.micro,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: C.pane,
            }}
          >
            {n}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: TYPE.ui,
            lineHeight: 1.5,
            color: C.text,
            fontWeight: 500,
          }}
        >
          <GreekText text={text} greek={greek} />
        </div>
        <div style={{ height: 6, marginTop: 3 }}>{running ? <PlanShimmer offset={n * 9} /> : null}</div>
      </div>
    </div>
  );
};

export interface PlanCardProps {
  pressAt: F;
  runAt: F;
  ticks: [F, F];
}

/** The checker's setup card: Greek'd form, "The plan" with two rows, "Run the check". */
export const PlanCard: React.FC<PlanCardProps> = ({ pressAt, runAt, ticks }) => (
  <div
    style={{
      width: 360,
      background: C.pane,
      borderRadius: RADIUS.pane,
      padding: 18,
      boxSizing: 'border-box',
      fontFamily: FONT.sans,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: TYPE.label,
        fontWeight: 600,
        color: C.muted,
        marginBottom: 14,
      }}
    >
      <AgentGlyph size={11} colour={C.muted} />
      {PLAN.header}
    </div>

    {/* The form: Draft and Depth, then Checks — entirely Greek'd. */}
    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
      <div style={{ flex: 1.4 }}>
        <FieldLabel w={34} />
        <div
          style={{
            height: 28,
            borderRadius: RADIUS.control,
            border: `1px solid ${C.borderStrong}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            gap: 8,
          }}
        >
          <GreekBar width="78%" lineHeight={14} />
          <span style={{ marginLeft: 'auto', color: C.faint, fontSize: 10 }}>▾</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <FieldLabel w={40} />
        <div
          style={{
            height: 28,
            borderRadius: RADIUS.control,
            background: C.sunken,
            display: 'flex',
            padding: 3,
            gap: 3,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              flex: 1,
              borderRadius: 6,
              background: C.pane,
              boxShadow: '0 1px 2px rgba(0,0,0,.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GreekBar width={30} lineHeight={12} />
          </div>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GreekBar width={24} lineHeight={12} />
          </div>
        </div>
      </div>
    </div>
    <FieldLabel w={44} />
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        rowGap: 6,
        columnGap: 14,
        marginBottom: 16,
      }}
    >
      {[52, 64, 86, 58, 74].map((w, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CheckBox />
          <GreekBar width={w} lineHeight={14} />
        </span>
      ))}
    </div>

    {/* The plan */}
    <div
      style={{
        background: C.sunken,
        borderRadius: RADIUS.card,
        padding: '12px 14px 8px',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: TYPE.dense,
          fontWeight: 600,
          color: C.text,
          marginBottom: 10,
        }}
      >
        {PLAN.heading}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <PlanRow n={1} text={QA.planRows[0]} startAt={runAt} doneAt={ticks[0]} />
        <PlanRow n={2} text={QA.planRows[1]} greek startAt={ticks[0]} doneAt={ticks[1]} />
      </div>
    </div>
    <Button variant="primary" label={PLAN.button} pressAt={pressAt} anchor="v02-run" />
  </div>
);

// ------------------------------------------------------------------ The checked canvas (shots 3, 5)

export interface CheckCanvasProps {
  /** Marks draw at these frames. */
  marks: { routewide: F; required: F; csm: F };
  /** The Required span turns sharp from here (6 f crossfade); omit to keep it Greek. */
  requiredSharpFrom?: F;
  /** Keep the Required span sharp (the blurred context in shot 5). */
  requiredSharp?: boolean;
  anchor?: string;
}

/** WA-EIA-MST-001 as checked: everything Greek-in-place except the Required span. */
export const CheckCanvas: React.FC<CheckCanvasProps> = ({ marks, requiredSharpFrom, requiredSharp, anchor }) => (
  <DocCanvas
    width={600}
    pad={28}
    blocks={[
      { kind: 'h', text: <GreekText text={CANVAS.h1} greek /> },
      {
        kind: 'p',
        text: (
          <span>
            <GreekText text={CANVAS.p1Before} greek />{' '}
            <Mark kind="advisory" at={marks.routewide}>
              <GreekText text={CANVAS.routewide} greek />
            </Mark>
          </span>
        ),
      },
      { kind: 'h', text: <GreekText text={CANVAS.h2} greek /> },
      { kind: 'strip', text: <GreekStrip docRef={LIB.GIR.ref} width="64%" /> },
      { kind: 'h', text: <GreekText text={CANVAS.h3} greek /> },
      {
        kind: 'p',
        text: (
          <span>
            <Mark kind="advisory" at={marks.csm}>
              <GreekText text={CANVAS.csm} greek />
            </Mark>{' '}
            <GreekText text={CANVAS.p3Middle} greek />{' '}
            <Mark kind="required" at={marks.required} anchor={anchor}>
              {requiredSharp ? (
                QA.requiredSpan
              ) : (
                <GreekText text={QA.requiredSpan} sharpFrom={requiredSharpFrom} greek={requiredSharpFrom === undefined} />
              )}
            </Mark>
            <SharpPeriod sharp={requiredSharp} sharpFrom={requiredSharpFrom} />
          </span>
        ),
      },
    ]}
  />
);

/** The full stop after the Required span: hidden while the span is Greek, so no lone sharp dot. */
const SharpPeriod: React.FC<{ sharp?: boolean; sharpFrom?: F }> = ({ sharp, sharpFrom }) => {
  const f = useCurrentFrame();
  const o = sharp ? 1 : sharpFrom === undefined ? 0 : appear(f, sharpFrom, 6, ease.linear);
  return <span style={{ opacity: o }}>.</span>;
};

/**
 * The checks chip at the canvas's top-right corner. From `runFrom` it is the
 * checker running (a light "Checking" chip with a shimmer bar, while the marks
 * draw); at `at`, as the last mark lands, it flips over 6 f to the dark
 * "✓ Checks (5)" result, so the count has a visible cause.
 */
export const ChecksChip: React.FC<{ runFrom: F; at: F }> = ({ runFrom, at }) => {
  const f = useCurrentFrame();
  const enter = appear(f, runFrom, 9);
  if (enter <= 0) return null;
  // Out, then in (no overlap of the two labels): 3 f + 4 f.
  const out = appear(f, at, 3, ease.linear);
  const done = appear(f, at + 2, 4, ease.linear);
  const face: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    padding: '5px 12px 5px 9px',
    fontFamily: FONT.sans,
    fontSize: TYPE.label,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 6}px) scale(${0.96 + 0.04 * done})`,
        transformOrigin: 'right center',
      }}
    >
      {/* Running: light chip, glyph, "Checking", shimmer. */}
      <span style={{ ...face, background: C.pane, color: C.text2, border: `1px solid ${C.border}`, boxShadow: SHADOW.soft, opacity: 1 - out }}>
        <AgentGlyph size={11} colour={C.muted} />
        Checking
        <Shimmer w={34} h={8} />
      </span>
      {/* Result: the dark chip, laid over the running one. */}
      {done > 0 ? (
        <span style={{ ...face, position: 'absolute', right: 0, top: 0, bottom: 0, background: C.ink, color: '#fff', boxShadow: SHADOW.popout, opacity: done }}>
          <Check size={12} color="#fff" strokeWidth={3} />
          {PLAN.checksChip}
        </span>
      ) : null}
    </span>
  );
};

// ------------------------------------------------------------------ The strip (shot 6)

/** Inline content whose width eases open over 6 f from `at` (the tracked insert arriving). */
const GrowIn: React.FC<{ at: F; maxW?: number; children: React.ReactNode }> = ({ at, maxW = 110, children }) => {
  const f = useCurrentFrame();
  const p = appear(f, at, 6, ease.out);
  return (
    <span
      style={{
        display: 'inline-block',
        maxWidth: p * maxW,
        overflow: 'hidden',
        verticalAlign: 'bottom',
        whiteSpace: 'nowrap',
        opacity: Math.min(1, p * 1.4),
      }}
    >
      {children}
    </span>
  );
};

/** One canvas line, Greek except the span; the house-style fix lands as a tracked change. */
export const StyleStrip: React.FC<{ markAt: F; fixAt: F }> = ({ markAt, fixAt }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        display: 'inline-block',
        background: C.pane,
        borderRadius: RADIUS.pane,
        boxShadow: SHADOW.pane,
        padding: '10px 18px',
        fontFamily: FONT.serif,
        fontSize: TYPE.prose,
        lineHeight: 1.75,
        color: C.prose,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: C.faint }}>…</span>
      <GreekText text={STRIP.before} greek />{' '}
      {f < fixAt ? (
        <Mark kind="advisory" at={markAt}>
          {STRIP.from}
        </Mark>
      ) : (
        <>
          <TrackedChange del={STRIP.from} at={fixAt} />
          <GrowIn at={fixAt}>
            {'\u00a0'}
            <span
              style={{
                background: C.success.tint,
                color: C.success.text,
                borderBottom: `1.5px solid ${C.success.dot}`,
                padding: '0 1px',
              }}
            >
              {STRIP.to}
            </span>
          </GrowIn>
        </>
      )}
      .
    </div>
  );
};

// ------------------------------------------------------------------ Collapse (smooth height)

/**
 * Wraps a child and eases its height to 0 over `dur` from `at`, so the parent
 * pane shrinks smoothly instead of jumping when the child unmounts. The
 * child's natural height is measured every frame (transforms don't affect it).
 */
export const Collapse: React.FC<{
  at: F;
  dur?: number;
  children: React.ReactNode;
}> = ({ at, dur = 8, children }) => {
  const f = useCurrentFrame();
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  useFontsReady();
  useLayoutEffect(() => {
    if (!inner.current) return;
    const nh = inner.current.offsetHeight;
    if (nh > 0 && nh !== h) setH(nh);
  });
  const p = appear(f, at, dur, ease.out);
  const style: React.CSSProperties = f < at || h === null ? {} : { height: h * (1 - p), overflow: 'hidden' };
  return (
    <div style={style}>
      <div ref={inner}>{children}</div>
    </div>
  );
};

// ------------------------------------------------------------------ Connector (shot 5)

interface Seg {
  x1: number;
  y1: number;
  /** Elbow x (just left of the card). */
  x2: number;
  /** The span's underline y. */
  y2: number;
  /** Where the underline trace ends (the span line's left edge). */
  x3: number;
}

/**
 * A 2 px danger line from the finding card's left edge to the Required span,
 * measured live from `data-anchor`s (so it follows the camera and focal zoom).
 * Draws from the card toward the span over [from, to].
 */
export const Connector: React.FC<{
  fromAnchor: string;
  toAnchor: string;
  yText: string;
  from: F;
  to: F;
}> = ({ fromAnchor, toAnchor, yText, from, to }) => {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const root = useRef<HTMLDivElement>(null);
  const [seg, setSeg] = useState<Seg | null>(null);
  useFontsReady();
  useLayoutEffect(() => {
    if (!root.current || f < from) return;
    const r = root.current.getBoundingClientRect();
    const k = r.width / width;
    // Scope the lookup to this shot's stage: the renderer can hold other mounted
    // copies of the composition, and a document-wide query may find theirs.
    const scope = root.current.parentElement ?? root.current.ownerDocument;
    const card = scope.querySelector(`[data-anchor="${fromAnchor}"]`);
    const span = scope.querySelector(`[data-anchor="${toAnchor}"]`);
    if (!card || !span) return;
    // The defect line: the span inside the card whose text is exactly `yText`.
    const line = Array.from(card.querySelectorAll('span')).find((el) => el.textContent === yText);
    if (!line) return;
    const cb = card.getBoundingClientRect();
    const lb = line.getClientRects()[0] ?? line.getBoundingClientRect();
    const rects = Array.from(span.getClientRects());
    if (!rects.length) return;
    // The span's line closest to the defect line, ending at its right edge (clipped to the card).
    const yMid = (lb.top + lb.bottom) / 2;
    let best = rects[0];
    for (const rc of rects) if (Math.abs((rc.top + rc.bottom) / 2 - yMid) < Math.abs((best.top + best.bottom) / 2 - yMid)) best = rc;
    const x1 = (cb.left - r.left) / k;
    const y1 = (yMid - r.top) / k;
    const x2 = (Math.min(best.right, cb.left - 44 * k) - r.left) / k;
    const y2 = (best.bottom - r.top) / k - 1;
    const x3 = (best.left - r.left) / k;
    const next = { x1, y1, x2, y2, x3 };
    if (!seg || JSON.stringify(seg) !== JSON.stringify(next)) setSeg(next);
  });
  const p = appear(f, from, to - from, ease.out);
  return (
    <AbsoluteFill ref={root} style={{ pointerEvents: 'none' }}>
      {seg && p > 0 ? (
        <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          {(() => {
            // Out from the card, down to the span's line, then along its underline.
            const mx = seg.x2;
            const d = `M${seg.x1},${seg.y1} L${mx},${seg.y1} L${mx},${seg.y2} L${seg.x3},${seg.y2}`;
            const total = Math.abs(seg.x1 - mx) + Math.abs(seg.y2 - seg.y1) + Math.abs(mx - seg.x3);
            return (
              <>
                <path
                  d={d}
                  fill="none"
                  stroke={C.danger.text}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeDasharray={total}
                  strokeDashoffset={total * (1 - p)}
                />
                <circle cx={seg.x1} cy={seg.y1} r={4} fill={C.danger.text} opacity={Math.min(1, p * 4)} />
              </>
            );
          })()}
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};
