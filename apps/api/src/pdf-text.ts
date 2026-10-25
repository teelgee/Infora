// T-305 — PDF text extraction: the INPUT side of a format this codebase only
// ever wrote. `renditions.ts` renders text into a PDF (`textToPdf`); nothing
// read one back, so a corpus that is overwhelmingly PDF — issued deliverables,
// Advice Notes, Decision Letters, consultee responses — could not ground at all.
//
// **Page is the point.** T-271 stored a character span on every chunk and
// derives the view from it (spike-locators.md: *store the position, compute the
// view*). Paragraph is "newlines before the span"; page is the same trick with a
// different separator, so this extractor emits a **form feed (`\f`) after every
// page**. That single convention is the whole schema change — there isn't one.
// A docx contains no page boundaries and so emits no `\f`, which is why a Word
// source still reports no page rather than an invented one.
//
// **Hand-written, in the spirit of `upload.ts`'s zip reader and `xlsx.ts`'s
// workbook reader.** What is needed is text and page boundaries out of the
// text-extractable subset — not rendering, not layout, not OCR — and that does
// not justify taking a rendering engine into a deployable that is meant to run
// in a sovereign tier. The spike called a PDF extractor "a real dependency";
// this is the same judgement the two readers above already made twice.
//
// **Every failure is loud and per-document** (v1.md's format ruling). This
// function never returns partial text: a stream it cannot decode, a file it
// cannot parse, an encrypted document, and — the case the ruling names — a
// *scanned* PDF with no text layer are all refusals carrying a reason the
// caller can put in front of a person. Half a document indexed silently is the
// failure mode the ruling exists to prevent.
import { inflateSync, inflateRawSync } from 'node:zlib';
import { UPLOAD_MAX_BYTES } from '@infora/contracts';

/** The page separator inside `versions.content`; page = the count before a span, + 1. */
export const PAGE_BREAK = '\f';

export type PdfRefusalReason =
  /** not a PDF, or structurally broken beyond the point of an honest read */
  | 'pdf_unreadable'
  /** password/permissions encryption — decryption is not this ticket's business */
  | 'pdf_encrypted'
  /** a content stream compressed with a filter this reader does not implement */
  | 'pdf_unsupported_filter'
  /** the ruling's case: a scanned page image, with no text layer to extract */
  | 'pdf_no_text';

export type PdfExtraction =
  | { ok: true; text: string; pages: number }
  | { ok: false; reason: PdfRefusalReason };

// Bounds, so a malformed or hostile file fails rather than runs away. An
// uploaded document larger than this is refused as unreadable, which is the
// honest answer: nothing here has read it. The byte ceiling is the one number
// the intake screen and the intake route also use (T-486 f), so the three cannot
// drift apart.
const MAX_BYTES = UPLOAD_MAX_BYTES;
const MAX_OBJECTS = 200_000;
const MAX_TEXT = 32 * 1024 * 1024;
const MAX_DEPTH = 8;

/**
 * PDF bytes → plain text, one `\f` per page boundary, or a refusal naming why.
 * Pure: no I/O, no state, same bytes always give the same text.
 */
export function pdfToText(bytes: Buffer): PdfExtraction {
  if (bytes.length > MAX_BYTES) return { ok: false, reason: 'pdf_unreadable' };
  if (!bytes.subarray(0, 1024).includes('%PDF-')) return { ok: false, reason: 'pdf_unreadable' };
  try {
    return extract(bytes);
  } catch {
    // a bounds error, a cycle, a truncated object: all the same answer to the
    // person holding the file — Infora could not read this document
    return { ok: false, reason: 'pdf_unreadable' };
  }
}

// ── The object model ───────────────────────────────────────────────────────
// Strings are Buffers (a PDF string is bytes, and what those bytes MEAN depends
// on the font that shows them); dictionaries are Maps keyed by name.
type PdfName = { name: string };
type PdfRef = { ref: number };
type PdfDict = Map<string, PdfValue>;
type PdfStream = { dict: PdfDict; data: Buffer };
type PdfValue = null | boolean | number | PdfName | Buffer | PdfValue[] | PdfDict | PdfRef | PdfStream;

type Maybe = PdfValue | undefined;
const isName = (v: Maybe): v is PdfName =>
  v !== null && v !== undefined && typeof v === 'object' && 'name' in v;
const isRef = (v: Maybe): v is PdfRef =>
  v !== null && v !== undefined && typeof v === 'object' && 'ref' in v;
const isDict = (v: Maybe): v is PdfDict => v instanceof Map;
const isStream = (v: Maybe): v is PdfStream =>
  v !== null && v !== undefined && typeof v === 'object' && 'dict' in v && 'data' in v;

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITER = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isRegular = (c: number | undefined) =>
  c !== undefined && !WHITESPACE.has(c) && !DELIMITER.has(c);

/** A cursor over PDF syntax. One class serves file objects and content streams. */
class Cursor {
  constructor(
    readonly buf: Buffer,
    public at = 0,
  ) {}

  skipSpace(): void {
    for (;;) {
      while (this.at < this.buf.length && WHITESPACE.has(this.buf[this.at]!)) this.at += 1;
      if (this.buf[this.at] !== 0x25) return; // '%' — a comment runs to end of line
      while (this.at < this.buf.length && this.buf[this.at] !== 0x0a && this.buf[this.at] !== 0x0d)
        this.at += 1;
    }
  }

  /** the next regular-character run, e.g. an operator or a keyword */
  keyword(): string {
    const from = this.at;
    while (isRegular(this.buf[this.at])) this.at += 1;
    if (this.at === from) this.at += 1; // never stall on a stray delimiter
    return this.buf.subarray(from, this.at).toString('latin1');
  }

  /**
   * The next syntactic item. `null` at end of input; an operator (a bare
   * keyword that is not `true`/`false`/`null`) comes back tagged, because a
   * content stream is operands-then-operator and the two share this grammar.
   */
  next(depth = 0): { value: PdfValue } | { op: string } | null {
    if (depth > MAX_DEPTH) throw new Error('nesting');
    this.skipSpace();
    const c = this.buf[this.at];
    if (c === undefined) return null;
    if (c === 0x2f) {
      this.at += 1;
      return { value: { name: this.readName() } };
    }
    if (c === 0x28) return { value: this.readLiteralString() };
    if (c === 0x3c) {
      if (this.buf[this.at + 1] === 0x3c) return { value: this.readDictOrStream(depth) };
      return { value: this.readHexString() };
    }
    if (c === 0x5b) {
      this.at += 1;
      const items: PdfValue[] = [];
      for (;;) {
        this.skipSpace();
        if (this.buf[this.at] === 0x5d) {
          this.at += 1;
          return { value: items };
        }
        const item = this.next(depth + 1);
        if (item === null) throw new Error('array');
        if ('op' in item) throw new Error('array');
        items.push(item.value);
      }
    }
    if (c === 0x5d || c === 0x3e || c === 0x7b || c === 0x7d || c === 0x29) {
      this.at += 1; // a stray closer: consume it rather than spin
      return { op: String.fromCharCode(c) };
    }
    if ((c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e) {
      return { value: this.readNumberOrRef() };
    }
    const word = this.keyword();
    if (word === 'true') return { value: true };
    if (word === 'false') return { value: false };
    if (word === 'null') return { value: null };
    return { op: word };
  }

  /** the next item, insisting it is a value (used where an operator is a syntax error) */
  value(depth = 0): PdfValue {
    const item = this.next(depth);
    if (item === null || 'op' in item) throw new Error('value');
    return item.value;
  }

  private readName(): string {
    const from = this.at;
    while (isRegular(this.buf[this.at])) this.at += 1;
    // #xx hex escapes are legal inside a name
    return this.buf
      .subarray(from, this.at)
      .toString('latin1')
      .replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }

  private readLiteralString(): Buffer {
    this.at += 1; // '('
    const out: number[] = [];
    let nesting = 1;
    while (this.at < this.buf.length) {
      const c = this.buf[this.at]!;
      this.at += 1;
      if (c === 0x5c) {
        const esc = this.buf[this.at];
        this.at += 1;
        if (esc === undefined) break;
        if (esc >= 0x30 && esc <= 0x37) {
          let code = esc - 0x30;
          for (let i = 0; i < 2; i++) {
            const d = this.buf[this.at];
            if (d === undefined || d < 0x30 || d > 0x37) break;
            code = code * 8 + (d - 0x30);
            this.at += 1;
          }
          out.push(code & 0xff);
        } else if (esc === 0x6e) out.push(0x0a);
        else if (esc === 0x72) out.push(0x0d);
        else if (esc === 0x74) out.push(0x09);
        else if (esc === 0x62) out.push(0x08);
        else if (esc === 0x66) out.push(0x0c);
        else if (esc === 0x0a) continue; // line continuation
        else if (esc === 0x0d) {
          if (this.buf[this.at] === 0x0a) this.at += 1;
          continue;
        } else out.push(esc);
        continue;
      }
      if (c === 0x28) nesting += 1;
      if (c === 0x29) {
        nesting -= 1;
        if (nesting === 0) break;
      }
      out.push(c);
    }
    return Buffer.from(out);
  }

  private readHexString(): Buffer {
    this.at += 1; // '<'
    const digits: string[] = [];
    while (this.at < this.buf.length && this.buf[this.at] !== 0x3e) {
      const ch = String.fromCharCode(this.buf[this.at]!);
      if (/[0-9a-fA-F]/.test(ch)) digits.push(ch);
      this.at += 1;
    }
    this.at += 1; // '>'
    if (digits.length % 2 === 1) digits.push('0'); // an odd final digit is padded
    return Buffer.from(digits.join(''), 'hex');
  }

  private readNumberOrRef(): PdfValue {
    const from = this.at;
    if (this.buf[this.at] === 0x2b || this.buf[this.at] === 0x2d) this.at += 1;
    while (isRegular(this.buf[this.at])) this.at += 1;
    const token = this.buf.subarray(from, this.at).toString('latin1');
    const number = Number.parseFloat(token);
    if (!Number.isFinite(number)) throw new Error('number');
    // `<n> <g> R` is an indirect reference; anything else is just the number,
    // so the lookahead rewinds when the shape does not hold
    if (!/^\d+$/.test(token)) return number;
    const save = this.at;
    this.skipSpace();
    const genFrom = this.at;
    while (isRegular(this.buf[this.at])) this.at += 1;
    const gen = this.buf.subarray(genFrom, this.at).toString('latin1');
    if (/^\d+$/.test(gen)) {
      this.skipSpace();
      const kwFrom = this.at;
      const kw = this.keyword();
      if (kw === 'R') return { ref: number };
      this.at = kwFrom;
    }
    this.at = save;
    return number;
  }

  private readDictOrStream(depth: number): PdfValue {
    this.at += 2; // '<<'
    const dict: PdfDict = new Map();
    for (;;) {
      this.skipSpace();
      if (this.buf[this.at] === 0x3e && this.buf[this.at + 1] === 0x3e) {
        this.at += 2;
        break;
      }
      if (this.at >= this.buf.length) throw new Error('dict');
      if (this.buf[this.at] !== 0x2f) {
        // a malformed entry: skip one item rather than abandon the dictionary
        this.next(depth + 1);
        continue;
      }
      this.at += 1;
      const key = this.readName();
      dict.set(key, this.value(depth + 1));
    }
    const save = this.at;
    this.skipSpace();
    if (this.buf.subarray(this.at, this.at + 6).toString('latin1') !== 'stream') {
      this.at = save;
      return dict;
    }
    this.at += 6;
    if (this.buf[this.at] === 0x0d) this.at += 1;
    if (this.buf[this.at] === 0x0a) this.at += 1;
    const start = this.at;
    const declared = dict.get('Length');
    if (typeof declared === 'number' && declared >= 0 && start + declared <= this.buf.length) {
      const probe = new Cursor(this.buf, start + declared);
      probe.skipSpace();
      if (probe.buf.subarray(probe.at, probe.at + 9).toString('latin1') === 'endstream') {
        this.at = probe.at + 9;
        return { dict, data: this.buf.subarray(start, start + declared) };
      }
    }
    // an indirect or wrong /Length: find the terminator instead
    const end = this.buf.indexOf('endstream', start, 'latin1');
    if (end < 0) throw new Error('stream');
    let stop = end;
    if (this.buf[stop - 1] === 0x0a) stop -= 1;
    if (this.buf[stop - 1] === 0x0d) stop -= 1;
    this.at = end + 9;
    return { dict, data: this.buf.subarray(start, stop) };
  }
}

// ── The document: every object, found by sweeping the file ─────────────────
// Deliberately NOT by following the cross-reference table. A sweep reads files
// with a broken or absent xref (which real-world exports produce), needs no
// xref-stream decoder, and cannot be walked in a circle. Later definitions win,
// which is the same rule an incremental update states.
type Document = {
  objects: Map<number, PdfValue>;
  resolve: (value: PdfValue) => PdfValue;
};

const OBJECT_HEADER = /(?<![0-9])(\d{1,10})\s+(\d{1,5})\s+obj\b/g;

function sweep(bytes: Buffer): { document: Document; encrypted: boolean } {
  const text = bytes.toString('latin1');
  const found = new Map<number, { value: PdfValue; at: number }>();
  const record = (num: number, value: PdfValue, at: number) => {
    const existing = found.get(num);
    if (existing === undefined || existing.at <= at) found.set(num, { value, at });
  };

  let skipUntil = 0;
  let count = 0;
  OBJECT_HEADER.lastIndex = 0;
  for (let m = OBJECT_HEADER.exec(text); m !== null; m = OBJECT_HEADER.exec(text)) {
    // a stream's binary payload can contain bytes that read as "12 0 obj";
    // skipping past every consumed object keeps those out of the map
    if (m.index < skipUntil) continue;
    if (++count > MAX_OBJECTS) throw new Error('objects');
    const cursor = new Cursor(bytes, m.index + m[0].length);
    try {
      const value = cursor.value();
      record(Number(m[1]), value, m.index);
      if (isStream(value)) skipUntil = cursor.at;
    } catch {
      // one unreadable object is not a broken document — the refusal gates at
      // the end decide whether what was read amounts to anything
    }
  }

  const objects = new Map<number, PdfValue>();
  for (const [num, entry] of found) objects.set(num, entry.value);
  const resolve = (value: PdfValue): PdfValue => {
    let seen = 0;
    let current = value;
    while (isRef(current)) {
      if (++seen > 32) throw new Error('reference cycle');
      current = objects.get(current.ref) ?? null;
    }
    return current;
  };
  const document: Document = { objects, resolve };

  // Objects living inside an object stream (PDF 1.5+). They inherit the
  // container's file position, so the last-definition-wins rule still holds.
  for (const [, entry] of [...found]) {
    if (!isStream(entry.value)) continue;
    const type = entry.value.dict.get('Type');
    if (!isName(type) || type.name !== 'ObjStm') continue;
    const data = decodeStream(entry.value, document);
    if (data === null) continue;
    const n = numberOf(resolve(entry.value.dict.get('N') ?? null));
    const first = numberOf(resolve(entry.value.dict.get('First') ?? null));
    if (n === null || first === null) continue;
    const header = new Cursor(data.subarray(0, first));
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const num = header.value();
      const off = header.value();
      if (typeof num !== 'number' || typeof off !== 'number') break;
      pairs.push([num, off]);
    }
    for (const [num, off] of pairs) {
      try {
        record(num, new Cursor(data, first + off).value(), entry.at);
      } catch {
        /* as above: one bad entry, not a bad document */
      }
    }
  }
  for (const [num, e] of found) objects.set(num, e.value);

  // Encryption is refused rather than attempted: the standard security handler
  // means keys and permissions, which is a decision, not a decoder.
  let encrypted = false;
  for (let at = text.indexOf('trailer'); at >= 0; at = text.indexOf('trailer', at + 7)) {
    try {
      const dict = new Cursor(bytes, at + 7).value();
      if (isDict(dict) && dict.has('Encrypt')) encrypted = true;
    } catch {
      /* an unparseable trailer says nothing either way */
    }
  }
  for (const value of objects.values()) {
    if (isStream(value) && value.dict.has('Encrypt')) encrypted = true;
  }
  return { document, encrypted };
}

const numberOf = (value: PdfValue): number | null => (typeof value === 'number' ? value : null);

const dictOf = (document: Document, value: PdfValue | undefined): PdfDict | null => {
  if (value === undefined) return null;
  const resolved = document.resolve(value);
  if (isDict(resolved)) return resolved;
  if (isStream(resolved)) return resolved.dict;
  return null;
};

const arrayOf = (document: Document, value: PdfValue | undefined): PdfValue[] => {
  if (value === undefined) return [];
  const resolved = document.resolve(value);
  if (resolved === null) return [];
  return Array.isArray(resolved) ? resolved : [resolved];
};

// ── Stream filters ─────────────────────────────────────────────────────────
// Flate covers essentially every content stream a modern producer writes; the
// three ASCII filters are cheap and occasionally still seen. Everything else —
// LZW, and the image codecs — returns null, and a content stream that returns
// null is a refusal rather than a gap.
function decodeStream(stream: PdfStream, document: Document): Buffer | null {
  const filters = arrayOf(document, stream.dict.get('Filter'));
  const parms = arrayOf(document, stream.dict.get('DecodeParms') ?? stream.dict.get('DP'));
  let data = stream.data;
  for (let i = 0; i < filters.length; i++) {
    const filter = document.resolve(filters[i]!);
    if (!isName(filter)) return null;
    const parm = dictOf(document, parms[i]);
    switch (filter.name) {
      case 'FlateDecode':
      case 'Fl': {
        const inflated = inflate(data);
        if (inflated === null) return null;
        data = inflated;
        break;
      }
      case 'ASCIIHexDecode':
      case 'AHx':
        data = asciiHexDecode(data);
        break;
      case 'ASCII85Decode':
      case 'A85':
        data = ascii85Decode(data);
        break;
      case 'RunLengthDecode':
      case 'RL':
        data = runLengthDecode(data);
        break;
      default:
        return null;
    }
    if (parm !== null) {
      const predicted = unpredict(data, parm, document);
      if (predicted === null) return null;
      data = predicted;
    }
  }
  return data;
}

function inflate(data: Buffer): Buffer | null {
  const attempts: Array<() => Buffer> = [
    () => inflateSync(data),
    () => inflateRawSync(data),
    // a stray leading EOL before the zlib header is a common producer bug
    () => inflateSync(data.subarray(1)),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      /* try the next */
    }
  }
  return null;
}

function asciiHexDecode(data: Buffer): Buffer {
  const hex = data.toString('latin1').split('>')[0]!.replace(/[^0-9a-fA-F]/g, '');
  return Buffer.from(hex.length % 2 === 0 ? hex : `${hex}0`, 'hex');
}

function ascii85Decode(data: Buffer): Buffer {
  const text = data.toString('latin1').replace(/^<~/, '').split('~>')[0]!.replace(/\s/g, '');
  const out: number[] = [];
  let group: number[] = [];
  const flush = (n: number) => {
    while (group.length < 5) group.push(0x75); // 'u' pads the final short group
    let value = 0;
    for (const c of group) value = value * 85 + (c - 33);
    const bytes = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
    out.push(...bytes.slice(0, n));
    group = [];
  };
  for (const ch of text) {
    if (ch === 'z' && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(ch.charCodeAt(0));
    if (group.length === 5) flush(4);
  }
  if (group.length > 0) flush(group.length - 1);
  return Buffer.from(out);
}

function runLengthDecode(data: Buffer): Buffer {
  const out: number[] = [];
  let at = 0;
  while (at < data.length) {
    const length = data[at]!;
    at += 1;
    if (length === 128) break;
    if (length < 128) {
      for (let i = 0; i <= length; i++) out.push(data[at + i] ?? 0);
      at += length + 1;
    } else {
      const byte = data[at] ?? 0;
      at += 1;
      for (let i = 0; i < 257 - length; i++) out.push(byte);
    }
  }
  return Buffer.from(out);
}

/** PNG/TIFF predictors — rare on content streams, ordinary on object streams. */
function unpredict(data: Buffer, parm: PdfDict, document: Document): Buffer | null {
  const predictor = numberOf(document.resolve(parm.get('Predictor') ?? null)) ?? 1;
  if (predictor <= 1) return data;
  const colors = numberOf(document.resolve(parm.get('Colors') ?? null)) ?? 1;
  const bits = numberOf(document.resolve(parm.get('BitsPerComponent') ?? null)) ?? 8;
  const columns = numberOf(document.resolve(parm.get('Columns') ?? null)) ?? 1;
  if (bits !== 8) return null; // sub-byte predictors are not worth the guesswork
  const pixel = colors;
  const row = columns * colors;
  if (predictor === 2) {
    const out = Buffer.from(data);
    for (let r = 0; r + row <= out.length; r += row) {
      for (let i = pixel; i < row; i++) out[r + i] = (out[r + i]! + out[r + i - pixel]!) & 0xff;
    }
    return out;
  }
  const out: number[] = [];
  let previous = new Uint8Array(row);
  for (let at = 0; at + 1 + row <= data.length + row; at += row + 1) {
    const tag = data[at];
    if (tag === undefined) break;
    const current = new Uint8Array(row);
    for (let i = 0; i < row; i++) {
      const raw = data[at + 1 + i] ?? 0;
      const left = i >= pixel ? current[i - pixel]! : 0;
      const up = previous[i]!;
      const upLeft = i >= pixel ? previous[i - pixel]! : 0;
      let value: number;
      switch (tag) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + up;
          break;
        case 3:
          value = raw + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          return null;
      }
      current[i] = value & 0xff;
    }
    out.push(...current);
    previous = current;
  }
  return Buffer.from(out);
}

// ── The page tree ──────────────────────────────────────────────────────────
type Page = { dict: PdfDict; resources: PdfDict | null };

function pagesOf(document: Document): Page[] {
  const pages: Page[] = [];
  const seen = new Set<PdfDict>();

  const walk = (node: PdfValue, inherited: PdfDict | null, depth: number): void => {
    if (depth > 64 || pages.length > 20_000) return;
    const dict = dictOf(document, node);
    if (dict === null || seen.has(dict)) return;
    seen.add(dict);
    const resources = dictOf(document, dict.get('Resources')) ?? inherited;
    const type = document.resolve(dict.get('Type') ?? null);
    const kids = dict.get('Kids');
    if (kids !== undefined && (!isName(type) || type.name !== 'Page')) {
      for (const kid of arrayOf(document, kids)) walk(kid, resources, depth + 1);
      return;
    }
    pages.push({ dict, resources });
  };

  for (const value of document.objects.values()) {
    const dict = isDict(value) ? value : null;
    const type = dict === null ? null : document.resolve(dict.get('Type') ?? null);
    if (dict !== null && isName(type) && type.name === 'Catalog') {
      walk(dict.get('Pages') ?? null, null, 0);
      if (pages.length > 0) return pages;
    }
  }
  // no catalog, or a catalog pointing nowhere: fall back to every page object,
  // in object-number order, which is the order producers write them in
  for (const num of [...document.objects.keys()].sort((a, b) => a - b)) {
    const value = document.objects.get(num)!;
    if (!isDict(value)) continue;
    const type = document.resolve(value.get('Type') ?? null);
    if (isName(type) && type.name === 'Page') {
      pages.push({ dict: value, resources: dictOf(document, value.get('Resources')) });
    }
  }
  return pages;
}

// ── Fonts: bytes on the page → characters a reader would recognise ─────────
// A PDF string is font-relative. A subset-embedded font (what every modern
// producer writes) carries a `/ToUnicode` CMap precisely so its bytes can be
// read back; a simple font falls back to its encoding. Where neither answers,
// the glyph counts as UNRESOLVED — and a document that is mostly unresolved is
// refused, because half-decoded text in the corpus is worse than none.
type Font = {
  codeBytes: number;
  toUnicode: Map<number, string> | null;
  encoding: Map<number, string>;
  /** glyph advances in thousandths of an em — how far the pen moves, per code */
  widths: Map<number, number>;
  defaultWidth: number;
};

type Decoded = {
  text: string;
  resolved: number;
  unresolved: number;
  /** the run's advance in ems, before font size and the spacing parameters */
  width: number;
  glyphs: number;
  spaces: number;
};

function decodeWith(font: Font | null, bytes: Buffer): Decoded {
  const step = font?.codeBytes ?? 1;
  let text = '';
  let resolved = 0;
  let unresolved = 0;
  let width = 0;
  let glyphs = 0;
  let spaces = 0;
  for (let at = 0; at < bytes.length; at += step) {
    let code = 0;
    for (let i = 0; i < step; i++) code = (code << 8) | (bytes[at + i] ?? 0);
    glyphs += 1;
    if (step === 1 && code === 0x20) spaces += 1;
    width += (font?.widths.get(code) ?? font?.defaultWidth ?? 500) / 1000;
    const mapped = font?.toUnicode?.get(code) ?? font?.encoding.get(code);
    if (mapped !== undefined) {
      text += mapped;
      resolved += 1;
      continue;
    }
    if (step === 1) {
      text += winAnsi(code);
      resolved += 1;
      continue;
    }
    // a two-byte CID with no ToUnicode: the bytes are glyph ids in an embedded
    // subset and mean nothing outside it. Say so rather than emit mojibake.
    unresolved += 1;
  }
  return { text, resolved, unresolved, width, glyphs, spaces };
}

const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
  0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
  0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

const winAnsi = (code: number): string => WIN_ANSI_HIGH[code] ?? String.fromCharCode(code);

// The Adobe glyph names a consenting document actually uses. `/Differences`
// re-points codes by name, and a name this table does not carry falls through
// to the uniXXXX form or is dropped rather than guessed.
const GLYPH_NAMES: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%',
  ampersand: '&', quotesingle: "'", parenleft: '(', parenright: ')', asterisk: '*',
  plus: '+', comma: ',', hyphen: '-', period: '.', slash: '/', zero: '0', one: '1',
  two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>',
  question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']',
  asciicircum: '^', underscore: '_', grave: '`', braceleft: '{', bar: '|',
  braceright: '}', asciitilde: '~', quoteleft: '‘', quoteright: '’',
  quotedblleft: '“', quotedblright: '”', endash: '–', emdash: '—', bullet: '•',
  ellipsis: '…', fi: 'ﬁ', fl: 'ﬂ', degree: '°', sterling: '£', euro: '€',
  section: '§', paragraph: '¶', dagger: '†', daggerdbl: '‡', trademark: '™',
  copyright: '©', registered: '®', multiply: '×', divide: '÷', minus: '−',
  nbspace: ' ', periodcentered: '·',
};

function glyphToChar(name: string): string | null {
  if (GLYPH_NAMES[name] !== undefined) return GLYPH_NAMES[name]!;
  if (/^[A-Za-z]$/.test(name)) return name;
  const uni = /^uni([0-9A-Fa-f]{4})$/.exec(name) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (uni !== null) return String.fromCodePoint(parseInt(uni[1]!, 16));
  return null;
}

function fontsOf(document: Document, resources: PdfDict | null): Map<string, Font> {
  const fonts = new Map<string, Font>();
  const table = dictOf(document, resources?.get('Font'));
  if (table === null) return fonts;
  for (const [key, value] of table) {
    const dict = dictOf(document, value);
    if (dict === null) continue;
    const subtype = document.resolve(dict.get('Subtype') ?? null);
    const composite = isName(subtype) && subtype.name === 'Type0';
    const toUnicodeStream = document.resolve(dict.get('ToUnicode') ?? null);
    const cmap = isStream(toUnicodeStream) ? parseToUnicode(toUnicodeStream, document) : null;
    fonts.set(key, {
      codeBytes: cmap?.codeBytes ?? (composite ? 2 : 1),
      toUnicode: cmap?.map ?? null,
      encoding: encodingOf(document, dict),
      ...widthsOf(document, dict, composite),
    });
  }
  return fonts;
}

/**
 * Glyph advances. Without them there is no way to tell a producer that ADVANCED
 * the pen to the next word from one that positioned every glyph individually —
 * and the difference decides whether the extracted text reads
 * "the assessment" or "t h e a s s e s s m e n t".
 */
function widthsOf(
  document: Document,
  font: PdfDict,
  composite: boolean,
): { widths: Map<number, number>; defaultWidth: number } {
  const widths = new Map<number, number>();
  if (composite) {
    const descendant = dictOf(document, arrayOf(document, font.get('DescendantFonts'))[0]);
    const defaultWidth = numberOf(document.resolve(descendant?.get('DW') ?? null)) ?? 1000;
    const w = arrayOf(document, descendant?.get('W'));
    for (let i = 0; i < w.length; ) {
      const first = numberOf(document.resolve(w[i]!));
      const second = document.resolve(w[i + 1] ?? null);
      if (first === null) break;
      if (Array.isArray(second)) {
        second.forEach((entry, at) => {
          const value = numberOf(document.resolve(entry));
          if (value !== null) widths.set(first + at, value);
        });
        i += 2;
        continue;
      }
      const last = numberOf(second);
      const value = numberOf(document.resolve(w[i + 2] ?? null));
      if (last === null || value === null) break;
      for (let code = first; code <= last && code - first < 65_536; code++) widths.set(code, value);
      i += 3;
    }
    return { widths, defaultWidth };
  }
  const firstChar = numberOf(document.resolve(font.get('FirstChar') ?? null)) ?? 0;
  const declared = arrayOf(document, font.get('Widths'));
  declared.forEach((entry, at) => {
    const value = numberOf(document.resolve(entry));
    if (value !== null) widths.set(firstChar + at, value);
  });
  const descriptor = dictOf(document, font.get('FontDescriptor'));
  const missing = numberOf(document.resolve(descriptor?.get('MissingWidth') ?? null));
  // no /Widths at all is one of the standard 14 faces, whose metrics live in
  // the viewer. 500 is the honest average, and the only cost of being a little
  // wrong is the space threshold below being a little generous.
  return { widths, defaultWidth: missing ?? 500 };
}

function encodingOf(document: Document, font: PdfDict): Map<number, string> {
  const map = new Map<number, string>();
  const encoding = document.resolve(font.get('Encoding') ?? null);
  const dict = isDict(encoding) ? encoding : null;
  if (dict === null) return map;
  let code = 0;
  for (const entry of arrayOf(document, dict.get('Differences'))) {
    const value = document.resolve(entry);
    if (typeof value === 'number') {
      code = value;
      continue;
    }
    if (isName(value)) {
      const char = glyphToChar(value.name);
      if (char !== null) map.set(code, char);
      code += 1;
    }
  }
  return map;
}

/** `/ToUnicode` is itself a little PostScript-ish program; only two forms matter. */
function parseToUnicode(
  stream: PdfStream,
  document: Document,
): { map: Map<number, string>; codeBytes: number } | null {
  const data = decodeStream(stream, document);
  if (data === null) return null;
  const source = data.toString('latin1');
  const map = new Map<number, string>();
  // a CMap destination is UTF-16BE, one or more code units
  const utf16 = (hex: string): string =>
    Buffer.from(hex.length % 4 === 0 ? hex : hex.padEnd(Math.ceil(hex.length / 4) * 4, '0'), 'hex')
      .swap16()
      .toString('utf16le');

  let codeBytes = 1;
  const codespace = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(source);
  if (codespace !== null) {
    const first = /<([0-9A-Fa-f]+)>/.exec(codespace[1]!);
    if (first !== null) codeBytes = Math.max(1, Math.min(2, Math.ceil(first[1]!.length / 2)));
  }

  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    const pairs = [...block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)];
    for (const [, from, to] of pairs) map.set(parseInt(from!, 16), utf16(to!));
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1]!;
    for (const m of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      const lo = parseInt(m[1]!, 16);
      const hi = parseInt(m[2]!, 16);
      const base = m[3]!;
      if (hi - lo > 65_535) continue;
      for (let code = lo; code <= hi; code++) {
        // the destination increments in its LAST code unit, which is what a
        // range means: a run of consecutive characters
        const tail = parseInt(base.slice(-4) || '0', 16) + (code - lo);
        const head = base.slice(0, -4);
        map.set(code, utf16(head + tail.toString(16).padStart(4, '0')));
      }
    }
    for (const m of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(m[1]!, 16);
      const items = [...m[3]!.matchAll(/<([0-9A-Fa-f]*)>/g)];
      items.forEach((item, i) => map.set(lo + i, utf16(item[1]!)));
    }
  }
  if (map.size === 0) return null;
  return { map, codeBytes };
}

// ── A page's content stream → its text ─────────────────────────────────────
// Position matters only for one question: did this run of glyphs start a new
// line, or continue the current one? So the text and line matrices are tracked
// properly (they are six numbers and a multiply) and the answer is read off
// the baseline. Widths are NOT tracked — a producer that splits a word does it
// inside a `TJ` array, which the kerning threshold below handles.
type PageText = { text: string; resolved: number; unresolved: number };

function textOfPage(page: Page, document: Document, depth = 0): PageText | null {
  const streams = arrayOf(document, page.dict.get('Contents'))
    .map((value) => document.resolve(value))
    .filter(isStream);
  if (streams.length === 0) return { text: '', resolved: 0, unresolved: 0 };
  const parts: Buffer[] = [];
  for (const stream of streams) {
    const data = decodeStream(stream, document);
    if (data === null) return null; // a stream we cannot read is a refusal
    parts.push(data, Buffer.from('\n'));
  }
  return runContent(Buffer.concat(parts), page.resources, document, depth);
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const translated = (m: Matrix, tx: number, ty: number): Matrix =>
  multiply([1, 0, 0, 1, tx, ty], m);

function runContent(
  content: Buffer,
  resources: PdfDict | null,
  document: Document,
  depth: number,
  initialCtm: Matrix = [...IDENTITY],
): PageText | null {
  if (depth > 4) return { text: '', resolved: 0, unresolved: 0 };
  const fonts = fontsOf(document, resources);
  const xobjects = dictOf(document, resources?.get('XObject'));
  const cursor = new Cursor(content);
  const operands: PdfValue[] = [];
  let out = '';
  let resolved = 0;
  let unresolved = 0;
  let font: Font | null = null;
  let textMatrix: Matrix = [...IDENTITY];
  let lineMatrix: Matrix = [...IDENTITY];
  let leading = 0;
  let size = 0;
  let charSpacing = 0;
  let wordSpacing = 0;
  let horizontal = 1;
  // the graphics state, only as far as position: a producer that places text
  // through the CTM rather than through Tm is otherwise read as one long line
  let ctm: Matrix = initialCtm;
  const ctmStack: Matrix[] = [];
  // where the pen finished, in device space. Deliberately NOT reset at BT/ET:
  // a producer emitting one text object per paragraph (Chromium does) would
  // otherwise run every paragraph together, because the only evidence of a
  // line break is the baseline moving.
  let pen: { x: number; y: number; size: number } | null = null;

  /** advance the pen by `tx` in unscaled text space, as a show or a kern does */
  const advance = (tx: number) => {
    textMatrix = translated(textMatrix, tx, 0);
  };

  const show = (bytes: Buffer) => {
    const device = multiply(textMatrix, ctm);
    const x = device[4];
    const y = device[5];
    // the em size as it lands on the page — the scale everything below is
    // judged against, so a caption and a heading get the same treatment
    const scaled = size * Math.hypot(device[2], device[3]);
    if (pen !== null) {
      if (Math.abs(y - pen.y) > 0.5 * Math.max(1, Math.min(scaled, pen.size))) out += '\n';
      // a gap wider than a quarter of an em is a space the producer chose to
      // draw by moving the pen rather than by putting one in the string; a
      // narrower one is kerning, and gluing the glyphs back together is the
      // whole difference between "the assessment" and "t h e a s s e s s m e n t"
      else if (x - pen.x > 0.25 * Math.max(scaled, 1) && !/\s$/.test(out)) out += ' ';
    }
    const decoded = decodeWith(font, bytes);
    out += decoded.text;
    resolved += decoded.resolved;
    unresolved += decoded.unresolved;
    advance(
      (decoded.width * size + charSpacing * decoded.glyphs + wordSpacing * decoded.spaces) *
        horizontal,
    );
    const after = multiply(textMatrix, ctm);
    pen = { x: after[4], y: after[5], size: scaled };
    if (out.length > MAX_TEXT) throw new Error('text');
  };

  const num = (at: number): number => {
    const value = operands[at];
    return typeof value === 'number' ? value : 0;
  };

  for (;;) {
    const item = cursor.next();
    if (item === null) break;
    if ('value' in item) {
      if (operands.length < 64) operands.push(item.value);
      continue;
    }
    switch (item.op) {
      case 'BT':
        textMatrix = [...IDENTITY];
        lineMatrix = [...IDENTITY];
        break;
      case 'ET':
        break;
      case 'q':
        if (ctmStack.length < 64) ctmStack.push([...ctm]);
        break;
      case 'Q':
        ctm = ctmStack.pop() ?? ctm;
        break;
      case 'cm':
        ctm = multiply([num(0), num(1), num(2), num(3), num(4), num(5)], ctm);
        break;
      case 'Tf': {
        const name = operands[0];
        font = isName(name) ? (fonts.get(name.name) ?? null) : null;
        size = num(1);
        break;
      }
      case 'TL':
        leading = num(0);
        break;
      case 'Tc':
        charSpacing = num(0);
        break;
      case 'Tw':
        wordSpacing = num(0);
        break;
      case 'Tz':
        horizontal = num(0) / 100;
        break;
      case 'Tm':
        lineMatrix = [num(0), num(1), num(2), num(3), num(4), num(5)];
        textMatrix = [...lineMatrix];
        break;
      case 'TD':
        leading = -num(1);
        lineMatrix = translated(lineMatrix, num(0), num(1));
        textMatrix = [...lineMatrix];
        break;
      case 'Td':
        lineMatrix = translated(lineMatrix, num(0), num(1));
        textMatrix = [...lineMatrix];
        break;
      case 'T*':
        lineMatrix = translated(lineMatrix, 0, -leading);
        textMatrix = [...lineMatrix];
        break;
      case 'Tj':
        if (Buffer.isBuffer(operands[0])) show(operands[0]);
        break;
      case "'":
        lineMatrix = translated(lineMatrix, 0, -leading);
        textMatrix = [...lineMatrix];
        if (Buffer.isBuffer(operands[0])) show(operands[0]);
        break;
      case '"':
        wordSpacing = num(0);
        charSpacing = num(1);
        lineMatrix = translated(lineMatrix, 0, -leading);
        textMatrix = [...lineMatrix];
        if (Buffer.isBuffer(operands[2])) show(operands[2]);
        break;
      case 'TJ': {
        const items = Array.isArray(operands[0]) ? operands[0] : [];
        for (const element of items) {
          if (Buffer.isBuffer(element)) show(element);
          // a kern moves the pen; whether the reader sees a space is decided
          // in `show`, against the em size, rather than by a magic threshold
          else if (typeof element === 'number') advance((-element / 1000) * size * horizontal);
        }
        break;
      }
      case 'Do': {
        const name = operands[0];
        const target = isName(name) ? document.resolve(xobjects?.get(name.name) ?? null) : null;
        if (isStream(target)) {
          const subtype = document.resolve(target.dict.get('Subtype') ?? null);
          if (isName(subtype) && subtype.name === 'Form') {
            const data = decodeStream(target, document);
            if (data === null) return null;
            const form = arrayOf(document, target.dict.get('Matrix'))
              .map((v) => numberOf(document.resolve(v)) ?? 0);
            const inner = runContent(
              data,
              dictOf(document, target.dict.get('Resources')) ?? resources,
              document,
              depth + 1,
              form.length === 6 ? multiply(form as Matrix, ctm) : ctm,
            );
            if (inner === null) return null;
            if (inner.text !== '') out += `${/\n$/.test(out) ? '' : '\n'}${inner.text}`;
            resolved += inner.resolved;
            unresolved += inner.unresolved;
            pen = null;
          }
        }
        break;
      }
      case 'BI': {
        // an inline image: its binary payload is not PDF syntax, so skip to EI
        const end = content.indexOf('EI', cursor.at, 'latin1');
        cursor.at = end < 0 ? content.length : end + 2;
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }
  return { text: out, resolved, unresolved };
}

// ── Putting it together ────────────────────────────────────────────────────
function extract(bytes: Buffer): PdfExtraction {
  const { document, encrypted } = sweep(bytes);
  if (encrypted) return { ok: false, reason: 'pdf_encrypted' };
  const pages = pagesOf(document);
  if (pages.length === 0) return { ok: false, reason: 'pdf_unreadable' };

  let text = '';
  let resolved = 0;
  let unresolved = 0;
  for (const page of pages) {
    const result = textOfPage(page, document);
    // null means a content stream this reader cannot decode. The document is
    // refused whole: indexing the pages that happened to decode would put a
    // document in the corpus that answers confidently from part of itself.
    if (result === null) return { ok: false, reason: 'pdf_unsupported_filter' };
    text += `${tidy(result.text)}${PAGE_BREAK}`;
    resolved += result.resolved;
    unresolved += result.unresolved;
  }

  // The ruling's case, and the one that must never pass quietly: a scanned PDF
  // is a picture of a document. It has pages, it has size, and it has no text.
  if (!/\S/.test(text)) return { ok: false, reason: 'pdf_no_text' };
  if (unresolved > resolved) return { ok: false, reason: 'pdf_no_text' };
  return { ok: true, text, pages: pages.length };
}

/** Per-page tidy-up: trailing spaces off each line, no runs of blank lines. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}
