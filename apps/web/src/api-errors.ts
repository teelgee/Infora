// T-223 — one place that turns the API's machine-readable error codes into a
// short, actionable sentence for the user. The wire codes stay lower_snake for
// the API; nothing user-facing should ever render a bare underscore code.
//
// Keys are the `detail` string an endpoint returns (the second arg to
// forbidden/conflict, or the `detail` field on an ApiError), falling back to
// the top-level `error` code, falling back to a humanised version of whatever
// string we were given.

const MESSAGES: Record<string, string> = {
  // access / class-of-user gates
  super_user_required: 'This needs an elevated super-user — switch on the elevated tier, or ask an owner.',
  super_user_only: 'Only a super-user can do this.',
  elevated_required: 'This is a protected action — switch on the elevated (super-user) tier first.',
  controller_only: 'Only the document controller can do this in controller mode.',
  member_folder_create_disabled: 'Folder creation is turned off for members in this sandbox.',
  release_not_permitted: 'You can’t release this check-out — only the lock holder, the lead reviewer, or a super-user.',
  recipient_ungated: 'That organisation can already see the deliverable — no transmittal is needed.',

  // authoring / appointment roles
  lead_author_only: 'Only the deliverable’s lead author can do this — appoint yourself as lead author on the Plan.',
  authors_only: 'Only an author of this deliverable can do this.',
  author_or_lead_reviewer: 'Only an author or the lead reviewer can do this.',
  lead_reviewer_only: 'Only the lead reviewer can do this.',
  reviewers_only: 'Only a confirmed reviewer can do this.',
  no_author: 'The schema requires an author — appoint one on the Plan before promoting.',
  no_document_owner: 'The schema requires a document owner — set one on the Plan before promoting.',
  no_reviewer: 'The schema requires a confirmed reviewer — propose one on the Plan, then the owner confirms it.',
  no_lead_reviewer: 'This deliverable needs a confirmed lead reviewer — propose one on the Plan, then the owner confirms it.',

  // review-cycle state
  round_open: 'A review round is already open.',
  round_not_open: 'This round isn’t open.',
  round_not_in_respond_phase: 'The review round isn’t in the respond phase yet.',
  unanswered_comments: 'Answer every review comment before re-promoting.',
  already_responded: 'That comment has already been responded to.',
  internal_cycle_active: 'An internal review cycle is still active — finish or release it first.',
  already_acknowledged: 'This deliverable has already been acknowledged.',

  // check-out / freeze
  head_locked: 'The document is checked out — release it first.',
  already_checked_out: 'The document is already checked out.',
  not_locked: 'The document isn’t checked out.',

  // binding / versions / codes
  unplanned_document: 'Bind the document to a planned deliverable first (Bind).',
  bound: 'This document is already bound to a deliverable.',
  no_current_version: 'This deliverable has no current version yet.',
  unknown_code: 'That acceptance code isn’t valid for this project.',
  share_required: 'The receiving organisation must be shared with before it can be transmitted to.',
  reason_required: 'A reason is required.',

  // top-level error classes (last-resort, when no detail is given)
  forbidden: 'You don’t have permission to do this.',
  conflict: 'That can’t be done in the current state.',
  invalid: 'Some of the details weren’t valid.',
  not_found: 'That couldn’t be found.',
  rate_limited: 'Too many requests — give it a moment and try again.',
  unauthenticated: 'Your session has expired — sign in again.',
  failed: 'Something went wrong. Please try again.',
};

import { RequestError } from './api';

// Pull the most specific code off a caught error: the `detail`, else the
// top-level `error`, else nothing (for non-API failures).
export function errorCode(error: unknown): string | undefined {
  return error instanceof RequestError ? (error.body?.detail ?? error.body?.error ?? undefined) : undefined;
}

// Humanise an unknown code so a bare underscore string never reaches the user.
function humanise(code: string): string {
  const spaced = code.replaceAll('_', ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Something went wrong. Please try again.';
}

/** Map an API error's detail/error code to a user-facing sentence. */
export function describeApiError(code: string | null | undefined): string {
  if (!code) return MESSAGES.failed!;
  return MESSAGES[code] ?? humanise(code);
}
