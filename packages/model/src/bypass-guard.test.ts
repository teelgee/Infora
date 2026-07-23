// ADR-0037 §3/§5 — the load-bearing check: the router's "cannot be bypassed"
// guarantee holds only if no caller reaches a provider directly. This guard
// walks the whole repo (packages + apps) and fails if any file outside
// packages/model imports a provider SDK or fetches a provider URL directly.
// The ESLint no-restricted-imports rule enforces the same at lint time; this
// test enforces it in the suite the ADR's acceptance gates on, and also
// catches raw fetch() to a provider host, which the import lint cannot see.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const MODEL_PACKAGE = join('packages', 'model'); // the one place providers live

// what a bypass looks like: importing a provider SDK, or hitting a provider
// host with a raw request outside the adapters
const PROVIDER_SDKS = [/@anthropic-ai\/sdk/, /from ['"]voyageai['"]/, /from ['"]openai['"]/];
const PROVIDER_HOSTS = [/api\.anthropic\.com/, /api\.voyageai\.com/, /api\.openai\.com/];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (entry.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('provider bypass guard (ADR-0037 §3/§5)', () => {
  it('no file outside packages/model reaches a provider directly', () => {
    const roots = [join(repoRoot, 'packages'), join(repoRoot, 'apps')];
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        if (file.includes(join(repoRoot, MODEL_PACKAGE))) continue; // the choke point
        if (file.endsWith('bypass-guard.test.ts')) continue; // this guard names the patterns
        const text = readFileSync(file, 'utf8');
        const hit =
          PROVIDER_SDKS.some((re) => re.test(text)) || PROVIDER_HOSTS.some((re) => re.test(text));
        if (hit) offenders.push(file.slice(repoRoot.length));
      }
    }

    expect(offenders, `provider access outside packages/model: ${offenders.join(', ')}`).toEqual([]);
  });
});
