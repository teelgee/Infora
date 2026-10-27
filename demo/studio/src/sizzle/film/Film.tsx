/**
 * The joined film (master-plan §3): nine segments, hard cuts, 3585 f.
 * Bodies are rendered with cut="film"; their lengths come from each clip's meta.
 */
import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { C } from '../../shared';
import { Body as Body1 } from '../v01/Body';
import { Body as Body2 } from '../v02/Body';
import { Body as Body3 } from '../v03/Body';
import { Body as Body4 } from '../v04/Body';
import { Body as Body5 } from '../v05/Body';
import { META as M1 } from '../v01/meta';
import { META as M2 } from '../v02/meta';
import { META as M3 } from '../v03/meta';
import { META as M4 } from '../v04/meta';
import { META as M5 } from '../v05/meta';
import {
  FILM_CLOSE_FRAMES,
  FILM_HOOK_FRAMES,
  FILM_WORDMARK_FRAMES,
  FilmClose,
  FilmOpenHook,
  FilmOpenWordmark,
  Montage,
  MONTAGE_FRAMES,
} from './segments';

export const FILM_SEGMENTS = [
  { name: 'FilmOpen: wordmark', frames: FILM_WORDMARK_FRAMES },
  { name: 'FilmOpen: hook card', frames: FILM_HOOK_FRAMES },
  { name: 'Body 1', frames: M1.body.film },
  { name: 'Body 2', frames: M2.body.film },
  { name: 'Body 3', frames: M3.body.film },
  { name: 'Body 4', frames: M4.body.film },
  { name: 'Body 5', frames: M5.body.film },
  { name: 'Montage', frames: MONTAGE_FRAMES },
  { name: 'FilmClose', frames: FILM_CLOSE_FRAMES },
] as const;

/** 3585 f = 119.5 s (≤ 3600). */
export const FILM_FRAMES = FILM_SEGMENTS.reduce((a, s) => a + s.frames, 0);

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.field }}>
    <Series>
      <Series.Sequence durationInFrames={FILM_WORDMARK_FRAMES} name="FilmOpen: wordmark">
        <FilmOpenWordmark />
      </Series.Sequence>
      <Series.Sequence durationInFrames={FILM_HOOK_FRAMES} name="FilmOpen: hook card">
        <FilmOpenHook />
      </Series.Sequence>
      <Series.Sequence durationInFrames={M1.body.film} name="Body 1: cited drafting">
        <Body1 cut="film" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={M2.body.film} name="Body 2: QA checker">
        <Body2 cut="film" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={M3.body.film} name="Body 3: review wall">
        <Body3 cut="film" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={M4.body.film} name="Body 4: KPI app">
        <Body4 cut="film" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={M5.body.film} name="Body 5: deck app">
        <Body5 cut="film" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={MONTAGE_FRAMES} name="Montage">
        <Montage />
      </Series.Sequence>
      <Series.Sequence durationInFrames={FILM_CLOSE_FRAMES} name="FilmClose">
        <FilmClose />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
