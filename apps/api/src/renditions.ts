// T-121 — renditions (ADR-0004/0034, contracts §4): stored, immutable,
// one-way exports per Version. Authored documents generate their native docx
// and the review-and-record PDF at promotion; an uploaded document's native
// rendition IS its file (T-122), with office→PDF conversion deferred to the
// infra session's converter. The blob substrate is a dev directory
// (INFORA_BLOB_DIR, default .blobs/) — real object storage is the infra
// session's decision; content_ref stays a pointer either way.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ApiError, ListRenditionsResponse, Rendition } from '@infora/contracts';
import { schema as s } from '@infora/db';
import type { Db } from '@infora/db';
import { resolveSlice } from './requester';
import type { AppEnv } from './requester';

const notFound = (c: Context) => c.json({ error: 'not_found' } satisfies ApiError, 404);
const isUuid = (value: string) => z.uuid().safeParse(value).success;

// ── The dev blob substrate ─────────────────────────────────────────────────
const blobDir = () => process.env.INFORA_BLOB_DIR ?? join(process.cwd(), '.blobs');

export function putBlob(bytes: Buffer, extension: string): string {
  mkdirSync(blobDir(), { recursive: true });
  const name = `${randomUUID()}.${extension}`;
  writeFileSync(join(blobDir(), name), bytes);
  return `blob:${name}`;
}

/**
 * T-340 — erase a blob. The dev substrate is a directory, so this is an
 * `unlink`; the **object-store** version is the seam the ticket names and
 * cannot close: S3 versioning is on (ADR-0047 §3), a delete writes a
 * delete-marker rather than erasing, and real erasure needs a version-level
 * purge. That belongs with Slice V1-I, which is parked, so this function is
 * where it goes and the ticket says so rather than implying it is done.
 *
 * A missing file is not an error: purge is idempotent by intent, and a blob
 * already gone is the state purge is trying to reach.
 */
export function deleteBlob(contentRef: string): void {
  if (!contentRef.startsWith('blob:')) return;
  const name = contentRef.slice('blob:'.length);
  if (name.includes('/') || name.includes('..')) return;
  try {
    rmSync(join(blobDir(), name), { force: true });
  } catch {
    // an unreferenced file left on disk is named in the purge record's counts
  }
}

export function getBlob(contentRef: string): Buffer | null {
  if (!contentRef.startsWith('blob:')) return null;
  const name = contentRef.slice('blob:'.length);
  if (name.includes('/') || name.includes('..')) return null;
  try {
    return readFileSync(join(blobDir(), name));
  } catch {
    return null;
  }
}

// ── A minimal, valid single-stream PDF (no dependencies) ───────────────────
// The review-and-record rendition (ADR-0004): real enough for any viewer;
// typography is the infra session's converter's job, not the record's.
export function textToPdf(title: string, text: string): Buffer {
  const escape = (line: string) => line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const wrapped: string[] = [];
  for (const raw of `${title}\n\n${text}`.split('\n')) {
    let line = raw;
    while (line.length > 92) {
      const cut = line.lastIndexOf(' ', 92);
      const at = cut > 40 ? cut : 92;
      wrapped.push(line.slice(0, at));
      line = line.slice(at).trimStart();
    }
    wrapped.push(line);
  }
  const linesPerPage = 54;
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) pages.push(wrapped.slice(i, i + linesPerPage));
  if (pages.length === 0) pages.push(['']);

  const objects: string[] = [];
  const pageObjectIds = pages.map((_, i) => 4 + i * 2);
  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`,
  );
  objects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  pages.forEach((pageLines, i) => {
    const content = [
      'BT',
      '/F1 10 Tf',
      '50 780 Td',
      '12 TL',
      ...pageLines.map((line) => `(${escape(line)}) Tj T*`),
      'ET',
    ].join('\n');
    objects.push(
      `${4 + i * 2} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>\nendobj\n`,
    );
    objects.push(`${5 + i * 2} 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xrefStart = Buffer.byteLength(body);
  const count = objects.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `${xref}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body, 'binary');
}

// ── A minimal, valid docx (a zip of OOXML parts; no dependencies) ──────────
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const deflated = deflateRawSync(data);
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10); // dos time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 30);
    central.writeUInt16LE(0, 34); // disk/attrs spread over next fields (zeroed)
    central.writeUInt32LE(0, 36);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const xmlEscape = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function textToDocx(text: string): Buffer {
  const paragraphs = text
    .split('\n')
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`)
    .join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rels) },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
  ]);
}

// ── Generation at promotion (called inside T-120's flow) ───────────────────
export async function generateRenditions(
  db: Db,
  version: { id: string; content: string },
  doc: { title: string; origin: 'authored' | 'uploaded'; format: string; fileRef: string | null },
): Promise<void> {
  if (doc.origin === 'uploaded') {
    // the native rendition IS the uploaded file; office→PDF conversion is
    // the infra session's converter (deliberately absent on the dev substrate)
    if (doc.fileRef) {
      await db.insert(s.renditions).values({
        versionId: version.id,
        kind: 'native',
        // T-305 — an uploaded PDF's native rendition is the PDF itself, and
        // it is deliberately still `native` rather than `pdf`: the `pdf` kind
        // means the rendition Infora GENERATED as the review-and-record copy
        // (ADR-0004), which is not what a client's own file is
        format: doc.format as 'docx' | 'xlsx' | 'pptx' | 'pdf',
        contentRef: doc.fileRef,
      });
    }
    return;
  }
  const pdfRef = putBlob(textToPdf(doc.title, version.content), 'pdf');
  const docxRef = putBlob(textToDocx(version.content), 'docx');
  await db.insert(s.renditions).values([
    { versionId: version.id, kind: 'pdf', format: 'pdf', contentRef: pdfRef },
    { versionId: version.id, kind: 'native', format: 'docx', contentRef: docxRef },
  ]);
}

const mimeTypes = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

export function renditionRoutes(deps: { db: Db }) {
  const app = new Hono<AppEnv>();

  async function versionScope(c: Context, versionId: string) {
    if (!isUuid(versionId)) return null;
    const [row] = await deps.db
      .select({ version: s.versions, container: s.containers })
      .from(s.versions)
      .innerJoin(s.containers, eq(s.versions.containerId, s.containers.id))
      .where(eq(s.versions.id, versionId))
      .limit(1);
    if (!row) return null;
    const slice = await resolveSlice(deps.db, c.get('user'), row.container.projectId);
    if (!slice) return null;
    // producer | owner | live share, and freeze-series versions stay org-private
    const { container } = row;
    if (container.scope === 'sandbox') {
      if (container.producingOrganisationId !== slice.organisationId) return null;
      return row;
    }
    if (container.producingOrganisationId === slice.organisationId) return row;
    const [project] = await deps.db
      .select({ ownerOrganisationId: s.projects.ownerOrganisationId })
      .from(s.projects)
      .where(eq(s.projects.id, container.projectId))
      .limit(1);
    if (project?.ownerOrganisationId === slice.organisationId) return row;
    const [share] = await deps.db
      .select({ id: s.deliverableShares.id })
      .from(s.deliverableShares)
      .where(
        and(
          eq(s.deliverableShares.containerId, container.id),
          eq(s.deliverableShares.organisationId, slice.organisationId),
          isNull(s.deliverableShares.revokedAt),
        ),
      )
      .limit(1);
    if (!share) return null;
    // ADR-0035 §4/§5: a shared organisation may download the rendition only
    // once it has acknowledged the deliverable's CURRENT version (organisation
    // grain — the same gate as the version read, so a superseded rendition
    // resolves whenever the org is currently entitled) and if the Participant is
    // within any narrowing present (participant grain).
    const [ack] = await deps.db
      .select({ id: s.deliverableAcknowledgements.id })
      .from(s.deliverableAcknowledgements)
      .innerJoin(s.versions, eq(s.versions.id, s.deliverableAcknowledgements.versionId))
      .where(
        and(
          eq(s.deliverableAcknowledgements.containerId, container.id),
          eq(s.deliverableAcknowledgements.organisationId, slice.organisationId),
          eq(s.versions.containerId, container.id),
          eq(s.versions.isCurrent, true),
        ),
      )
      .limit(1);
    if (!ack) return null;
    const grants = await deps.db
      .select({ participantId: s.deliverableParticipantGrants.participantId })
      .from(s.deliverableParticipantGrants)
      .where(
        and(
          eq(s.deliverableParticipantGrants.containerId, container.id),
          eq(s.deliverableParticipantGrants.organisationId, slice.organisationId),
          isNull(s.deliverableParticipantGrants.revokedAt),
        ),
      );
    if (grants.length > 0 && !grants.some((g) => g.participantId === slice.participantId)) {
      return null;
    }
    return row;
  }

  app.get('/versions/:versionId/renditions', async (c) => {
    const scope = await versionScope(c, c.req.param('versionId'));
    if (!scope) return notFound(c);
    const rows = await deps.db
      .select()
      .from(s.renditions)
      .where(eq(s.renditions.versionId, scope.version.id));
    const items: Rendition[] = rows.map((r) => ({
      id: r.id,
      versionId: r.versionId,
      kind: r.kind,
      format: r.format,
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json({ items } satisfies ListRenditionsResponse);
  });

  app.get('/renditions/:renditionId/file', async (c) => {
    const renditionId = c.req.param('renditionId');
    if (!isUuid(renditionId)) return notFound(c);
    const [rendition] = await deps.db
      .select()
      .from(s.renditions)
      .where(eq(s.renditions.id, renditionId))
      .limit(1);
    if (!rendition) return notFound(c);
    const scope = await versionScope(c, rendition.versionId);
    if (!scope) return notFound(c);
    const bytes = getBlob(rendition.contentRef);
    if (!bytes) return notFound(c);
    return c.body(new Uint8Array(bytes), 200, {
      'content-type': mimeTypes[rendition.format],
      'content-disposition': `attachment; filename="${scope.container.documentReference ?? 'document'}-${scope.version.versionReference}.${rendition.format}"`,
    });
  });

  return app;
}
