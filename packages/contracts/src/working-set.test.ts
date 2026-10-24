// T-471 — the words beside a run that was handed a working set, and the
// working-area query.
import { describe, expect, it } from 'vitest';
import { WORKING_AREA_PAGE_SIZE, isHiddenEntry, workingAreaQuery, workingSetStatement } from './working-set';

describe('T-471 — workingSetStatement', () => {
  it('a run handed nothing carries no line at all (not "0 documents")', () => {
    expect(workingSetStatement(undefined)).toBeNull();
    expect(workingSetStatement([])).toBeNull();
  });

  it('says it drew on the working area, with the count, and lists the titles for the hover', () => {
    const s = workingSetStatement([
      { sandboxDocumentId: 'a', label: 'Land quality method statement' },
      { sandboxDocumentId: 'b', label: 'Ecology baseline note' },
    ]);
    expect(s?.line).toBe('Drawing on your working area — 2 documents');
    expect(s?.titles).toEqual(['Land quality method statement', 'Ecology baseline note']);
    expect(s?.hiddenCount).toBe(0);
  });

  it('is singular for one', () => {
    expect(workingSetStatement([{ sandboxDocumentId: 'a', label: 'x' }])?.line).toBe(
      'Drawing on your working area — 1 document',
    );
  });

  it('a reader in none of the working areas is told how many, with no title', () => {
    const s = workingSetStatement([{ hidden: true }, { hidden: true }, { hidden: true }]);
    expect(s?.line).toBe('3 documents from a working area you are not in');
    expect(s?.titles).toEqual([]);
    expect(s?.hiddenCount).toBe(3);
  });

  it('a reader in some of them sees the label for the whole set and the titles they may see', () => {
    const s = workingSetStatement([{ sandboxDocumentId: 'a', label: 'Mine' }, { hidden: true }]);
    expect(s?.line).toBe('Drawing on your working area — 2 documents');
    expect(s?.titles).toEqual(['Mine']);
    expect(s?.hiddenCount).toBe(1);
  });

  it('tells a hidden entry from a document', () => {
    expect(isHiddenEntry({ hidden: true })).toBe(true);
    expect(isHiddenEntry({ sandboxDocumentId: 'a', label: 'x' })).toBe(false);
  });
});

describe('T-471 — the working-area query', () => {
  it('pages at 50 and starts on page 1', () => {
    expect(WORKING_AREA_PAGE_SIZE).toBe(50);
    expect(workingAreaQuery.parse({})).toEqual({ page: 1 });
    expect(workingAreaQuery.parse({ q: '  land ', page: '2' })).toEqual({ q: 'land', page: 2 });
  });

  it('refuses a page below 1', () => {
    expect(workingAreaQuery.safeParse({ page: '0' }).success).toBe(false);
  });
});
