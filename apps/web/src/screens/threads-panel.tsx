// T-479 — the Threads panel on the review screen, and the response link.
//
// *In plain terms: every comment of the review in one list, each marked open,
// answered, no change or overtaken. Filter it by person, by code or by state,
// and walk it with J and K. While a round is open the reviewing side also sees
// one line per reviewer; the authoring side sees neither the comments nor the
// lines, and is told so.*
//
// Presentation only: the state, the filters and the lines are decided in
// `threads.ts`, the selection and the keys live on the screen so the round
// card's comment and the list row are one highlight.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ReviewComment, Round } from '@infora/contracts';
import { Badge, SectionLabel } from '@infora/ui';
import { formatDateTime } from './shared';
import {
  filterThreads,
  isFiltered,
  NO_FILTER,
  progressWords,
  responseLinkPath,
  THREAD_STATES,
  threadCodes,
  threadReviewers,
  type ProgressLine,
  type Thread,
  type ThreadFilter,
  type ThreadState,
} from './threads';

const STATE_BADGE: Record<ThreadState, { tone: 'info' | 'success' | 'neutral' | 'warning'; label: string }> = {
  open: { tone: 'info', label: 'Open' },
  answered: { tone: 'success', label: 'Answered' },
  no_change: { tone: 'neutral', label: 'No change' },
  overtaken: { tone: 'warning', label: 'Overtaken' },
};

/** A response's revised passage, as a link into the next version — or, before that version exists, as words. */
export function ResponseChange(props: {
  response: NonNullable<ReviewComment['response']>;
  projectId: string;
  containerId: string;
  versionRefById: Record<string, string>;
}) {
  const { response } = props;
  const quote = response.nextVersionAnchor?.quote;
  const path = responseLinkPath(props.projectId, props.containerId, response);
  const ref = response.nextVersionId ? props.versionRefById[response.nextVersionId] : undefined;
  return (
    <>
      {path !== null ? (
        <Link to={path} data-response-link>
          See the change in {ref ?? 'the next version'}
        </Link>
      ) : (
        'Change prepared for the next revision'
      )}
      {quote && (
        <>
          {' '}
          — <i>“{quote}”</i>
        </>
      )}
    </>
  );
}

function FilterChip(props: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={props.active}
      title={props.title}
      onClick={props.onClick}
      style={props.active ? { background: 'var(--surface-hover)', borderColor: 'var(--action-primary-bg)', color: 'var(--text-primary)' } : undefined}
    >
      {props.children}
      {props.active && <span aria-hidden> ×</span>}
    </button>
  );
}

export function ThreadsPanel(props: {
  threads: ReadonlyArray<Thread>;
  /** the rounds whose comments this reader may not read yet (ADR-0014) */
  withheldRounds: ReadonlyArray<Pick<Round, 'id' | 'number'>>;
  filter: ThreadFilter;
  onFilter: (next: ThreadFilter) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  progress: ReadonlyArray<{ round: Pick<Round, 'id' | 'number' | 'versionReference'>; lines: ReadonlyArray<ProgressLine> }>;
  projectId: string;
  containerId: string;
  versionRefById: Record<string, string>;
}) {
  const { threads, filter } = props;
  const visible = filterThreads(threads, filter);
  const set = (patch: Partial<ThreadFilter>) => props.onFilter({ ...filter, ...patch });
  const reviewers = threadReviewers(threads);
  const codes = threadCodes(threads);
  const active = isFiltered(filter);
  const countFor = (facet: keyof ThreadFilter, test: (t: Thread) => boolean) =>
    filterThreads(threads, filter, facet).filter(test).length;

  return (
    <div style={{ marginBottom: 24 }} data-threads-panel>
      <SectionLabel>Threads</SectionLabel>

      {props.withheldRounds.map((r) => (
        <div key={r.id} className="withheld" style={{ margin: '0 0 8px' }}>
          Round {r.number} is open, so there is nothing to list yet: the comments stay with the review group
          until the lead reviewer issues the round.
        </div>
      ))}

      {props.progress.map(({ round, lines }) => (
        <div key={round.id} aria-label={`Progress, round ${round.number}`} style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>
            Where the review group is, round {round.number} · {round.versionReference}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {lines.map((l) => (
              <li key={l.participantId} data-progress-line>
                {progressWords(l)}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {threads.length === 0 ? (
        props.withheldRounds.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No comments have been written on this review yet.</p>
        )
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6, marginBottom: 8, fontSize: 12.5 }}>
            <div role="group" aria-label="Filter by state">
              {THREAD_STATES.map((s) => (
                <FilterChip
                  key={s.value}
                  active={filter.state === s.value}
                  onClick={() => set({ state: filter.state === s.value ? null : s.value })}
                >
                  {s.label} ({countFor('state', (t) => t.state === s.value)})
                </FilterChip>
              ))}
            </div>
            {reviewers.length > 1 && (
              <div role="group" aria-label="Filter by reviewer">
                {reviewers.map((r) => (
                  <FilterChip
                    key={r.participantId}
                    active={filter.reviewerId === r.participantId}
                    onClick={() => set({ reviewerId: filter.reviewerId === r.participantId ? null : r.participantId })}
                  >
                    {r.name} ({countFor('reviewerId', (t) => t.comment.author.participantId === r.participantId)})
                  </FilterChip>
                ))}
              </div>
            )}
            {codes.length > 0 && (
              <div role="group" aria-label="Filter by code">
                {codes.map((c) => (
                  <FilterChip
                    key={c.id}
                    active={filter.codeId === c.id}
                    onClick={() => set({ codeId: filter.codeId === c.id ? null : c.id })}
                  >
                    {c.code} ({countFor('codeId', (t) => t.comment.acceptanceCode?.id === c.id)})
                  </FilterChip>
                ))}
              </div>
            )}
            <div style={{ color: 'var(--text-muted)' }} aria-live="polite">
              {active ? `${visible.length} of ${threads.length} comments shown` : `${threads.length} comment${threads.length === 1 ? '' : 's'}`}
              {active && (
                <>
                  {' · '}
                  <button type="button" className="fb-btn" onClick={() => props.onFilter(NO_FILTER)}>
                    Clear filters
                  </button>
                </>
              )}
              {' · '}J / K walk the list, R responds, E responds as no change
            </div>
          </div>

          {visible.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No comment matches these filters.</p>
          ) : (
            <ul
              aria-label="Threads"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                maxHeight: 300,
                overflowY: 'auto',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--control-sm)',
              }}
            >
              {visible.map((t) => {
                const on = props.activeId === t.comment.id;
                const badge = STATE_BADGE[t.state];
                return (
                  <li
                    key={t.comment.id}
                    data-thread-id={t.comment.id}
                    data-state={t.state}
                    aria-current={on ? 'true' : undefined}
                    style={{
                      borderBottom: '1px solid var(--border-subtle, var(--border-default))',
                      borderLeft: `2px solid ${on ? 'var(--action-primary-bg)' : 'transparent'}`,
                      background: on ? 'var(--surface-hover)' : 'transparent',
                      padding: '6px 10px',
                      fontSize: 13,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => props.onSelect(t.comment.id)}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        width: '100%',
                      }}
                    >
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      <b style={{ whiteSpace: 'nowrap' }}>{t.comment.author.name}</b>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        Round {t.round.number} · {t.round.versionReference}
                      </span>
                      {t.comment.acceptanceCode && <Badge tone="info">{t.comment.acceptanceCode.code}</Badge>}
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.comment.body.split('\n')[0]}
                      </span>
                    </button>
                    {on && (
                      <div style={{ display: 'grid', gap: 4, margin: '6px 0 2px', fontSize: 12.5 }}>
                        {t.comment.anchor?.quote && (
                          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            “{t.comment.anchor.quote}”
                            {t.comment.anchor.page !== undefined && ` — p.${t.comment.anchor.page}`}
                          </div>
                        )}
                        <div style={{ whiteSpace: 'pre-wrap' }}>{t.comment.body}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDateTime(t.comment.createdAt)}</div>
                        {t.state === 'overtaken' && (
                          <div style={{ color: 'var(--text-muted)' }}>
                            A later version went out without an answer to this comment.
                          </div>
                        )}
                      </div>
                    )}
                    {t.comment.response && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12, margin: '2px 0 0' }}>
                        {t.comment.response.noChangeReason ? (
                          <>No change — {t.comment.response.noChangeReason}</>
                        ) : (
                          <ResponseChange
                            response={t.comment.response}
                            projectId={props.projectId}
                            containerId={props.containerId}
                            versionRefById={props.versionRefById}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
