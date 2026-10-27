/**
 * Clip scaffolding shared by every vNN folder: the standalone wrapper
 * (ClipOpen + Body + EndCard), the clip meta shape, and a placeholder body.
 */
import React from 'react';
import { AbsoluteFill, Sequence, Series, useCurrentFrame } from 'remotion';
import { C, FONT } from './theme';
import { CLIP_OPEN_FRAMES, ClipOpen, END_CARD_FRAMES, EndCard, FadeOutToField, Field, TitleCard } from './film';

export type Cut = 'standalone' | 'film';

// A type alias (not an interface) so Remotion's Composition accepts it as props.
export type BodyProps = {
  cut: Cut;
};

export interface ClipMeta {
  /** Composition id, e.g. "V01-cited-drafting". */
  id: string;
  /** Body length in frames per cut. */
  body: { standalone: number; film: number };
  /** Standalone = 30 + body.standalone + 90. */
  standalone: number;
  /** Film start frame of this body (master-plan §3), for reference. */
  filmStart: number;
  /** Title card and end card lines (`*word*` = italic). */
  title: string;
  endCard: string;
}

export const standaloneFrames = (bodyFrames: number) => CLIP_OPEN_FRAMES + bodyFrames + END_CARD_FRAMES;

/** ClipOpen (30) + Body (standalone cut) + EndCard (90), hard cuts. */
export const StandaloneClip: React.FC<{ meta: ClipMeta; Body: React.FC<BodyProps> }> = ({ meta, Body }) => (
  <AbsoluteFill style={{ background: C.field }}>
    <Series>
      <Series.Sequence durationInFrames={CLIP_OPEN_FRAMES}>
        <ClipOpen />
      </Series.Sequence>
      <Series.Sequence durationInFrames={meta.body.standalone}>
        <Body cut="standalone" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={END_CARD_FRAMES}>
        <EndCard line={meta.endCard} />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

/**
 * Placeholder body: the clip's TitleCard (0–59), a grey "TODO body" frame,
 * and the 12-frame fade to the field. Replace in src/sizzle/vNN/Body.tsx.
 */
export const PlaceholderBody: React.FC<{ meta: ClipMeta; cut: Cut }> = ({ meta, cut }) => {
  const len = meta.body[cut];
  return (
    <Field>
      <Sequence durationInFrames={60}>
        <TitleCard text={meta.title} />
      </Sequence>
      <Sequence from={60} durationInFrames={len - 60}>
        <TodoFrame label={`${meta.id} · ${cut} body · ${len} f`} />
      </Sequence>
      <FadeOutToField from={len - 12} />
    </Field>
  );
};

const TodoFrame: React.FC<{ label: string }> = ({ label }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 1440,
          height: 760,
          borderRadius: 16,
          background: C.borderStrong,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          fontFamily: FONT.sans,
          color: C.muted,
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 600, color: C.text2 }}>TODO body</div>
        <div style={{ fontSize: 26 }}>{label}</div>
        <div style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>body frame {f + 60}</div>
      </div>
    </AbsoluteFill>
  );
};
