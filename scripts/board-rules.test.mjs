// The guard must fail on the drift it was written for — a closed ticket whose
// record never left the board — and must stay quiet on the shapes a real board
// uses. The trap case is `✅ Unblocked`, which is a gate clearing and not a
// close: reading it as one would file two live tickets into the archive.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBoard } from './board-rules.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function tree(planBody, historyBody = '', frontierBody = '') {
  root = mkdtempSync(join(tmpdir(), 'infora-board-rules-'));
  mkdirSync(join(root, 'docs/build'), { recursive: true });
  writeFileSync(
    join(root, 'docs/build/plan.md'),
    `# Board\n\n## Where to start\n\n${frontierBody}\n\n## Building for V1\n\n${planBody}\n\n## Beyond V1 — the deferred register\n\n- **T-999 — deferred, never checked.**\n  a second line the guard must not read\n`,
  );
  writeFileSync(join(root, 'docs/build/plan-history.md'), `# History\n\n${historyBody}\n`);
  return root;
}

const pointer = (id) =>
  `- ~~**${id} — a thing.**~~ ✅ **Built 2026-08-28**. Record in [plan-history.md](plan-history.md#slice-ask).`;

describe('a closed ticket must have let go of its record', () => {
  it('rejects a closed entry that still carries its record', () => {
    const violations = checkBoard(
      tree(
        `- **T-100 — a thing.** ✅ **Built 2026-08-28**. Record in [plan-history.md](plan-history.md).\n  and here is the whole finding, still on the live board`,
        'T-100',
      ),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('T-100');
    expect(violations[0]).toContain('2 lines');
  });

  it('rejects a closed entry with no pointer — archiving is not deleting', () => {
    const violations = checkBoard(tree('- ~~**T-101 — a thing.**~~ ✅ **Built 2026-08-28**.', 'T-101'));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('does not link to plan-history.md');
  });

  it('rejects a pointer the archive cannot honour', () => {
    const violations = checkBoard(tree(pointer('T-102'), 'T-999 and nothing else'));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('the archive does not mention it');
  });
});

describe('what the guard must not do', () => {
  it('leaves an open entry alone, however long it runs', () => {
    const violations = checkBoard(
      tree('- **T-200 — an open thing.** the design it is built against\n  and a second line\n  and a third'),
    );
    expect(violations).toEqual([]);
  });

  it('does NOT read `✅ Unblocked` as closed — it is a gate clearing', () => {
    // T-310 and T-311 both carry it and are both open. A rule keyed on the
    // tick alone would file two live tickets into the archive, which is the
    // guard causing the loss it exists to prevent.
    const violations = checkBoard(
      tree('- **T-310 — the checker DAG.** ✅ **Unblocked 2026-08-01 → ADR-0048.**\n  the capability, still to build'),
    );
    expect(violations).toEqual([]);
  });

  it('accepts the shape the board actually uses', () => {
    expect(checkBoard(tree(pointer('T-103'), 'T-103 — a thing. the whole record'))).toEqual([]);
  });

  it('ignores the deferred register — it is recorded work, not closed work', () => {
    // the fixture's Beyond-V1 entry runs to two lines and names no history
    expect(checkBoard(tree(pointer('T-104'), 'T-104'))).toEqual([]);
  });

  it('says so plainly if the section it is scoped to was renamed', () => {
    root = mkdtempSync(join(tmpdir(), 'infora-board-rules-'));
    mkdirSync(join(root, 'docs/build'), { recursive: true });
    writeFileSync(join(root, 'docs/build/plan.md'), '# Board\n\n## Something Else\n');
    writeFileSync(join(root, 'docs/build/plan-history.md'), '# History\n');
    const violations = checkBoard(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('Where to start');
  });
});

describe('the 2026-08-28 widenings', () => {
  it('reads the frontier — a closed record parked in Where to start is caught', () => {
    // the regrowth case: a dozen of these were sitting above the guard's old
    // ceiling on the day its scope was widened, in the same file it guards
    const violations = checkBoard(
      tree('', 'T-500', '- ~~**T-500 — landed today.**~~ ✅ **Built 2026-08-28**. Record in [plan-history.md](plan-history.md).\n  and the whole finding, parked on the frontier'),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('T-500');
    expect(violations[0]).toContain('2 lines');
  });

  it('reads `✅ Done` as closed — a synonym must not smuggle a record past the guard', () => {
    const violations = checkBoard(
      tree('- **T-501 — a thing.** ✅ Done 2026-08-28.\n  the record, still here, no pointer anywhere'),
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('T-501'))).toBe(true);
  });
});

describe('the real board', () => {
  it('passes its own guard', async () => {
    const { fileURLToPath } = await import('node:url');
    const repo = join(join(fileURLToPath(import.meta.url), '..'), '..');
    expect(checkBoard(repo)).toEqual([]);
  });
});
