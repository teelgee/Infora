import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pad } from './counter-rules.mjs';
import { checkQuestionNumbers } from './question-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { violations, highest, next, counter } = checkQuestionNumbers(root);

// `node scripts/check-questions.mjs --next` prints the next free number and
// nothing else, so a session can derive it instead of trusting the prose line.
if (process.argv.includes('--next')) {
  console.log(`Q-${pad(next)}`);
  process.exit(0);
}

if (violations.length > 0) {
  console.error('Question-number violations:\n' + violations.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log(
  `Question numbers hold: highest claimed Q-${pad(highest)}, counter Q-${pad(counter)} — next free Q-${pad(next)}.`,
);
