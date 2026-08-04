import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinks, withoutBaseline } from './link-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { violations, total } = checkLinks(root);

// `--baseline <file>` carries breakage that predates the guard, as
// `source → target` lines — pre-existing rot must not stop the guard landing,
// and new breakage must still fail.
let live = violations;
const flag = process.argv.indexOf('--baseline');
if (flag !== -1 && process.argv[flag + 1]) {
  live = withoutBaseline(violations, readFileSync(process.argv[flag + 1], 'utf8'));
}

if (live.length > 0) {
  console.error('Broken links:\n' + live.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log(`Links hold: ${total} in-repo links checked, none broken.`);
