/**
 * S18 — the review record, client seat (`24a`, DEV dates and strings): every
 * comment beside its code and its answer; round 2 open with no comments.
 */
import React from 'react';
import { C, FONT } from '../../shared';
import { WT_DATES, WT_DOC, WT_REVIEW } from '../../data/wrenfield';
import { Page, StatusPill } from '../shared';
import { Button, Micro } from './parts';

const COL = { n: 9, where: 61, comment: 251, code: 685, resp: 747 } as const;
const BAND = '#f4f3ef';

const Band: React.FC<{ left: React.ReactNode; right?: React.ReactNode; h?: number; white?: boolean }> = ({ left, right, h = 38, white }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      minHeight: h,
      padding: '0 9px',
      background: white ? C.pane : BAND,
      borderTop: `1px solid ${C.border}`,
      fontSize: 13,
      gap: 8,
      whiteSpace: 'nowrap',
    }}
  >
    {left}
    {right ? <span style={{ marginLeft: 'auto', color: C.text2, fontSize: 12.5 }}>{right}</span> : null}
  </div>
);

const Row: React.FC<{ n: string; quote: string; comment: string; code: 'S0' | null; head: string; text: React.ReactNode; passage?: string }> = ({ n, quote, comment, code, head, text, passage }) => (
  <div style={{ position: 'relative', borderTop: `1px solid ${C.border}`, padding: '15px 0 14px', display: 'flex', fontSize: 13 }}>
    <span style={{ position: 'absolute', left: COL.n, top: 15, color: C.text2, lineHeight: '18px' }}>{n}</span>
    <span style={{ position: 'absolute', left: COL.where, top: 16, width: 180, lineHeight: '15px', fontSize: 12.5, color: C.text2 }}>
      p. 1
      <br />
      <i style={{ color: C.text }}>{quote}</i>
    </span>
    <div style={{ marginLeft: COL.comment, width: 410, lineHeight: '20px' }}>
      <div style={{ fontSize: 14, color: C.text, marginTop: 1 }}>{comment}</div>
      <div style={{ fontSize: 12.5, color: C.muted }}>Rachel Bowen · {WT_DATES.round1IssuedDay}</div>
    </div>
    <span style={{ position: 'absolute', left: COL.code, top: 13 }}>{code ? <StatusPill tone="info" label={code} size={12.5} /> : <span style={{ color: C.muted, marginLeft: 2 }}>—</span>}</span>
    <div style={{ marginLeft: COL.resp - COL.comment - 410, width: 300, lineHeight: '18.5px' }}>
      <div style={{ fontWeight: 600, color: C.text }}>{head}</div>
      <div style={{ color: C.text }}>{text}</div>
      {passage ? <div style={{ fontStyle: 'italic', color: C.muted, fontSize: 12.5, lineHeight: '15px', marginTop: 3 }}>“{passage}”</div> : null}
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Eleanor Price · {WT_DATES.responsesDay}</div>
    </div>
  </div>
);

export const ReviewRecordPage: React.FC<{ openHover?: boolean; openPressAt?: number }> = ({ openHover, openPressAt }) => {
  const [c1, c2, c3] = WT_REVIEW.comments;
  const [r1, r2, r3] = WT_REVIEW.responses;
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
      <Page>
        <div style={{ display: 'flex', alignItems: 'center', height: 38 }}>
          <span style={{ fontFamily: FONT.serif, fontSize: 29, fontWeight: 500, lineHeight: '38px', color: C.text }}>Review record</span>
          <span style={{ color: C.muted, margin: '6px 9px 0' }}>·</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 13.5, color: C.text2, marginTop: 7 }}>{WT_DOC.ref}</span>
          <Button kind="primary" label="Open the round" hover={openHover} pressAt={openPressAt} pad="4px 12px" style={{ marginLeft: 'auto', height: 27, marginTop: -6 }} />
        </div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: -2, lineHeight: '18px' }}>{WT_REVIEW.recordSubtitle}</div>
        <div style={{ marginTop: 2, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', background: C.pane }}>
          <div style={{ position: 'relative', height: 32 }}>
            {(
              [
                ['#', COL.n],
                ['Where', COL.where],
                ['Comment', COL.comment],
                ['Code', COL.code],
                ['Response', COL.resp],
              ] as const
            ).map(([l, x]) => (
              <Micro key={l} style={{ position: 'absolute', left: x, top: 10, letterSpacing: 0.8 }}>
                {l}
              </Micro>
            ))}
          </div>
          <Band
            left={
              <>
                <b style={{ fontWeight: 600 }}>Round 1</b> <span style={{ color: C.muted }}>·</span> <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.text2 }}>P01</span>
              </>
            }
            right={`Closed and issued · ${WT_DATES.round1IssuedDay}`}
          />
          <Row n="1.1" quote="“Conceptual site model”" comment={c1.body} code="S0" head="Changed in P02" text={r1.text} passage={r1.passage} />
          <Row n="1.2" quote="“Asbestos in soils”" comment={c2.body} code="S0" head="Changed in P02" text={r2.text} passage={r2.passage} />
          <Row n="1.3" quote="“route section”" comment={c3.body} code={null} head="No change" text={r3.noChange} />
          <Band
            left={
              <>
                <b style={{ fontWeight: 600 }}>Round 1 closed</b>
                <StatusPill tone="warning" label={WT_REVIEW.verdicts.S0} size={12} />
              </>
            }
            right={`Set by Rachel Bowen, lead reviewer · ${WT_DATES.round1IssuedDay}`}
            h={40}
          />
          <Band
            left={
              <>
                <b style={{ fontWeight: 600 }}>Round 2</b> <span style={{ color: C.muted }}>·</span> <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.text2 }}>P02</span>
              </>
            }
            right={`Acknowledged into review ${WT_DATES.round2AckDay} · open`}
          />
          <Band white left={<span style={{ color: C.text2 }}>No comments yet — the round is open to the review group.</span>} h={37} />
          <Band
            left={
              <span>
                <b style={{ fontWeight: 600 }}>Round 2 has no deliverable code yet</b> <span style={{ color: C.text2 }}>The lead reviewer sets it when they close the round. No count of comments closes it.</span>
              </span>
            }
            h={37}
          />
        </div>
      </Page>
    </div>
  );
};
