// component.skeleton (design-rules.md §B) — shimmering loading placeholder
// for canvas content / chat responses while a run is in flight. Not a
// spinner: the shimmer communicates "content is coming" without implying a
// determinate progress %.
export function Skeleton(props: { width?: string | number; height?: string | number; className?: string }) {
  return (
    <div
      className={props.className ? `skeleton ${props.className}` : 'skeleton'}
      style={{ width: props.width ?? '100%', height: props.height ?? '1em' }}
    />
  );
}
