/** Filterable picker. Its list is an overlay — mind the clipping rule. */
export interface ComboboxProps {
  value: string | null;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string; sub?: string }>;
  placeholder?: string;
  emptyText?: string;
}
export function Combobox(props: ComboboxProps): JSX.Element;
