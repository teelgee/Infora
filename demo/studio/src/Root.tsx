import React from 'react';
import { Composition, Folder } from 'remotion';
import { STAGE } from './shared';
import { Film, FILM_FRAMES } from './sizzle/film/Film';
import { ComponentSheet, SHEET_PAGES } from './dev/ComponentSheet';
import { Standalone as S1 } from './sizzle/v01/Standalone';
import { Standalone as S2 } from './sizzle/v02/Standalone';
import { Standalone as S3 } from './sizzle/v03/Standalone';
import { Standalone as S4 } from './sizzle/v04/Standalone';
import { Standalone as S5 } from './sizzle/v05/Standalone';
import { META as M1 } from './sizzle/v01/meta';
import { META as M2 } from './sizzle/v02/meta';
import { META as M3 } from './sizzle/v03/meta';
import { META as M4 } from './sizzle/v04/meta';
import { META as M5 } from './sizzle/v05/meta';
import { Body as B1 } from './sizzle/v01/Body';
import { Body as B2 } from './sizzle/v02/Body';
import { Body as B3 } from './sizzle/v03/Body';
import { Body as B4 } from './sizzle/v04/Body';
import { Body as B5 } from './sizzle/v05/Body';
import { Video as WV1 } from './walkthroughs/w1/Video';
import { Video as WV2 } from './walkthroughs/w2/Video';
import { Video as WV3 } from './walkthroughs/w3/Video';
import { Video as WV4 } from './walkthroughs/w4/Video';
import { Video as WV5 } from './walkthroughs/w5/Video';
import { META as WM1 } from './walkthroughs/w1/meta';
import { META as WM2 } from './walkthroughs/w2/meta';
import { META as WM3 } from './walkthroughs/w3/meta';
import { META as WM4 } from './walkthroughs/w4/meta';
import { META as WM5 } from './walkthroughs/w5/meta';
import { WalkthroughSheet, WT_SHEET_PAGES } from './walkthroughs/WalkthroughSheet';

const size = { fps: STAGE.fps, width: STAGE.w, height: STAGE.h };

const CLIPS = [
  { meta: M1, Standalone: S1, Body: B1 },
  { meta: M2, Standalone: S2, Body: B2 },
  { meta: M3, Standalone: S3, Body: B3 },
  { meta: M4, Standalone: S4, Body: B4 },
  { meta: M5, Standalone: S5, Body: B5 },
];

/** The pillar walkthroughs (demo/plans/master-plan.md). */
const WALKTHROUGHS = [
  { meta: WM1, Video: WV1 },
  { meta: WM2, Video: WV2 },
  { meta: WM3, Video: WV3 },
  { meta: WM4, Video: WV4 },
  { meta: WM5, Video: WV5 },
];

export const RemotionRoot: React.FC = () => (
  <>
    {CLIPS.map(({ meta, Standalone }) => (
      <Composition key={meta.id} id={meta.id} component={Standalone} durationInFrames={meta.standalone} {...size} />
    ))}
    <Composition id="Film" component={Film} durationInFrames={FILM_FRAMES} {...size} />
    <Folder name="Walkthroughs">
      {WALKTHROUGHS.map(({ meta, Video }) => (
        <Composition key={meta.id} id={meta.id} component={Video} durationInFrames={meta.total} {...size} />
      ))}
      <Composition id="WalkthroughSheet" component={WalkthroughSheet} durationInFrames={WT_SHEET_PAGES * 100} {...size} />
    </Folder>
    <Folder name="Dev">
      {CLIPS.map(({ meta, Body }) => (
        <React.Fragment key={meta.id}>
          <Composition id={`${meta.id}-body-film`} component={Body} defaultProps={{ cut: 'film' as const }} durationInFrames={meta.body.film} {...size} />
          <Composition id={`${meta.id}-body-standalone`} component={Body} defaultProps={{ cut: 'standalone' as const }} durationInFrames={meta.body.standalone} {...size} />
        </React.Fragment>
      ))}
      <Composition id="ComponentSheet" component={ComponentSheet} durationInFrames={SHEET_PAGES * 100} {...size} />
    </Folder>
  </>
);
