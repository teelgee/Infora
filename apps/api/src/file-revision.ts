// T-453 — landing a new native file on an uploaded document, as ONE act.
//
// *In plain terms: whether a person replaces a file by uploading a new copy, or
// an editing engine saves the file someone is editing in the browser, the same
// thing happens — the new file becomes the document, and the history gains a
// working version (v0.x) that keeps that file.*
//
// It is one function because ADR-0059's file source refreshes on "a new version
// of that document lands", and its own text names both arrivals: "an upload
// replacing the file today, a co-authoring save later". Two code paths would be
// two events, and anything that listened to one would miss the other. So the
// replace-file route (T-220) and the WOPI host's PutFile (T-453) both call
// `landFileRevision`, and a listener belongs here, once.
//
// T-220 left "durable prior-blob retention" to ADR-0043's P2. This is P2: each
// working revision row now carries the `file_ref` it had (migration 0070), so a
// replaced or co-authored file's earlier versions are still real files.
import { eq, sql } from 'drizzle-orm';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { putBlob } from './renditions';
import { extractText } from './extract';

export const uploadFormats = { docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', pdf: 'pdf' } as const;
export type UploadFormat = keyof typeof uploadFormats;

/**
 * The grounding text an uploaded file contributes, and the reason it does not.
 *
 * **The rule is: text arrives at upload when there is no other way to get it.**
 * A PDF (T-305), a workbook and a deck (T-306) have no editor path — conversion
 * makes a document editable, and none of the three should become an Infora text
 * document — so it is text at upload or never, and until T-306 the last two sat
 * in the sandbox as opaque blobs that never grounded.
 *
 * **A docx is the one exception, and it is not an oversight.** It has a
 * conversion path, and that path makes the extracted text *canonical* rather
 * than merely grounding. Extracting here as well would give `content` two
 * meanings for one format, and the second would be the one nobody expected. So
 * an uploaded docx keeps `''` until someone opens it in the editor (ADR-0034).
 * The bulk load has no such exception: reference material never converts, so
 * `extractText` there reads every format including docx.
 */
export function extractOnUpload(
  format: UploadFormat,
  bytes: Buffer,
): { ok: true; content: string } | { ok: false; detail: string } {
  if (format === 'docx') return { ok: true, content: '' };
  const extracted = extractText(format, bytes);
  // the refusal carries WHICH failure, because "we could not read it" and
  // "this is a scan and Infora does not do OCR" are different things to the
  // person holding the document, and only one of them is worth re-exporting
  return extracted.ok ? { ok: true, content: extracted.text } : { ok: false, detail: extracted.reason };
}

type SandboxDocumentRow = typeof s.sandboxDocuments.$inferSelect;

/**
 * Swap an uploaded document's canonical file and append the working revision
 * that records it. The caller has already decided the act is allowed — the
 * route checks the head lock, the WOPI host checks that the engine's lock is
 * the one holding it — so this refuses only on the bytes themselves.
 *
 * `db` may be a transaction: the WOPI host runs this inside the same
 * transaction as its entitlement re-check, so a grant revoked a moment earlier
 * cannot let one last save through.
 */
export async function landFileRevision(
  db: Db,
  doc: Pick<SandboxDocumentRow, 'id' | 'format'>,
  bytes: Buffer,
  participantId: string,
): Promise<{ ok: true; doc: SandboxDocumentRow } | { ok: false; detail: string }> {
  const format = doc.format as UploadFormat;
  // T-305 — the replacement's text replaces the old text, or the row keeps
  // grounding on a document that is no longer there. Refused on the same
  // terms as a first upload: a scan swapped in for a readable PDF is a
  // refusal, not a silently emptied document.
  const extracted = extractOnUpload(format, bytes);
  if (!extracted.ok) return extracted;
  const fileRef = putBlob(bytes, format);
  const [updated] = await db
    .update(s.sandboxDocuments)
    .set({ fileRef, content: extracted.content, updatedAt: sql`now()` })
    .where(eq(s.sandboxDocuments.id, doc.id))
    .returning();
  // the ambient snapshot marks the save boundary (ADR-0041) and, since 0070,
  // keeps the file it had — content is the canonical-empty '' for a docx
  await db.insert(s.sandboxDocumentVersions).values({
    sandboxDocumentId: updated!.id,
    content: updated!.content,
    fileRef,
    createdByParticipantId: participantId,
  });
  return { ok: true, doc: updated! };
}
