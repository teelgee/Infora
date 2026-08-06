import type { MouseEvent, ReactNode } from 'react';

export interface RailNavItem {
  label: string;
  /** A Lucide icon element at 15px, 2px stroke, currentColor. */
  glyph: ReactNode;
  href: string;
  active?: boolean;
  /** Routers call preventDefault here. */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/** The rail's section switcher. Hover and active fills come from the frame ramp. */
export interface RailNavProps {
  items: RailNavItem[];
}
export function RailNav(props: RailNavProps): JSX.Element;
