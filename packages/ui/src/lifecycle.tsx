// T-455 — the lifecycle vocabulary: ONE label table for where a document is,
// keyed to CONTEXT.md's four axes (CDE state, status code, revision code,
// record state), so every screen says the same words for the same position.
//
// *In plain terms: a document is "Working v0.3" in the sandbox, "Frozen v0.3"
// once checked out for QA, "In internal QA", "QA accepted", then "Submitted
// P01", "In review P01", "Responding", "Accepted C01" — and, once it stops
// being current, "Superseded", "Withdrawn" or "Rejected". Before T-455 the
// plan, the sandbox, the review list and the cycle each printed their own
// words for these; this table is the only place the words now live.*
//
// The second badge beside this one — whether the AI may use the document,
// and why not — is the context-state badge (T-388, `contextStateBadge` in
// the web app's shared helpers). The two answer different questions and are
// never folded into one: a document can be accepted and out of reach.
//
// Which position a document is in is DERIVED by the caller from the record's
// own fields (record state, work-item status, the sandbox lock, the internal
// series); this module only knows the words. It never reads a store and never
// invents a state the record does not carry.
import { Badge, type BadgeTone } from './primitives';

export type LifecyclePosition =
  // the plan row exists; nothing bound to it yet
  | 'planned'
  // the sandbox's ambient v0.x working series (ADR-0041 §1)
  | 'working'
  // checked out: the head is locked for the org-private internal series (ADR-0032)
  | 'frozen'
  // an internal (sandbox-scope) review round is open
  | 'in_qa'
  // the internal cycle accepted the frozen version — what promotes under the QA gate
  | 'qa_accepted'
  // promoted: a P revision issued, awaiting the lead reviewer's acknowledgement (ADR-0051)
  | 'submitted'
  // a project-scope review round is open
  | 'in_review'
  // the round was issued back; the authoring side holds the pen
  | 'responding'
  // an accepting code closed the cycle; a C revision where it was contractual (ADR-0041 §3)
  | 'accepted'
  // owner-loaded reference material: received, not produced (T-304)
  | 'reference'
  // record state, ADR-0013 — stays in the library, leaves the grounded corpus
  | 'superseded'
  | 'withdrawn'
  // the producer removed its own pre-publication plan row (ADR-0013's two acts that share a word)
  | 'removed'
  | 'rejected';

/** The words, the tone, and which of CONTEXT.md's axes each position belongs to. */
export const LIFECYCLE_LABELS: Record<
  LifecyclePosition,
  { word: string; tone: BadgeTone; axis: 'CDE state' | 'Record state'; carriesRevision: boolean }
> = {
  planned: { word: 'Planned', tone: 'neutral', axis: 'CDE state', carriesRevision: false },
  working: { word: 'Working', tone: 'neutral', axis: 'CDE state', carriesRevision: true },
  frozen: { word: 'Frozen', tone: 'warning', axis: 'CDE state', carriesRevision: true },
  in_qa: { word: 'In internal QA', tone: 'info', axis: 'CDE state', carriesRevision: true },
  qa_accepted: { word: 'QA accepted', tone: 'success', axis: 'CDE state', carriesRevision: true },
  submitted: { word: 'Submitted', tone: 'warning', axis: 'CDE state', carriesRevision: true },
  in_review: { word: 'In review', tone: 'info', axis: 'CDE state', carriesRevision: true },
  responding: { word: 'Responding', tone: 'warning', axis: 'CDE state', carriesRevision: true },
  accepted: { word: 'Accepted', tone: 'success', axis: 'CDE state', carriesRevision: true },
  reference: { word: 'Reference material', tone: 'neutral', axis: 'CDE state', carriesRevision: true },
  superseded: { word: 'Superseded', tone: 'neutral', axis: 'Record state', carriesRevision: false },
  withdrawn: { word: 'Withdrawn', tone: 'neutral', axis: 'Record state', carriesRevision: false },
  removed: { word: 'Removed from plan', tone: 'neutral', axis: 'Record state', carriesRevision: false },
  rejected: { word: 'Rejected', tone: 'danger', axis: 'Record state', carriesRevision: false },
};

/**
 * The badge for a position: its word, plus the revision code where the
 * position carries one ("Working v0.3", "Accepted C01"). A revision is only
 * appended where it says something — a superseded document's revision is a
 * fact for the Versions tab, not for the badge.
 */
export function lifecycleBadge(
  position: LifecyclePosition,
  revision?: string | null,
): { tone: BadgeTone; label: string } {
  const entry = LIFECYCLE_LABELS[position];
  const label = entry.carriesRevision && revision ? `${entry.word} ${revision}` : entry.word;
  return { tone: entry.tone, label };
}

export function LifecycleBadge(props: { position: LifecyclePosition; revision?: string | null }) {
  const b = lifecycleBadge(props.position, props.revision);
  return <Badge tone={b.tone}>{b.label}</Badge>;
}
