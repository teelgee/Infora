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
  row_edit_not_permitted:
    'Editing this row is for the producing organisation’s super users and its lead author (T-362).',
  already_bound: 'That deliverable already has a bound working draft — one draft per row.',
  qa_acceptance_required:
    'This sandbox requires QA acceptance before promotion — freeze the draft and run the internal review, or a super-user turns the gate off in sandbox Settings.',
  qa_acceptance_stale:
    'The last QA acceptance was already issued as a revision — freeze this draft again and run a fresh internal review before promoting the next one.',
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
  // T-377 — a NAMED lead is enough to promote (proposed included); the
  // confirmed-and-accepted gates sit on the acknowledgement (ADR-0051)
  no_lead_reviewer: 'This deliverable needs a lead reviewer — name one here or on the Plan.',
  already_lead_reviewer: 'They are already the lead reviewer.',
  // T-332 (ADR-0049 §7) — the gate itself. The message never distinguishes the
  // two lists, because the ruling is that they are treated identically and the
  // surface must never have to explain why one stops you and the other does
  // not. The window states the COUNTS beside it, which is what makes this
  // actionable rather than merely refusing.
  open_items:
    'This draft has open items — resolve the open comment threads, findings and gaps before promoting.',
  promotion_state_changed:
    'What would promote has changed since this window opened — close it and reopen to see the current state.',
  // T-374 — the receipt narrows to a single accountable receiver (ADR-0051
  // addendum, 2026-08-22, superseding the 2026-08-06 widening)
  lead_reviewer_or_owner_super_user_only:
    'Only the lead reviewer acknowledges a submission — or a super user of the owner organisation, when the lead is away.',
  // T-372 — the appointee's own answer (ADR-0033 addendum §2)
  lead_reviewer_has_not_accepted:
    'The lead reviewer hasn’t accepted the appointment yet — nobody can acknowledge the submission until they do. If they’re away, name a different lead reviewer.',
  confirmation_required:
    'The owner organisation confirms the appointment before you can accept it — that is where access begins.',
  lead_appointment_only: 'Only a lead-reviewer appointment is accepted or declined.',
  appointment_revoked: 'That appointment has been withdrawn.',
  appointment_declined: 'That appointment was declined — a new lead reviewer is named instead.',
  already_accepted: 'You have already accepted this appointment.',
  already_declined: 'You have already declined this appointment.',

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
  // T-454 — the browser editor holds the file (the WOPI lock rides the check-out)
  open_in_editor: 'Someone has this file open in the browser editor — it can be frozen once they close it.',
  already_checked_out: 'The document is already checked out.',
  not_locked: 'The document isn’t checked out.',

  // binding / versions / codes
  unplanned_document: 'Bind the document to a planned deliverable first (Bind).',
  bound: 'This document is already bound to a deliverable.',
  no_current_version: 'This deliverable has no current version yet.',
  unknown_code: 'That acceptance code isn’t valid for this project.',

  // uploads and format reach (T-305). Each says what to DO about it: a refused
  // document is refused for a reason its owner can usually act on, and "upload
  // failed" would send them back to the same file with the same result.
  unsupported_format: 'Infora reads DOCX, XLSX, PPTX and PDF files.',
  unsupported_conversion: 'Only a Word document opens in the editor.',
  format_mismatch: 'A replacement must be the same format as the file it replaces.',
  unreadable_file: 'That file couldn’t be read — it may be damaged.',
  pdf_no_text:
    'That PDF is a scan — a picture of a document, with no text to index. Infora doesn’t read scans; export or re-issue it as a text PDF.',
  pdf_encrypted: 'That PDF is password-protected. Remove the protection and upload it again.',
  pdf_unreadable: 'That PDF couldn’t be read — it may be damaged or incomplete.',
  pdf_unsupported_filter:
    'Infora couldn’t read all of that PDF, and won’t index part of a document. Re-export it and try again.',
  docx_no_text: 'That Word document has no text in it.',
  xlsx_no_text:
    'That spreadsheet has no text to index — charts, images and formula results without values aren’t readable.',
  pptx_no_text:
    'That deck has no text on its slides — a set of images has nothing to index. Speaker notes aren’t read.',

  // reference-material intake (T-472)
  reference_in_use: 'A document with that reference is already in the library — reject this file or rename it and add it again.',
  already_confirmed: 'That file has already been confirmed.',
  invalid_classification: 'One of the classifications isn’t one this project uses — choose again.',
  admission_failed: 'Nothing was added — try again.',
  index_failed: 'The document is in the library, but Infora still couldn’t index it for the AI to read. Try “Index again” in a moment.',
  not_citable: 'That document has no readable text, so there is nothing to index.',

  // schema import (T-337) — each names the fix, because "rename the column" is
  // a ten-second job and is why this path never reaches for a model
  no_recognisable_headers:
    'That sheet needs a column of codes and a column of descriptions — rename the columns and import again.',
  no_codes_found: 'That sheet has the right columns but no usable codes in them.',
  file_required: 'Choose a file first.',
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
