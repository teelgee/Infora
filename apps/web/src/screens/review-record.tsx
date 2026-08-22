// T-375 — the review record: the DRR as ONE APPENDED TABLE (approved mockup:
// docs/design/mockups/review-log.html).
//
// No ADR changed here. component-5 has named "the DRR table interface" as this
// surface since it was written, and the build drew round cards instead —
// comments in a div grid with the round's code as a badge in its header. This
// is a drift that existed regardless of the walk, which is why the ticket
// depended on nothing.
//
// Rounds are BANDS INSIDE ONE RECORD, not separate tables or tabs. The
// chapter's whole review history reads top to bottom in one scroll, which is
// the thing the Excel review notice could never do and the reason ADR-0009
// refused to materialise one. A further round appends to the same table.
//
// EACH ROUND CLOSES WITH ITS CODE. A round ends on a verdict band carrying the
// deliverable code, who set it and when; an open round carries a band saying it
// has no code yet, because an open round with no verdict is a state rather than
// a gap — and no count of comments will ever fill it (ADR-0005).
//
// THE WALL IS A DIFFERENT RECORD, NOT A HIDDEN COLUMN. For the authoring side
// the open round's rows are ABSENT, not greyed — enforced in the server's read
// exactly as ADR-0014 already is — under a stated withheld notice, because
// silence would read as absence and absence is a different and wrong fact.
//
// NO EXPORT CONTROL ANYWHERE ON THIS SCREEN, deliberately: ADR-0009 dropped the
// DRN and refused a second artifact, and a download button here would quietly
// reinstate it. The browser can still print, which is a browser doing its job
// rather than Infora issuing a document.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import type {
  MeResponse,
  PlanRow,
  ReviewComment,
  ReviewCycle,
  Round,
} from '@infora/contracts';
import { Badge, Button, Skeleton, Table } from '@infora/ui';
import { api, RequestError } from '../api';
import { describeApiError, errorCode } from '../api-errors';
import { formatDate } from './shared';

type ShellContext = { participant: MeResponse['participants'][number] };

export function ReviewRecordScreen() {
  const { participant: me } = useOutletContext<ShellContext>();
  const { containerId } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<PlanRow | null>(null);
  const [cycle, setCycle] = useState<ReviewCycle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!containerId) return;
    try {
      const [plan, cycleRead] = await Promise.all([api.plan(me.projectId), api.cycle(containerId)]);
      const planRow = plan.items.find((r) => r.containerId === containerId) ?? null;
      setRow(planRow ?? (await api.qaRow(containerId).catch(() => null)));
      setCycle(cycleRead);
      setLoaded(true);
    } catch (error) {
      setLoadError(
        error instanceof RequestError
          ? describeApiError(errorCode(error))
          : 'Could not load this review record.',
      );
    }
  }, [containerId, me.projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!containerId) return null;
  if (loadError) {
    return (
      <div className="content">
        <p style={{ color: 'var(--text-muted)' }}>{loadError}</p>
      </div>
    );
  }
  if (row === null) {
    return (
      <div className="content">
        {loaded ? (
          <p style={{ color: 'var(--text-muted)' }}>This deliverable is not on a plan you can see.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
            <Skeleton height={28} width="40%" />
            <Skeleton height={320} />
          </div>
        )}
      </div>
    );
  }

  const rounds = cycle ? [...cycle.rounds].sort((a, b) => a.number - b.number) : [];
  // the counts read off what THIS requester can see, never off the whole
  // record: a header claiming five comments beside three visible rows would
  // leak the shape of what the wall withholds
  const visible = rounds.flatMap((r) => r.comments);
  const answered = visible.filter((c) => c.response !== null).length;
  const issuedRounds = rounds.filter((r) => r.state === 'issued' || r.state === 'responded').length;
  const authoringSide = rounds.some((r) => r.commentsWithheld);
  // a response's change pointer resolves to the revision it landed in — the
  // version id is stamped by the promotion that creates it (T-354), so this is
  // a fact rather than a guess
  const versionRefById = Object.fromEntries(rounds.map((r) => [r.versionId, r.versionReference]));

  return (
    <div className="content">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page">
            Review record{' '}
            <span
              style={{
                fontFamily: 'var(--primitive-font-family-mono)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-muted)',
              }}
            >
              · {row.documentReference ?? 'Internal QA'}
            </span>
          </h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {row.workItem?.title ?? 'Reference material'}
            {rounds.length > 0 && (
              <>
                {' · '}
                {authoringSide
                  ? `${issuedRounds} round${issuedRounds === 1 ? '' : 's'} issued`
                  : `${rounds.length} round${rounds.length === 1 ? '' : 's'}`}
                {` · ${visible.length} comment${visible.length === 1 ? '' : 's'} · ${answered} answered`}
              </>
            )}
          </p>
        </div>
        {/* the way through to the PDF and the commenting surface. There is
            deliberately no download, no "issue the record" and no print button
            beside it — ADR-0009 dropped the DRN and it stays dropped. */}
        <Button
          size="sm"
          variant="primary"
          onClick={() => void navigate(`/projects/${me.projectId}/review/${containerId}/cycle`)}
        >
          Open the round
        </Button>
      </div>

      {rounds.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          No rounds yet — the record begins when the first version is promoted.
        </p>
      )}

      {rounds.length > 0 && (
        <Table>
          <table>
            <thead>
              <tr>
                <th style={{ width: 52 }}>#</th>
                <th style={{ width: '18%' }}>Where</th>
                <th>Comment</th>
                <th style={{ width: 56 }}>Code</th>
                <th style={{ width: '30%' }}>Response</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round) => (
                <RoundBand key={round.id} round={round} versionRefById={versionRefById} />
              ))}
            </tbody>
          </table>
        </Table>
      )}
    </div>
  );
}

/** One round as a band inside the record: an opening band, its comment rows,
 * and the verdict band that closes it. */
function RoundBand(props: { round: Round; versionRefById: Record<string, string> }) {
  const { round } = props;
  const submitted = round.transmittals.find((t) => t.direction === 'return');
  const issued = round.transmittals.find((t) => t.direction === 'issue');

  return (
    <>
      <tr>
        <td colSpan={5} style={bandStyle}>
          <span style={{ fontWeight: 700 }}>Round {round.number}</span>{' '}
          <span className="mono" style={{ color: 'var(--text-muted)' }}>
            · {round.versionReference}
          </span>
          <span style={{ float: 'right', fontWeight: 400, color: 'var(--text-muted)' }}>
            {round.state === 'submitted' && submitted
              ? `Submitted ${formatDate(submitted.issuedAt)} — awaiting acknowledgement`
              : issued
                ? `Closed and issued · ${formatDate(issued.issuedAt)}`
                : round.acknowledgedAt
                  ? `Acknowledged into review ${formatDate(round.acknowledgedAt)} · open`
                  : 'Open'}
          </span>
        </td>
      </tr>

      {/* the wall, stated. The rows are ABSENT rather than greyed — the
          authoring side does not have them — and the notice says that content
          exists and why it is out of reach. */}
      {round.commentsWithheld && (
        <tr>
          <td colSpan={5} style={{ background: 'var(--surface-sunken)' }}>
            <div className="withheld" style={{ margin: 0 }}>
              Round {round.number} is open. Its comments are withheld until the lead reviewer closes
              the round and issues it — reviewer-side positioning is never live to the authoring
              side. Every issued round above stays readable here permanently.
            </div>
          </td>
        </tr>
      )}

      {!round.commentsWithheld && round.comments.length === 0 && (
        <tr>
          <td colSpan={5} style={{ color: 'var(--text-muted)' }}>
            {round.state === 'open'
              ? 'No comments yet — the round is open to the review group.'
              : 'No comments were recorded in this round.'}
          </td>
        </tr>
      )}

      {round.comments.map((comment, i) => (
        <CommentRow
          key={comment.id}
          comment={comment}
          number={`${round.number}.${i + 1}`}
          round={round}
          versionRefById={props.versionRefById}
        />
      ))}

      {/* the round's own close: its code, who set it and when — or the honest
          statement that an open round has none yet */}
      <tr>
        <td colSpan={5} style={{ ...bandStyle, background: 'var(--surface-sunken)' }}>
          {round.deliverableCode ? (
            <>
              <span style={{ fontWeight: 700 }}>Round {round.number} closed</span>{' '}
              <Badge tone={round.deliverableCode.isAccepting ? 'success' : 'warning'}>
                {round.deliverableCode.code} — {round.deliverableCode.description}
              </Badge>
              {issued && (
                <span style={{ float: 'right', fontWeight: 400, color: 'var(--text-muted)' }}>
                  Set by {issued.sender.name}, lead reviewer · {formatDate(issued.issuedAt)}
                </span>
              )}
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700 }}>Round {round.number} has no deliverable code yet</span>{' '}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                The lead reviewer sets it when they close the round. No count of comments closes it.
              </span>
            </>
          )}
        </td>
      </tr>
    </>
  );
}

function CommentRow(props: {
  comment: ReviewComment;
  number: string;
  round: Round;
  versionRefById: Record<string, string>;
}) {
  const { comment, round } = props;
  const response = comment.response;
  return (
    <tr>
      <td style={{ verticalAlign: 'top', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {props.number}
      </td>
      <td style={{ verticalAlign: 'top', fontSize: 12 }}>
        {comment.anchor?.page !== undefined && (
          <div style={{ color: 'var(--text-muted)' }}>p. {comment.anchor.page}</div>
        )}
        {comment.anchor?.quote ? (
          <div style={{ fontStyle: 'italic' }}>“{comment.anchor.quote}”</div>
        ) : comment.anchor?.point ? (
          <div style={{ color: 'var(--text-muted)' }}>dropped point</div>
        ) : comment.anchor?.page === undefined ? (
          <div style={{ color: 'var(--text-faint)' }}>the round</div>
        ) : null}
      </td>
      <td style={{ verticalAlign: 'top' }}>
        <div style={{ lineHeight: 1.5 }}>{comment.body}</div>
        <div className="sub">
          {comment.author.name} · {formatDate(comment.createdAt)}
        </div>
      </td>
      <td style={{ verticalAlign: 'top' }}>
        {comment.acceptanceCode ? (
          <Badge tone="info">{comment.acceptanceCode.code}</Badge>
        ) : (
          <span style={{ color: 'var(--text-faint)' }}>—</span>
        )}
      </td>
      <td style={{ verticalAlign: 'top', fontSize: 12.5 }}>
        {/* ADR-0004 — a response either points at the change or states
            explicitly that none was made. There is no third state and no blank
            cell: an unanswered comment reads as the round state it is. */}
        {response ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {response.noChangeReason
                ? 'No change'
                : response.nextVersionId && props.versionRefById[response.nextVersionId]
                  ? `Changed in ${props.versionRefById[response.nextVersionId]}`
                  : 'Change prepared for the next revision'}
            </div>
            <div style={{ lineHeight: 1.5 }}>
              {response.noChangeReason ? response.noChangeReason : response.body}
            </div>
            {response.nextVersionAnchor?.quote && (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                “{response.nextVersionAnchor.quote}”
              </div>
            )}
            <div className="sub">
              {response.author.name} · {formatDate(response.createdAt)}
            </div>
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>
            {round.state === 'open'
              ? 'Awaiting the authoring side — the round is open'
              : round.state === 'issued'
                ? 'Awaiting the authoring side'
                : '—'}
          </span>
        )}
      </td>
    </tr>
  );
}

const bandStyle = {
  background: 'var(--surface-active)',
  borderTop: '2px solid var(--border-default)',
  fontSize: 12.5,
} as const;
