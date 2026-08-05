/**
 * Loading placeholder for content that is coming. Use instead of a spinner —
 * a shimmer does not imply a determinate percentage. Paused under
 * `prefers-reduced-motion`.
 */
export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
}
export function Skeleton(props: SkeletonProps): JSX.Element;
