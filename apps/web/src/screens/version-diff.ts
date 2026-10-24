// T-480 — the word-level comparison behind the document page's Compare tab.
//
// *In plain terms: give it the older text and the newer text and it says what
// was taken out and what was put in, word by word, paragraph by paragraph. A
// "change" is one unbroken stretch of taken-out and/or put-in words, so a word
// swapped for another counts once, not twice.*
//
// Pure and dependency-free (CI audits dependencies). Paragraphs are lines; they
// are lined up first (an unchanged one matches itself, an edited one matches
// its most similar neighbour), then each matched pair is compared word by word.
// Whitespace is not compared: two texts that differ only in spacing are the
// same text. Runs carry words without their spaces; the view puts one space
// between runs.

export type DiffRun = {
  text: string;
  kind: 'same' | 'ins' | 'del';
  /** the change this run belongs to (1-based, in reading order); null for unchanged words */
  change: number | null;
};

export type DiffRow = {
  /** same: both sides identical; changed: a paragraph edited in place; deleted / inserted: a whole paragraph on one side */
  kind: 'same' | 'changed' | 'deleted' | 'inserted';
  /** the older side: unchanged words and deletions */
  left: DiffRun[];
  /** the newer side: unchanged words and insertions */
  right: DiffRun[];
};

export type VersionDiff = {
  rows: DiffRow[];
  /** contiguous runs of inserted and/or deleted words; a replacement counts once */
  changes: number;
  /** changes that put words in (a replacement is one insertion and one deletion) */
  insertions: number;
  deletions: number;
};

const blocksOf = (text: string): string[] =>
  text
    .split(/\n+/)
    .map((b) => b.trim())
    .filter((b) => b !== '');
const wordsOf = (block: string): string[] => block.match(/\S+/g) ?? [];

/** Above this many word pairs a paragraph is shown as wholly replaced rather than compared. */
const WORD_PAIR_LIMIT = 4_000_000;
/** Two paragraphs this alike are the same paragraph, edited. */
const SIMILAR = 0.4;

type Op = { op: 'same' | 'del' | 'ins'; word: string };

/** The shortest edit between two word lists (longest common subsequence). */
export function wordOps(a: readonly string[], b: readonly string[]): Op[] {
  if (a.length * b.length > WORD_PAIR_LIMIT) {
    return [...a.map((word) => ({ op: 'del' as const, word })), ...b.map((word) => ({ op: 'ins' as const, word }))];
  }
  const cols = b.length + 1;
  const table = new Uint32Array((a.length + 1) * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1]! + 1
          : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ op: 'same', word: a[i]! });
      i++;
      j++;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) {
      ops.push({ op: 'del', word: a[i++]! });
    } else {
      ops.push({ op: 'ins', word: b[j++]! });
    }
  }
  while (i < a.length) ops.push({ op: 'del', word: a[i++]! });
  while (j < b.length) ops.push({ op: 'ins', word: b[j++]! });
  return ops;
}

/** How alike two paragraphs are, 0 to 1: the shared share of their words (Dice over word counts). */
function similarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const w of a) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of b) {
    const n = counts.get(w) ?? 0;
    if (n > 0) {
      shared++;
      counts.set(w, n - 1);
    }
  }
  return (2 * shared) / (a.length + b.length);
}

type Item = { t: 'match'; i: number; j: number } | { t: 'del'; i: number } | { t: 'ins'; j: number };

/** A gap of leftover paragraphs bigger than this (rows x rows) is shown as wholly replaced, counted once. */
export const GAP_PAIR_LIMIT = 250_000;
/** The exact-match fallback table is built only up to this many cells. */
const EXACT_DP_LIMIT = 4_000_000;

/** Longest common subsequence of two id lists, as matched index pairs. */
function lcsPairs(a: readonly number[], b: readonly number[], aLo: number, aHi: number, bLo: number, bHi: number) {
  const n = aHi - aLo;
  const m = bHi - bLo;
  const cols = m + 1;
  const table = new Uint32Array((n + 1) * cols);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[aLo + i] === b[bLo + j]
          ? table[(i + 1) * cols + j + 1]! + 1
          : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }
  const out: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[aLo + i] === b[bLo + j]) out.push([aLo + i++, bLo + j++]);
    else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) i++;
    else j++;
  }
  return out;
}

/**
 * Exactly-equal paragraphs, paired in order, without ever scoring similarity:
 * trim what is identical at both ends, anchor on paragraphs that occur once on
 * each side (longest increasing run of them), and recurse into what lies
 * between. A stretch with no anchor falls back to a table, if small enough.
 */
function exactPairs(a: readonly number[], b: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const walk = (aLo: number, aHi: number, bLo: number, bHi: number) => {
    const head: Array<[number, number]> = [];
    while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) head.push([aLo++, bLo++]);
    const tail: Array<[number, number]> = [];
    while (aLo < aHi && bLo < bHi && a[aHi - 1] === b[bHi - 1]) tail.push([--aHi, --bHi]);
    out.push(...head);
    if (aLo < aHi && bLo < bHi) {
      const countA = new Map<number, number>();
      const countB = new Map<number, number>();
      for (let i = aLo; i < aHi; i++) countA.set(a[i]!, (countA.get(a[i]!) ?? 0) + 1);
      for (let j = bLo; j < bHi; j++) countB.set(b[j]!, (countB.get(b[j]!) ?? 0) + 1);
      const posB = new Map<number, number>();
      for (let j = bLo; j < bHi; j++) if (countB.get(b[j]!) === 1) posB.set(b[j]!, j);
      const cand: Array<[number, number]> = [];
      for (let i = aLo; i < aHi; i++) {
        if (countA.get(a[i]!) === 1 && posB.has(a[i]!)) cand.push([i, posB.get(a[i]!)!]);
      }
      if (cand.length > 0) {
        // longest increasing subsequence on the b positions
        const tails: number[] = [];
        const prev: number[] = new Array(cand.length).fill(-1);
        for (let k = 0; k < cand.length; k++) {
          let lo = 0;
          let hi = tails.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cand[tails[mid]!]![1] < cand[k]![1]) lo = mid + 1;
            else hi = mid;
          }
          if (lo > 0) prev[k] = tails[lo - 1]!;
          tails[lo] = k;
        }
        const chain: Array<[number, number]> = [];
        for (let k = tails[tails.length - 1]!; k !== -1 && k !== undefined; k = prev[k]!) chain.push(cand[k]!);
        chain.reverse();
        let ca = aLo;
        let cb = bLo;
        for (const [i, j] of chain) {
          walk(ca, i, cb, j);
          out.push([i, j]);
          ca = i + 1;
          cb = j + 1;
        }
        walk(ca, aHi, cb, bHi);
      } else if ((aHi - aLo) * (bHi - bLo) <= EXACT_DP_LIMIT) {
        out.push(...lcsPairs(a, b, aLo, aHi, bLo, bHi));
      }
    }
    out.push(...tail.reverse());
  };
  walk(0, a.length, 0, b.length);
  return out;
}

/** Line up one gap's paragraphs: the alignment with the most shared words, edits matched to their nearest neighbour. */
function alignGap(
  a: ReadonlyArray<readonly string[]>,
  b: ReadonlyArray<readonly string[]>,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): Item[] {
  const n = aHi - aLo;
  const m = bHi - bLo;
  if (n === 0 || m === 0 || n * m > GAP_PAIR_LIMIT) {
    return [
      ...Array.from({ length: n }, (_, k): Item => ({ t: 'del', i: aLo + k })),
      ...Array.from({ length: m }, (_, k): Item => ({ t: 'ins', j: bLo + k })),
    ];
  }
  const cols = m + 1;
  const score = new Float64Array((n + 1) * cols);
  const sim = (i: number, j: number) => {
    const s = similarity(a[aLo + i]!, b[bLo + j]!);
    return s >= SIMILAR ? s : -1;
  };
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      let best = Math.max(score[(i + 1) * cols + j]!, score[i * cols + j + 1]!);
      const s = sim(i, j);
      if (s >= 0) best = Math.max(best, score[(i + 1) * cols + j + 1]! + s);
      score[i * cols + j] = best;
    }
  }
  const items: Item[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const s = sim(i, j);
    if (s >= 0 && score[i * cols + j] === score[(i + 1) * cols + j + 1]! + s) {
      items.push({ t: 'match', i: aLo + i++, j: bLo + j++ });
    } else if (score[(i + 1) * cols + j]! >= score[i * cols + j + 1]!) {
      items.push({ t: 'del', i: aLo + i++ });
    } else {
      items.push({ t: 'ins', j: bLo + j++ });
    }
  }
  while (i < n) items.push({ t: 'del', i: aLo + i++ });
  while (j < m) items.push({ t: 'ins', j: bLo + j++ });
  return items;
}

/** Exact matches anchor the alignment; similarity is scored only inside the gaps between them. */
function alignBlocks(a: ReadonlyArray<readonly string[]>, b: ReadonlyArray<readonly string[]>): Item[] {
  const ids = new Map<string, number>();
  const idOf = (words: readonly string[]) => {
    const key = words.join(' ');
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = ids.size));
    return id;
  };
  const pairs = exactPairs(a.map(idOf), b.map(idOf));
  const items: Item[] = [];
  let ai = 0;
  let bj = 0;
  for (const [i, j] of pairs) {
    items.push(...alignGap(a, b, ai, i, bj, j), { t: 'match', i, j });
    ai = i + 1;
    bj = j + 1;
  }
  items.push(...alignGap(a, b, ai, a.length, bj, b.length));
  return items;
}

export function diffVersions(older: string, newer: string): VersionDiff {
  const a = blocksOf(older).map(wordsOf);
  const b = blocksOf(newer).map(wordsOf);
  const rows: DiffRow[] = [];
  let changes = 0;
  let insertions = 0;
  let deletions = 0;

  const whole = (words: readonly string[], kind: 'ins' | 'del', change: number): DiffRun[] => [
    { text: words.join(' '), kind, change },
  ];

  let gapDel: number[] = [];
  let gapIns: number[] = [];
  const flushGap = () => {
    if (gapDel.length === 0 && gapIns.length === 0) return;
    const change = ++changes;
    if (gapDel.length > 0) deletions++;
    if (gapIns.length > 0) insertions++;
    for (const i of gapDel) rows.push({ kind: 'deleted', left: whole(a[i]!, 'del', change), right: [] });
    for (const j of gapIns) rows.push({ kind: 'inserted', left: [], right: whole(b[j]!, 'ins', change) });
    gapDel = [];
    gapIns = [];
  };

  for (const item of alignBlocks(a, b)) {
    if (item.t === 'del') {
      gapDel.push(item.i);
      continue;
    }
    if (item.t === 'ins') {
      gapIns.push(item.j);
      continue;
    }
    flushGap();
    const ops = wordOps(a[item.i]!, b[item.j]!);
    if (ops.every((o) => o.op === 'same')) {
      const run: DiffRun = { text: a[item.i]!.join(' '), kind: 'same', change: null };
      rows.push({ kind: 'same', left: [run], right: [{ ...run }] });
      continue;
    }
    const left: DiffRun[] = [];
    const right: DiffRun[] = [];
    let same: string[] = [];
    let del: string[] = [];
    let ins: string[] = [];
    const closeChange = () => {
      if (del.length === 0 && ins.length === 0) return;
      const change = ++changes;
      if (del.length > 0) {
        deletions++;
        left.push({ text: del.join(' '), kind: 'del', change });
      }
      if (ins.length > 0) {
        insertions++;
        right.push({ text: ins.join(' '), kind: 'ins', change });
      }
      del = [];
      ins = [];
    };
    const closeSame = () => {
      if (same.length === 0) return;
      left.push({ text: same.join(' '), kind: 'same', change: null });
      right.push({ text: same.join(' '), kind: 'same', change: null });
      same = [];
    };
    for (const o of ops) {
      if (o.op === 'same') {
        closeChange();
        same.push(o.word);
      } else {
        closeSame();
        (o.op === 'del' ? del : ins).push(o.word);
      }
    }
    closeChange();
    closeSame();
    rows.push({ kind: 'changed', left, right });
  }
  flushGap();
  return { rows, changes, insertions, deletions };
}

/** "3 changes — 2 insertions, 1 deletion"; "No changes" when the texts match. */
export function changeCountWords(diff: Pick<VersionDiff, 'changes' | 'insertions' | 'deletions'>): string {
  if (diff.changes === 0) return 'No changes';
  const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    ...(diff.insertions > 0 ? [noun(diff.insertions, 'insertion', 'insertions')] : []),
    ...(diff.deletions > 0 ? [noun(diff.deletions, 'deletion', 'deletions')] : []),
  ];
  return `${noun(diff.changes, 'change', 'changes')} — ${parts.join(', ')}`;
}
