/**
 * S13 — the wall, side by side (`18` ‖ `19` content, DEV narrow reflow): the
 * same round 1, 10:31 AM, in two seats. Each a Shell 752 × 832 with the
 * collapsed rail, both scrolled 280, column padding 16 (text x 80–724).
 * Left: Rachel's three comments. Right: Eleanor's clean PDF and the amber
 * notice only.
 */
import React from 'react';
import { C, RADIUS, SHADOW } from '../../shared';
import { WT_DATES, WT_REVIEW } from '../../data/wrenfield';
import { Shell, StatusPill } from '../shared';
import { CommentCard, Composer } from './cycle';
import { Micro } from './parts';
import { PdfDoc, type Anchor } from './pdf';

const SAVED3: Anchor[] = WT_REVIEW.comments.map((c) => ({ span: c.anchor, states: [[0, 'saved']] }));

export const WithheldNotice: React.FC<{ size?: number }> = ({ size = 13.5 }) => (
  <div style={{ background: '#f6ecd6', color: C.warning.text, borderRadius: RADIUS.control, padding: '10px 14px', fontSize: size, lineHeight: `${Math.round(size * 1.12)}px` }}>{WT_REVIEW.wallNotice}</div>
);

const SplitRound: React.FC<{ seat: 'RACHEL' | 'ELEANOR' }> = ({ seat }) => {
  const rachel = seat === 'RACHEL';
  // Pane x 64–740 (676); column padding 16 → text x 80–724. Positions are pane-relative (pane x 64, y 12; content below the 56 topbar).
  const top = (y: number) => y - 68;
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div style={{ position: 'absolute', left: 16, top: top(84) - 6 }}>
        <Micro>Round 1 · P01</Micro>
      </div>
      <div style={{ position: 'absolute', left: 16, top: top(108) - 11, height: 22, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.text2, whiteSpace: 'nowrap' }}>
        <StatusPill tone="neutral" label="Open" size={12.5} />
        {rachel ? WT_REVIEW.answeredLine(0) : null}
      </div>
      {/* Work area x 80–724, y 128–812 */}
      <div
        style={{
          position: 'absolute',
          left: 16,
          top: top(128),
          width: 644,
          height: 684,
          boxSizing: 'border-box',
          background: C.sunken,
          borderRadius: RADIUS.pane,
          padding: 8,
          display: 'flex',
          gap: 8,
        }}
      >
        <div style={{ width: 308, flex: 'none', background: C.pane, borderRadius: RADIUS.pane, overflow: 'hidden', padding: '8px 0 0 4px', boxSizing: 'border-box' }}>
          <div style={{ width: 660 * 0.46, height: 940 * 0.46, overflow: 'hidden' }}>
            <div style={{ transform: 'scale(0.46)', transformOrigin: '0 0' }}>
              <PdfDoc version="p01" anchors={rachel ? SAVED3 : []} />
            </div>
          </div>
        </div>
        <div
          style={{
            width: 312,
            flex: 'none',
            alignSelf: 'flex-start',
            boxSizing: 'border-box',
            background: C.pane,
            borderRadius: RADIUS.pane,
            boxShadow: SHADOW.soft,
            padding: rachel ? '12px 12px 0' : 12,
            maxHeight: 668,
            overflow: 'hidden',
          }}
        >
          {rachel ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {WT_REVIEW.comments.map((c, i) => (
                  <CommentCard key={i} compact author={c.author} code={c.code} when={[WT_DATES.comment1, WT_DATES.comment2, WT_DATES.comment3][i]} quote={c.quote} body={c.body} />
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10 }}>
                <Composer />
              </div>
            </>
          ) : (
            <WithheldNotice size={12.5} />
          )}
        </div>
      </div>
    </div>
  );
};

export const SplitSeat: React.FC<{ seat: 'RACHEL' | 'ELEANOR' }> = ({ seat }) => (
  <Shell seat={seat} nav={null} width={752} height={832}>
    <SplitRound seat={seat} />
  </Shell>
);
