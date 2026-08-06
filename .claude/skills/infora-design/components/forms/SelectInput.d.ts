/** A closed list of options. */
export interface SelectInputProps {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}
export function SelectInput(props: SelectInputProps): JSX.Element;
