import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBoard } from './board-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const violations = checkBoard(root);
if (violations.length > 0) {
  console.error('Board-hygiene violations:\n' + violations.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log('Board holds: every closed ticket has moved to plan-history.md and left a pointer.');
