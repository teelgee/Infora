/**
 * W3 split-editor geometry (plan §3.6, §3.7), in SHELL-native px of one
 * 752 × 832 seat. Pure functions of the frame (and measured text), shared by
 * the renderer (editor.tsx, panel.tsx) and the cursor targets (Video.tsx), so
 * the pointer lands on what is drawn.
 */
import { WT_COLLAB } from '../../data/wrenfield';
import { claimsSchedule, streamCount, typedCountAt } from '../shared';
import { ease } from '../../shared';
import { flow, lineCount, tw, type Part, type TextStyle } from './measure';
import { T, TY } from './timeline';

const SG = WT_COLLAB.suggestion;
const CM = WT_COLLAB.comments;

// ------------------------------------------------------------------ fixed regions

export const SPLIT_O = { x: 64, y: 120 }; // the Shell's content origin
export const CANVAS = { x0: 76, x1: 420, y0: 132, y1: 808, barY: 152, viewTop: 184, viewBottom: 784, textTop: 200, colX: 100, colW: 296 } as const;
export const PANEL = { x0: 428, x1: 728, y0: 132, y1: 808, cx0: 446, cx1: 710, cw: 264, tabsY: 150 } as const;

export const SERIF: TextStyle = { size: 15.5, family: 'serif' };
export const LH = 15.5 * 1.72; // 26.66
const TEXTAREA_MIN = 260;
/** The suggestion callout sits under the textarea (min-height 260 → y 460) + 14. */
export const CALLOUT = { top: CANVAS.textTop + TEXTAREA_MIN + 14, padX: 16, padY: 14, innerW: CANVAS.colW - 32 } as const;

// ------------------------------------------------------------------ the document text (§3.7)

const nadiaSentence = WT_COLLAB.nadiaText.split('\n')[1];
export const acceptedText = SG.claims.map((c) => c.text).join(' ');

export function docGeom() {
  const nadiaLines = lineCount(nadiaSentence, SERIF, CANVAS.colW);
  // [1. Ecological receptors][sentence…][blank][2. Dewatering…][blank][paragraph…]
  const paraTop = CANVAS.textTop + LH * (1 + nadiaLines + 3);
  const para = flow([{ text: acceptedText, st: SERIF }], CANVAS.colW);
  const dewIdx = para.placed.findIndex((p) => p.word === 'dewatering.');
  const dw = para.placed[dewIdx];
  const wordW = tw('dewatering', SERIF);
  const lineMid = paraTop + dw.line * LH + LH / 2;
  return {
    nadiaLines,
    paraTop,
    paraLines: para.lines,
    dew: { x0: CANVAS.colX + dw.x0, x1: CANVAS.colX + dw.x0 + wordW, y: lineMid, lineTop: paraTop + dw.line * LH },
  };
}

// ------------------------------------------------------------------ the suggestion callout (§7.2)

const pillW = (ref: string) => tw(ref, { size: 11.5, weight: 600 }) + 16 + 2;
const TAG = { size: 10.5, weight: 700, ls: 0.8, upper: true } as TextStyle;

/** Parts for the callout prose as streamed at f (all of it when f is large). */
function calloutParts(f: number): Part[] {
  const sched = claimsSchedule(SG.claims, T.claimsFrom, 4, 4);
  const parts: Part[] = [];
  SG.claims.forEach((c, i) => {
    const n = Math.min(c.text.length, streamCount(f, sched[i].start, 4));
    if (n <= 0) return;
    parts.push({ text: c.text.slice(0, n), st: SERIF, tag: `c${i}` });
    if (f >= sched[i].pillAt) {
      parts.push({ text: ' ', st: SERIF });
      parts.push({ box: pillW(c.refs[0]), tag: `pill${i}` });
      parts.push({ text: ' ', st: SERIF });
    }
  });
  return parts;
}

const BTN_SM = (label: string, weight: number) => 22 + 2 + tw(label, { size: 12, weight });

let calloutMemo: ReturnType<typeof computeCallout> | null = null;
export const calloutGeom = () => (calloutMemo ??= computeCallout());
function computeCallout() {
  const tagLines = flow([{ text: 'Suggestion · Insert · Pending your decision', st: TAG }], CALLOUT.innerW - 26).lines;
  const tagH = Math.max(18, tagLines * 10.5 * 1.72);
  const proseTop = CALLOUT.top + CALLOUT.padY + tagH + 8;
  const full = flow(calloutParts(1e9), CALLOUT.innerW);
  // actions row: ✓ Accept · ✎ Edit · ↻ Refine · Reject, gap 8, wrapping in the inner width
  const widths = [BTN_SM('✓ Accept', 700), BTN_SM('✎ Edit', 600), BTN_SM('↻ Refine', 600), BTN_SM('Reject', 600)];
  let rows = 1;
  let x = 0;
  widths.forEach((w, i) => {
    if (i > 0 && x + 8 + w > CALLOUT.innerW) {
      rows++;
      x = w;
    } else x += (i > 0 ? 8 : 0) + w;
  });
  const actionsH = rows * 27 + (rows - 1) * 8;
  const actionsTop = proseTop + full.lines * LH + 12;
  const bottom = actionsTop + actionsH + CALLOUT.padY;
  const pill3 = full.placed.find((p) => p.tag === 'pill2')!;
  return {
    tagH,
    proseTop,
    lines: full.lines,
    actionsTop,
    bottom,
    settled: Math.max(0, bottom - CANVAS.viewBottom + 8),
    accept: { x: CANVAS.colX + CALLOUT.padX + widths[0] / 2, y: actionsTop + 13.5 },
    pill3: { x: CANVAS.colX + CALLOUT.padX + (pill3.x0 + pill3.x1) / 2, y: proseTop + pill3.line * LH + LH / 2, top: proseTop + pill3.line * LH + 3 },
  };
}

/** The bottom of what has been revealed at f (text bottom + padding; actions once shown). */
function revealedBottom(f: number, g: ReturnType<typeof calloutGeom>) {
  if (f < T.done) return 0;
  if (f >= T.actionsAt) return g.bottom;
  const parts = calloutParts(f);
  if (parts.length === 0) return g.proseTop + CALLOUT.padY;
  const lines = flow(parts, CALLOUT.innerW).lines;
  return g.proseTop + lines * LH + CALLOUT.padY;
}

const scrollMemo = new Map<number, number>();
/**
 * Follow-scroll (VISION, §12 item 6): scroll = max(0, revealedBottom − 776),
 * each new line eased over 6 f; back to 0 over 2561–2580 after Accept.
 */
export function canvasScroll(f: number): number {
  if (f < T.done) return 0;
  const hit = scrollMemo.get(f);
  if (hit !== undefined) return hit;
  const g = calloutGeom();
  const viewEdge = CANVAS.viewBottom - 8; // 776
  const target = (t: number) => Math.max(0, revealedBottom(t, g) - viewEdge);
  const until = Math.min(f, T.actionsAt + 8);
  let s = 0;
  let prev = 0;
  for (let t = T.done; t <= until; t++) {
    const cur = target(t);
    if (cur > prev) {
      const p = Math.min(1, Math.max(0, (f - t) / 6));
      s += (cur - prev) * ease.inOut(p);
      prev = cur;
    }
  }
  if (f >= T.accepted) s = prev * (1 - ease.inOut(Math.min(1, (f - T.accepted) / (T.scrollBackEnd - T.accepted))));
  scrollMemo.set(f, s);
  return s;
}

// ------------------------------------------------------------------ the panel (§3.6)

export const SANS = (size: number, weight = 400): TextStyle => ({ size, weight });
const TAB_GAP = 20;
export const tabLabel = (k: 'Chat' | 'Comments' | 'Checks', comments: number) => (k === 'Comments' && comments ? `Comments (${comments})` : k);
/** Tab centres (x) for a given comments count. */
export function tabX(k: 'Chat' | 'Comments' | 'Checks', comments: number, pending = false) {
  let x = PANEL.cx0;
  for (const t of ['Chat', 'Comments', 'Checks'] as const) {
    const w = tw(tabLabel(t, comments), SANS(13, 600));
    if (t === k) return x + w / 2;
    x += w + (pending ? 16 : TAB_GAP);
  }
  return x;
}
export const tabRowBottom = (pending: boolean) => (pending ? 212 : 182);
export const contentTop = (pending: boolean) => tabRowBottom(pending) + 22;

// composer
export const COMPOSER = { textW: 178, lh: 18.75, padY: 12 } as const;
export const composerH = (lines: number) => Math.max(52, COMPOSER.padY * 2 + lines * COMPOSER.lh);

/** Eleanor's composer text at f (plain text with the built ` per <ref>` inserts). */
export function composerText(f: number): string {
  if (f < TY.prompt.from || f >= T.sent) return '';
  let s = WT_COLLAB.promptTyped.slice(0, typedCountAt(f, TY.prompt.text, TY.prompt.from, TY.prompt.seed));
  if (f >= T.lib1Pick) s = WT_COLLAB.promptTyped + ' per WA-GEO-GIR-004';
  if (f >= TY.promptAnd.from) s += WT_COLLAB.promptAnd.slice(0, typedCountAt(f, TY.promptAnd.text, TY.promptAnd.from, TY.promptAnd.seed));
  if (f >= T.lib2Pick) s = WT_COLLAB.promptFinal;
  return s;
}
export const composerLines = (s: string) => (s === '' ? 1 : lineCount(s, SANS(12.5), COMPOSER.textW));

/** Chip rows: flex-wrap, gap 8, in the content width. Returns each chip's box (x relative to cx0, row). */
const CHIPS = [WT_COLLAB.editor.chips.library, ...WT_COLLAB.editor.chips.disabled];
export function chipBoxes() {
  let x = 0;
  let row = 0;
  return CHIPS.map((label) => {
    const w = tw(label, SANS(11.5, 500)) + 20 + 2;
    if (x > 0 && x + 8 + w > PANEL.cw) {
      row++;
      x = 0;
    }
    const x0 = x === 0 ? 0 : x + 8;
    x = x0 + w;
    return { label, x0, w, row };
  });
}
export const CHIP_H = 24;
export const CHIP_ROW = 32;

/** The library chip's centre when the composer has `lines` lines (pre-send layout, no pending). */
export function libChipPoint(lines: number) {
  const top = contentTop(false) + composerH(lines) + 12;
  const c = chipBoxes()[0];
  return { x: PANEL.cx0 + c.x0 + c.w / 2, y: top + CHIP_H / 2, top };
}
export const LIB_ROW = 32;
/** Library list rows (opens above the chip, 4 px gap, padding 4). */
export function libRowPoint(chipTop: number, i: number) {
  const n = WT_COLLAB.libraryEleanor.length;
  const top = chipTop - 4 - (n * LIB_ROW + 8);
  return { x: PANEL.cx0 + 90, y: top + 4 + LIB_ROW / 2 + i * LIB_ROW, top };
}
export function sendPoint(lines: number) {
  return { x: PANEL.cx1 - 10 - 15, y: contentTop(false) + composerH(lines) - 10 - 15 };
}

// chat log (after send)
export const MICRO_H = 14;
export const BUBBLE = { padX: 15, padY: 12, lh: 18.75 } as const;
export const bubbleLines = () => lineCount(WT_COLLAB.promptFinal, SANS(12.5), PANEL.cw - BUBBLE.padX * 2);

// comments
export const CMT = { lh: 12.5 * 1.55, headH: 18, anchorH: 11.5 * 1.5 + 8, bodyW: PANEL.cw - 2 - 28 } as const;
export const BTN_SM_H = 27;
const quietSmW = (label: string) => 22 + 2 + 13 + 4 + tw(label, SANS(12, 600));
export const bodyLines = (s: string, w: number) => lineCount(s, SANS(12.5), w);

/**
 * Comments-tab positions. `phase` = what the open thread shows.
 * Thread card top (after the New comment button) = contentTop + 27 + 10.
 */
export function commentsGeom() {
  const top = contentTop(false);
  const cardTop = top + BTN_SM_H + 10;
  const inner = cardTop + 1 + 12;
  const headTop = inner + CMT.anchorH + 9;
  const cLines = bodyLines(CM.comment.body, CMT.bodyW);
  const cBottom = headTop + CMT.headH + 2 + cLines * CMT.lh + 8;
  const rLines = bodyLines(CM.reply.body, CMT.bodyW - 26);
  const rBottom = cBottom + CMT.headH + 2 + rLines * CMT.lh + 8;
  const actions = (y: number) => ({
    reply: { x: PANEL.cx0 + 15 + quietSmW('Reply') / 2, y: y + 8 + BTN_SM_H / 2 },
    close: { x: PANEL.cx0 + 15 + quietSmW('Reply') + 6 + quietSmW('Close') / 2, y: y + 8 + BTN_SM_H / 2 },
  });
  // empty state + resolved toggle
  const emptyLines = bodyLines(CM.emptyOpen, PANEL.cw);
  const emptyTop = top + BTN_SM_H + 10;
  const toggleTop = emptyTop + emptyLines * 18.75 + 14;
  // the composing form (Nadia)
  const formInner = top + 1 + 12;
  const boxTop = formInner + CMT.anchorH + 9;
  return {
    cardTop,
    headTop,
    cLines,
    rLines,
    beforeReply: actions(cBottom - 8),
    afterReply: actions(rBottom - 8),
    replyBoxTop: cBottom,
    emptyTop,
    emptyLines,
    toggle: { x: PANEL.cx0 + tw(CM.resolvedToggle(1, false), SANS(12, 600)) / 2, y: toggleTop + 11.5, top: toggleTop },
    form: { boxTop },
  };
}

/** Comment textarea height for `text` (min 56; padding 8, border 1). */
export const boxH = (text: string, w: number) => Math.max(56, 18 + (text ? bodyLines(text, w - 20) : 1) * CMT.lh);

/** Nadia's comment box text at f. */
export function nadiaCommentText(f: number): string {
  if (f < T.mentionPick) return CM.commentAt.slice(0, typedCountAt(f, TY.commentAt.text, TY.commentAt.from, TY.commentAt.seed));
  return CM.mentionPick + ' ' + CM.commentRest.slice(0, typedCountAt(f, TY.commentRest.text, TY.commentRest.from, TY.commentRest.seed));
}
/** The mention list row (opens under the comment box, x 469, padding 4, 27 px row). */
export function mentionRowPoint() {
  const g = commentsGeom();
  const bottom = g.form.boxTop + boxH(CM.commentAt, CMT.bodyW);
  return { x: PANEL.cx0 + 15 + 90, y: bottom + 2 + 6 + 13.5, top: bottom + 2 };
}
