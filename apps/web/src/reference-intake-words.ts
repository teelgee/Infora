// T-472 — the words the intake screens use for what a file's text status means.
// The extractor's own reasons are lower_snake codes; nothing user-facing shows
// one. These are short, for a table cell — the library's longer refusal
// sentences (api-errors.ts) are about a refusal, and nothing here refuses.
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

/** Where a drop of files has got to — fed from each request's own answer, never a timer. */
export type UploadProgress = { total: number; uploaded: number; scanned: number; failed: string[]; finished: boolean };

/** "7 of 50 uploaded · 2 could not be read" — the count line under the library's intro */
export function uploadSentence(p: UploadProgress): string {
  return (
    `${p.uploaded} of ${p.total} uploaded` +
    (p.failed.length > 0 ? ` · ${p.failed.length} could not be read` : '') +
    (p.scanned > 0 ? ` · ${p.scanned} with no readable text` : '') +
    (p.finished ? ' — waiting for you in the intake queue.' : '')
  );
}
