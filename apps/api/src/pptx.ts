// T-306 — a minimal .pptx reader, in the spirit of upload.ts's zip reader and
// xlsx.ts's workbook reader: what is needed is the text of each slide in
// presentation order, which does not justify a deck-parsing dependency.
//
// **Slide order comes from the rels, not from the file names.** A deck whose
// slides have been reordered still stores them as `slide1.xml`…`slideN.xml` in
// whatever order they were first created; `ppt/presentation.xml` holds the
// running order. Reading the directory would silently renumber a reordered
// deck, and slide number is the locator a citation into a deck resolves to —
// so it is the one thing that must not be guessed.
//
// **Shapes are the unit within a slide, and that is deliberate.** A slide is a
// title placeholder, a body placeholder and whatever else was dropped on it;
// running them together makes a title read as the first sentence of its own
// bullet list, which is the same defect T-307 fixed in the chunker. So each
// shape's paragraphs are emitted as their own lines.
//
// **Speaker notes are NOT read.** They live in `ppt/notesSlides/` and are the
// presenter's private script rather than the document — a deck issued as a
// deliverable is what is on the slides. Reading them would put words in the
// corpus that nobody in the room ever saw.
import { unzipEntry } from './zip';

export type Slide = { blocks: string[] };

/** Slide parts in presentation order, resolved through the presentation rels. */
function slideParts(bytes: Buffer): Buffer[] {
  const presentation = unzipEntry(bytes, 'ppt/presentation.xml')?.toString('utf8');
  const rels = unzipEntry(bytes, 'ppt/_rels/presentation.xml.rels')?.toString('utf8');
  const parts: Buffer[] = [];
  for (const ref of presentation?.matchAll(/<p:sldId\s[^>]*r:id="([^"]+)"[^>]*\/?>/g) ?? []) {
    const target = rels
      ?.match(new RegExp(`<Relationship\\s[^>]*Id="${ref[1]}"[^>]*/?>`))?.[0]
      ?.match(/Target="([^"]+)"/)?.[1];
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `ppt/${target.replace(/^\.\.\//, '')}`;
    const xml = unzipEntry(bytes, path);
    if (xml) parts.push(xml);
  }
  if (parts.length > 0) return parts;
  // no readable rels: fall back to the file-name convention, in numeric order.
  // It is right for a deck nobody has reordered and wrong for one that has —
  // which is why it is the fallback and not the method.
  for (let n = 1; n <= 500; n++) {
    const xml = unzipEntry(bytes, `ppt/slides/slide${n}.xml`);
    if (!xml) break;
    parts.push(xml);
  }
  return parts;
}

const unescapeXml = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');

/** One slide's text, one entry per shape paragraph, in document order. */
function slideText(xml: Buffer): Slide {
  const source = xml.toString('utf8');
  const blocks: string[] = [];
  // `<p:sp>` is a shape — a placeholder, a text box, a table cell's parent. Its
  // `<a:p>` paragraphs are the lines a reader sees.
  for (const shape of source.matchAll(/<p:(?:sp|graphicFrame)\b[\s\S]*?<\/p:(?:sp|graphicFrame)>/g)) {
    const lines: string[] = [];
    for (const paragraph of shape[0].matchAll(/<a:p\b[\s\S]*?<\/a:p>|<a:p\s*\/>/g)) {
      const runs = [...paragraph[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)];
      const line = runs.map((run) => unescapeXml(run[1]!)).join('').trim();
      if (line !== '') lines.push(line);
    }
    if (lines.length > 0) blocks.push(lines.join('\n'));
  }
  return { blocks };
}

/**
 * A deck's slides, in presentation order. `null` when the bytes are not a
 * readable presentation — which the caller turns into a refusal, never into
 * an empty document quietly admitted to the corpus.
 */
export function parsePptx(bytes: Buffer): Slide[] | null {
  const parts = slideParts(bytes);
  if (parts.length === 0) return null;
  return parts.map(slideText);
}
