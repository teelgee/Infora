// T-480 — the word-level comparison: what counts as one change.
import { describe, expect, it } from 'vitest';
import { changeCountWords, diffVersions, GAP_PAIR_LIMIT } from './version-diff';

const base = [
  'The contamination baseline was set from the 2022 trial pits.',
  'Groundwater was not encountered during the first visit.',
  'The dewatering plan follows the standard method.',
].join('\n\n');

describe('diffVersions (T-480)', () => {
  it('finds no change between identical texts', () => {
    const d = diffVersions(base, base);
    expect(d).toMatchObject({ changes: 0, insertions: 0, deletions: 0 });
    expect(d.rows.every((r) => r.kind === 'same')).toBe(true);
    expect(changeCountWords(d)).toBe('No changes');
  });

  it('ignores spacing and blank lines', () => {
    expect(diffVersions(base, base.replace(/\n\n/g, '\n').replace(/ /g, '  ')).changes).toBe(0);
  });

  it('counts a replaced word as one change (one insertion, one deletion)', () => {
    const d = diffVersions(base, base.replace('standard', 'approved'));
    expect(d).toMatchObject({ changes: 1, insertions: 1, deletions: 1 });
    const changed = d.rows.find((r) => r.kind === 'changed')!;
    expect(changed.left.find((r) => r.kind === 'del')?.text).toBe('standard');
    expect(changed.right.find((r) => r.kind === 'ins')?.text).toBe('approved');
    expect(changeCountWords(d)).toBe('1 change — 1 insertion, 1 deletion');
  });

  it('counts an inserted paragraph as one change', () => {
    const d = diffVersions(base, `${base}\n\nA new closing paragraph about monitoring.`);
    expect(d).toMatchObject({ changes: 1, insertions: 1, deletions: 0 });
    expect(d.rows.at(-1)).toMatchObject({ kind: 'inserted' });
    expect(d.rows.at(-1)!.left).toEqual([]);
  });

  it('counts a deleted paragraph as one change', () => {
    const d = diffVersions(base, base.replace('\n\nGroundwater was not encountered during the first visit.', ''));
    expect(d).toMatchObject({ changes: 1, insertions: 0, deletions: 1 });
    expect(d.rows.find((r) => r.kind === 'deleted')).toBeDefined();
  });

  it('counts a paragraph rewritten from scratch once, not twice', () => {
    const d = diffVersions('Alpha beta gamma delta.', 'Entirely different sentence about something else.');
    expect(d.changes).toBe(1);
  });

  it('counts three separated edits as exactly three changes', () => {
    const edited = base
      .replace('trial pits.', 'trial pits and the 2024 boreholes.')
      .replace('first visit', 'visit')
      .replace('standard method', 'method agreed with the regulator');
    const d = diffVersions(base, edited);
    expect(d.changes).toBe(3);
    const numbers = new Set(d.rows.flatMap((r) => [...r.left, ...r.right]).map((r) => r.change).filter((n) => n !== null));
    expect([...numbers].sort()).toEqual([1, 2, 3]);
    expect(changeCountWords(d)).toMatch(/^3 changes — /);
  });

  it('keeps an edited paragraph beside its original when a paragraph is added above it', () => {
    const d = diffVersions(base, `A fresh opening paragraph.\n\n${base.replace('standard', 'approved')}`);
    expect(d.changes).toBe(2);
    expect(d.rows.filter((r) => r.kind === 'changed')).toHaveLength(1);
  });

  it('diffs a 3,000-paragraph chapter with two small edits quickly and counts exactly two changes', () => {
    const para = (k: number) => `Paragraph ${k} reports finding ${k * 7} at location ${k % 13} of the corridor survey.`;
    const older = Array.from({ length: 3000 }, (_, k) => para(k));
    const newer = [...older];
    newer[700] = `${newer[700]} Added words here.`;
    newer[2200] = newer[2200]!.replace('finding', 'result');
    const t0 = performance.now();
    const d = diffVersions(older.join('\n\n'), newer.join('\n\n'));
    const ms = performance.now() - t0;
    console.info(`3,000 paragraphs, two edits: ${ms.toFixed(1)} ms`);
    expect(d.changes).toBe(2);
    expect(ms).toBeLessThan(500);
  });

  it('shows a gap too big to compare as wholly replaced, counted once', () => {
    const side = (tag: string) => Array.from({ length: 600 }, (_, k) => `${tag} paragraph ${k} unlike ${tag}${k}`);
    expect(600 * 600).toBeGreaterThan(GAP_PAIR_LIMIT);
    const d = diffVersions(side('alpha').join('\n'), side('omega').join('\n'));
    expect(d.changes).toBe(1);
    expect(d.rows).toHaveLength(1200);
  });
});
