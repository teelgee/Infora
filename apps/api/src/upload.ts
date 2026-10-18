// T-122 — upload to the sandbox + open-in-editor conversion (ADR-0034,
// contracts §4). An uploaded document keeps its native file as canonical
// (origin 'uploaded'; Infora views, promotes and reviews it but does not
// edit it); "open in editor" converts to authored IN PLACE, deliberately —
// the extracted text becomes the canonical source, the original file stays
// on the row (file_ref) as the preserved original, and fidelity is honest:
// complex Word formatting simplifies. docx converts; xlsx/pptx do not
// pretend to (400 unsupported_conversion).
//
// T-305 — PDF joins the accepted formats, and enters differently from the
// other three. Its text is extracted **at the moment its bytes arrive**, into
// `content`, while the file stays canonical and the row stays `uploaded`:
//
//   * a PDF has no editor path to extract it later. Conversion turns a
//     document into an editable one, which a PDF is not and should not become,
//     so text taken at upload or never is the real choice;
//   * versions are append-only (T-008), and `versions.content` is what the
//     chunker indexes and what every locator is an offset INTO. Extraction has
//     to precede the version, which means it cannot live in the ingest sweep;
//   * and the refusal has to happen while a person is still holding the file.
//     v1.md requires an unsupported document to fail loudly and per-document;
//     a scanned PDF accepted here and found unreadable later is exactly the
//     silent corpus gap that ruling exists to prevent.
//
// The extraction itself is bounded, one document's worth, and on no sweep —
// what T-302 kept off the request path is the corpus-wide walk, not this.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, sql } from 'drizzle-orm';
import type { ApiError, SandboxDocument } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { putBlob, getBlob } from './renditions';
import { docxToText, extractText } from './extract';
import { importOnVersionLanding } from './app-table-source';
import { ensureDefaultSandbox } from './sandbox';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';
import { toSandboxDocument } from './sandbox';

const invalid = (c: Context, detail?: string) =>
  c.json({ error: 'invalid', ...(detail && { detail }) } satisfies ApiError, 400);

const formats = { docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', pdf: 'pdf' } as const;

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
function extractOnUpload(
  format: keyof typeof formats,
  bytes: Buffer,
): { ok: true; content: string } | { ok: false; detail: string } {
  if (format === 'docx') return { ok: true, content: '' };
  const extracted = extractText(format, bytes);
  // the refusal carries WHICH failure, because "we could not read it" and
  // "this is a scan and Infora does not do OCR" are different things to the
  // person holding the document, and only one of them is worth re-exporting
  return extracted.ok ? { ok: true, content: extracted.text } : { ok: false, detail: extracted.reason };
}

export function uploadRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();
  const project = projectScope(deps);
  const documentScope = resourceScope(deps, 'id', resourceHomes.sandboxDocument);

  // Drag-and-drop from the Office world: the native file is canonical.
  app.post('/projects/:projectId/sandbox-uploads', project, async (c) => {
    const slice = c.get('slice');
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    if (!(file instanceof File)) return invalid(c, 'file_required');
    const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
    const format = formats[extension as keyof typeof formats];
    if (!format) return invalid(c, 'unsupported_format');
    const bytes = Buffer.from(await file.arrayBuffer());
    // refused before anything is written: a document that cannot ground is not
    // quietly parked in the sandbox as an opaque blob (T-305)
    const extracted = extractOnUpload(format, bytes);
    if (!extracted.ok) return invalid(c, extracted.detail);
    const fileRef = putBlob(bytes, format);
    const sandboxId = await ensureDefaultSandbox(
      deps.db,
      slice.projectId,
      slice.organisationId,
      slice.participantId,
    );
    const [doc] = await deps.db
      .insert(s.sandboxDocuments)
      .values({
        projectId: slice.projectId,
        organisationId: slice.organisationId,
        sandboxId,
        title: file.name.replace(/\.[^.]+$/, ''),
        origin: 'uploaded',
        kind: 'text',
        format,
        // the native file stays canonical (ADR-0034) — this is the grounding
        // text, not a second copy of the document. '' for every format whose
        // text is taken elsewhere or not at all; a PDF's extracted text, page
        // breaks and all, for the one format that has no editor path (T-305).
        content: extracted.content,
        fileRef,
        createdByParticipantId: slice.participantId,
      })
      .returning();
    // the upload is the document's genesis save boundary — seed the ambient
    // history so it reads v0.1 and shows in the timeline (ADR-0041), the same
    // way the first authored save does. A later replace-file then bumps to v0.2.
    await deps.db.insert(s.sandboxDocumentVersions).values({
      sandboxDocumentId: doc!.id,
      content: doc!.content,
      createdByParticipantId: slice.participantId,
    });
    return c.json(toSandboxDocument(doc!), 201);
  });

  // T-220 — replace the canonical native file (ADR-0043 P1). An uploaded
  // document keeps its native file canonical (ADR-0034); this swaps that file
  // for a new upload of the SAME format family — a new blob + file_ref — and
  // bumps the working revision with an ambient snapshot. Refused while checked
  // out (409 head_locked): it rewrites canonical bytes, like the T-122
  // conversion. Only an 'uploaded' document has a native file to replace.
  // Durable prior-blob retention is deferred to P2 — the old blob is orphaned.
  app.post('/sandbox-documents/:id/file', documentScope, async (c) => {
    const slice = c.get('slice');
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    if (doc!.origin !== 'uploaded') return invalid(c, 'not_uploaded');
    if (doc!.headLocked) {
      return c.json({ error: 'conflict', detail: 'head_locked' } satisfies ApiError, 409);
    }
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    if (!(file instanceof File)) return invalid(c, 'file_required');
    const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
    const format = formats[extension as keyof typeof formats];
    if (!format) return invalid(c, 'unsupported_format');
    // same format family only — a docx is replaced by a docx (ADR-0034)
    if (format !== doc!.format) return invalid(c, 'format_mismatch');
    const bytes = Buffer.from(await file.arrayBuffer());
    // T-305 — the replacement's text replaces the old text, or the row keeps
    // grounding on a document that is no longer there. Refused on the same
    // terms as a first upload: a scan swapped in for a readable PDF is a
    // refusal, not a silently emptied document.
    const extracted = extractOnUpload(format, bytes);
    if (!extracted.ok) return invalid(c, extracted.detail);
    const fileRef = putBlob(bytes, format);
    const [updated] = await deps.db
      .update(s.sandboxDocuments)
      .set({ fileRef, content: extracted.content, updatedAt: sql`now()` })
      .where(eq(s.sandboxDocuments.id, doc!.id))
      .returning();
    // the ambient snapshot marks the save boundary (ADR-0041) — content is the
    // canonical-empty '' for an uploaded row; the prior blob is not retained (P2)
    await deps.db.insert(s.sandboxDocumentVersions).values({
      sandboxDocumentId: updated!.id,
      content: updated!.content,
      createdByParticipantId: slice.participantId,
    });
    // T-451 — THE VERSION-LANDING EVENT (ADR-0059 decision 1). A new version of
    // this document has landed, so every app table pointed at it re-derives
    // now, as the person who just replaced the file. Never a poll; never fails
    // the upload — each table's receipt says what the import made of it.
    await importOnVersionLanding(deps.db, { sandboxDocumentId: updated!.id });
    return c.json(toSandboxDocument(updated!) satisfies SandboxDocument);
  });

  // "Open in editor": uploaded → authored, in place, the original preserved.
  app.post('/sandbox-documents/:id/conversion', documentScope, async (c) => {
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    if (doc!.origin !== 'uploaded') return invalid(c, 'already_authored');
    // still docx only, and PDF is a deliberate NO rather than an omission
    // (T-305): conversion makes a document editable, and a PDF is the record
    // rendition — ADR-0004's "never an editing surface". Its text is already
    // extracted for grounding at upload, which is the thing conversion would
    // have been reached for.
    if (doc!.format !== 'docx') return invalid(c, 'unsupported_conversion');
    // a checked-out head holds still for every format — conversion rewrites the
    // canonical content, so it is refused while locked (ADR-0032 addendum, T-180)
    if (doc!.headLocked) return c.json({ error: 'conflict', detail: 'head_locked' } satisfies ApiError, 409);
    const bytes = doc!.fileRef ? getBlob(doc!.fileRef) : null;
    const text = bytes ? docxToText(bytes) : null;
    if (text === null) return invalid(c, 'unreadable_file');
    const [updated] = await deps.db
      .update(s.sandboxDocuments)
      .set({
        origin: 'authored',
        format: 'infora_text',
        content: text,
        updatedAt: sql`now()`,
        // fileRef stays: the preserved original (ADR-0034's honest fidelity)
      })
      .where(eq(s.sandboxDocuments.id, doc!.id))
      .returning();
    return c.json(toSandboxDocument(updated!) satisfies SandboxDocument);
  });

  return app;
}
