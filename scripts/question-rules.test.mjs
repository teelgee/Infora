// R1 — the question guard must FAIL on the collision it exists to prevent (two
// sessions both reaching for Q-034 on 2026-08-03) and must NOT fire on the
// shapes the tracker legitimately uses — above all the struck pointer stub a
// ruled question leaves behind. A guard that only ever passes is decoration; a
// guard that fires on a document's own convention gets disabled within a week.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkQuestionNumbers } from './question-rules.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function tree({ tracker = '', history = '' }) {
  root = mkdtempSync(join(tmpdir(), 'infora-question-rules-'));
  mkdirSync(join(root, 'docs/grill-sessions'), { recursive: true });
  writeFileSync(join(root, 'docs/grill-sessions/grill-questions.md'), tracker);
  writeFileSync(join(root, 'docs/grill-sessions/grill-history.md'), history);
  return root;
}

// the tracker's real counter shape — a full stop inside the bold run, unlike
// the board's
const counter = (n) => `\`Q-###\` — title. **Next free number: Q-${n}.** Each entry carries:\n`;

describe('rule 1 — one definition per number', () => {
  it('rejects two different questions claiming one number — the 2026-08-03 collision', () => {
    const { violations } = checkQuestionNumbers(
      tree({
        tracker:
          counter('040') +
          '- **Q-034 — What an assistive agent inside a surface knows.** **[B]**\n' +
          '- **Q-034 — Something a concurrent session raised.** **[B]**\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('defined twice, for different questions');
    expect(violations[0]).toContain('renumber');
  });

  it('names the number with its leading zeros — Q-007, never Q-7', () => {
    const { violations } = checkQuestionNumbers(
      tree({
        tracker:
          counter('040') +
          '- **Q-007 — The rulebook’s channel.** **[B]**\n' +
          '- **Q-007 — A different question entirely.** **[B]**\n',
      }),
    );
    expect(violations[0]).toContain('Q-007 is defined twice');
  });

  it('admits the struck pointer stub a ruled question leaves in the tracker', () => {
    // the established pattern: the full record moves to history, and a one-line
    // struck pointer stays so a reader looking up Q-007 finds where it went
    const { violations } = checkQuestionNumbers(
      tree({
        tracker:
          counter('040') +
          '- ~~**Q-007 — The rulebook’s channel.**~~ ✅ **Ruled 2026-08-01** → ADR-0048. Record in [grill-history.md](grill-history.md).\n',
        history: '- ~~**Q-007 — The rulebook’s channel.**~~ ✅ **Ruled 2026-08-01 (owner).** The long record.\n',
      }),
    );
    expect(violations).toEqual([]);
  });

  it('still fires when the tracker copy is NOT struck — that is a real duplicate', () => {
    const { violations } = checkQuestionNumbers(
      tree({
        tracker: counter('040') + '- **Q-007 — The rulebook’s channel.** **[B]** Open.\n',
        history: '- ~~**Q-007 — The rulebook’s channel.**~~ ✅ Ruled.\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('MOVES to grill-history.md');
  });

  it('still fires on two DIFFERENT questions even when one is struck', () => {
    // the stub is a pointer to the SAME question; it is never a licence to
    // reuse the number
    const { violations } = checkQuestionNumbers(
      tree({
        tracker: counter('040') + '- ~~**Q-012 — Mention delivery.**~~ ✅ Ruled → ADR-0049.\n',
        history: '- **Q-012 — An unrelated question that took the number.** **[B]**\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('different questions');
  });
});

describe('rule 2 — the counter is ahead of every claim', () => {
  it('rejects a counter a claimed number has overtaken', () => {
    const { violations } = checkQuestionNumbers(
      tree({ tracker: counter('030') + '- **Q-034 — A newer question.** **[B]**\n' }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('counter says Q-030 is free');
    expect(violations[0]).toContain('Set it to Q-035');
  });

  it('counts a number claimed only in a commit subject', async () => {
    // the collision mode the prose convention cannot see: a number taken on a
    // branch whose tracker edit has not landed in this working tree
    const { execFileSync } = await import('node:child_process');
    const repo = tree({ tracker: counter('034') });
    const git = (...args) =>
      execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] });
    git('init', '-q');
    git('config', 'user.email', 'guard@test.local');
    git('config', 'user.name', 'guard');
    git('add', '-A');
    git('commit', '-q', '-m', 'Q-034: the privacy programme');
    const { violations, next } = checkQuestionNumbers(repo);
    expect(next).toBe(35);
    expect(violations[0]).toContain('Q-034 is already claimed');
  });

  it('rejects a tracker with no counter line at all', () => {
    const { violations } = checkQuestionNumbers(
      tree({ tracker: '- **Q-001 — A question.** **[B]**\n' }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('no "**Next free number');
  });
});

describe('what the guard must not do', () => {
  it('does not read the `Q-###` template as a claim', () => {
    const { violations, highest } = checkQuestionNumbers(tree({ tracker: counter('036') }));
    expect(highest).toBe(0);
    expect(violations).toEqual([]);
  });

  it('does not read the counter line as a claim on its own number', () => {
    const { violations, next } = checkQuestionNumbers(
      tree({ tracker: counter('036') + '- **Q-035 — Controller or processor.** **[B]**\n' }),
    );
    expect(violations).toEqual([]);
    expect(next).toBe(36);
  });

  it('does not treat an interacts-with reference as a definition', () => {
    const { violations } = checkQuestionNumbers(
      tree({
        tracker:
          counter('040') +
          '- **Q-002 — The per-document guidance artefact.** Needs an ADR, and carries **Q-003**.\n' +
          '- **Q-003 — Signal-derived guidance crossing organisations.** Settle with **Q-002**.\n',
      }),
    );
    expect(violations).toEqual([]);
  });
});

describe('the real repository', () => {
  it('passes its own guard', async () => {
    const { fileURLToPath } = await import('node:url');
    const repo = join(join(fileURLToPath(import.meta.url), '..'), '..');
    const { violations } = checkQuestionNumbers(repo);
    expect(violations).toEqual([]);
  });
});
