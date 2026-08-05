import type { ReactNode } from 'react';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * A status label: 6px dot + word. The five tones are a closed set — do not add
 * a sixth hue. Colour never carries meaning alone; the label always does too.
 * @startingPoint section="Core" subtitle="The five status tones, flat and pill variants" viewport="700x150"
 */
export interface BadgeProps {
  tone: BadgeTone;
  /** Hide the dot only when the badge is already inside a coloured context. */
  dot?: boolean;
  /** Tinted background pill — for card contexts (a role badge on a project row). */
  pill?: boolean;
  children: ReactNode;
}
export function Badge(props: BadgeProps): JSX.Element;
export const badgeTone: Record<BadgeTone, string>;
