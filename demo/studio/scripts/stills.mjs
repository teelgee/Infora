// Render many check-frames of one composition from a single bundle.
// Bundling is the slow part, so this is much faster than repeated
// `npx remotion still` calls.
//
//   node scripts/stills.mjs <CompositionId> <frame> [<frame> …] [--scale=0.5]
//   node scripts/stills.mjs W1-document-management 207 700 1500 --scale=0.5
//
// Frames are written to out/stills/<CompositionId>/<frame>.png (out/ is
// gitignored scratch; empty it whenever you like).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const scaleArg = args.find((a) => a.startsWith('--scale='));
const scale = scaleArg ? Number(scaleArg.split('=')[1]) : 0.5;
const [id, ...rest] = args.filter((a) => !a.startsWith('--'));
const frames = rest.map(Number).filter((n) => Number.isFinite(n));
if (!id || frames.length === 0) {
  console.error('usage: node scripts/stills.mjs <CompositionId> <frame> [<frame> …] [--scale=0.5]');
  process.exit(1);
}

const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts') });
const composition = await selectComposition({ serveUrl, id });
const outDir = path.join(root, 'out/stills', id);
fs.mkdirSync(outDir, { recursive: true });
for (const frame of frames) {
  const output = path.join(outDir, `${frame}.png`);
  await renderStill({ composition, serveUrl, frame, output, scale });
  console.log(output);
}
