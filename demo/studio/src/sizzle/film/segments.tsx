/**
 * The film's own segments (master-plan §3): FilmOpen (wordmark 24 f + hook
 * card 45 f), Montage (75 f) and FilmClose (180 f).
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import {
  appear,
  between,
  C,
  CardText,
  CentredWordmark,
  ease,
  Field,
  FONT,
  Greek,
  PromptHero,
  SHADOW,
  TitleCard,
  vanish,
  Wordmark,
} from '../../shared';
import { CARDS, MONTAGE_APPS } from '../../data/wrenfield';

export const FILM_WORDMARK_FRAMES = 24;
export const FILM_HOOK_FRAMES = 45;
export const MONTAGE_FRAMES = 75;
export const FILM_CLOSE_FRAMES = 180;

/** 0–23: ink field, Wordmark 96 fades in over 0–7. */
export const FilmOpenWordmark: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Field tone="ink">
      <CentredWordmark size={96} tone="onInk" opacity={appear(f, 0, 7, ease.out)} />
    </Field>
  );
};

/** 24–68: the hook card on the field. */
export const FilmOpenHook: React.FC = () => <TitleCard text={CARDS.hook} />;

// ------------------------------------------------------------------ Montage

const SWAP = 25;

/** A Greek'd dashboard silhouette: neutral shapes only, three layouts. */
const Silhouette: React.FC<{ layout: 0 | 1 | 2 }> = ({ layout }) => {
  const bar = (h: number, i: number) => <div key={i} style={{ flex: 1, height: `${h}%`, background: i % 3 === 1 ? C.faint : C.text2, borderRadius: '4px 4px 0 0' }} />;
  const tile = (i: number) => (
    <div key={i} style={{ flex: 1, background: C.pane, borderRadius: 8, boxShadow: SHADOW.soft, padding: 16 }}>
      <Greek lines={1} lineHeight={14} widths={[0.5]} />
      <div style={{ width: '60%', height: 26, background: C.text2, borderRadius: 4, marginTop: 10, opacity: 0.7 }} />
    </div>
  );
  const card: React.CSSProperties = { background: C.pane, borderRadius: 8, boxShadow: SHADOW.soft, padding: 18, boxSizing: 'border-box' };
  return (
    <div style={{ width: 1100, height: 640, background: C.sunken, borderRadius: 10, padding: 24, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 220, height: 22, background: C.text, opacity: 0.75, borderRadius: 4 }} />
        <Greek lines={1} lineHeight={16} widths={[1]} style={{ width: 160 }} />
      </div>
      {layout === 0 ? (
        <div style={{ flex: 1, display: 'flex', gap: 16 }}>
          <div style={{ ...card, flex: 2.2, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Greek lines={1} lineHeight={18} seed={i + 3} style={{ flex: 1 }} />
                <div style={{ width: 70, height: 16, borderRadius: 999, background: i % 3 === 0 ? C.faint : C.borderStrong }} />
              </div>
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[0, 1, 2].map(tile)}
          </div>
        </div>
      ) : layout === 1 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, height: 96 }}>{[0, 1, 2, 3].map(tile)}</div>
          <div style={{ flex: 1, display: 'flex', gap: 16 }}>
            <div style={{ ...card, flex: 1.6, display: 'flex', alignItems: 'flex-end', gap: 14, paddingTop: 40 }}>
              {[62, 80, 45, 90, 70, 55, 84, 38].map(bar)}
            </div>
            <div style={{ ...card, flex: 1 }}>
              <Greek lines={9} lineHeight={30} seed={11} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', gap: 16 }}>
          <div style={{ ...card, flex: 2, display: 'flex', flexDirection: 'column' }}>
            <Greek lines={1} lineHeight={16} widths={[0.3]} />
            <svg viewBox="0 0 600 300" style={{ flex: 1, width: '100%' }} preserveAspectRatio="none">
              <path d="M0,80 L100,95 L200,130 L300,150 L400,190 L500,205 L600,240" fill="none" stroke={C.text2} strokeWidth={5} />
              <path d="M0,90 L600,230" fill="none" stroke={C.faint} strokeWidth={3} strokeDasharray="10 10" />
            </svg>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ ...card, flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 170, height: 170, borderRadius: 999, background: `conic-gradient(${C.text2} 0 42%, ${C.faint} 42% 70%, ${C.borderStrong} 70% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 100, height: 100, borderRadius: 999, background: C.pane }} />
              </div>
            </div>
            {tile(9)}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * The chip sequence. PromptHero crossfades consecutive chips in the same cell,
 * which drew "RFI log" over the fading "…t tracker". An empty (zero-width
 * space) chip sits between each pair, so the old text is gone (4 f) before the
 * new text starts (4 f), centred on the silhouette swap.
 */
const SWAP_CHIPS = MONTAGE_APPS.flatMap((t, i) =>
  i === 0
    ? [{ text: t, from: 0 }]
    : [
        { text: '\u200b'.repeat(i), from: i * SWAP - 2 },
        { text: t, from: i * SWAP + 2 },
      ],
);

/** 75 f on the field: "Build a [chip]." cycling three apps; silhouettes swap behind. */
export const Montage: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Field>
      {([0, 1, 2] as const).map((i) => {
        const from = i * SWAP;
        const o = (i === 0 ? 1 : appear(f, from, 4, ease.linear)) * (i < 2 ? vanish(f, from + SWAP, 4, ease.linear) : 1);
        if (o <= 0) return null;
        return (
          <AbsoluteFill key={i} style={{ alignItems: 'center', justifyContent: 'center', opacity: 0.35 * o, filter: 'blur(6px)' }}>
            <div style={{ transform: 'scale(1.2)' }}>
              <Silhouette layout={i} />
            </div>
          </AbsoluteFill>
        );
      })}
      <PromptHero
        text="Build a"
        typeFrom={-2}
        typeTo={-1}
        hideSend
        caret={false}
        swapChip={SWAP_CHIPS}
        y={540}
        width={1100}
      />
    </Field>
  );
};

// ------------------------------------------------------------------ FilmClose

/** 180 f on ink: two lines, then the wordmark and tagline (master-plan §3, exact). */
export const FilmClose: React.FC = () => {
  const f = useCurrentFrame();
  const move = between(f, [50, 65], [0, 1], ease.out);
  const out = vanish(f, 100, 12, ease.out);
  return (
    <Field tone="ink">
      <div style={{ position: 'absolute', left: 960, top: 540 - 90 * move, transform: 'translate(-50%, -50%)', opacity: (1 - 0.45 * move) * out }}>
        <CardText text={CARDS.close[0]} colour={C.field} from={0} />
      </div>
      {/* Always mounted (words start at opacity 0) so it is measured before 52. */}
      <div style={{ position: 'absolute', left: 960, top: 560, transform: 'translate(-50%, -50%)', opacity: out }}>
        <CardText text={CARDS.close[1]} colour={C.field} from={52} />
      </div>
      <div style={{ position: 'absolute', left: 960, top: 520, transform: 'translate(-50%, -50%)' }}>
        <Wordmark size={96} tone="onInk" opacity={appear(f, 100, 20, ease.out)} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 960,
          top: 620,
          transform: `translate(-50%, -50%) translateY(${(1 - appear(f, 120, 15)) * 8}px)`,
          opacity: appear(f, 120, 15, ease.out),
          fontFamily: FONT.sans,
          fontSize: 28,
          lineHeight: 1.3,
          color: C.faint,
          whiteSpace: 'nowrap',
        }}
      >
        {CARDS.tagline}
      </div>
    </Field>
  );
};
