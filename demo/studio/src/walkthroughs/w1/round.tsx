/**
 * The review-cycle page as one composable screen: header, status card, round
 * bar, the work area (PDF pane + panel) and, for the author, the activity list
 * (`12`, `17`, `18`, `19`, `22`, `23`, `25`). Native px.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, RADIUS, SHADOW, type F } from '../../shared';
import { Page } from '../shared';
import { PageTitleRow, RoundBar, StatusCard, type HeaderAction, type StatusCardProps } from './cycle';
import { fade, Micro } from './parts';
import { PdfDoc, type Anchor } from './pdf';

export const WORK_H = 604;

export interface RoundPageProps {
  title: string;
  sub: React.ReactNode;
  actions: HeaderAction[];
  status: StatusCardProps;
  roundLabel: string;
  roundBar: React.ReactNode;
  pdf: { version: 'v01' | 'p01' | 'p02'; anchors?: Anchor[]; select?: { span: string; from: F; to: F } };
  /** The reviewer's `Select text on the page…` hint above the page. */
  hint?: boolean;
  panel: React.ReactNode;
  /** Panel card height: content (default) or the full work area (author seat). */
  panelFull?: boolean;
  activity?: Array<[string, string]>;
  scrollY?: number;
  /** Overlays in page coordinates (open select menus). */
  children?: React.ReactNode;
}

export const RoundPage: React.FC<RoundPageProps> = ({ title, sub, actions, status, roundLabel, roundBar, pdf, hint, panel, panelFull, activity, scrollY = 0, children }) => (
  <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
    <Page scrollY={scrollY}>
      <PageTitleRow title={title} sub={sub} actions={actions} />
      <div style={{ marginTop: 0 }}>
        <StatusCard {...status} />
      </div>
      <div style={{ marginTop: 34.5 }}>
        <RoundBar label={roundLabel}>{roundBar}</RoundBar>
      </div>
      <div
        style={{
          marginTop: 10.5,
          height: WORK_H,
          boxSizing: 'border-box',
          background: C.sunken,
          borderRadius: RADIUS.pane,
          padding: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ width: 672, height: WORK_H - 24, flex: 'none', background: C.pane, borderRadius: RADIUS.pane, overflow: 'hidden', padding: '12px 0 0 12px', boxSizing: 'border-box' }}>
          {hint ? <div style={{ fontSize: 12.5, lineHeight: '15px', color: C.muted, marginBottom: 8 }}>Select text on the page to quote it, or click to drop a point — then write the comment alongside.</div> : null}
          <PdfDoc version={pdf.version} anchors={pdf.anchors} select={pdf.select} />
        </div>
        <div
          style={{
            width: 352,
            flex: 'none',
            boxSizing: 'border-box',
            background: C.pane,
            borderRadius: RADIUS.pane,
            boxShadow: SHADOW.soft,
            padding: 16,
            height: panelFull ? WORK_H - 24 : undefined,
            maxHeight: WORK_H - 24,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {panel}
        </div>
      </div>
      {activity ? (
        <div style={{ marginTop: 33.5 }}>
          <Micro>Activity</Micro>
          <div style={{ marginTop: 5 }}>
            {activity.map(([t, d]) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', height: 24, fontSize: 13, color: C.text }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: C.faint, marginLeft: 1, marginRight: 10 }} />
                {t}
                <span style={{ marginLeft: 'auto', color: C.text2, fontSize: 12.5 }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Page>
    {children ? <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-scrollY}px)` }}>{children}</div> : null}
  </div>
);

/** A clipped scroll region showing either its start or its end. */
export const ListRegion: React.FC<{ maxH?: number; align?: 'start' | 'end'; children: React.ReactNode; scroll?: number; fill?: boolean }> = ({ maxH, align = 'start', children, scroll = 0, fill }) => (
  <div
    style={{
      maxHeight: maxH,
      flex: fill ? 1 : 'none',
      minHeight: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: align === 'end' ? 'flex-end' : 'flex-start',
      position: 'relative',
    }}
  >
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 10, transform: `translateY(${-scroll}px)` }}>{children}</div>
    {/* A list scrolled to its end: fade the clipped line at the top instead of showing half a glyph. */}
    {align === 'end' ? <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 40, background: `linear-gradient(${C.pane}, ${C.pane} 35%, rgba(255,255,255,0))` }} /> : null}
  </div>
);

/** The reviewer's panel: comment list (clipped) + hairline + composer; or the list alone once issued. */
export const ReviewerPanel: React.FC<{ cards: React.ReactNode[]; listMax?: number; composer?: React.ReactNode; composerExitAt?: F }> = ({ cards, listMax = 197, composer, composerExitAt }) => {
  const f = useCurrentFrame();
  const cO = composer ? fade(f, undefined, composerExitAt) : 0;
  return (
    <>
      {cards.length ? <ListRegion maxH={cO > 0 ? listMax : undefined}>{cards}</ListRegion> : null}
      {composer && cO > 0 ? (
        <div style={{ opacity: cO, ...(cards.length ? { borderTop: `1px solid ${C.border}`, marginTop: 9, paddingTop: 12 } : {}) }}>{composer}</div>
      ) : null}
    </>
  );
};
