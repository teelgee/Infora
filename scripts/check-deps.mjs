import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDeps } from './dep-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const manifests = ['apps', 'packages'].flatMap((group) =>
  readdirSync(join(root, group), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => JSON.parse(readFileSync(join(root, group, e.name, 'package.json'), 'utf8'))),
);
// the e2e (T-084) and eval (T-255) harnesses are workspace packages too —
// same discipline, and neither lives under apps/ or packages/
for (const harness of ['e2e', 'evals']) {
  manifests.push(JSON.parse(readFileSync(join(root, harness, 'package.json'), 'utf8')));
}

const violations = checkDeps(manifests);
if (violations.length > 0) {
  console.error('Dependency-rule violations:\n' + violations.map((v) => `  ✗ ${v}`).join('\n'));
  process.exit(1);
}
console.log(`Dependency rules hold across ${manifests.length} workspace packages.`);
