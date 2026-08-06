export interface RunStep {
  /** Plain past-tense outcome: "Retrieved sources", "Ground-checked claims". */
  label: string;
  pending?: boolean;
}

/** What the agent did, in order, with a connecting rail. */
export interface RunTraceProps {
  steps: RunStep[];
}
export function RunTrace(props: RunTraceProps): JSX.Element;
