import { UPLOAD_MAX_LABEL, isOverUploadCeiling, uploadTooLargeLine } from '@infora/contracts';

// T-472 — the words the intake screens use for what a file's text status means.
// The extractor's own reasons are lower_snake codes; nothing user-facing shows
// one. These are short, for a table cell — the library's longer refusal
// sentences (api-errors.ts) are about a refusal. The words for a file's text refuse
// nothing; the one refusal in this file is the size rule at the foot of it (T-486).
const SHORT: Record<string, string> = {
  pdf_no_text: 'A scan — no text layer',
  pdf_encrypted: 'Password-protected',
  pdf_unreadable: 'Could not be read',
  pdf_unsupported_filter: 'Could only be partly read',
  docx_no_text: 'No text in it',
  xlsx_no_text: 'No text in it',
  pptx_no_text: 'No text on its slides',
  unreadable_file: 'Could not be read',
};

/** why a file has no readable text, in a few words */
export const describeTextStatus = (status: string): string => SHORT[status] ?? 'No readable text';

/** the sentence the library row carries for a held-but-unreadable file */
export const NOT_CITABLE_LABEL = 'Not citable — no readable text';

/**
 * Where a drop of files has got to — fed from each request's own answer, never a
 * timer. `tooLarge` holds the names of files the screen did not send because they
 * are over the ceiling (T-486 f); `failed` holds the lines for files the server
 * could not take.
 */
export type UploadProgress = {
  total: number;
  uploaded: number;
  scanned: number;
  failed: string[];
  tooLarge: string[];
  finished: boolean;
};

/** "7 of 50 uploaded · 2 could not be read" — the count line under the library's intro */
export function uploadSentence(p: UploadProgress): string {
  return (
    `${p.uploaded} of ${p.total} uploaded` +
    (p.failed.length > 0 ? ` · ${p.failed.length} could not be read` : '') +
    (p.tooLarge.length > 0 ? ` · ${p.tooLarge.length} larger than ${UPLOAD_MAX_LABEL} — not uploaded` : '') +
    (p.scanned > 0 ? ` · ${p.scanned} with no readable text` : '') +
    (p.finished ? ' — waiting for you in the intake queue.' : '')
  );
}

/** The lines under the count: each file that did not go up, with its name and why, files over the ceiling first. */
export const uploadProblemLines = (p: UploadProgress): string[] => [
  ...p.tooLarge.map(uploadTooLargeLine),
  ...p.failed,
];

/**
 * Send a drop of files one at a time (T-486 f). A file over the ceiling is not
 * sent at all — the line names it and says why — and the others carry on, as one
 * file's trouble never stopped the rest (T-305's rule). The sending and the words
 * for an error come from the caller, so this is the screen's whole upload rule as
 * a pure function the tests can run.
 */
export async function sendReferenceFiles<F extends { name: string; size: number }>(
  files: readonly F[],
  send: (file: F) => Promise<{ readable: boolean }>,
  explain: (error: unknown) => { tooLarge: boolean; words: string },
  onProgress: (progress: UploadProgress) => void,
): Promise<UploadProgress> {
  const state: UploadProgress = { total: files.length, uploaded: 0, scanned: 0, failed: [], tooLarge: [], finished: false };
  const tell = () => onProgress({ ...state, failed: [...state.failed], tooLarge: [...state.tooLarge] });
  tell();
  for (const file of files) {
    if (isOverUploadCeiling(file.size)) {
      state.tooLarge.push(file.name);
    } else {
      try {
        const item = await send(file);
        state.uploaded += 1;
        if (!item.readable) state.scanned += 1;
      } catch (error) {
        const why = explain(error);
        if (why.tooLarge) state.tooLarge.push(file.name);
        else state.failed.push(`${file.name}: ${why.words}`);
      }
    }
    tell();
  }
  state.finished = true;
  tell();
  return state;
}
