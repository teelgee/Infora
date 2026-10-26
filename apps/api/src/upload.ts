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
import { sandboxUploadFields } from '@infora/contracts';
import type { ApiError, SandboxDocument } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { putBlob, getBlob, mimeTypes } from './renditions';
import { docxToText } from './extract';
import { extractOnUpload, landFileRevision, uploadFormats } from './file-revision';
import { releaseLapsedEngineLock } from './engine-lock';
import { importOnVersionLanding } from './app-table-source';
import { admittedSandbox, ensureDefaultSandbox, folderInSandbox } from './sandbox';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';
import { toSandboxDocument } from './sandbox';

const invalid = (c: Context, detail?: string) =>
  c.json({ error: 'invalid', ...(detail && { detail }) } satisfies ApiError, 400);

const formats = uploadFormats;

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
    // T-477 — an upload lands where the person was: the sandbox and folder they
    // had selected. Named, it takes the SAME admission as creating a document in
    // that sandbox (`admittedSandbox`), and a folder must belong to it; either
    // refusal is the plain 404 of absence, so a stranger learns nothing. Neither
    // named: the organisation's default sandbox, as before. Checked before the
    // bytes are read, so a refused upload costs nothing.
    const fields = sandboxUploadFields.safeParse({
      sandboxId: typeof body?.sandboxId === 'string' && body.sandboxId !== '' ? body.sandboxId : undefined,
      folderId: typeof body?.folderId === 'string' && body.folderId !== '' ? body.folderId : undefined,
    });
    if (!fields.success) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    let sandboxId: string;
    if (fields.data.sandboxId) {
      const sandbox = await admittedSandbox(deps.db, slice, fields.data.sandboxId);
      if (!sandbox) return c.json({ error: 'not_found' } satisfies ApiError, 404);
      sandboxId = sandbox.id;
    } else {
      sandboxId = await ensureDefaultSandbox(deps.db, slice.projectId, slice.organisationId, slice.participantId);
    }
    if (fields.data.folderId && !(await folderInSandbox(deps.db, fields.data.folderId, sandboxId))) {
      return c.json({ error: 'not_found' } satisfies ApiError, 404);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    // refused before anything is written: a document that cannot ground is not
    // quietly parked in the sandbox as an opaque blob (T-305)
    const extracted = extractOnUpload(format, bytes);
    if (!extracted.ok) return invalid(c, extracted.detail);
    const fileRef = putBlob(bytes, format);
    const [doc] = await deps.db
      .insert(s.sandboxDocuments)
      .values({
        projectId: slice.projectId,
        organisationId: slice.organisationId,
        sandboxId,
        folderId: fields.data.folderId ?? null,
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
      // T-453 — v0.1 keeps the file it was (migration 0070)
      fileRef,
      createdByParticipantId: slice.participantId,
    });
    return c.json(toSandboxDocument(doc!), 201);
  });

  // T-488 (walk defect 12) — DOWNLOAD the document's file from the working area.
  //
  // *In plain terms: a spreadsheet or a Word file someone uploaded can be
  // taken back out, as the file, with its own name.*
  //
  // 🔒 The access check is `documentScope` — the very middleware the open and
  // read of this document run — so whoever is refused there (another
  // organisation's people, anyone outside the working area's grants) is refused
  // here with the same plain 404, and nobody learns the document exists. The
  // bytes are the document's CURRENT file (`file_ref`, which every replace and
  // every editor save moves forward); an authored document has no file of its
  // own (its original, if any, is kept for fidelity, not as the current text),
  // so it is a 404 as well.
  app.get('/sandbox-documents/:id/file', documentScope, async (c) => {
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    if (!doc || doc.origin !== 'uploaded' || !doc.fileRef) {
      return c.json({ error: 'not_found' } satisfies ApiError, 404);
    }
    const bytes = getBlob(doc.fileRef);
    if (!bytes) return c.json({ error: 'not_found' } satisfies ApiError, 404);
    const name = `${doc.title.replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim() || 'document'}.${doc.format}`;
    // an ASCII fallback for old clients, and the real name in the RFC 5987 form
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    const contentType =
      doc.format in mimeTypes ? mimeTypes[doc.format as keyof typeof mimeTypes] : 'application/octet-stream';
    return c.body(new Uint8Array(bytes), 200, {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  });

  // T-220 — replace the canonical native file (ADR-0043 P1). An uploaded
  // document keeps its native file canonical (ADR-0034); this swaps that file
  // for a new upload of the SAME format family — a new blob + file_ref — and
  // bumps the working revision with an ambient snapshot. Refused while checked
  // out (409 head_locked): it rewrites canonical bytes, like the T-122
  // conversion. Only an 'uploaded' document has a native file to replace.
  // T-453 (P2) — the prior blob is now retained on its working revision, and
  // the landing itself is `landFileRevision`, shared with the WOPI host's save.
  app.post('/sandbox-documents/:id/file', documentScope, async (c) => {
    const slice = c.get('slice');
    // an editing engine's lock that lapsed is released before it can refuse
    await releaseLapsedEngineLock(deps.db, c.req.param('id'));
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
    const landed = await landFileRevision(deps.db, doc!, bytes, slice.participantId);
    if (!landed.ok) return invalid(c, landed.detail);
    // T-451 — THE VERSION-LANDING EVENT (ADR-0059 decision 1), fired after the
    // revision is committed: every app table pointed at this document
    // re-derives now, as the person who just replaced the file. Never a poll;
    // never fails the upload — each table's receipt says what the import made
    // of it. (Reconciled with office-editing in review 2026-10-18: the replace
    // logic moved into landFileRevision, and the editor's saves fire the same
    // event from the WOPI route.)
    // T-488 — the same file as the one already held is no new version: nothing landed
    if (!landed.unchanged) await importOnVersionLanding(deps.db, { sandboxDocumentId: doc!.id });
    return c.json(toSandboxDocument(landed.doc) satisfies SandboxDocument);
  });

  // "Open in editor": uploaded → authored, in place, the original preserved.
  app.post('/sandbox-documents/:id/conversion', documentScope, async (c) => {
    await releaseLapsedEngineLock(deps.db, c.req.param('id'));
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
