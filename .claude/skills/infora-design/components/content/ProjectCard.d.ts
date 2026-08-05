import type { MouseEvent, ReactNode } from 'react';

/**
 * A project row: progress numeral, serif title, plain-language subtitle, role
 * badge. The numeral is a count of drafted deliverables, never a percentage bar.
 * @startingPoint section="Content" subtitle="Project row with progress numeral and role badge" viewport="700x150"
 */
export interface ProjectCardProps {
  title: string;
  /** Plain language: "Owner · 7 of 11 deliverables drafted". */
  subtitle?: string;
  /** Deliverables drafted. */
  count: number | string;
  /** Muted numeral for projects the org does not own. */
  countQuiet?: boolean;
  /** Usually a role `<Badge pill>`. */
  action?: ReactNode;
  href?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement | HTMLDivElement>) => void;
}
export function ProjectCard(props: ProjectCardProps): JSX.Element;
