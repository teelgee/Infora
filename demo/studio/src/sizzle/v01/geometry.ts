/**
 * Clip 01 screen geometry (screen px unless noted), measured from render
 * checks of out/stills/v01/. Cursor targets are where the arrow tip lands.
 */
export const GEO = {
  /** Shot 2: the side-panel composer under Float 1.2 at (960, 540). */
  composer: { x: 1591, y: 272 },
  /** Shot 4: the prompt bubble, right-aligned over the run trace (trace: Float 960, 560). */
  bubble: { x: 996, y: 254 },
  /** Shot 4: the trace float's centre y (direction 560; 592 centres the bubble + trace group). */
  traceY: 592,
  /** Shot 7: the card's resting x once it slides away. */
  cardLeftX: 560,
  /** Shot 7: pill 3 in the card (camera ×1.05). */
  pill3: { x: 1090, y: 476 },
  /**
   * Shots 7–9: the source panel. Scale 2.2 (not 2.4) and 420 native wide (not
   * 380) so the whole page fits the frame and the risen footer sets on one
   * line; the 14 px span still reads at ≥ 30 px (2.2 × 14 = 30.8, ×1.06 pushed).
   */
  panel: { x: 1360, y: 540, scale: 2.2, width: 420 },
  /** The hl span's centre (stage px), the slow push's fixed point. */
  span: { x: 1303, y: 622 },
  /** Shot 10: Accept in the returned card. */
  accept: { x: 312, y: 808 },
  /**
   * Shot 10: the shell's float at ×1.6 (direction: 1.7; 1.6 fits both section 2
   * and the side panel's receipt on screen), and section 2's prose centre
   * (stage px = final screen px).
   */
  shell: { x: 784, y: 620, scale: 1.6 },
  section2: { x: 666, y: 610 },
  /** The receipt's native size so it reads at ≥ 30 px (19 × 1.6 = 30.4). */
  receiptSize: 19,
  /** Shot 10: card centre offset so its prose sits on section 2 as it dissolves (stage px). */
  cardDy: 43,
} as const;
