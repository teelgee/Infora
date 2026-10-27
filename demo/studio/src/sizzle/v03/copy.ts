/**
 * Clip 03's own copy and geometry (demo/archive/2026-10-sizzle/plan/video-03-review-wall.md). The
 * shared strings (comments, steps, notice, response line, dates) come from
 * src/data/wrenfield.ts; only lines that appear in this clip alone live here.
 */
import { DATES, PEOPLE } from '../../data/wrenfield';

export const SEATS = {
  left: `${PEOPLE.RACHEL.org} · ${PEOPLE.RACHEL.name}, ${PEOPLE.RACHEL.role}`,
  right: `${PEOPLE.ELEANOR.org} · ${PEOPLE.ELEANOR.name}, ${PEOPLE.ELEANOR.role}`,
} as const;

export const COPY = {
  composerPlaceholder: 'Add a review comment…',
  commentButton: 'Comment',
  releaseButton: 'Release comments to Calder & Hale',
  verdictValue: 'choose a code…',
  responseChip: 'Fixed in revision 2, section 3',
  respondButton: 'Respond',
  answered: 'Answered',
  libraryLabel: 'In the project library',
  acceptedLine: `Accepted by ${PEOPLE.RACHEL.name}, ${PEOPLE.RACHEL.org}`,
  acceptedDate: DATES.accepted,
  citeLine: 'The AI can now cite this.',
  revision: 'Revision 2',
} as const;

/** Split-screen geometry (screen px). See the deviation note in Body.tsx. */
export const GEO = {
  /** Native crop size. The plan says 358 × 330; the content needs 376 (see Body.tsx). */
  w: 358,
  h: 376,
  scale: 2.4,
  leftX: 510,
  rightX: 1410,
  y: 590,
  seatY: 94,
} as const;
