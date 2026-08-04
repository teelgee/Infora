// The link guard, checked in CI beside the docs index (docs-rules.mjs), the
// dependency matrix (dep-rules.mjs), the source guards (source-rules.mjs) and
// the two counters (ticket-rules.mjs, question-rules.mjs).
//
// Why it exists: the docs layer is several hundred relative links — every ADR
// points into the build layer, every build doc points back — and nothing
// validated any of them. A file move rewrites dozens of paths by hand, and a
// bad rewrite fails silently: the link renders, the click goes nowhere, and
// nobody notices until a reader needed the target. The 2026-08 restructure
// moved ~70 files; this guard is what made that provable rather than hopeful.
//
// What it checks, mechanically:
//   1. every relative markdown link and image in every .md under docs/ and at
//      the repo root resolves to a file or directory that exists
//   2. a link into another .md's #anchor resolves to a real heading there
//      (GitHub's slug rules); anchors into non-markdown targets — #L123 line
//      references — are existence-checked on the file only
//
// External http(s)/mailto links are ignored: no network calls in CI, and a dead
// external URL is not a repository defect. Pre-existing breakage can be carried
// in a baseline file (see check-links.mjs --baseline) so the guard can land on
// an imperfect tree without being switched off — new breakage still fails.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/** Root-level markdown plus everything under docs/. */
function markdownFiles(root) {
  const files = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(root, e.name));
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) files.push(p);
    }
  };
  walk(join(root, 'docs'));
  return files;
}

// A link or image: [text](target) / ![alt](target), optionally with a "title".
// The target stops at whitespace or the closing paren — titles and formatting
// after a space belong to the link, not the path.
const LINK = /!?\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;

/**
 * Fenced code blocks and inline code spans hold example links, not links —
 * blank them (preserving line structure) so the matcher never sees them.
 */
function withoutCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length));
}

/**
 * GitHub's heading slug: strip inline formatting, lowercase, drop everything
 * but letters, digits, spaces, hyphens and underscores, spaces to hyphens.
 * Duplicate headings get -1, -2… suffixes.
 */
export function slugsOf(markdown) {
  const seen = new Map();
  const slugs = new Set();
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (!m) continue;
    const text = m[1]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links keep their text
      .replace(/[*_~`]/g, ''); // formatting marks go, their content stays
    let slug = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\p{Emoji_Presentation} _-]/gu, '')
      .replace(/\p{Emoji_Presentation}/gu, '')
      .replace(/ /g, '-');
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count}`;
    slugs.add(slug);
  }
  // raw HTML anchors are valid targets too
  for (const m of markdown.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) slugs.add(m[1]);
  return slugs;
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} root repository root
 * @returns {{ violations: string[], total: number }} violations as
 *   `source:line → target (reason)`; total is every in-repo link checked
 */
export function checkLinks(root) {
  const violations = [];
  let total = 0;
  const slugCache = new Map();
  const headingSlugs = (file) => {
    if (!slugCache.has(file)) slugCache.set(file, slugsOf(readFileSync(file, 'utf8')));
    return slugCache.get(file);
  };

  for (const file of markdownFiles(root)) {
    const text = readFileSync(file, 'utf8');
    const source = relative(root, file).split(sep).join('/');
    const lines = withoutCode(text).split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(LINK)) {
        const target = match[1];
        if (/^(https?|mailto):/.test(target)) continue;
        total += 1;
        const [path, anchor] = target.split('#');
        const resolved =
          path === ''
            ? file // same-file anchor
            : path.startsWith('/')
              ? join(root, path)
              : resolve(dirname(file), decodeURIComponent(path));
        if (path !== '' && !exists(resolved)) {
          violations.push(`${source}:${index + 1} → ${target} (file does not exist)`);
          continue;
        }
        if (anchor !== undefined && resolved.endsWith('.md')) {
          if (!headingSlugs(resolved).has(anchor)) {
            violations.push(`${source}:${index + 1} → ${target} (no such heading)`);
          }
        }
      }
    });
  }

  return { violations, total };
}

/**
 * A baseline entry is `source → target` — no line number, so an unrelated edit
 * above a known-broken link does not resurface it. Only links broken before the
 * guard landed belong here; fixing them removes their line.
 * @param {string[]} violations
 * @param {string} baselineText
 */
export function withoutBaseline(violations, baselineText) {
  const keyOf = (v) => v.replace(/:(\d+) → /, ' → ').replace(/ \([^)]*\)$/, '');
  const baseline = new Set(
    baselineText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')),
  );
  return violations.filter((v) => !baseline.has(keyOf(v)));
}
