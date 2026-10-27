// Slims the full-resolution captures in ./shots/ (gitignored, @2x) into the
// committed views in docs/architecture/user-story-screens/: each is resized to
// 1440 wide and stored as an 8-bit palette PNG (libimagequant, through sharp,
// at quality 70 with no dither). Same names, same format, about a quarter of
// the 24-bit size.
//
// Why (housekeeping, 2026-10-27): the 107 views had grown to 28 MB as 24-bit
// PNGs, and the self-contained guide build.mjs emits with --inline carried them
// as base64 — 35 MB, over the 16 MB a published artifact may be. The views are
// flat warm greys with a little colour, so a 256-colour palette holds every
// edge of the anti-aliased text; the three settings tried (quality 100, 80 and
// 60) were indistinguishable at 1:1, and 70 keeps a margin either way.
//
// Run it between capture.mjs and build.mjs, every time — the recipe in
// capture.mjs's header names it. Skipping it re-bloats the page on the next
// recapture:
//   node scripts/user-story-walkthrough/capture.mjs
//   node scripts/user-story-walkthrough/slim.mjs
//   node scripts/user-story-walkthrough/build.mjs
//
// A committed view with no capture behind it is reported, not deleted: shots/
// is emptied by capture.mjs, so a leftover here is a renamed beat whose old
// file has outlived it (the trap T-404's recapture found), and a person
// decides what it is.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const SHOTS = path.join(here, 'shots');
const VIEWS = path.join(repoRoot, 'docs/architecture/user-story-screens');

const WIDTH = 1440;
const PNG = { palette: true, quality: 70, dither: 0, compressionLevel: 9, effort: 10 };

if (!fs.existsSync(SHOTS)) {
  console.error(`${SHOTS} does not exist — run capture.mjs first.`);
  process.exit(1);
}
const shots = fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).sort();
if (shots.length === 0) {
  console.error(`${SHOTS} holds no .png — run capture.mjs first.`);
  process.exit(1);
}
fs.mkdirSync(VIEWS, { recursive: true });

let before = 0;
let after = 0;
for (const name of shots) {
  const src = path.join(SHOTS, name);
  const dst = path.join(VIEWS, name);
  if (fs.existsSync(dst)) before += fs.statSync(dst).size;
  await sharp(src)
    .resize({ width: WIDTH, kernel: 'lanczos3', withoutEnlargement: true })
    .png(PNG)
    .toFile(dst);
  after += fs.statSync(dst).size;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`${shots.length} views written to ${path.relative(repoRoot, VIEWS)}: ${mb(before)} → ${mb(after)}`);

const leftovers = fs
  .readdirSync(VIEWS)
  .filter((f) => f.endsWith('.png') && !shots.includes(f))
  .sort();
if (leftovers.length > 0) {
  console.warn(
    `${leftovers.length} committed view(s) have no capture behind them — a renamed beat, or a partial capture? Not deleted:\n  ${leftovers.join('\n  ')}`,
  );
}
