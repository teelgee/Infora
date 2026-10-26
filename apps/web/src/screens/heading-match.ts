// T-488 (walk defect 19) — pairing a spreadsheet's headings with a table's
// columns **by words, not by exact strings**.
//
// *In plain terms: "Cost (£)" in the spreadsheet and "Cost in pounds" on the
// table are the same thing to a person, so Infora suggests them as a pair. The
// builder still confirms or changes every pairing; this only fills the boxes
// in with a good first guess.*
//
// A heading and a column are compared as sets of words: lower-case, split on
// anything that is not a letter or a digit, "£" and "GBP" read as "pounds", and
// the small words (in, of, the, a, per, and) dropped. They pair when the sets
// are equal, or one holds the other. A column's key is tried as well as its
// label. A heading is never given to two columns.

const SMALL_WORDS = new Set(['in', 'of', 'the', 'a', 'per', 'and']);

/** A heading or label as the set of words that matter in it. */
export function headingWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/£/g, ' pounds ')
      .replace(/\bgbp\b/g, ' pounds ')
      .split(/[^a-z0-9]+/)
      .filter((word) => word !== '' && !SMALL_WORDS.has(word)),
  );
}

/** 3 when the word sets are equal, 2 when one holds the other, 0 otherwise. */
function closeness(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const aInB = [...a].every((word) => b.has(word));
  const bInA = [...b].every((word) => a.has(word));
  return aInB && bInA ? 3 : aInB || bInA ? 2 : 0;
}

/**
 * Suggest which heading fills which column. `kept` is what the source was
 * already mapped to (honoured first, while that heading still exists); the rest
 * are paired best-match first, ties going to the earlier column and the earlier
 * heading, so the same inputs always give the same suggestion.
 */
export function suggestMapping(
  columns: Array<{ key: string; label: string }>,
  headers: string[],
  kept: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  const takenHeaders = new Set<number>();
  for (const column of columns) {
    const header = kept[column.key];
    const at = header === undefined ? -1 : headers.indexOf(header);
    if (at !== -1 && !takenHeaders.has(at)) {
      out[column.key] = header!;
      takenHeaders.add(at);
    }
  }
  const pairs: Array<{ column: number; header: number; score: number }> = [];
  columns.forEach((column, columnIndex) => {
    if (out[column.key] !== undefined) return;
    const names = [headingWords(column.label), headingWords(column.key)];
    headers.forEach((header, headerIndex) => {
      if (takenHeaders.has(headerIndex)) return;
      const words = headingWords(header);
      const score = Math.max(...names.map((name) => closeness(name, words)));
      if (score > 0) pairs.push({ column: columnIndex, header: headerIndex, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score || a.column - b.column || a.header - b.header);
  for (const pair of pairs) {
    const column = columns[pair.column]!;
    if (out[column.key] !== undefined || takenHeaders.has(pair.header)) continue;
    out[column.key] = headers[pair.header]!;
    takenHeaders.add(pair.header);
  }
  return out;
}
