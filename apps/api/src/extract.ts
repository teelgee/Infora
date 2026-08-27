// T-303 — one place that turns a document's bytes into the text the corpus
// grounds on, and one vocabulary for refusing to.
//
// The two callers want the same answer for different reasons, which is why
// this is a module rather than a branch inside either of them:
//
//   * **the sandbox upload** ([upload.ts](upload.ts)) extracts a PDF at the
//     door, because a PDF has no editor path to extract it later;
//   * **the bulk load** ([bulk-load.ts](bulk-load.ts)) extracts *everything* it
//     admits, because reference material is received, never authored, and so
//     never passes through conversion either.
//
// The difference between them is policy and stays with them: a sandbox docx
// keeps its text at `''` until someone opens it in the editor (ADR-0034), and
// the same docx loaded as reference material is extracted immediately. What is
// shared is the reading and the refusing.
//
// **The refusal vocabulary is the point of the file.** v1.md rules format
// coverage narrow — text-extractable only, an unsupported document failing
// **loudly and per-document**. A caller gets a reason it can put in front of a
// person, never a `null` it has to invent a sentence for, and never partial
// text. T-306 adds xlsx and pptx here, beside the refusals they currently earn.
import { inflateRawSync } from 'node:zlib';
import { pdfToText } from './pdf-text';

export type ExtractableFormat = 'docx' | 'xlsx' | 'pptx' | 'pdf';

export type Extraction =
  | { ok: true; text: string }
  /** a lower_snake code, carried to the surface by api-errors.ts */
  | { ok: false; reason: string };

/**
 * A document's grounding text, or a reason there is none.
 *
 * Empty text is a **refusal**, not a success: a document that yields nothing
 * would be admitted to the library, chunk to zero chunks, and sit there
 * answering nothing while looking loaded. That is the exact shape of the
 * failure v1.md's ruling is written against.
 */
export function extractText(format: ExtractableFormat, bytes: Buffer): Extraction {
  if (format === 'pdf') {
    const extracted = pdfToText(bytes);
    return extracted.ok ? { ok: true, text: extracted.text } : { ok: false, reason: extracted.reason };
  }
  if (format === 'docx') {
    const text = docxToText(bytes);
    if (text === null) return { ok: false, reason: 'unreadable_file' };
    if (!/\S/.test(text)) return { ok: false, reason: 'docx_no_text' };
    return { ok: true, text };
  }
  // T-306. Both formats upload today and neither converts, so they sit as
  // opaque blobs and never ground — which is why the refusal is named for the
  // format rather than folded into a generic "unsupported".
  return { ok: false, reason: format === 'xlsx' ? 'xlsx_not_extractable' : 'pptx_not_extractable' };
}

// ── A minimal zip reader (central directory walk) for docx extraction ──────
// Moved here from upload.ts by T-303, unchanged: it is format reach, and
// format reach now has a home. xlsx.ts carries its own copy deliberately —
// it also writes zips, and the two readers have different jobs.
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
