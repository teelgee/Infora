// T-306 — xlsx and pptx text extraction, and the refusal path that is half the
// ticket. Both formats uploaded before this and neither converted, so they sat
// in the sandbox as opaque blobs and never grounded.
//
// The property that matters most here is the **page separator**: a sheet and a
// slide are each a paginated unit, so both are rendered one-per-page with the
// form feed T-305 introduced, and the page locator T-271's span already derives
// works on all four formats with no new field. The tests below assert that
// mechanically — count the separators before an offset — because that is
// exactly what the store does.
import { describe, expect, it } from 'vitest';
import { extractText } from './extract';
import { PAGE_BREAK } from './pdf-text';
import { buildXlsx, zipStore } from './xlsx';
import { textToDocx, textToPdf } from './renditions';

/** the slide number a span at `at` sits on, derived exactly as the store does */
const pageAt = (text: string, at: number) =>
  text.slice(0, at).split(PAGE_BREAK).length;

// ── a minimal deck, built the way buildXlsx builds a workbook ───────────────
function buildPptx(slides: string[][][]): Buffer {
  const rels = slides
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="slide" Target="slides/slide${i + 1}.xml"/>`)
    .join('');
  const ids = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('');
  const entries = [
    {
      name: 'ppt/presentation.xml',
      data: Buffer.from(`<p:presentation><p:sldIdLst>${ids}</p:sldIdLst></p:presentation>`),
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: Buffer.from(`<Relationships>${rels}</Relationships>`),
    },
  ];
  slides.forEach((shapes, i) => {
    const body = shapes
      .map(
        (paragraphs) =>
          `<p:sp><p:txBody>${paragraphs
            .map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`)
            .join('')}</p:txBody></p:sp>`,
      )
      .join('');
    entries.push({
      name: `ppt/slides/slide${i + 1}.xml`,
      data: Buffer.from(`<p:sld><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`),
    });
  });
  return zipStore(entries);
}

describe('extractText — xlsx (T-306)', () => {
  const workbook = buildXlsx([
    {
      name: 'Consultation register',
      rows: [
        ['Reference', 'Respondent', 'Received'],
        ['WA-CON-001', 'Environment Agency', '12 March 2026'],
        ['WA-CON-002', 'Natural England', '19 March 2026'],
      ],
    },
    {
      name: 'Requirements',
      rows: [
        ['Number', 'Requirement'],
        ['R7', 'A three metre acoustic barrier at chainage 4+200'],
      ],
    },
  ]);

  it('reads every sheet, in tab order, as rows a reader recognises', () => {
    const result = extractText('xlsx', workbook);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // a row is a row, not a list of cell coordinates: "B14" is an Excel user's
    // address, and nobody cites a spreadsheet that way
    expect(result.text).toContain('WA-CON-001 | Environment Agency | 12 March 2026');
    expect(result.text).toContain('R7 | A three metre acoustic barrier at chainage 4+200');
    expect(result.text).not.toMatch(/\bA1:/);
  });

  it('makes the SHEET the page, so the existing locator addresses it', () => {
    const result = extractText('xlsx', workbook);
    if (!result.ok) throw new Error('workbook did not extract');
    expect([...result.text].filter((c) => c === PAGE_BREAK)).toHaveLength(2);
    expect(pageAt(result.text, result.text.indexOf('Environment Agency'))).toBe(1);
    expect(pageAt(result.text, result.text.indexOf('acoustic barrier'))).toBe(2);
    // the sheet names travel with their sheets, so the verbatim says where it is
    expect(result.text).toContain('Consultation register');
    expect(result.text).toContain('Requirements');
  });

  it('refuses a workbook with nothing to index rather than admitting an empty one', () => {
    // charts, formulas and blank grids: it would chunk to nothing and then sit
    // in the library answering nothing while the list said it was there
    expect(extractText('xlsx', buildXlsx([{ name: 'Chart', rows: [[''], ['']] }]))).toEqual({
      ok: false,
      reason: 'xlsx_no_text',
    });
  });

  it('refuses bytes that are not a workbook', () => {
    expect(extractText('xlsx', Buffer.from('PK, but not really'))).toEqual({
      ok: false,
      reason: 'unreadable_file',
    });
  });
});

describe('extractText — pptx (T-306)', () => {
  const deck = buildPptx([
    [['Wrenfield–Ashcombe 400kV'], ['Noise and vibration', 'Chapter 12 summary']],
    [['Assessment of effects'], ['R7 is 54 dB LAeq,16h', 'A significant adverse effect']],
    [['Mitigation'], ['A three metre acoustic barrier at chainage 4+200']],
  ]);

  it('reads every slide in presentation order, shape by shape', () => {
    const result = extractText('pptx', deck);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('Wrenfield–Ashcombe 400kV');
    expect(result.text).toContain('A significant adverse effect');
    // a title is not the first sentence of its own bullet list — the same
    // defect T-307 fixed in the chunker, arriving by a different route
    expect(result.text).toContain('Assessment of effects\nR7 is 54 dB LAeq,16h');
  });

  it('makes the SLIDE the page, which is what a citation into a deck names', () => {
    const result = extractText('pptx', deck);
    if (!result.ok) throw new Error('deck did not extract');
    expect([...result.text].filter((c) => c === PAGE_BREAK)).toHaveLength(3);
    expect(pageAt(result.text, result.text.indexOf('Chapter 12 summary'))).toBe(1);
    expect(pageAt(result.text, result.text.indexOf('54 dB'))).toBe(2);
    expect(pageAt(result.text, result.text.indexOf('acoustic barrier'))).toBe(3);
  });

  it('follows the presentation order, not the file names', () => {
    // a reordered deck still stores slide1.xml…slideN.xml in creation order,
    // and slide number is the locator — so it is the one thing not guessed
    const reordered = buildPptx([[['Third']], [['First']], [['Second']]]);
    const result = extractText('pptx', reordered);
    if (!result.ok) throw new Error('deck did not extract');
    expect(result.text).toBe(`Third${PAGE_BREAK}First${PAGE_BREAK}Second${PAGE_BREAK}`);
  });

  it('refuses a deck of images — the pptx form of a scanned PDF', () => {
    expect(extractText('pptx', buildPptx([[], []]))).toEqual({ ok: false, reason: 'pptx_no_text' });
  });

  it('refuses bytes that are not a deck', () => {
    expect(extractText('pptx', Buffer.from('not a deck'))).toEqual({
      ok: false,
      reason: 'unreadable_file',
    });
  });
});

describe('extractText — one vocabulary across four formats (T-303/T-305/T-306)', () => {
  it('reads a docx, and refuses an empty one', () => {
    const result = extractText('docx', textToDocx('The Inspectorate advises on adequacy.'));
    expect(result.ok && result.text).toContain('The Inspectorate advises on adequacy.');
    expect(extractText('docx', textToDocx(''))).toEqual({ ok: false, reason: 'docx_no_text' });
  });

  it('reads a PDF, page separators and all', () => {
    const result = extractText('pdf', textToPdf('Decision', 'Consent is granted.'));
    expect(result.ok && result.text).toContain('Consent is granted.');
    expect(result.ok && result.text.endsWith(PAGE_BREAK)).toBe(true);
  });

  it('every refusal is a named reason, never a bare null', () => {
    // the caller must be able to put it in front of a person; "could not read
    // it" and "this is a scan and Infora does not do OCR" are different
    // instructions, and only one is worth acting on
    const refusals = [
      extractText('docx', Buffer.from('nope')),
      extractText('xlsx', Buffer.from('nope')),
      extractText('pptx', Buffer.from('nope')),
      extractText('pdf', Buffer.from('nope')),
    ];
    for (const refusal of refusals) {
      expect(refusal.ok).toBe(false);
      if (!refusal.ok) expect(refusal.reason).toMatch(/^[a-z][a-z_]+$/);
    }
  });
});
