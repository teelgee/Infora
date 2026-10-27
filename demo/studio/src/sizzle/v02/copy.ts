/**
 * Clip 02 copy that appears only in this clip (README rule 3). The shared
 * strings (the Required span, the finding lines, the button labels) come from
 * QA in src/data/wrenfield.ts. Everything here except PLAN and the strip's
 * span is drawn Greek'd; the words only set the bars' lengths.
 */
export const PLAN = {
  header: 'QA checker',
  heading: 'The plan',
  button: 'Run the check',
  checksChip: 'Checks (5)',
} as const;

/** WA-EIA-MST-001 as the canvas shows it (video-02 "Canvas (shot 3)"). */
export const CANVAS = {
  h1: '1. Purpose and scope',
  p1Before: 'This statement scopes land quality for',
  routewide: 'the routewide works',
  h2: '2. Baseline sources',
  h3: '3. Conceptual site model',
  csm: 'A conceptual site model has been prepared for each land parcel crossed by the route.',
  p3Middle: 'Sources considered include historic landfill, agricultural fuel storage and made ground associated with the former works, including',
} as const;

/** The one-line strip in shot 6: "…for the routewide works." → "…for ~~the routewide works~~ the scheme." */
export const STRIP = {
  before: 'for',
  from: 'the routewide works',
  to: 'the scheme',
} as const;

/** Greek'd house-style copy (shot 6), shortened so the group fits the frame. */
export const STYLE = {
  note: 'One substitution, applied consistently.',
  ruleFrom: '(project style guide)',
  ruleQuote: 'Refer to the works as “the scheme”, throughout.',
} as const;
