import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSourceRules } from './source-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const violations = checkSourceRules(root);
if (violations.length > 0) {
  console.error('Source-rule violations:\n' + violations.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log('Source rules hold: the grounding index has one reader, and no prompt carries a permission.');
