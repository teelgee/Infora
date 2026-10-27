/**
 * W3 overlays drawn at Shell level (they cross pane edges): the library list
 * that opens above the `▤ From the library` chip, the passage hover card on a
 * source pill (VISION), the selection `Comment` bubble, and the @mention list.
 * Shell-native px of one split seat.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { MessageSquare } from 'lucide-react';
import { appear, C, ease, FONT, RADIUS, SHADOW } from '../../shared';
import { WT_COLLAB } from '../../data/wrenfield';
import { StatusPill } from '../shared';
import { composerLines, composerText, libChipPoint, LIB_ROW, mentionRowPoint, PANEL } from './layout';
import { T } from './timeline';

const pop = (f: number, at: number, exitAt: number, dur = 4) => appear(f, at, dur, ease.linear) * (1 - appear(f, exitAt, dur, ease.linear));

/** Library list (BUILT-NP composer-sources: opens above the chip; mono rows). Eleanor's seat only. */
export const LibraryList: React.FC = () => {
  const f = useCurrentFrame();
  const opens = [
    { at: T.lib1Open, exit: T.lib1Pick, clickAt: 1879, hover: 4, hoverFrom: 1896 },
    { at: T.lib2Open, exit: T.lib2Pick, clickAt: 1953, hover: 3, hoverFrom: 1970 },
  ];
  return (
    <>
      {opens.map((o) => {
        const op = pop(f, o.at, o.exit);
        if (op <= 0) return null;
        const chip = libChipPoint(composerLines(composerText(o.clickAt)));
        const refs = WT_COLLAB.libraryEleanor;
        const h = refs.length * LIB_ROW + 8;
        return (
          <div
            key={o.at}
            style={{
              position: 'absolute',
              left: PANEL.cx0,
              top: chip.top - 4 - h,
              width: 180,
              height: h,
              boxSizing: 'border-box',
              padding: 4,
              background: C.pane,
              borderRadius: RADIUS.control,
              boxShadow: SHADOW.overlay,
              opacity: op,
            }}
          >
            {refs.map((r, i) => (
              <div
                key={r}
                style={{
                  height: LIB_ROW,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                  borderRadius: 6,
                  fontFamily: FONT.mono,
                  fontSize: 12.5,
                  color: C.text,
                  background: i === o.hover && f >= o.hoverFrom ? C.sunken : undefined,
                }}
              >
                {r}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
};

/** The passage hover card on WA-ENV-BAS-003 (VISION, §7.4), above the pill. Nadia's seat only. */
export const PillHoverCard: React.FC<{ pill: { x: number; top: number } }> = ({ pill }) => {
  const f = useCurrentFrame();
  const o = pop(f, T.hoverCardIn, T.hoverCardOut);
  if (o <= 0) return null;
  const h = WT_COLLAB.hoverCard;
  return (
    <div
      style={{
        position: 'absolute',
        left: 108,
        top: pill.top - 10,
        width: 280,
        transform: 'translateY(-100%)',
        boxSizing: 'border-box',
        background: C.pane,
        borderRadius: RADIUS.control,
        boxShadow: SHADOW.overlay,
        padding: '12px 14px',
        fontFamily: FONT.sans,
        opacity: o,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 500, color: C.text }}>{h.ref}</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.muted }}>{h.rev}</span>
        <StatusPill tone="success" label={h.state} size={11} />
      </div>
      <div style={{ marginTop: 9, fontSize: 10.5, lineHeight: '13px', letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.muted }}>{h.locator}</div>
      <div style={{ marginTop: 6, background: C.sunken, borderRadius: 6, padding: '8px 10px', fontFamily: FONT.serif, fontSize: 13.5, lineHeight: 1.55, color: C.text }}>
        {h.passage.map((p, i) => (
          <span key={i} style={p.hl ? { background: '#fbf3e3', boxShadow: '0 0 0 1px #fbf3e3' } : { color: C.text2 }}>
            {p.text}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: C.muted }}>{h.title}</div>
      <span style={{ position: 'absolute', left: Math.max(16, Math.min(250, pill.x - 108 - 6)), bottom: -6, width: 12, height: 12, background: C.pane, transform: 'rotate(45deg)', boxShadow: '3px 3px 5px rgba(0,0,0,.05)' }} />
    </div>
  );
};

/** The floating `Comment` bubble over a selection (BUILT-NP `.sel-comment`: top −34, left −8). */
export const SelectionBubble: React.FC<{ left: number; top: number }> = ({ left, top }) => {
  const f = useCurrentFrame();
  const o = pop(f, T.bubbleIn, T.commentForm, 3);
  if (o <= 0) return null;
  const hover = f >= 2787 && f < T.commentForm;
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        height: 24,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 11px',
        borderRadius: 999,
        background: C.pane,
        boxShadow: SHADOW.overlay,
        fontFamily: FONT.sans,
        fontSize: 12,
        fontWeight: 600,
        color: hover ? C.ink : C.text,
        whiteSpace: 'nowrap',
        opacity: o,
      }}
    >
      <MessageSquare size={13} strokeWidth={2} />
      {WT_COLLAB.comments.selectBubble}
    </div>
  );
};
export const bubbleWidth = 82;

/** The @mention list under Nadia's comment box (BUILT-NP `.mention-pop`). */
export const MentionList: React.FC = () => {
  const f = useCurrentFrame();
  const o = pop(f, T.mentionOpen, T.mentionPick);
  if (o <= 0) return null;
  const p = mentionRowPoint();
  const hover = f >= T.mentionHover - 4;
  return (
    <div
      style={{
        position: 'absolute',
        left: PANEL.cx0 + 10,
        top: p.top,
        minWidth: 180,
        boxSizing: 'border-box',
        padding: 6,
        background: C.pane,
        borderRadius: RADIUS.control,
        boxShadow: SHADOW.overlay,
        fontFamily: FONT.sans,
        opacity: o,
      }}
    >
      <div
        style={{
          height: 27,
          display: 'flex',
          alignItems: 'center',
          padding: '0 9px',
          borderRadius: 6,
          fontSize: 12.5,
          background: hover ? C.info.tint : undefined,
          color: hover ? C.info.text : C.text,
        }}
      >
        {WT_COLLAB.comments.mentionPick}
      </div>
    </div>
  );
};
