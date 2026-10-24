import type { BadgeTone, LifecyclePosition } from '@infora/ui';
import { lifecycleBadge } from '@infora/ui';
import type { ContextState, LibraryItem, PlanRow, ReviewCycle, SandboxDocument } from '@infora/contracts';

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

// One date format across the app (T-233): "25 Jul 2026"; the datetime variant
// adds the time for timestamps (comment/run activity).
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * T-388 — the context-state badge, and it NAMES ITS REASON.
 *
 * "Not used for AI answers" on its own is the unhelpful version: a user who
 * reads it cannot tell whether the deliverable was ended, replaced, or accepted
 * under a code their own project decided not to rely on — three situations with
 * three different responses. So the label always carries the why, and the why
 * comes from the server's derivation rather than being re-inferred here, because
 * a surface that worked it out for itself would be the second state machine the
 * ADR refuses (ADR-0013 §6).
 *
 * Null when the deliverable grounds: silence is right there. A green "used for
 * AI answers" chip on every row would make the ordinary case shout and the
 * exceptional case blend in.
 */
export function contextStateBadge(state: ContextState): { tone: BadgeTone; label: string } | null {
  if (state.grounds) return null;
  return { tone: 'warning', label: `Not used for AI answers — ${state.reason}` };
}

/**
 * T-455 — where a plan row (a container) is in its lifecycle, derived from the
 * record's own fields and rendered through the one label table in `@infora/ui`.
 *
 * Record state wins over work-item status: a superseded deliverable is
 * "Superseded" whatever its cycle last said. `withdrawn` is two acts that share
 * a word (ADR-0013's 2026-08-27 amendment): before publication it is the
 * producer removing its own row, after it is the owner ending a published
 * deliverable — `inLibrary` tells them apart, and a caller that cannot say
 * gets the published reading. An internal (sandbox-scope) cycle has no coded
 * reference, and its open round is "In internal QA", its acceptance "QA
 * accepted" — the same work-item statuses, read at the other scope.
 */
export function lifecycleOf(row: {
  state: PlanRow['state'];
  inLibrary?: boolean;
  workItem: { status: string } | null;
  currentVersion?: { versionReference: string } | null;
  documentReference?: string | null;
}): { position: LifecyclePosition; revision: string | null } | null {
  const revision = row.currentVersion?.versionReference ?? null;
  if (row.state === 'superseded') return { position: 'superseded', revision };
  if (row.state === 'rejected') return { position: 'rejected', revision };
  if (row.state === 'withdrawn') return { position: row.inLibrary === false ? 'removed' : 'withdrawn', revision };
  if (row.workItem === null) return { position: 'reference', revision };
  const internal = row.documentReference === null;
  switch (row.workItem.status) {
    case 'planned':
      return { position: 'planned', revision: null };
    case 'in_production':
      return { position: 'working', revision: null };
    case 'submitted':
      return { position: 'submitted', revision };
    case 'in_review':
      return { position: internal ? 'in_qa' : 'in_review', revision };
    case 'responding':
      return { position: 'responding', revision };
    case 'accepted':
      return { position: internal ? 'qa_accepted' : 'accepted', revision };
    case 'rejected':
      return { position: 'rejected', revision };
    default:
      return null;
  }
}

/** The lifecycle badge for a plan row; falls back to the raw status for a state the table does not know. */
export function lifecycleBadgeOf(row: Parameters<typeof lifecycleOf>[0]): { tone: BadgeTone; label: string } {
  const l = lifecycleOf(row);
  return l ? lifecycleBadge(l.position, l.revision) : statusBadge(row.workItem?.status ?? row.state);
}

/** A library row is live by construction: an accepted deliverable, or received reference material. */
export function libraryLifecycleBadge(item: Pick<LibraryItem, 'kind' | 'revision'>): { tone: BadgeTone; label: string } {
  return lifecycleBadge(item.kind === 'reference' ? 'reference' : 'accepted', item.revision);
}

/**
 * A sandbox document is working, or frozen (checked out) at its working revision
 * (ADR-0032, ADR-0041 §1). Given the freeze container's cycle (the read the
 * editor already makes), an open internal round reads "In internal QA P01" and
 * its acceptance "QA accepted" (T-478): the document itself carries no round, and
 * the freeze container has no work item, so without the cycle it can only say
 * Frozen.
 */
export function sandboxLifecycleBadge(
  doc: Pick<SandboxDocument, 'headLocked' | 'workingRevision'>,
  internalCycle?: ReviewCycle | null,
): { tone: BadgeTone; label: string } {
  const latest = internalCycle?.rounds.at(-1);
  if (internalCycle && latest) {
    if (internalCycle.state === 'accepted') return lifecycleBadge('qa_accepted', latest.versionReference);
    if (internalCycle.state === 'active' && latest.state === 'open') {
      return lifecycleBadge('in_qa', latest.versionReference);
    }
  }
  return lifecycleBadge(doc.headLocked ? 'frozen' : 'working', doc.workingRevision ?? null);
}

/** A stored status/state → badge tone + humanised label. Runs and agents (Ask, History) still read through here; documents read through `lifecycleBadgeOf` (T-455). */
export function statusBadge(status: string): { tone: BadgeTone; label: string } {
  const label = status.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
  // explicit tones for the known statuses; the keyword fallback keeps novel
  // states from rendering tone-less
  const TONES: Record<string, BadgeTone> = {
    planned: 'neutral',
    in_production: 'success',
    in_review: 'info',
    // a round awaiting the owner's acknowledgement (ADR-0051)
    submitted: 'warning',
    responding: 'warning',
    accepted: 'success',
    rejected: 'danger',
    withdrawn: 'neutral',
    // run/agent states (Ask, History)
    running: 'neutral',
    succeeded: 'success',
    completed: 'success',
    failed: 'danger',
  };
  const tone: BadgeTone =
    TONES[status] ??
    (status.includes('review')
      ? 'info'
      : status.includes('respond')
        ? 'warning'
        : status.includes('fail') || status.includes('reject')
          ? 'danger'
          : 'neutral');
  return { tone, label };
}
