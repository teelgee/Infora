// T-479 — the thread states, the filters, the progress lines and the response
// link, pinned. Static markup, as `render.test.tsx` does it: what is under test
// is the derivation and the copy, both decided before any handler runs.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ReviewComment, ReviewResponseRecord, Round } from '@infora/contracts';
import { findQuote, QuoteText } from '../source-card';
import {
  buildThreads,
  filterThreads,
  NO_FILTER,
  progressLines,
  progressWords,
  responseLinkPath,
  threadCodes,
  threadReviewers,
  threadState,
} from './threads';
import { ThreadsPanel } from './threads-panel';

const response = (patch: Partial<ReviewResponseRecord>): ReviewResponseRecord => ({
  id: 'r1',
  commentId: 'c1',
  author: { participantId: 'a', name: 'Eleanor Price' },
  body: 'Done.',
  nextVersionId: null,
  nextVersionAnchor: null,
  noChangeReason: null,
  createdAt: '2026-10-24T10:00:00Z',
  ...patch,
});

const comment = (id: string, by: string, patch: Partial<ReviewComment> = {}): ReviewComment => ({
  id,
  roundId: 'round-1',
  versionId: 'v1',
  author: { participantId: by.toLowerCase(), name: by },
  body: `${id} first line\nsecond line`,
  acceptanceCode: null,
  anchor: null,
  createdAt: `2026-10-24T09:00:${id.slice(-2).padStart(2, '0')}Z`,
  response: null,
  ...patch,
});

const round = (number: number, comments: ReviewComment[], patch: Partial<Round> = {}): Round => ({
  id: `round-${number}`,
  number,
  versionId: `v${number}`,
  versionReference: `P0${number}`,
  state: 'issued',
  acknowledgedBy: null,
  acknowledgedAt: null,
  reviewerCompletions: [],
  commentsWithheld: false,
  completionsWithheld: false,
  reviewPeriodTarget: null,
  deliverableCode: null,
  comments,
  transmittals: [],
  ...patch,
});

describe('threadState', () => {
  const rounds = [{ number: 1 }, { number: 2 }];
  it('is no change when the response says no change was made', () => {
    expect(threadState({ response: response({ noChangeReason: 'Out of scope' }) }, { number: 1 }, rounds)).toBe('no_change');
  });
  it('is answered when the response carries a revised passage', () => {
    expect(
      threadState({ response: response({ nextVersionAnchor: { quote: 'the new words' } }) }, { number: 1 }, rounds),
    ).toBe('answered');
  });
  it('is overtaken when nothing answered it and a later round exists', () => {
    expect(threadState({ response: null }, { number: 1 }, rounds)).toBe('overtaken');
  });
  it('is open when nothing answered it and no later round exists', () => {
    expect(threadState({ response: null }, { number: 2 }, rounds)).toBe('open');
  });
  it('counts an answer as an answer even in an overtaken round', () => {
    expect(threadState({ response: response({ noChangeReason: 'x' }) }, { number: 1 }, rounds)).toBe('no_change');
  });
});

describe('threads and their filters', () => {
  const c1 = comment('c-01', 'Rachel', { acceptanceCode: { id: 'k1', code: 'A2' } });
  const c2 = comment('c-02', 'Nadia', { acceptanceCode: { id: 'k2', code: 'B1' }, response: response({ noChangeReason: 'n/a' }) });
  const c3 = comment('c-03', 'Nadia');
  const cycle = { rounds: [round(1, [c1, c2]), round(2, [c3], { state: 'open' })] };
  const threads = buildThreads(cycle);

  it('lists newest round first, each round oldest comment first', () => {
    expect(threads.map((t) => t.comment.id)).toEqual(['c-03', 'c-01', 'c-02']);
    expect(threads.map((t) => t.state)).toEqual(['open', 'overtaken', 'no_change']);
  });
  it('filters by reviewer, by code and by state, and they combine', () => {
    expect(filterThreads(threads, { ...NO_FILTER, reviewerId: 'nadia' }).map((t) => t.comment.id)).toEqual(['c-03', 'c-02']);
    expect(filterThreads(threads, { ...NO_FILTER, codeId: 'k1' }).map((t) => t.comment.id)).toEqual(['c-01']);
    expect(filterThreads(threads, { ...NO_FILTER, state: 'overtaken' }).map((t) => t.comment.id)).toEqual(['c-01']);
    expect(filterThreads(threads, { state: 'open', reviewerId: 'rachel', codeId: null })).toEqual([]);
  });
  it('names the reviewers and the codes present', () => {
    expect(threadReviewers(threads).map((r) => r.name)).toEqual(['Nadia', 'Rachel']);
    expect(threadCodes(threads).map((c) => c.code)).toEqual(['A2', 'B1']);
  });
});

describe('progressLines', () => {
  const grants = [
    { participantId: 'rachel', name: 'Rachel Bowen', confirmedAt: '2026-10-01', revokedAt: null, declinedAt: null },
    { participantId: 'nadia', name: 'Nadia Okonjo', confirmedAt: '2026-10-01', revokedAt: null, declinedAt: null },
    { participantId: 'tom', name: 'Tom Reid', confirmedAt: null, revokedAt: null, declinedAt: null },
  ];
  const open = round(1, [comment('c-01', 'Rachel'), comment('c-02', 'Rachel'), comment('c-03', 'Nadia')], {
    state: 'open',
    reviewerCompletions: [{ participantId: 'nadia', name: 'Nadia Okonjo', completedAt: '2026-10-24T10:00:00Z' }],
  });
  it('is one line per confirmed reviewer, with their comments and whether they are done', () => {
    const lines = progressLines(open, grants)!;
    expect(lines.map(progressWords)).toEqual([
      'Rachel Bowen — 2 comments · still reading',
      'Nadia Okonjo — 1 comment · done',
    ]);
  });
  it('draws nothing at all, not zeros, where the read withheld the round', () => {
    expect(progressLines({ ...open, comments: [], reviewerCompletions: [], commentsWithheld: true, completionsWithheld: true }, grants)).toBeNull();
  });
  it('draws nothing for a round that is not open', () => {
    expect(progressLines({ ...open, state: 'issued' }, grants)).toBeNull();
  });
});

describe('the response link', () => {
  it('opens the next version with the revised passage in the query', () => {
    expect(
      responseLinkPath('p1', 'c1', { nextVersionId: 'v2', nextVersionAnchor: { quote: 'the 2024 survey', page: 3 } }),
    ).toBe('/projects/p1/documents/c1?version=v2&quote=the+2024+survey&page=3');
  });
  it('is no link before the next version exists, or without a revised passage', () => {
    expect(responseLinkPath('p1', 'c1', { nextVersionId: null, nextVersionAnchor: { quote: 'x' } })).toBeNull();
    expect(responseLinkPath('p1', 'c1', { nextVersionId: 'v2', nextVersionAnchor: null })).toBeNull();
  });
});

describe('findQuote', () => {
  it('finds the first exact occurrence', () => {
    expect(findQuote('a cat and a cat', 'a cat')).toEqual({ start: 0, end: 5 });
  });
  it('finds it ignoring case and across a line break', () => {
    const text = 'The revised\nGround   Investigation shows more.';
    const hit = findQuote(text, 'revised ground investigation')!;
    expect(text.slice(hit.start, hit.end)).toBe('revised\nGround   Investigation');
  });
  it('is null when the quote is not in the text', () => {
    expect(findQuote('nothing here', 'the 2024 survey')).toBeNull();
  });
});

describe('ThreadsPanel', () => {
  const props = {
    withheldRounds: [],
    filter: NO_FILTER,
    onFilter: () => undefined,
    activeId: null,
    onSelect: () => undefined,
    progress: [],
    projectId: 'p1',
    containerId: 'c1',
    versionRefById: { v2: 'P02' },
  };
  const html = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

  it('says the round is withheld, in words, and draws no progress line', () => {
    const out = html(<ThreadsPanel {...props} threads={[]} withheldRounds={[{ id: 'r', number: 2 }]} />);
    expect(out).toContain('Round 2 is open, so there is nothing to list yet');
    expect(out).not.toContain('data-progress-line');
    expect(out).not.toContain('No comments have been written');
  });
  it('shows a link on an answered thread once the next version exists', () => {
    const answered = comment('c-01', 'Rachel', {
      response: response({ nextVersionId: 'v2', nextVersionAnchor: { quote: 'new words' } }),
    });
    const out = html(<ThreadsPanel {...props} threads={buildThreads({ rounds: [round(1, [answered]), round(2, [])] })} />);
    expect(out).toContain('See the change in P02');
    expect(out).toContain('/projects/p1/documents/c1?version=v2&amp;quote=new+words');
    expect(out).toContain('Answered');
  });
  it('draws the progress lines it is given', () => {
    const out = html(
      <ThreadsPanel
        {...props}
        threads={[]}
        progress={[{ round: { id: 'r', number: 1, versionReference: 'P01' }, lines: [{ participantId: 'a', name: 'Priya Shah', comments: 12, done: true }] }]}
      />,
    );
    expect(out).toContain('Priya Shah — 12 comments · done');
  });
});

describe('QuoteText', () => {
  it('marks the first occurrence of the revised passage in the text', () => {
    const out = renderToStaticMarkup(<QuoteText content="Before the new words, and the new words again." quote="the new words" />);
    expect(out).toContain('<mark data-passage="true" data-quote="true">the new words</mark>');
    expect(out.indexOf('<mark')).toBeLessThan(out.indexOf('again'));
    expect(out.match(/<mark/g)).toHaveLength(1);
  });
  it('says so, quietly, when the passage is not in the text, and still shows the text', () => {
    const out = renderToStaticMarkup(<QuoteText content="Nothing like it here." quote="a passage nobody wrote" />);
    expect(out).toContain('The revised passage could not be found in this version’s text');
    expect(out).toContain('Nothing like it here.');
    expect(out).not.toContain('<mark');
  });
});
