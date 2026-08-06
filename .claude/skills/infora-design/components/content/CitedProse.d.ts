/** A paragraph and the source grounding it. */
export interface CitedParagraph {
  text: string;
  source?: { corpus: 'library' | 'authority'; label: string };
}

/** Grounded prose — every claim carries its source inline. */
export interface CitedProseProps {
  paragraphs: CitedParagraph[];
}
export function CitedProse(props: CitedProseProps): JSX.Element;
