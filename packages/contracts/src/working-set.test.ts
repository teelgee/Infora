// T-471 — the words beside a run that was handed a working set, and the
// working-area query.
import { describe, expect, it } from 'vitest';
import { WORKING_AREA_PAGE_SIZE, isOpenEntry, workingAreaQuery, workingSetStatement } from './working-set';

describe('T-471/T-482 — workingSetStatement', () => {
  const open = (label: string) => ({ sandboxDocumentId: 'a', label, openToYou: true as const });
  const closed = (label: string) => ({ label, openToYou: false as const });
  const removed = (label: string) => ({ label, openToYou: false as const, removed: true as const });

  it('a run handed nothing carries no line at all (not "0 documents")', () => {
    expect(workingSetStatement(undefined)).toBeNull();
    expect(workingSetStatement([])).toBeNull();
  });

  it('says it drew on the working area, with the count, and lists the titles for the hover', () => {
    const s = workingSetStatement([open('Land quality method statement'), open('Ecology baseline note')]);
    expect(s?.line).toBe('Drawing on your working area — 2 documents');
    expect(s?.entries).toEqual([
      { title: 'Land quality method statement', mark: null },
      { title: 'Ecology baseline note', mark: null },
    ]);
  });

  it('is singular for one', () => {
    expect(workingSetStatement([open('x')])?.line).toBe('Drawing on your working area — 1 document');
  });

  it('a reader outside the working area reads every title, each marked, under the same line', () => {
    const s = workingSetStatement([closed('Team draft'), closed('Narrow draft')]);
    expect(s?.line).toBe('Drawing on your working area — 2 documents');
    expect(s?.entries).toEqual([
      { title: 'Team draft', mark: 'not open to you' },
      { title: 'Narrow draft', mark: 'not open to you' },
    ]);
  });

  it('a draft deleted for good keeps its title with the removed mark', () => {
    expect(workingSetStatement([removed('Gone draft')])?.entries).toEqual([{ title: 'Gone draft', mark: 'document removed' }]);
  });

  it('the line is the same for a member and for an outsider', () => {
    const member = workingSetStatement([open('A'), open('B')]);
    const outsider = workingSetStatement([closed('A'), removed('B')]);
    expect(outsider?.line).toBe(member?.line);
  });

  it('tells an open entry from one that is not', () => {
    expect(isOpenEntry(closed('x'))).toBe(false);
    expect(isOpenEntry(open('x'))).toBe(true);
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
