import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTicketNumbers } from './ticket-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { violations, highest, next, counter } = checkTicketNumbers(root);

// `node scripts/check-tickets.mjs --next` prints the next free number and
// nothing else, so a session can derive it instead of trusting the prose line.
if (process.argv.includes('--next')) {
  console.log(`T-${next}`);
  process.exit(0);
}

if (violations.length > 0) {
  console.error('Ticket-number violations:\n' + violations.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log(
  `Ticket numbers hold: highest claimed T-${highest}, counter T-${counter} — next free T-${next}.`,
);
