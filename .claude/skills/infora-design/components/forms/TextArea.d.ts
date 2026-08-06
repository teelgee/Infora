/** Multi-line text. */
export interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}
export function TextArea(props: TextAreaProps): JSX.Element;
