// T-472 — reference-material intake (ADR-0011's addendum of 2026-10-24).
//
// *In plain terms: the owner drops a standard, a piece of guidance or a
// baseline report onto the library screen. It does not go into the library. It
// waits in an intake queue, where the AI has proposed a title and a
// classification, until a person confirms them — singly or in bulk. Only then
// does a library document exist, so nothing can be read by the AI before a
// person has looked at it.*
//
// Confidence is a WORD, never a number: the AI's guess is shown as "confident",
// "likely" or "unsure", because a figure like 0.82 would look like a
// measurement and is not one.
import { z } from 'zod';
import type { Id } from './shared';

const id = z.uuid();

// T-486 (f) — the ceiling on a file Infora takes in on a person's behalf: 64 MB.
// ONE number, so the three places that enforce it cannot drift: the intake screen
// (which does not send a larger file), the intake route (which refuses one with a
// 413 in words) and the PDF reader (which will not read one). It was first a
// private constant of the PDF reader, and the intake had no cap of its own beyond
// the server's (T-472 deviation g).
export const UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
/** the ceiling as a person reads it */
export const UPLOAD_MAX_LABEL = `${UPLOAD_MAX_BYTES / (1024 * 1024)} MB`;
/** true when a file is over the ceiling (a file of exactly the ceiling is not) */
export const isOverUploadCeiling = (sizeBytes: number): boolean => sizeBytes > UPLOAD_MAX_BYTES;
/** the screen's progress line for a file it did not send */
export const uploadTooLargeLine = (fileName: string): string =>
  `${fileName}: not uploaded — larger than ${UPLOAD_MAX_LABEL}`;
/**
 * The server's 413 `detail`. It names the file when it has read far enough to
 * know it; a refusal on the declared length alone comes before the body is read,
 * so before any name exists, and says "the file".
 */
export const uploadTooLargeDetail = (fileName?: string): string =>
  `${fileName ? `“${fileName}”` : 'The file'} is larger than ${UPLOAD_MAX_LABEL}, the most reference intake takes`;

export const INTAKE_CONFIDENCES = ['confident', 'likely', 'unsure'] as const;
export type IntakeConfidence = (typeof INTAKE_CONFIDENCES)[number];

/** One facet's proposed or settled term. */
export type IntakeClassification = { facetId: Id; termId: Id; confidence: IntakeConfidence };

/** 'extracted', or the extractor's refusal reason (pdf_no_text, pdf_encrypted, unreadable_file …). */
export type IntakeTextStatus = string;

export type IntakeRow = {
  id: Id;
  originalFilename: string;
  format: string;
  textStatus: IntakeTextStatus;
  /** false for a file whose text could not be read — if confirmed, it is held but never read by a run */
  readable: boolean;
  proposedTitle: string;
  /** null while there is no proposal (the AI is switched off, or the file has no text) */
  proposedClassifications: IntakeClassification[] | null;
  status: 'proposed' | 'confirmed' | 'rejected';
  uploadedBy: { participantId: Id; name: string };
  uploadedAt: string;
  confirmedBy: { participantId: Id; name: string } | null;
  confirmedAt: string | null;
  containerId: Id | null;
  /** confirmed, but the index call failed: the document is in the library and no run can read it yet */
  needsIndexing: boolean;
};

// GET /projects/:projectId/reference-intake?status=&page= — the queue, paged
export const referenceIntakeQuery = z.object({
  status: z.enum(['proposed', 'confirmed']).default('proposed'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ReferenceIntakeQuery = { status?: 'proposed' | 'confirmed'; page?: number; pageSize?: number };
export type ListReferenceIntakeResponse = {
  items: IntakeRow[];
  total: number;
  page: number;
  pageSize: number;
  /** whether the project's AI switch for proposing is on — the screen says so when it is not */
  proposalsOn: boolean;
};

// POST /projects/:projectId/reference-intake (multipart: `file`) — one file per request
export type UploadReferenceIntakeResponse = { item: IntakeRow };

/** What the person settled on for one file. */
export const confirmIntakeBody = z.object({
  title: z.string().trim().min(1).max(300),
  classifications: z
    .array(z.object({ facetId: id, termId: id }))
    .max(40)
    .default([]),
});
export type ConfirmIntakeBody = z.input<typeof confirmIntakeBody>;

// POST /projects/:projectId/reference-intake/confirm — several, each as the person settled it
export const bulkConfirmIntakeBody = z.object({
  items: z
    .array(confirmIntakeBody.extend({ id }))
    .min(1)
    .max(200),
});
export type BulkConfirmIntakeBody = z.input<typeof bulkConfirmIntakeBody>;

export type ConfirmIntakeResult =
  | { id: Id; ok: true; containerId: Id; documentReference: string; notCitable: boolean; indexed: boolean }
  | { id: Id; ok: false; reason: string };
// POST /projects/:projectId/reference-intake/:id/index — "Index again" for a confirmed file the index call failed on
export type IndexIntakeResponse = { id: Id; indexed: true; chunks: number };

export type BulkConfirmIntakeResponse = { results: ConfirmIntakeResult[]; confirmed: number; failed: number };

// GET /containers/:containerId/library-admission — who put a reference document in the library, and when
export type LibraryAdmission = {
  intakeId: Id;
  /** the version is not yet indexed — "Index again" is offered to the owner's super user */
  needsIndexing: boolean;
  uploadedBy: { participantId: Id; name: string };
  confirmedBy: { participantId: Id; name: string };
  confirmedAt: string;
  originalFilename: string;
};
export type GetLibraryAdmissionResponse = { admission: LibraryAdmission | null };
