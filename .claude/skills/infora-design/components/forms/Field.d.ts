import type { ReactNode } from 'react';

/** Wraps every form control. Error replaces hint when present. */
export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}
export function Field(props: FieldProps): JSX.Element;
