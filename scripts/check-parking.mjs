import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pad } from './counter-rules.mjs';
import { checkParkedNumbers } from './parking-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { violations, highest, next, counter } = checkParkedNumbers(root);

// `node scripts/check-parking.mjs --next` prints the next free number and
// nothing else, so a session can derive it instead of trusting the prose line.
if (process.argv.includes('--next')) {
  console.log(`P-${pad(next)}`);
  process.exit(0);
}

if (violations.length > 0) {
  console.error('Parked-proposal number violations:\n' + violations.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log(
  `Parked-proposal numbers hold: highest claimed P-${pad(highest)}, counter P-${pad(counter)} — next free P-${pad(next)}.`,
);
