// T-305 — the PDF reader. Two kinds of case, and both matter:
//
//   * **structure** — hand-built files that isolate one feature each (a flate
//     content stream, an object stream, a two-byte ToUnicode CMap), so a
//     failure names the thing that broke; and
//   * **a real document** — `fixtures/chapter-12-noise.pdf`, printed by a
//     browser, with compressed streams, subset Type0 fonts and per-glyph
//     positioning. Reading only our own `textToPdf` output back would prove
//     the reader agrees with the writer and nothing about a client's corpus.
//
// The refusals are tested as hard as the successes. v1.md requires an
// unsupported document to fail loudly and per-document, and the failure that
// costs money is the quiet one: a corpus that answers confidently out of the
// pages it happened to decode.
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_BREAK, pdfToText } from './pdf-text';
import { textToPdf } from './renditions';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'chapter-12-noise.pdf');

// ── A minimal PDF builder, for the structural cases ────────────────────────
// The reader sweeps the file for objects rather than following the
// cross-reference table, so these files carry a trailer and no xref — which is
// also a case worth having: real exports arrive with broken tables.
function buildPdf(objects: Array<Buffer | string>, trailer = '<< /Root 1 0 R >>'): Buffer {
  const parts: Buffer[] = [Buffer.from('%PDF-1.7\n')];
  objects.forEach((object, at) => {
    parts.push(Buffer.from(`${at + 1} 0 obj\n`));
    parts.push(Buffer.isBuffer(object) ? object : Buffer.from(object));
    parts.push(Buffer.from('\nendobj\n'));
  });
  parts.push(Buffer.from(`trailer\n${trailer}\n%%EOF\n`));
  return Buffer.concat(parts);
}

const stream = (dict: string, data: Buffer): Buffer =>
  Buffer.concat([
    Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`),
    data,
    Buffer.from('\nendstream'),
  ]);

/** catalog, page tree and one page, around a caller-supplied content stream */
function onePagePdf(content: Buffer, extras: { font?: string; filter?: string } = {}): Buffer {
  const font = extras.font ?? '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    stream(extras.filter ?? '', content),
    font,
  ]);
}

const show = (text: string) => Buffer.from(`BT /F1 12 Tf 50 700 Td (${text}) Tj ET\n`);

describe('pdfToText — reading a real document', () => {
  const result = pdfToText(readFileSync(FIXTURE));

  it('extracts the text of every page', () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages).toBe(3);
    expect(result.text).toContain('Survey points were selected in accordance');
    expect(result.text).toContain('a three metre acoustic barrier');
  });

  it('reads glyphs the producer positioned one at a time as words', () => {
    // the browser places each glyph with its own pen move; without the font's
    // advance widths this reads "t h e a s s e s s m e n t"
    if (!result.ok) throw new Error('fixture did not extract');
    expect(result.text).toContain('The predicted daytime level at receptor R7 is 54 dB LAeq,16h');
    expect(result.text).not.toMatch(/\ba s s e s s\b/);
  });

  it('terminates every page with a form feed — the page locator’s raw material', () => {
    if (!result.ok) throw new Error('fixture did not extract');
    const breaks = [...result.text].filter((c) => c === PAGE_BREAK).length;
    expect(breaks).toBe(result.pages);
    // and the count before an offset is that offset's page, one-based
    const at = result.text.indexOf('Mitigation is proposed at chainage');
    const page = result.text.slice(0, at).split(PAGE_BREAK).length;
    expect(page).toBe(3);
  });
});

describe('pdfToText — structure', () => {
  it('round-trips the renditions writer, page boundaries included', () => {
    const body = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of the noise chapter.`);
    const result = pdfToText(textToPdf('Chapter 12 Noise', body.join('\n')));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages).toBeGreaterThan(1);
    expect([...result.text].filter((c) => c === PAGE_BREAK).length).toBe(result.pages);
    expect(result.text).toContain('Line 1 of the noise chapter.');
    expect(result.text).toContain('Line 120 of the noise chapter.');
  });

  it('inflates a compressed content stream', () => {
    const pdf = onePagePdf(deflateSync(show('Consultee response from the Environment Agency.')), {
      filter: '/Filter /FlateDecode',
    });
    const result = pdfToText(pdf);
    expect(result.ok && result.text).toContain('Consultee response from the Environment Agency.');
  });

  it('reads objects that live inside an object stream (PDF 1.5+)', () => {
    const inner = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    ];
    const offsets: number[] = [];
    let body = '';
    for (const object of inner) {
      offsets.push(body.length);
      body += `${object} `;
    }
    const header = [1, 2, 3].map((num, at) => `${num} ${offsets[at]}`).join(' ');
    const packed = deflateSync(Buffer.from(`${header} ${body}`));
    const pdf = buildPdf([
      '<< /Placeholder true >>', // object 1 lives in the ObjStm, not here
      '<< /Placeholder true >>',
      '<< /Placeholder true >>',
      stream('', show('Decision Letter issued 14 March.')),
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      stream(
        `/Type /ObjStm /N 3 /First ${header.length + 1} /Filter /FlateDecode`,
        packed,
      ),
    ]);
    const result = pdfToText(pdf);
    expect(result.ok && result.text).toContain('Decision Letter issued 14 March.');
  });

  it('maps two-byte codes through a ToUnicode CMap', () => {
    const cmap = Buffer.from(`/CIDInit /ProcSet findresource begin
1 begincodespacerange <0000> <FFFF> endcodespacerange
2 beginbfchar <0003> <0052> <0004> <0037> endbfchar
1 beginbfrange <0010> <0012> <0061> endbfrange
endcmap end`);
    const font = `<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Georgia /ToUnicode 6 0 R
      /DescendantFonts [<< /Type /Font /Subtype /CIDFontType2 /DW 500 >>] >>`;
    const pdf = buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      stream('', Buffer.from('BT /F1 12 Tf 50 700 Td <00030004001000110012> Tj ET\n')),
      font,
      stream('', cmap),
    ]);
    const result = pdfToText(pdf);
    expect(result.ok && result.text).toBe(`R7abc${PAGE_BREAK}`);
  });
});

describe('pdfToText — the refusals, which are loud and per-document', () => {
  it('refuses something that is not a PDF at all', () => {
    expect(pdfToText(Buffer.from('PK a docx, actually'))).toEqual({
      ok: false,
      reason: 'pdf_unreadable',
    });
  });

  it('refuses an encrypted document rather than guessing at it', () => {
    const pdf = buildPdf(
      [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>',
        stream('', show('Commercially confidential.')),
      ],
      '<< /Root 1 0 R /Encrypt 9 0 R >>',
    );
    expect(pdfToText(pdf)).toEqual({ ok: false, reason: 'pdf_encrypted' });
  });

  it('refuses the whole document when one content stream will not decode', () => {
    // the failure this prevents is the quiet one: two readable pages indexed
    // and a third dropped, leaving a corpus confident about a document it has
    // only partly seen
    const pdf = onePagePdf(Buffer.from('nonsense'), { filter: '/Filter /LZWDecode' });
    expect(pdfToText(pdf)).toEqual({ ok: false, reason: 'pdf_unsupported_filter' });
  });

  it('refuses a scanned page — the case the V1 ruling names', () => {
    // a page that is a picture of a document: it has size and pages, and no
    // text layer. OCR is out of V1, so this is a refusal, not an attempt.
    const pdf = buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
      stream('', Buffer.from('q 595 0 0 842 0 0 cm /Im0 Do Q\n')),
      stream(
        '/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode',
        Buffer.alloc(64, 0xff),
      ),
    ]);
    expect(pdfToText(pdf)).toEqual({ ok: false, reason: 'pdf_no_text' });
  });

  it('refuses text it cannot read back, rather than emitting glyph ids', () => {
    // a subset font with no ToUnicode: the bytes are indexes into an embedded
    // subset and mean nothing outside it
    const font =
      '<< /Type /Font /Subtype /Type0 /BaseFont /BCDEEE+Calibri /DescendantFonts [<< /DW 500 >>] >>';
    const pdf = buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      stream('', Buffer.from('BT /F1 12 Tf 50 700 Td <00030004000500060007> Tj ET\n')),
      font,
    ]);
    expect(pdfToText(pdf)).toEqual({ ok: false, reason: 'pdf_no_text' });
  });
});
