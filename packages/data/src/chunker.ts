// T-012 — deterministic sentence-packing chunker. Splits on sentence
// boundaries and packs greedily to the size cap, so the same content always
// yields the same chunks (re-ingest is idempotent by construction). Sizing
// is character-based — crude but stable; token-aware sizing can replace it
// behind the same signature.

export type Chunk = { index: number; content: string };

const SENTENCE_BREAK = /(?<=[.!?])\s+/;

export function chunkText(text: string, maxChars = 1200): Chunk[] {
  const sentences = text
    .split(SENTENCE_BREAK)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    // a single sentence over the cap is hard-split rather than dropped
    .flatMap((sentence) => splitOversize(sentence, maxChars));

  const chunks: Chunk[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current !== '' && current.length + 1 + sentence.length > maxChars) {
      chunks.push({ index: chunks.length, content: current });
      current = sentence;
    } else {
      current = current === '' ? sentence : `${current} ${sentence}`;
    }
  }
  if (current !== '') chunks.push({ index: chunks.length, content: current });
  return chunks;
}

function splitOversize(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];
  const parts: string[] = [];
  for (let at = 0; at < sentence.length; at += maxChars) {
    parts.push(sentence.slice(at, at + maxChars));
  }
  return parts;
}
