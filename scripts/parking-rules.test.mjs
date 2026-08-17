// R1 — the parking-lot guard is the third configuration of one engine, so what
// is worth testing here is the CONFIGURATION, not the engine: the lot's own
// counter shape, its archive being grill-history (a taken-up proposal leaves
// with its session record), and its struck-pointer convention. The engine's
// general behaviour is already covered by ticket-rules.test.mjs and
// question-rules.test.mjs; duplicating it here would be a third copy of the
// same assertions drifting apart, which is the failure the shared engine
// exists to prevent.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkParkedNumbers } from './parking-rules.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function tree({ lot = '', history = '' }) {
  root = mkdtempSync(join(tmpdir(), 'infora-parking-rules-'));
  mkdirSync(join(root, 'docs/grill-sessions'), { recursive: true });
  writeFileSync(join(root, 'docs/grill-sessions/parking-lot.md'), lot);
  writeFileSync(join(root, 'docs/grill-sessions/grill-history.md'), history);
  return root;
}

// the lot's real counter shape — the tracker's, with a full stop inside the
// bold run rather than the board's bare form
const counter = (n) => `**Numbering.** \`P-###\` — **Next free number: P-${n}.** Derive it.\n`;

describe('rule 1 — one definition per number', () => {
  it('rejects two different proposals claiming one number', () => {
    const { violations } = checkParkedNumbers(
      tree({
        lot:
          counter('003') +
          '- **P-001 — Mirroring, and the external-collaborator tier.** *Raised 2026-08-17.*\n' +
          '- **P-001 — Something a concurrent session parked.** *Raised 2026-08-17.*\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('defined twice, for different parked proposals');
    expect(violations[0]).toContain('renumber');
  });

  it('admits the struck pointer a taken-up proposal leaves behind', () => {
    const { violations } = checkParkedNumbers(
      tree({
        lot:
          counter('002') +
          '- ~~**P-001 — Mirroring, and the external-collaborator tier.**~~ ✅ Taken up 2026-09-01. Record in grill-history.md.\n',
        history: '- **P-001 — Mirroring, and the external-collaborator tier.** Session record.\n',
      }),
    );
    expect(violations).toEqual([]);
  });

  it('still fires when the archive holds a DIFFERENT proposal on the same number', () => {
    const { violations } = checkParkedNumbers(
      tree({
        lot: counter('002') + '- ~~**P-001 — Mirroring.**~~ ✅ Taken up. Record in grill-history.md.\n',
        history: '- **P-001 — An unrelated proposal someone archived.** Session record.\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('for different parked proposals');
  });

  it('names the move advice when one proposal is copied rather than moved', () => {
    const { violations } = checkParkedNumbers(
      tree({
        lot: counter('002') + '- **P-001 — Mirroring.** *Raised 2026-08-17.*\n',
        history: '- **P-001 — Mirroring.** Session record.\n',
      }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('MOVES to grill-history.md');
  });
});

describe('rule 2 — the counter is ahead of every claim', () => {
  it('fires when the counter has fallen behind a claimed number', () => {
    const { violations } = checkParkedNumbers(
      tree({ lot: counter('002') + '- **P-002 — A proposal minted without bumping the line.**\n' }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('counter says P-002 is free, but P-002 is already claimed');
  });

  it('does not read the counter line itself as a claim', () => {
    const { violations, next } = checkParkedNumbers(
      tree({ lot: counter('002') + '- **P-001 — Mirroring.** *Raised 2026-08-17.*\n' }),
    );
    expect(violations).toEqual([]);
    expect(next).toBe(2);
  });

  // the lot states its own three-digit convention as "`P-001`, never `P-1`",
  // exactly as the tracker states "`Q-007`, never `Q-7`". That prose mentions a
  // low number, and a guard that read it as a claim would be harmless — but a
  // guard that read it as the HIGHEST claim would hide a real collision.
  it('is unmoved by the three-digit convention line naming P-1', () => {
    const { violations, highest } = checkParkedNumbers(
      tree({
        lot:
          counter('002') +
          'Numbers are three digits (`P-001`, never `P-1`).\n' +
          '- **P-001 — Mirroring.** *Raised 2026-08-17.*\n',
      }),
    );
    expect(violations).toEqual([]);
    expect(highest).toBe(1);
  });

  it('reports the missing counter line as the missing mutex it is', () => {
    const { violations } = checkParkedNumbers(
      tree({ lot: '- **P-001 — Mirroring.** *Raised 2026-08-17.*\n' }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('is the mutex every session reads');
  });
});
