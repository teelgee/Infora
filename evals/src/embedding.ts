// T-312 — a deterministic embedding that can actually RANK.
//
// **The finding this file is.** Sizing the fixture to three hundred documents
// exposed that the harness's embedding was the binding constraint, not the
// corpus. `fakeVector` (apps/api/src/test-router.ts) maps text to one of TWO
// basis vectors — "contains the word alpha", or not — which is exactly enough
// for the suites it was written for, where the question is *whether* a document
// is reachable rather than *which* document is best. At seven documents it is
// invisible: retrieval fetches the whole library either way. At two hundred and
// ninety-one every document lands on the same basis, the vectors are identical,
// and the top eight is decided by the tie-break on chunk id — which is to say,
// at random. The first run of HAPPY-03 scored 0 of 8, and that was the
// substrate answering, not retrieval.
//
// So the harness gets its own vectoriser, which is the pattern it already
// follows: it declares its own pinned model id (`eval-embed`) to keep its index
// disjoint (ADR-0024), and the vectoriser belongs with the id. `fakeVector`
// stays exactly as it is for every other suite — those tests assert
// reachability and would be re-tuned for nothing.
//
// **Hashed bag of words, and that is deliberately all.** Each token lands in
// one of the 1024 dimensions by hash; the vector is L2-normalised, so cosine
// distance reads as shared vocabulary. It is not semantic — a synonym scores
// nothing — and it must not be, because an eval substrate that guessed at
// meaning would be a second model to disagree with the first. What it does have
// is the one property the two-basis version lacked: **a question about noise
// ranks the noise chapter above three hundred documents that are not about
// noise**, which is the whole of what a precision assertion needs to be
// measuring something real.
import { FAKE_EMBED_DIMENSIONS } from '@infora/api/test-router';

/** FNV-1a, because it is short, fast and stable across machines and versions. */
function hash(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % FAKE_EMBED_DIMENSIONS;
}

// Words carried by every document in a scheme corpus, which therefore separate
// nothing. Left in and they dominate the vector: a question mentioning "the
// scheme" would pull every document equally, which is the two-basis failure in
// a subtler form.
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'at', 'is', 'are', 'was', 'were',
  'be', 'been', 'by', 'with', 'that', 'this', 'it', 'as', 'from', 'we', 'our', 'has', 'have', 'had',
  'not', 'no', 'any', 'all', 'which', 'what', 'does', 'do', 'did', 'will', 'would', 'there', 'their',
]);

export function evalVector(text: string): number[] {
  const vector = new Array<number>(FAKE_EMBED_DIMENSIONS).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
  for (const token of tokens) vector[hash(token)] = (vector[hash(token)] ?? 0) + 1;
  // L2 normalise, so cosine distance compares direction rather than length —
  // without it a long document beats a short one on every query
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return length === 0 ? vector : vector.map((value) => value / length);
}
