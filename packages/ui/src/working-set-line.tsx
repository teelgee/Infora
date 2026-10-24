// T-471 — the line beside an answer, a draft or a set of findings that was
// handed a working set (ADR-0022's addendum of 2026-10-24).
//
// *In plain terms: when the AI was given some of the person's own drafts to
// read, the answer says so — "Drawing on your working area — 2 documents" — and
// hovering the words lists which. It never turns those drafts into citations.
// A reader who is not in those drafts' working area reads the same line and the
// same titles, each marked "not open to you" — and none of them is a link. A
// draft deleted for good keeps its title with "document removed" after it.*
//
// The words come from one function in `@infora/contracts` so every surface says
// the same thing. This component holds no data and fetches nothing.
import { workingSetStatement } from '@infora/contracts';
import type { WorkingSetEntry } from '@infora/contracts';
import { HoverCard } from './hover-card';

/** The card on hover: every title, a mark after those the reader cannot open. No title is a link. */
export function WorkingSetCard(props: { entries: readonly WorkingSetEntry[] | undefined }) {
  const statement = workingSetStatement(props.entries);
  if (statement === null) return null;
  return (
    <div className="working-set-card">
      <div className="working-set-card-head">
        Read as background the person vouched for — never a source, never cited.
      </div>
      <ul className="working-set-card-list">
        {statement.entries.map((entry, at) => (
          <li key={`${at}-${entry.title}`}>
            {entry.title}
            {entry.mark !== null && <span className="working-set-mark">{entry.mark}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorkingSetLine(props: { entries: readonly WorkingSetEntry[] | undefined }) {
  const statement = workingSetStatement(props.entries);
  if (statement === null) return null;
  return (
    <span className="cf-working-set">
      <HoverCard label="The working set this run was handed" toggleOnClick card={<WorkingSetCard entries={props.entries} />}>
        <span className="cf-working-set-text" tabIndex={0}>
          {statement.line}
        </span>
      </HoverCard>
    </span>
  );
}
