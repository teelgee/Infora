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
// text.
//
// **T-306 brought xlsx and pptx in, and both use T-305's page separator.** A
// sheet and a slide are each a paginated unit — the thing a reader names when
// they say where something is — so both are rendered one-per-page with a form
// feed between, and the page locator T-271's span already derives works on
// them unchanged. Four formats now share one locator mechanism and one
// vocabulary of refusal, which is what "format reach" was supposed to mean.
import { PAGE_BREAK, pdfToText } from './pdf-text';
import { unzipEntry } from './zip';
import { parsePptx } from './pptx';
import { parseXlsxSheets } from './xlsx';

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
 *
 * T-472 — there is exactly ONE place a textless file is admitted anyway, and it
 * is not here: the reference-material intake (ADR-0011's addendum of
 * 2026-10-24) takes this refusal's reason, stores it as the file's text status,
 * and — if a person confirms — admits the file with its version marked
 * `not_citable`, so it is held and openable and no run can read or cite it. The
 * sandbox upload, the bulk load and every other caller keep refusing.
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
  if (format === 'xlsx') return extractWorkbook(bytes);
  return extractDeck(bytes);
}

/**
 * T-306 — a workbook as text: **one sheet per page**, its name as the first
 * line, its rows pipe-joined beneath.
 *
 * The separator is the form feed T-305 introduced for PDF pages, so the sheet
 * index falls straight out of the locator machinery that already exists —
 * *count the separators before the span* — with no new field and no new
 * derivation. That is the whole reason a sheet is rendered as a page rather
 * than as a heading: the locator was already there.
 *
 * **Rows are rendered as rows, not as cells.** `A1: Reference / B1: Respondent`
 * embeds as coordinates rather than as meaning, and nobody cites a spreadsheet
 * by cell — a planner cites *"the consultation register, the Environment
 * Agency's row"*, which is the row's own text. So the row IS the passage, and
 * the verbatim a citation carries is a line a reader recognises. **Cell-grain
 * addressing is not delivered and is not half-delivered:** it needs a locator
 * that is a coordinate rather than a count, which is a different mechanism.
 */
function extractWorkbook(bytes: Buffer): Extraction {
  const sheets = parseXlsxSheets(bytes);
  if (sheets === null) return { ok: false, reason: 'unreadable_file' };
  let text = '';
  let cells = 0;
  for (const sheet of sheets) {
    const lines = sheet.rows
      .map((row) => row.map((cell) => cell.replace(/\s+/g, ' ')).join(' | ').replace(/(?: \| )+$/, ''))
      .filter((line) => line.trim() !== '');
    cells += lines.length;
    const heading = sheet.name === '' ? '' : `${sheet.name}\n`;
    text += `${heading}${lines.join('\n')}${PAGE_BREAK}`;
  }
  // A workbook of formulas, charts and blank grids has no text to index, and
  // is refused whole rather than admitted as a document that answers nothing
  // while the list says it is there.
  //
  // The count is of ROWS, not of characters: a workbook always has tab names,
  // so "is there any non-whitespace" would pass a chart-only file on the
  // strength of the word "Chart" and put a meaningless chunk in the corpus.
  if (cells === 0) return { ok: false, reason: 'xlsx_no_text' };
  return { ok: true, text };
}

/**
 * T-306 — a deck as text: **one slide per page**, each shape's paragraphs on
 * their own lines.
 *
 * Same trick as the workbook, and a better fit: a slide genuinely *is* a page,
 * so `page` is the slide number with nothing lost in translation. Shapes stay
 * apart because running a title into its own bullet list makes the title read
 * as the first sentence of the body — the same defect T-307 fixed in the
 * chunker, arriving by a different route.
 */
function extractDeck(bytes: Buffer): Extraction {
  const slides = parsePptx(bytes);
  if (slides === null) return { ok: false, reason: 'unreadable_file' };
  let text = '';
  for (const slide of slides) text += `${slide.blocks.join('\n')}${PAGE_BREAK}`;
  // a deck of images — a photo report, a scanned set of boards — has no text
  // layer, and is the pptx form of the scanned PDF the V1 ruling names
  if (!/\S/.test(text)) return { ok: false, reason: 'pptx_no_text' };
  return { ok: true, text };
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
