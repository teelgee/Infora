import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPersonalData } from './personal-data-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const violations = checkPersonalData(root);
if (violations.length > 0) {
  console.error('Personal-data register violations:\n' + violations.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log('Personal-data register holds: every who-did-this column belongs to a registered table.');
