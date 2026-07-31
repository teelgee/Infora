// T-250 acceptance — the untrusted-content barrier is a type, and this is what
// makes that claim checkable rather than aspirational (finding F3).
//
// Every file under fixtures/must-not-compile is a way of getting external
// content into the working input the model sees. Each must FAIL to typecheck,
// and must fail for the stated reason — a fixture that failed because of a
// typo would pass this test while proving nothing. The control fixture must
// compile, so a broken tsconfig cannot make the suite green by failing
// everything.
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { AssembledItem } from '@infora/contracts';
import { externalSource, WEB_RESEARCH_TRUST } from './web-research';

const run = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = join(packageRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const fixtures = join(packageRoot, 'fixtures');

const COMPILER_FLAGS = [
  '--noEmit',
  '--strict',
  '--target',
  'ES2022',
  '--module',
  'ESNext',
  '--moduleResolution',
  'Bundler',
  '--skipLibCheck',
];

async function typecheck(args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    await run(process.execPath, [tsc, ...args], { cwd: packageRoot });
    return { ok: true, output: '' };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

// the reason each fixture must fail — not merely THAT it fails
const EXPECTED: Record<string, RegExp> = {
  'external-as-assembled-item.ts': /'ExternalSource' is missing the following properties from type 'AssembledItem'/,
  'external-into-assembled-input.ts': /not assignable to parameter of type 'AssembledItem'/,
  'worker-deps-carry-a-store.ts': /'db' does not exist in type 'WebResearchDeps'/,
};

describe('the untrusted-content type barrier (T-250)', () => {
  const files = readdirSync(join(fixtures, 'must-not-compile')).filter((f) => f.endsWith('.ts'));

  it('has a fixture for every attempt it claims to block', () => {
    expect(files.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(files)('%s does not compile, for the stated reason', async (file) => {
    const result = await typecheck([...COMPILER_FLAGS, join('fixtures', 'must-not-compile', file)]);
    expect(result.ok, `${file} compiled — the barrier is gone`).toBe(false);
    expect(result.output).toMatch(EXPECTED[file]!);
  });

  it('the control fixture compiles — the suite is not green by breakage', async () => {
    const result = await typecheck(['-p', join('fixtures', 'tsconfig.control.json')]);
    expect(result.ok, result.output).toBe(true);
  });
});

describe('the external source constructor', () => {
  it('stamps trust rather than accepting it', () => {
    const source = externalSource({
      url: 'https://example.invalid/a',
      publisher: 'Example',
      title: 'A page',
      publishedDate: null,
      retrievedAt: '2026-07-30T00:00:00.000Z',
      excerpt: 'text',
      relevance: 'relevant',
    });
    expect(source.trust).toBe(WEB_RESEARCH_TRUST);
    expect(WEB_RESEARCH_TRUST).toBe('external-untrusted');

    // and at runtime it is not an AssembledItem either: nothing that reads the
    // working input would find a channel, a source or content on it
    const asRecord = source as unknown as Partial<AssembledItem>;
    expect(asRecord.channel).toBeUndefined();
    expect(asRecord.source).toBeUndefined();
    expect(asRecord.content).toBeUndefined();
  });
});
