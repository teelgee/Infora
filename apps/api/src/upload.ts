// T-122 — upload to the sandbox + open-in-editor conversion (ADR-0034,
// contracts §4). An uploaded document keeps its native file as canonical
// (origin 'uploaded'; Infora views, promotes and reviews it but does not
// edit it); "open in editor" converts to authored IN PLACE, deliberately —
// the extracted text becomes the canonical source, the original file stays
// on the row (file_ref) as the preserved original, and fidelity is honest:
// complex Word formatting simplifies. docx converts; xlsx/pptx do not
// pretend to (400 unsupported_conversion).
import { inflateRawSync } from 'node:zlib';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, sql } from 'drizzle-orm';
import type { ApiError, SandboxDocument } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { putBlob, getBlob } from './renditions';
import { ensureDefaultSandbox } from './sandbox';
import { projectScope, resourceHomes, resourceScope } from './requester';
import type { AppEnv } from './requester';
import { toSandboxDocument } from './sandbox';

const invalid = (c: Context, detail?: string) =>
  c.json({ error: 'invalid', ...(detail && { detail }) } satisfies ApiError, 400);

const formats = { docx: 'docx', xlsx: 'xlsx', pptx: 'pptx' } as const;

// ── A minimal zip reader (central directory walk) for docx extraction ──────
function unzipEntry(zip: Buffer, wanted: string): Buffer | null {
  // find end-of-central-directory
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 65536; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name === wanted) {
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const payload = zip.subarray(dataStart, dataStart + compressedSize);
      return method === 8 ? inflateRawSync(payload) : Buffer.from(payload);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/** docx → plain text: paragraphs from word/document.xml, tags stripped. */
export function docxToText(bytes: Buffer): string | null {
  const documentXml = unzipEntry(bytes, 'word/document.xml');
  if (!documentXml) return null;
  const xml = documentXml.toString('utf8');
  return xml
    .replace(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g, (p) => `${p}\n`)
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
        content: '', // the native file is canonical (ADR-0034); T-122 keeps
        // content NOT NULL as '' until the format decision's relaxation
        fileRef,
        createdByParticipantId: slice.participantId,
      })
      .returning();
    return c.json(toSandboxDocument(doc!), 201);
  });

  // "Open in editor": uploaded → authored, in place, the original preserved.
  app.post('/sandbox-documents/:id/conversion', documentScope, async (c) => {
    const [doc] = await deps.db
      .select()
      .from(s.sandboxDocuments)
      .where(eq(s.sandboxDocuments.id, c.req.param('id')))
      .limit(1);
    if (doc!.origin !== 'uploaded') return invalid(c, 'already_authored');
    if (doc!.format !== 'docx') return invalid(c, 'unsupported_conversion');
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
