/**
 * Single-line text. Focus shows the hairline darkening plus the focus ring.
 * @startingPoint section="Forms" subtitle="Text, select and combobox controls with labels and errors" viewport="700x220"
 */
export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Monospace — for ids, codes, acceptance references. */
  mono?: boolean;
  disabled?: boolean;
  onEnter?: () => void;
}
export function TextInput(props: TextInputProps): JSX.Element;
