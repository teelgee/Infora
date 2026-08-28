import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAdrNumbers } from './adr-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { violations, highest, next } = checkAdrNumbers(root);

const pad4 = (n) => String(n).padStart(4, '0');

// `node scripts/check-adrs.mjs --next` prints the next free number and nothing
// else, so a session can derive it instead of scanning the folder by eye.
if (process.argv.includes('--next')) {
  console.log(`ADR-${pad4(next)}`);
  process.exit(0);
}

if (violations.length > 0) {
  console.error('ADR-number violations:\n' + violations.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log(`ADR numbers hold: highest claimed ADR-${pad4(highest)} — next free ADR-${pad4(next)}.`);
