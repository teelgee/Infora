// R1 — the guard must FAIL on the two collisions it exists to prevent, and it
// must NOT fire on the shapes the board legitimately uses (ranges, status
// notes, prose references). A guard that only ever passes is decoration; a
// guard that fires on ordinary prose gets disabled within a week.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTicketNumbers } from './ticket-rules.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function tree({ board = '', history = '' }) {
  root = mkdtempSync(join(tmpdir(), 'infora-ticket-rules-'));
  mkdirSync(join(root, 'docs/build'), { recursive: true });
  writeFileSync(join(root, 'docs/build/plan.md'), board);
  writeFileSync(join(root, 'docs/build/plan-history.md'), history);
  return root;
}

const counter = (n) => `\`T-###\` — title. **Next free number: T-${n}** — check this line.\n`;

describe('rule 1 — one definition per number', () => {
  it('rejects two different tickets claiming one number', () => {
    const { violations } = checkTicketNumbers(
      tree({
        board:
          counter(300) +
          '- **T-250 — The untrusted-content type barrier.** Built.\n' +
          '- **T-250 — Something else entirely.** Also built.\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('defined twice, for different tickets');
    expect(violations[0]).toContain('renumber');
  });

  it('rejects a closed ticket copied into history rather than moved', () => {
    // UNSTRUCK on the board and full in the archive: two entries, not a
    // pointer and a record.
    const { violations } = checkTicketNumbers(
      tree({
        board: counter(300) + '- **T-245 — Conflict register: schema and predicate.** Built.\n',
        history: '- **T-245 — Conflict register: schema and predicate.** Built.\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('a struck one-line pointer stays on the board');
  });

  it('accepts a STRUCK pointer on the board beside its record in history', () => {
    // 2026-08-28 — the board adopted the tracker's convention (a closed ticket
    // leaves a struck one-liner and its record moves), so it adopted the
    // tracker's tolerance with it. Before that the board moved a closing SLICE
    // whole and this shape was correctly a violation.
    const { violations } = checkTicketNumbers(
      tree({
        board:
          counter(300) +
          '- ~~**T-245 — Conflict register: schema and predicate.**~~ ✅ **Built** (migration 0032). Record in [plan-history.md](plan-history.md#slice-ask).\n',
        history: '- **T-245 — Conflict register: schema and predicate.** Built. The whole record.\n',
      }),
    );
    expect(violations).toEqual([]);
  });

  it('still fires on two DIFFERENT tickets on one number, struck or not', () => {
    // the tolerance must not blunt the collision it exists for — two
    // renumbers' worth of cost (T-208–T-210, T-223–T-233)
    const { violations } = checkTicketNumbers(
      tree({
        board:
          counter(300) +
          '- ~~**T-245 — Conflict register: schema and predicate.**~~ ✅ Built. Record in [plan-history.md](plan-history.md).\n' +
          '- **T-245 — Something else entirely.** a different ticket on the same number\n',
        history: '- **T-245 — Conflict register: schema and predicate.** Built.\n',
      }),
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('for different tickets'))).toBe(true);
  });

  it('accepts the same ticket defined once, in either file', () => {
    const { violations } = checkTicketNumbers(
      tree({
        board: counter(300) + '- **T-299 — A live ticket.** Open.\n',
        history: '- **T-245 — A closed ticket.** Built.\n',
      }),
    );
    expect(violations).toEqual([]);
  });

  it('tolerates a title edited after the fact', () => {
    // the same number, the same ticket, wording tightened in one place only —
    // still a copy rather than a move, but reported as the softer failure
    const { violations } = checkTicketNumbers(
      tree({
        board: counter(300) + '- **T-245 — Conflict register: schema and predicate.** Open.\n',
        history: '- **T-245 — Conflict register — schema and predicate!** Built.\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('same ticket');
  });
});

describe('rule 2 — the counter is ahead of every claim', () => {
  it('rejects a counter that a claimed number has overtaken', () => {
    const { violations } = checkTicketNumbers(
      tree({ board: counter(250) + '- **T-260 — The plan artefact.** Built.\n' }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('counter says T-250 is free');
    expect(violations[0]).toContain('Set it to T-261');
  });

  it('rejects a counter equal to a claimed number', () => {
    const { violations } = checkTicketNumbers(
      tree({ board: counter(260) + '- **T-260 — The plan artefact.** Built.\n' }),
    );
    expect(violations[0]).toContain('Set it to T-261');
  });

  it('counts a number that appears only in prose', () => {
    // the collision that actually happened: numbers claimed in a status note
    // before their ticket bullets were written
    const { violations, next } = checkTicketNumbers(
      tree({ board: counter(224) + '✅ **T-223–T-233 built 2026-07-26** (owner session).\n' }),
    );
    expect(next).toBe(234);
    expect(violations[0]).toContain('T-233 is already claimed');
  });

  it('rejects a board with no counter line at all', () => {
    const { violations } = checkTicketNumbers(
      tree({ board: '- **T-100 — A ticket.** Open.\n' }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('no "**Next free number');
  });
});

describe('what the guard must not do', () => {
  it('does not read the counter template as a claim', () => {
    // the header's literal `T-###` is not a number and must not parse as one
    const { violations, highest } = checkTicketNumbers(tree({ board: counter(300) }));
    expect(highest).toBe(0);
    expect(violations).toEqual([]);
  });

  it('does not read the counter line as a claim on its own number', () => {
    // the guard's first run against the real board failed on exactly this: the
    // counter names T-299 in order to declare it FREE, and scanning it as a
    // claim made a correct board fail
    const { violations, next } = checkTicketNumbers(
      tree({ board: counter(299) + '- **T-298 — Seed the scenario.** Built.\n' }),
    );
    expect(violations).toEqual([]);
    expect(next).toBe(299);
  });

  it('does not treat a dependency reference as a definition', () => {
    const { violations } = checkTicketNumbers(
      tree({
        board:
          counter(300) +
          '- **T-262 — Execute from the plan.** | *(Deps: T-260)*\n' +
          '- **T-263 — Step and run state migration.** | *(Deps: T-262)*\n',
      }),
    );
    expect(violations).toEqual([]);
  });

  it('catches a collision hiding behind a non-standard entry form', () => {
    // found by the 2026-08-28 audit's break-it pass: a plain-bullet claim
    // (`- T-250 — …`, no bold run) was invisible to rule 1, so a sloppy entry
    // could sit on an already-claimed number without a violation
    const { violations } = checkTicketNumbers(
      tree({
        board:
          counter(300) +
          '- **T-250 — The untrusted-content type barrier.** Built.\n' +
          '- T-250 — something else entirely, written in a hurry\n',
      }),
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes('for different tickets'))).toBe(true);
  });

  it('does not read a struck or status-glyph loose line as a rival claim', () => {
    // pointers and status notes legitimately take loose forms; only an
    // unstruck, glyph-free loose line is collision evidence
    const { violations } = checkTicketNumbers(
      tree({
        board:
          counter(300) +
          '- ~~**T-245** — a thing.~~ ✅ Built — moved record in [plan-history.md](plan-history.md)\n',
        history: '- **T-245 — Conflict register: schema and predicate.** Built. The whole record.\n',
      }),
    );
    expect(violations).toEqual([]);
  });

  it('holds a struck-through ticket to its number', () => {
    const { violations } = checkTicketNumbers(
      tree({
        board:
          counter(300) +
          '- ~~**T-248 — Scope attenuation.**~~ Downgraded.\n' +
          '- **T-248 — A different ticket.** Open.\n',
      }),
    );
    expect(violations[0]).toContain('different tickets');
  });
});

describe('the real repository', () => {
  it('passes its own guard', async () => {
    const { fileURLToPath } = await import('node:url');
    const repo = join(join(fileURLToPath(import.meta.url), '..'), '..');
    const { violations } = checkTicketNumbers(repo);
    expect(violations).toEqual([]);
  });
});
