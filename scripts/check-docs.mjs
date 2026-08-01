import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocsIndex } from './docs-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const violations = checkDocsIndex(root);
if (violations.length > 0) {
  console.error('Docs-index violations:\n' + violations.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log('Docs index holds: every build doc is indexed, and every indexed doc exists.');
