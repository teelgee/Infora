// T-471 — the line beside an answer, a draft or a set of findings that was
// handed a working set (ADR-0022's addendum of 2026-10-24).
//
// *In plain terms: when the AI was given some of the person's own drafts to
// read, the answer says so — "Drawing on your working area — 2 documents" — and
// hovering the words lists which. It never turns those drafts into citations.
// A reader who is not in those drafts' working area sees only how many there
// were, never which.*
//
// The words come from one function in `@infora/contracts` so every surface says
// the same thing. This component holds no data and fetches nothing.
import { workingSetStatement } from '@infora/contracts';
import type { WorkingSetEntry } from '@infora/contracts';
import { HoverCard } from './hover-card';

export function WorkingSetLine(props: { entries: readonly WorkingSetEntry[] | undefined }) {
  const statement = workingSetStatement(props.entries);
  if (statement === null) return null;
  const { line, titles, hiddenCount } = statement;
  return (
    <span className="cf-working-set">
      <HoverCard
        label="The working set this run was handed"
        toggleOnClick
        card={
          <div className="working-set-card">
            <div className="working-set-card-head">
              Read as background the person vouched for — never a source, never cited.
            </div>
            {titles.length > 0 && (
              <ul className="working-set-card-list">
                {titles.map((title, at) => (
                  <li key={`${at}-${title}`}>{title}</li>
                ))}
              </ul>
            )}
            {hiddenCount > 0 && (
              <div className="working-set-card-hidden">
                {titles.length > 0 ? 'and ' : ''}
                {hiddenCount} document{hiddenCount === 1 ? '' : 's'} from a working area you are not in
              </div>
            )}
          </div>
        }
      >
        <span className="cf-working-set-text" tabIndex={0}>
          {line}
        </span>
      </HoverCard>
    </span>
  );
}
