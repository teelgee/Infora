// T-012 — deterministic sentence-packing chunker. Splits on sentence
// boundaries and packs greedily to the size cap, so the same content always
// yields the same chunks (re-ingest is idempotent by construction). Sizing
// is character-based — crude but stable; token-aware sizing can replace it
// behind the same signature.
//
// T-271 — every chunk now carries the character range it came from. The spike
// (T-270) found that offsets cannot be recovered afterwards and explained why:
// the splitter consumes the whitespace run after a terminator and the packer
// rejoins with exactly one space, so a chunk whose interior crossed a paragraph
// break is **not a substring of its own version** and `indexOf` returns -1. The
// chunker is the only place that knows where each sentence came from, and it
// knows at the moment it packs. Keeping it is a change to `Chunk`; recovering
// it later is impossible.

/**
 * `content` is what the model is shown — sentences trimmed and rejoined with a
 * single space. `start`/`end` are where those sentences came from in the source
 * text. **The two are deliberately not interchangeable:** `content` is the
 * assembled rendering, `text.slice(start, end)` is what the document really
 * says there, and they differ wherever the source had a paragraph break. Both
 * are wanted — one is what was read, the other is what a reader can check.
 */
export type Chunk = { index: number; content: string; start: number; end: number };

const SENTENCE_BREAK = /(?<=[.!?])\s+/g;

type Piece = { content: string; start: number; end: number };

export function chunkText(text: string, maxChars = 1200): Chunk[] {
  const sentences = splitSentences(text).flatMap((piece) => splitOversize(piece, maxChars));

  const chunks: Chunk[] = [];
  let current: Piece | null = null;
  for (const sentence of sentences) {
    if (current !== null && current.content.length + 1 + sentence.content.length > maxChars) {
      chunks.push({ index: chunks.length, ...current });
      current = sentence;
    } else {
      current =
        current === null
          ? sentence
          : // the span runs from the FIRST sentence's start to the LAST one's
            // end. That range is real in the real document even where the join
            // the model saw was manufactured by this packer (T-270 finding 3),
            // which is exactly what makes the cross-boundary quote locatable.
            { content: `${current.content} ${sentence.content}`, start: current.start, end: sentence.end };
    }
  }
  if (current !== null) chunks.push({ index: chunks.length, ...current });
  return chunks;
}

/**
 * Sentences with their source offsets. Splitting by regex would discard the
 * positions, so the separators are walked instead, and each piece is trimmed by
 * MOVING its offsets rather than by rewriting its text — which keeps
 * `text.slice(start, end) === content` true for every sentence.
 */
function splitSentences(text: string): Piece[] {
  const pieces: Piece[] = [];
  const breaks = new RegExp(SENTENCE_BREAK);
  let at = 0;
  let match: RegExpExecArray | null;
  while ((match = breaks.exec(text)) !== null) {
    pieces.push(trimmed(text, at, match.index));
    at = match.index + match[0].length;
  }
  pieces.push(trimmed(text, at, text.length));
  return pieces.filter((piece) => piece.content.length > 0);
}

function trimmed(text: string, from: number, to: number): Piece {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(text[start]!)) start += 1;
  while (end > start && /\s/.test(text[end - 1]!)) end -= 1;
  return { content: text.slice(start, end), start, end };
}

/** a single sentence over the cap is hard-split rather than dropped */
function splitOversize(sentence: Piece, maxChars: number): Piece[] {
  if (sentence.content.length <= maxChars) return [sentence];
  const parts: Piece[] = [];
  for (let at = 0; at < sentence.content.length; at += maxChars) {
    parts.push({
      content: sentence.content.slice(at, at + maxChars),
      start: sentence.start + at,
      end: Math.min(sentence.start + at + maxChars, sentence.end),
    });
  }
  return parts;
}
